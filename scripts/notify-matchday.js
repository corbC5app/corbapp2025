// notify-matchday.js
// Gira ogni giorno via GitHub Actions: controlla se c'è una partita OGGI
// nella collezione "matches" di Firestore, e se sì manda una notifica push
// a tutti i telefoni registrati in "pushTokens". Zero intervento umano.

const admin = require('firebase-admin');

function todayInItaly(){
  // Data di "oggi" nel fuso orario italiano, formato YYYY-MM-DD
  // (coerente con come le date vengono salvate dal form Admin, tipo <input type="date">)
  const now = new Date();
  const it = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const y = it.getFullYear();
  const m = String(it.getMonth()+1).padStart(2,'0');
  const d = String(it.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

async function main(){
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Manca il secret FIREBASE_SERVICE_ACCOUNT');
  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const messaging = admin.messaging();

  const today = todayInItaly();
  console.log('Controllo partite per la data:', today);

  const snapTutte = await db.collection('matches').where('data', '==', today).get();
  // Il calendario ora contiene TUTTE le partite del girone (22 squadre), non solo
  // le vostre — quindi filtro solo quelle in cui gioca davvero il Corbiolo,
  // altrimenti arriverebbe una notifica anche per le partite delle altre squadre.
  const docsCorbiolo = snapTutte.docs.filter(doc => {
    const m = doc.data();
    const casa = (m.casa||'').trim().toLowerCase();
    const fuori = (m.fuori||'').trim().toLowerCase();
    return casa === 'corbiolo' || fuori === 'corbiolo';
  });
  if (!docsCorbiolo.length){
    console.log('Nessuna partita del Corbiolo oggi, nessuna notifica da inviare.');
    return;
  }

  const tokensSnap = await db.collection('pushTokens').get();
  const tokens = tokensSnap.docs.map(d => d.id);
  if (!tokens.length){
    console.log('Nessun dispositivo registrato alle notifiche.');
    return;
  }

  for (const doc of docsCorbiolo){
    const m = doc.data();
    const casa  = m.casa  || 'Corbiolo';
    const fuori = m.fuori || 'Avversario';
    const ora   = m.ora ? ` alle ${m.ora}` : '';

    const title = 'Oggi si gioca! ⚽';
    const body  = `${casa} - ${fuori}${ora}`;

    console.log(`Invio notifica a ${tokens.length} dispositivi: "${body}"`);

    const resp = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { url: './prossima.html' },
      webpush: { fcmOptions: { link: '/prossima.html' } }
    });

    console.log(`Inviate: ${resp.successCount}, fallite: ${resp.failureCount}`);

    // Pulizia: rimuovi i token non più validi (app disinstallata, permesso tolto, ecc.)
    const toDelete = [];
    resp.responses.forEach((r, i) => {
      if (!r.success){
        const code = r.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')){
          toDelete.push(tokens[i]);
        }
      }
    });
    if (toDelete.length){
      console.log(`Rimuovo ${toDelete.length} token non più validi.`);
      await Promise.all(toDelete.map(t => db.collection('pushTokens').doc(t).delete()));
    }
  }
}

main().catch(err => {
  console.error('Errore invio notifica:', err);
  process.exit(1);
});
