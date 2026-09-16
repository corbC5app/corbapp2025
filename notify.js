// notify.js — richiesta permesso, registrazione al push, invio "notifica di prova"
import { db, VAPID_KEY, getMessagingIfSupported } from './firebase-init.js';
import {
  doc, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

const TOKENS_COLLECTION = 'pushTokens';

export function permissionState(){
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Alcuni Safari/iOS più datati implementano Notification.requestPermission()
// con un vecchio sistema a "callback" invece del sistema moderno a Promise:
// se lo chiami con await senza gestire anche quel caso, resta in attesa per
// sempre senza mai rispondere. Questo wrapper funziona con entrambi.
function requestPermissionSafe(){
  return new Promise((resolve, reject) => {
    let done = false;
    try{
      const maybePromise = Notification.requestPermission((result) => {
        if (!done){ done = true; resolve(result); }
      });
      if (maybePromise && typeof maybePromise.then === 'function'){
        maybePromise.then((result) => { if (!done){ done = true; resolve(result); } }, (err) => { if (!done){ done = true; reject(err); } });
      }
    }catch(err){ if (!done){ done = true; reject(err); } }
  });
}

// Chiede il permesso, ottiene il token FCM per QUESTO dispositivo/browser
// e lo salva in Firestore così l'admin (o l'automatismo del giorno-partita)
// può usarlo per mandare la notifica a tutti.
export async function enableNotifications(onStep){
  const step = (s) => { if (onStep) onStep(s); };

  if (!('Notification' in window)) throw new Error('Notifiche non supportate su questo dispositivo/browser.');

  step('Controllo il permesso...');
  const perm = await requestPermissionSafe();
  if (perm !== 'granted') throw new Error('Permesso negato.');

  step('Controllo il supporto del browser...');
  const messaging = await getMessagingIfSupported();
  if (!messaging) throw new Error('Push non supportato su questo browser (es. iPhone: l\'app va aperta dalla schermata Home, non da Safari).');

  step('Mi collego al service worker...');
  const swReg = await navigator.serviceWorker.ready;

  step('Ottengo il codice del dispositivo...');
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  if (!token) throw new Error('Impossibile ottenere il token di notifica.');

  step('Salvo su Firestore...');
  await setDoc(doc(db, TOKENS_COLLECTION, token), {
    token,
    ua: navigator.userAgent,
    updatedAt: serverTimestamp()
  });

  // Notifiche ricevute mentre l'app è aperta e in primo piano
  // (in background/chiusa ci pensa sw.js → onBackgroundMessage)
  onMessage(messaging, (payload) => {
    // Se è la notifica di un gol e la persona sta già guardando l'app aperta,
    // non serve un popup in più: il tabellone live si aggiorna già da solo
    // sotto i loro occhi in tempo reale.
    if ((payload?.data?.kind === 'gol' || payload?.data?.kind === 'autogol') && document.visibilityState === 'visible') return;

    const title = payload?.notification?.title || 'CORB';
    const body  = payload?.notification?.body  || '';
    new Notification(title, { body, icon: './img/logo_c5.png' });
  });

  return token;
}

export async function disableNotifications(onStep){
  const step = (s) => { if (onStep) onStep(s); };
  step('Controllo il supporto del browser...');
  const messaging = await getMessagingIfSupported();
  if (!messaging) return;
  step('Mi collego al service worker...');
  const swReg = await navigator.serviceWorker.ready;
  try {
    step('Ottengo il codice del dispositivo...');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token){ step('Rimuovo da Firestore...'); await deleteDoc(doc(db, TOKENS_COLLECTION, token)); }
  } catch {}
}
