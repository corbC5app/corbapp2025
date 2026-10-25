// data-store.js — versione Firestore
// Al posto del CSV da Google Sheet, i dati vivono in Firestore.
// Ogni pagina "si iscrive" con onSnapshot: quando qualcosa cambia nel
// database (perché l'admin ha modificato o perché lo scraper del
// campionato ha scritto un nuovo risultato), TUTTI i telefoni aperti
// ricevono l'aggiornamento all'istante, senza dover ricaricare nulla.

import { db } from './firebase-init.js';
import {
  collection, onSnapshot, query, orderBy,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const COLLECTIONS = {
  matches:   'matches',    // partite (risultati + calendario insieme, distinti da data)
  news:      'news',
  players:   'players',
  videos:    'videos',
  standings: 'standings', // classifica
  scorersHistory: 'scorers_history', // marcatori delle stagioni passate (archivio)
};

// Stagione corrente in formato "2025/26" (settembre→giugno; da luglio si considera
// già iniziata la preparazione della stagione successiva).
// Usata come valore di default nei form Admin e per i filtri stagione.
export function currentSeason(){
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; // 6 = luglio
  return `${y}/${String(y+1).slice(-2)}`;
}

// ---- Sottoscrizioni in tempo reale ----
// cb(arrayDiOggetti) viene richiamata subito e ad ogni cambiamento.
// Ritorna una funzione unsubscribe da chiamare quando si lascia la pagina.
function subscribe(collName, cb, orderField=null, direction='asc'){
  const col = collection(db, collName);
  const q = orderField ? query(col, orderBy(orderField, direction)) : col;
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(rows);
  }, (err) => {
    console.error(`[corb] errore lettura "${collName}":`, err.message);
    cb([]); // meglio una lista vuota che una pagina rotta
  });
}

export const subscribeMatches = (cb) => subscribe(COLLECTIONS.matches, cb, 'data');
export const subscribeNews    = (cb) => subscribe(COLLECTIONS.news, cb, 'createdAt', 'desc');
export const subscribePlayers = (cb) => subscribe(COLLECTIONS.players, cb);
export const subscribeVideos  = (cb) => subscribe(COLLECTIONS.videos, cb);
export const subscribeStandings = (cb) => subscribe(COLLECTIONS.standings, cb);
export const subscribeScorersHistory = (cb) => subscribe(COLLECTIONS.scorersHistory, cb);

// ---- CRUD per il pannello Admin ----
// (le regole di sicurezza di Firestore permettono la scrittura solo se loggati)
async function addItem(collName, data){
  return addDoc(collection(db, collName), { ...data, createdAt: serverTimestamp() });
}
async function updateItem(collName, id, data){
  return updateDoc(doc(db, collName, id), data);
}
async function deleteItem(collName, id){
  return deleteDoc(doc(db, collName, id));
}

export const Matches = {
  add:    (data) => addItem(COLLECTIONS.matches, data),
  update: (id, data) => updateItem(COLLECTIONS.matches, id, data),
  remove: (id) => deleteItem(COLLECTIONS.matches, id),
};
export const News = {
  add:    (data) => addItem(COLLECTIONS.news, data),
  update: (id, data) => updateItem(COLLECTIONS.news, id, data),
  remove: (id) => deleteItem(COLLECTIONS.news, id),
};
export const Players = {
  add:    (data) => addItem(COLLECTIONS.players, data),
  update: (id, data) => updateItem(COLLECTIONS.players, id, data),
  remove: (id) => deleteItem(COLLECTIONS.players, id),
};
export const Videos = {
  add:    (data) => addItem(COLLECTIONS.videos, data),
  update: (id, data) => updateItem(COLLECTIONS.videos, id, data),
  remove: (id) => deleteItem(COLLECTIONS.videos, id),
};
export const Standings = {
  add:    (data) => addItem(COLLECTIONS.standings, data),
  update: (id, data) => updateItem(COLLECTIONS.standings, id, data),
  remove: (id) => deleteItem(COLLECTIONS.standings, id),
};

// ===== Campi di gioco delle squadre (fonte: CSI Live, "Squadre iscritte") =====
// Serve per mostrare la via quando il Corbiolo gioca IN TRASFERTA: è il campo della squadra di casa.
// Il confronto ignora maiuscole, accenti, punti e apici ("C.U.S. Verona A.S.D." = "cus verona").
// Nuova Cometa: indirizzo non ancora inserito.
const _CAMPI = [
  ['union best',        "Campo Polisportiva Erbè, Via San Giuseppe 1, 37060 Erbè"],
  ['guidizzolo',        "C.S. Comunale - Campo Coperto, Via Matteotti 9, 46040 Guidizzolo"],
  ['ponte crencano',    "Campo Avesa, Via Delle Agostiniane, 37127 Verona"],
  ['beer club',         "C.S. Avanzi, Via Flavio Gioia, 37100 Verona"],
  ['cus verona',        "Palazzetto Gavagnin (parquet), Via Montelungo, 37131 Verona"],
  ['confimpresaitalia', "Palazzetto dello Sport, Via dell'Artigianato, 37040 Zimella"],
  ['curacao',           "C.S. Avanzi, Via Flavio Gioia, 37100 Verona"],
  ['flip off',          "C.S. Avanzi, Via Flavio Gioia, 37100 Verona"],
  ['casaloldo',         "Palestra Comunale Casaloldo, Via Montegrappa 12, 46040 Casaloldo"],
  ['goto mit uns',      "C.S. Avanzi, Via Flavio Gioia, 37100 Verona"],
  ['hammers',           "C.S. Avanzi, Via Flavio Gioia, 37100 Verona"],
  ['conte di verona',   "C.S. De Stefani, Via Gran Sasso 1, 37132 Verona"],
  ['taverna',           "Campo Sintetico, Via Alcide De Gasperi, 37035 San Giovanni Ilarione"],
  ['oto',               "C.S. De Stefani, Via Gran Sasso 1, 37132 Verona"],
  ['pdc',               "Campo Sportivo, Via Prealpi 15A, Stallavena-Lugo, 37023 Verona"],
  ['peretti cofer',     "Esperia Circolo Sportivo, Via Marin Faliero 98, Saval, 37138 Verona"],
  ['rosegaferro',       "Impianti Sportivi di Rosegaferro, Via Giuseppe Zamboni 20, 37069 Verona"],
  ['muchachos',         "C.S. De Stefani, Via Gran Sasso 1, 37132 Verona"],
  ['real vigo',         "Impianti Sportivi, Via Bassa 1, 37066 Sommacampagna"],
  ['scaligeri',         "C.S. Avanzi, Via Flavio Gioia, 37100 Verona"],
];
const _normSq = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function viaCampoSquadra(nome){
  const n = ' ' + _normSq(nome) + ' ';
  const r = _CAMPI.find(([k]) => n.includes(' ' + k + ' '));
  return r ? r[1] : '';
}
