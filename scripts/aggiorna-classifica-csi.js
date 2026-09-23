// aggiorna-classifica-csi.js
// Legge classifica squadre + risultati del girone direttamente dal sito
// ufficiale CSI e li scrive in Firestore, così non serve più farlo a mano.
//
// REGOLE DI SICUREZZA (per non entrare mai in conflitto con la diretta):
//  - NON tocca MAI i gol/marcatori dei giocatori (players.gol) — quelli
//    restano sempre e solo governati dalla Console Diretta.
//  - NON tocca MAI una partita del Corbiolo che è ATTUALMENTE in diretta
//    (live === 'Sì'), per non rischiare di sovrascrivere quello che si sta
//    inserendo in tempo reale.
//  - NON tocca MAI il risultato di una partita del Corbiolo che ha già una
//    cronaca inserita (vuol dire che l'abbiamo seguita noi in diretta:
//    quella resta sempre la fonte autorevole, non il sito).
//  - Aggiorna SOLO: la classifica squadre, e i risultati delle partite
//    delle ALTRE 21 squadre (quelle che noi non tracciamo mai in diretta).

const admin = require('firebase-admin');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const SEASON = '2026/27';
const URL = 'https://live.centrosportivoitaliano.it/26/Calcio-a-5/Veneto/Verona/C36024/?j=NEU9REdLJjRGPVBOUCY0Rz1HSkRGSCY0SD1GTEZMRUkmNEk9KiogUHVuejJ2MTA1dXYyJjRMPURHSyY0Mj1l';

function normTeam(n){
  n = (n || '').trim();
  return n.toLowerCase() === 'us corbiolo c5' ? 'Corbiolo' : n;
}

