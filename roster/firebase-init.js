// Firebase bridge for The Orchestral Frame — mathans---roster project
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, onSnapshot, setDoc, getDoc, addDoc, collection, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDbZMNj5deQR4dlNDNcCEipQb_iYv3T508",
  authDomain: "mathans---roster.firebaseapp.com",
  projectId: "mathans---roster",
  storageBucket: "mathans---roster.firebasestorage.app",
  messagingSenderId: "321304885494",
  appId: "1:321304885494:web:4d840406f3b98e391194d7",
  measurementId: "G-5QJTH1NN0P"
};

const STATE_KEYS = [
  'roster.ledger', 'roster.availability', 'roster.rehearsals',
  'roster.checkins', 'roster.leaves', 'roster.project',
  'roster.pollWindow', 'roster.notices', 'roster.presentSubmissions',
  'roster.zoomConfig', 'roster.zoomSession', 'roster.zoomMeetings',
  'roster.checkinCodes', 'roster.attendance',
  'roster.commonReasons', 'roster.commonLeaveReasons',
  'roster.adminInbox'
];

function snapshotLocal() {
  const out = {};
  STATE_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v != null) out[k] = v;
  });
  return out;
}

function applySnapshot(data) {
  if (!data) return;
  STATE_KEYS.forEach(k => {
    if (typeof data[k] === 'string') localStorage.setItem(k, data[k]);
  });
  window.dispatchEvent(new CustomEvent('roster-state-sync'));
}

let db, stateRef, ready = false, suspendWrites = false;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  stateRef = doc(db, 'state', 'main');

  let initialSyncDone = false;

  onSnapshot(stateRef, (snap) => {
    if (!snap.exists()) return;
    if (!initialSyncDone) return;
    suspendWrites = true;
    try { applySnapshot(snap.data()); } finally { suspendWrites = false; }
  }, (err) => {
    console.warn('[firebase] listener offline:', err.message);
  });

  getDoc(stateRef).then((snap) => {
    const localData = snapshotLocal();
    const remoteData = snap.exists() ? snap.data() : {};

    // Merge: prefer local if it's newer or more complete
    let merged = { ...remoteData };
    STATE_KEYS.forEach(k => {
      if (localData[k]) {
        merged[k] = localData[k];
      }
    });

    applySnapshot(merged);
    initialSyncDone = true;
    ready = true;
    window.dispatchEvent(new CustomEvent('firebase-ready'));
  }).catch(() => {
    initialSyncDone = true;
    ready = true;
    window.dispatchEvent(new CustomEvent('firebase-ready'));
  });
} catch (e) {
  console.warn('[firebase] init failed, offline mode:', e.message);
  ready = true;
  window.dispatchEvent(new CustomEvent('firebase-ready'));
}

let flushTimer = null;
function pushState() {
  if (!db || suspendWrites) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(async () => {
    try { await setDoc(stateRef, snapshotLocal(), { merge: true }); }
    catch (e) { console.warn('[firebase] push failed:', e.message); }
  }, 300);
}

async function submitPresent(entry) {
  if (!db) throw new Error('Firebase not initialised');
  return addDoc(collection(db, 'presentSubmissions'), { ...entry, createdAt: serverTimestamp() });
}

window.rosterFirebase = { isReady: () => ready, pushState, submitPresent };
