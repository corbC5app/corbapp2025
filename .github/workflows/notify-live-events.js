// notify-live-events.js
// Gira ogni pochi minuti via GitHub Actions, SOLO per le partite marcate
// "in diretta" (live === 'Sì'). Manda due tipi di notifica:
//  1) "La partita è iniziata! Segui la diretta" - una volta sola, appena
//     la partita passa in diretta.
//  2) "⚽ GOL!" - ogni volta che compare un nuovo evento gol nella cronaca,
//     mentre la diretta è attiva. Le modifiche fatte a cronaca DOPO la fine
//     della partita (diretta = No) non mandano mai notifiche.

const admin = require('firebase-admin');

async function main(){
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Manca il secret FIREBASE_SERVICE_ACCOUNT');
  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const messaging = admin.messaging();

  const snap = await db.collection('matches').get();
  if (snap.empty){ console.log('Nessuna partita in archivio.'); return; }

  // Partite dove la diretta è finita: "riarmo" i flag per la prossima volta
  const toReset = snap.docs.filter(d => {
    const m = d.data();
    return m.live !== 'Sì' && (m.liveNotified || m.notifiedEventCount);
  });
  if (toReset.length){
    console.log(`Riarmo ${toReset.length} partite (diretta terminata).`);
    await Promise.all(toReset.map(d => d.ref.update({ liveNotified:false, notifiedEventCount:0 })));
  }

  // Il calendario ora contiene TUTTE le partite del girone (22 squadre), quindi
  // per ogni notifica controllo sempre che sia davvero una partita del Corbiolo,
  // non una qualsiasi delle altre squadre.
  function isCorbioloMatch(m){
    const casa = (m.casa||'').trim().toLowerCase();
    const fuori = (m.fuori||'').trim().toLowerCase();
    return casa === 'corbiolo' || fuori === 'corbiolo';
  }

  // Solo le partite ATTUALMENTE in diretta contano per gol/inizio-diretta
  const live = snap.docs.filter(d => d.data().live === 'Sì' && isCorbioloMatch(d.data()));

  // Partite con un rinvio/annullamento da notificare (indipendente dalla diretta)
  const daNotificareStato = snap.docs.filter(d => {
    const m = d.data();
    return (m.stato === 'Rinviata' || m.stato === 'Annullata') && !m.statoNotificato && isCorbioloMatch(m);
  });
  const daRiarmareStato = snap.docs.filter(d => {
    const m = d.data();
    return (!m.stato || m.stato === 'Regolare') && m.statoNotificato;
  });

  if (!live.length && !daNotificareStato.length && !daRiarmareStato.length){
    console.log('Nessuna diretta in corso e nessun cambio di stato da notificare.');
    return;
  }

  if (daRiarmareStato.length){
    await Promise.all(daRiarmareStato.map(d => d.ref.update({ statoNotificato: false })));
  }

  const tokensSnap = await db.collection('pushTokens').get();
  const tokens = tokensSnap.docs.map(d => d.id);
  if (!tokens.length){ console.log('Nessun dispositivo registrato alle notifiche.'); return; }

  async function sendPush(title, body, kind){
    console.log(`Invio "${title} — ${body}" a ${tokens.length} dispositivi`);
    const resp = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { url: './index.html', kind },
      webpush: { fcmOptions: { link: '/index.html' } }
    });
    console.log(`Inviate: ${resp.successCount}, fallite: ${resp.failureCount}`);
    const toDelete = [];
    resp.responses.forEach((r, i) => {
      if (!r.success){
        const code = r.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')){
          toDelete.push(tokens[i]);
        }
      }
    });
    if (toDelete.length) await Promise.all(toDelete.map(t => db.collection('pushTokens').doc(t).delete()));
  }

  // 0) Partita rinviata/annullata
  for (const doc of daNotificareStato){
    const m = doc.data();
    const casa  = m.casa  || 'Corbiolo';
    const fuori = m.fuori || 'Avversario';
    const emoji = m.stato === 'Rinviata' ? '⚠️' : '❌';
    await sendPush(`${emoji} Partita ${m.stato.toLowerCase()}`, `${casa} - ${fuori}`, 'stato');
    await doc.ref.update({ statoNotificato: true });
  }

  for (const doc of live){
    const m = doc.data();
    const casa  = m.casa  || 'Corbiolo';
    const fuori = m.fuori || 'Avversario';

    // 1) Notifica "è iniziata la diretta" - una volta sola
    if (!m.liveNotified){
      await sendPush('🔴 È iniziata la diretta!', `${casa} - ${fuori}, segui la diretta`, 'diretta-start');
      await doc.ref.update({ liveNotified: true });
    }

    // 2) Notifiche per i nuovi eventi comparsi in cronaca (gol/gialli/rossi)
    const eventi = Array.isArray(m.eventi) ? m.eventi : [];
    const already = m.notifiedEventCount || 0;
    const nuovi = eventi.slice(already);

    for (const line of nuovi){
      // Formato riga: "1°T 23' ⚽ Melotti Matteo (#7) — Corbiolo"
      const match = line.match(/(⚽|🥅|🟨|🟥)\s+(.+?)\s+—\s+(.+)$/);
      if (!match) continue; // riga non riconosciuta (es. "Fine 1° tempo", "Time-out"): ignoro

      const [, emoji, who, team] = match;
      const isCorb = team.trim().toLowerCase() === 'corbiolo';
      const punteggio = m.risultato ? ` (${m.risultato.replace('-', ' - ')})` : '';

      if (emoji === '⚽'){
        const body = isCorb ? `${who} — Corbiolo${punteggio}` : `${team}${punteggio}`;
        await sendPush('⚽ GOL!', body, 'gol');
      } else if (emoji === '🥅'){
        // Autogol: il punto va alla squadra AVVERSARIA rispetto a chi lo segna
        const body = isCorb ? `${who} (autogol) — Corbiolo${punteggio}` : `${team} (autogol)${punteggio}`;
        await sendPush('🥅 AUTOGOL!', body, 'autogol');
      } else if (emoji === '🟨'){
        if (isCorb) await sendPush('🟨 Ammonizione', `${who} — Corbiolo`, 'giallo');
        // giallo avversario: nessuna notifica, come richiesto
      } else if (emoji === '🟥'){
        const body = isCorb ? `${who} — Corbiolo` : `${team}`;
        await sendPush('🟥 Espulsione', body, 'rosso');
      }
    }

    if (eventi.length !== already){
      await doc.ref.update({ notifiedEventCount: eventi.length });
    }
  }

  console.log('Fatto.');
}

main().catch(err => { console.error(err); process.exit(1); });
