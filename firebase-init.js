// firebase-init.js
// Un unico punto in cui inizializziamo Firebase: tutte le altre pagine
// importano "db" e "auth" da qui, così la config sta scritta in un solo posto.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyAFmaHbXMTlfTTp6wWVSU76o0_JXrovPeI",
  authDomain: "corb-app26.firebaseapp.com",
  projectId: "corb-app26",
  storageBucket: "corb-app26.firebasestorage.app",
  messagingSenderId: "685810855713",
  appId: "1:685810855713:web:2625310ab8c90af293d860",
  measurementId: "G-8HR6P6GBR1"
};

// Chiave VAPID (Cloud Messaging → Web configuration → Genera coppia di chiavi)
export const VAPID_KEY = "BKosjFQWQZIZqFWtCbt3A2JUElP3YaC5uU4c-7_s5QkFdHKsUTFve_kkg-0ZVtvvqv_6m1t5_bJsMOAfk_FKxiI";

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Statistiche di utilizzo (quante persone aprono l'app, quali pagine, quando).
// isSupported() evita che l'app si rompa nei rari browser/contesti dove
// Analytics non funziona (stesso trucco già usato per le notifiche push).
analyticsSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});

// getMessaging() rompe su iOS Safari non-PWA e su browser senza supporto Push;
// isSupported() ci evita crash silenziosi sull'intera pagina.
export async function getMessagingIfSupported(){
  try {
    if (await isSupported()) return getMessaging(app);
  } catch {}
  return null;
}
