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

const MTIMES_KEY = 'roster.__mtimes';

const STATE_KEYS = [
  'roster.ledger', 'roster.availability', 'roster.rehearsals',
  'roster.checkins', 'roster.leaves', 'roster.project',
  'roster.pollWindow', 'roster.notices', 'roster.presentSubmissions',
  'roster.zoomConfig', 'roster.zoomSession', 'roster.zoomMeetings',
  'roster.checkinCodes', 'roster.attendance',
  'roster.commonReasons', 'roster.commonLeaveReasons',
  'roster.adminInbox'
];

function readMt(obj) {
  try {
    const raw = obj && obj[MTIMES_KEY];
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) { return {}; }
}

function snapshotLocal() {
  const out = {};
  STATE_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v != null) out[k] = v;
  });
  const mt = localStorage.getItem(MTIMES_KEY);
  if (mt != null) out[MTIMES_KEY] = mt;
  return out;
}

function applySnapshot(data) {
  if (!data) return;
  STATE_KEYS.forEach(k => {
    if (typeof data[k] === 'string') localStorage.setItem(k, data[k]);
  });
  if (typeof data[MTIMES_KEY] === 'string') {
    localStorage.setItem(MTIMES_KEY, data[MTIMES_KEY]);
  }
  window.dispatchEvent(new CustomEvent('roster-state-sync'));
}

/* Per-key timestamped merge: keep whichever side has the newer mtime. Keys
   only on one side are preserved. This prevents a fresh ensureSeed()'s empty
   writes from clobbering real remote data, and prevents stale local data
   from overwriting newer edits made on another device. */
function mergeWithTimestamps(localData, remoteData) {
  const localMt = readMt(localData);
  const remoteMt = readMt(remoteData);
  const merged = {};
  const mergedMt = {};
  STATE_KEYS.forEach(k => {
    const lv = localMt[k] || 0;
    const rv = remoteMt[k] || 0;
    const lHas = typeof localData[k] === 'string';
    const rHas = typeof remoteData[k] === 'string';
    if (lHas && rHas) {
      merged[k] = lv >= rv ? localData[k] : remoteData[k];
    } else if (lHas) {
      merged[k] = localData[k];
    } else if (rHas) {
      merged[k] = remoteData[k];
    }
    mergedMt[k] = Math.max(lv, rv);
  });
  merged[MTIMES_KEY] = JSON.stringify(mergedMt);
  return merged;
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
    const remote = snap.data() || {};
    const local = snapshotLocal();
    suspendWrites = true;
    try { applySnapshot(mergeWithTimestamps(local, remote)); } finally { suspendWrites = false; }
  }, (err) => {
    console.warn('[firebase] listener offline:', err.message);
  });

  getDoc(stateRef).then((snap) => {
    const localData = snapshotLocal();
    const remoteData = snap.exists() ? snap.data() : {};
    applySnapshot(mergeWithTimestamps(localData, remoteData));
    initialSyncDone = true;
    ready = true;
    window.dispatchEvent(new CustomEvent('firebase-ready'));
    pushState();
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
function doFlush() {
  if (!db || suspendWrites) return;
  return setDoc(stateRef, snapshotLocal(), { merge: true })
    .catch(e => console.warn('[firebase] push failed:', e.message));
}
function pushState() {
  if (!db || suspendWrites) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; doFlush(); }, 150);
}

/* Flush pending writes before the page unloads so a quick refresh after
   adding a student never loses data. */
function flushNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  doFlush();
}
window.addEventListener('pagehide', flushNow);
window.addEventListener('beforeunload', flushNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushNow();
});

async function submitPresent(entry) {
  if (!db) throw new Error('Firebase not initialised');
  return addDoc(collection(db, 'presentSubmissions'), { ...entry, createdAt: serverTimestamp() });
}

window.rosterFirebase = { isReady: () => ready, pushState, flushNow, submitPresent };