async function main(){
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Manca il secret FIREBASE_SERVICE_ACCOUNT');
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  // Le 22 squadre ufficiali del girone (nome esattamente come compare sul
  // sito), usate per "cercare per nome" invece di affidarci a una struttura
  // di tabella che il sito in realtà non usa (sono riquadri, non <table>).
  const SQUADRE_SITO = [
    'Atletico Ponte Crencano','Beer Club','C.U.S. Verona A.S.D.','Confimpresaitalia Sport',
    'Us Corbiolo C5','Curaçao','Flip-Off F.C.','Futsal Casaloldo','Goto Mit Uns','Guidizzolo',
    'Hammers Mmxiv','Il Conte di Verona','La Taverna C. A 5','Nuova Cometa F.C. A.S.D.',
    'Oto A.S.D.','PDC','Peretti Cofer Futsal Vr','Pol. Rosegaferro Asd','Real Muchachos Asd',
    'Real Vigo','Scaligeri 2023','Union Best Calcio'
  ];

  console.log('Apro un browser vero (finto) per leggere la pagina...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  let html, bodyText;
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9' });
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('body', { timeout: 20000 }).catch(() => {});
    // Aspetto un attimo in più: la classifica a volte si popola con un
    // secondo passaggio JS dopo il caricamento iniziale della pagina.
    await new Promise(res => setTimeout(res, 3000));
    html = await page.content();
    bodyText = await page.evaluate(() => document.body.innerText);
  } finally {
    await browser.close();
  }
  console.log(`Pagina scaricata: ${html.length} caratteri (testo visibile: ${bodyText.length} caratteri).`);

  const $ = cheerio.load(html);

  // ===================== 1) CLASSIFICA SQUADRE =====================
  // Isolo la sezione "Classifica" del testo (tra il titolo e la sezione
  // successiva), per non pescare per sbaglio numeri dal calendario.
  const iniz = bodyText.indexOf('Classifica');
  let fine = bodyText.indexOf('Squadre iscritte', iniz);
  if (fine < 0) fine = bodyText.indexOf('Promosse', iniz);
  if (fine < 0) fine = iniz + 6000;
  const sezioneClassifica = iniz >= 0 ? bodyText.slice(iniz, fine) : '';
  console.log(`Sezione classifica isolata: ${sezioneClassifica.length} caratteri (da "Classifica" a "Squadre iscritte/Promosse").`);

  const righeClassifica = [];
  for (const nomeSito of SQUADRE_SITO){
    const escaped = nomeSito.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Dopo il nome squadra mi aspetto 7 numeri: Pt PG V N P GF GS
    // (l'ottava colonna, DR, la ignoro: è solo GF-GS, non ci serve salvarla)
    const re = new RegExp(escaped + '\\s*\\n?\\s*(-?\\d+)\\s*\\n?\\s*(-?\\d+)\\s*\\n?\\s*(-?\\d+)\\s*\\n?\\s*(-?\\d+)\\s*\\n?\\s*(-?\\d+)\\s*\\n?\\s*(-?\\d+)\\s*\\n?\\s*(-?\\d+)');
    const m = sezioneClassifica.match(re);
    if (!m){
      console.log(`Non trovata in classifica: "${nomeSito}"`);
      continue;
    }
    const [, pt, pg, v, n, p, gf, gs] = m;
    righeClassifica.push({
      squadra: normTeam(nomeSito),
      punti: +pt || 0, giocate: +pg || 0, vinte: +v || 0,
      pareggiate: +n || 0, perse: +p || 0, gf: +gf || 0, gs: +gs || 0,
    });
  }
  console.log(`Classifica letta dal sito: ${righeClassifica.length} squadre trovate.`);
  if (righeClassifica.length) console.log('Esempio prima riga:', JSON.stringify(righeClassifica[0]));

  if (righeClassifica.length){
    const existing = await db.collection('standings').where('stagione', '==', SEASON).get();
    let nuove = 0, aggiornate = 0;
    for (const row of righeClassifica){
      const match = existing.docs.find(d => (d.data().squadra || '').trim().toLowerCase() === row.squadra.trim().toLowerCase());
      const data = { ...row, stagione: SEASON };
      if (match){ await match.ref.update(data); aggiornate++; }
      else { await db.collection('standings').add(data); nuove++; }
    }
    console.log(`Classifica: ${aggiornate} righe aggiornate, ${nuove} nuove create.`);
  } else {
    console.log('ATTENZIONE: nessuna tabella classifica trovata nella pagina — la struttura del sito potrebbe essere cambiata, va controllato a mano.');
  }

  // ===================== 2) RISULTATI PARTITE (girone completo) =====================
  const risultatiTrovati = [];
  $('a[href*="/Calcio-a-5/Veneto/Verona/P"]').each((_, a) => {
    const testo = $(a).text().replace(/\s+/g, ' ').trim();
    // formato atteso: "08/10/26 20:00 03700148 Il Conte di Verona 03701089 C.U.S. Verona A.S.D. 3 2"
    const m = testo.match(/\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s+\d{8}\s+(.+?)\s+\d{8}\s+(.+?)\s+(\d+|-)\s+(\d+|-)\s*$/);
    if (!m) return;
    const [, casaRaw, fuoriRaw, gh, ga] = m;
    if (gh === '-' || ga === '-') return; // partita non ancora giocata
    risultatiTrovati.push({ casa: normTeam(casaRaw), fuori: normTeam(fuoriRaw), risultato: `${gh}-${ga}` });
  });
  console.log(`Risultati (partite già giocate) trovati sul sito: ${risultatiTrovati.length}.`);
  if (risultatiTrovati.length) console.log('Esempio primo risultato:', JSON.stringify(risultatiTrovati[0]));

  if (risultatiTrovati.length){
    const matchesSnap = await db.collection('matches')
      .where('stagione', '==', SEASON).where('tipo', '==', 'Campionato').get();

    let aggiornate = 0, nonTrovate = 0, saltateCorbioloLive = 0, saltateCorbioloTracciate = 0;
    for (const r of risultatiTrovati){
      const doc = matchesSnap.docs.find(d => {
        const m = d.data();
        return (m.casa || '').trim().toLowerCase() === r.casa.trim().toLowerCase()
            && (m.fuori || '').trim().toLowerCase() === r.fuori.trim().toLowerCase();
      });
      if (!doc){ nonTrovate++; continue; }
      const m = doc.data();
      const isCorbiolo = r.casa.toLowerCase() === 'corbiolo' || r.fuori.toLowerCase() === 'corbiolo';

      if (isCorbiolo && m.live === 'Sì'){ saltateCorbioloLive++; continue; }
      if (isCorbiolo && Array.isArray(m.eventi) && m.eventi.length){ saltateCorbioloTracciate++; continue; }

      if (m.risultato !== r.risultato){
        await doc.ref.update({ risultato: r.risultato });
        aggiornate++;
      }
    }
    console.log(`Risultati: ${aggiornate} aggiornati, ${nonTrovate} non trovati in Firestore, ${saltateCorbioloLive} saltati (Corbiolo in diretta ORA), ${saltateCorbioloTracciate} saltati (Corbiolo già tracciato con cronaca).`);
  }

  console.log('Fatto.');
}

main().catch(err => { console.error(err); process.exit(1); });
