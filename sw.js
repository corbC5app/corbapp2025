// sw.js — cache offline (PWA) + notifiche push in background (Firebase Cloud Messaging)
const CACHE = "corb-cache-v64";

const ASSETS = [
  "./",
  "./index.html","./news.html","./squadra.html","./video.html",
  "./prossima.html","./partite.html","./calendario.html","./admin.html",
  "./classifica.html",
  "./dove.html",
  "./scarica.html",
  "./competizioni.html",
  "./settings.html",
  "./style.css?v=35",
  "./data-store.js",
  "./firebase-init.js",
  "./ui.js",
  "./onboarding.js",
  "./img/onboarding/nuova-app.jpg",
  "./img/onboarding/diretta.jpg",
  "./img/onboarding/classifica.jpg",
  "./img/onboarding/statistiche.jpg",
  "./img/onboarding/competizioni.jpg",
  "./install-prompt.js",
  "./manifest.json",
  "./img/logo_c5.png","./img/logo_avv.png","./img/player1.png","./img/campo.jpg",
  "./img/icons/icon-192.png","./img/icons/icon-512.png",
];

self.addEventListener("install", e=>{
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // IMPORTANTE: prima usavamo caches.addAll(), che è "tutto o niente" —
      // se anche un solo file della lista non si riesce a scaricare, l'INTERA
      // installazione del service worker falliva e restava bloccata per sempre
      // (ed è probabilmente la causa del blocco "Mi collego al service worker...").
      // Ora proviamo ogni file singolarmente: se uno fallisce, lo saltiamo e
      // basta, invece di far fallire tutto.
      const results = await Promise.allSettled(ASSETS.map(url => c.add(url)));
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.warn('[SW] impossibile mettere in cache:', ASSETS[i], r.reason);
      });
    })
  );
  self.skipWaiting();
});
self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener("fetch", e=>{
  const {request} = e;
  if (request.method!=="GET") return;
  // Non mettere in cache le chiamate a Firestore/Firebase: devono sempre andare in rete.
  if (request.url.includes('firestore.googleapis.com') || request.url.includes('googleapis.com')) return;

  // NETWORK-FIRST: prova sempre a scaricare la versione più recente del file.
  // La cache serve SOLO come riserva se non c'è connessione (o se la rete è troppo
  // lenta), così non si resta mai bloccati a vedere una versione vecchia dell'app.
  e.respondWith(
    fetch(request).then(net=>{
      const clone = net.clone();
      caches.open(CACHE).then(c=>c.put(request, clone));
      return net;
    }).catch(()=> caches.match(request))
  );
});

// ---- Notifiche push (Firebase Cloud Messaging) ----
// Il service worker gira "fuori" dalla pagina, quindi non può usare gli import
// ES modules del resto dell'app: usiamo la build "compat" di Firebase via importScripts,
// che è pensata apposta per questo caso.
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAFmaHbXMTlfTTp6wWVSU76o0_JXrovPeI",
  authDomain: "corb-app26.firebaseapp.com",
  projectId: "corb-app26",
  storageBucket: "corb-app26.firebasestorage.app",
  messagingSenderId: "685810855713",
  appId: "1:685810855713:web:2625310ab8c90af293d860"
});

const messaging = firebase.messaging();

// Notifica ricevuta mentre l'app NON è in primo piano (anche chiusa).
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'CORB';
  const body  = payload?.notification?.body  || '';
  const url   = payload?.data?.url || './prossima.html';
  self.registration.showNotification(title, {
    body,
    icon: './img/logo_c5.png',
    badge: './img/logo_c5.png',
    data: { url }
  });
});

// Pulsante "Invia notifica di prova" nelle Impostazioni: mostra una notifica
// locale, giusto per verificare che permesso + service worker funzionino.
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'local-test-notify'){
    self.registration.showNotification('CORB • Test', {
      body: 'Questa è una notifica di prova.',
      icon: './img/logo_c5.png',
      data: { url: './index.html' }
    });
  }
});

// Click sulla notifica → apre/porta in primo piano l'app sulla pagina giusta.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find(c => c.url.includes(url.replace('./','')));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
