// Firebase bridge for The Orchestral Frame — mathans---roster project
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, onSnapshot, setDoc, getDoc, getDocs, deleteDoc,
  addDoc, collection, serverTimestamp
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

/* Collection-owned state has been migrated out of state/main. Only true
   singletons (project, poll window, zoom config/session, common-reason
   presets, locally-cached present submissions) still flow through here. */
const STATE_KEYS = [
  'roster.project', 'roster.pollWindow',
  'roster.zoomConfig', 'roster.zoomSession', 'roster.zoomMeetings',
  'roster.commonReasons', 'roster.commonLeaveReasons',
  'roster.presentSubmissions'
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
  flushTimer = setTimeout(() => { flushTimer = null; doFlush(); scheduleBackup(); }, 150);
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

/* ── Safety-net snapshots ──────────────────────────────────────────────────
   Every meaningful change also writes a timestamped backup document to
   `backups/{timestamp}` containing every roster.* localStorage key. If the
   live state is ever corrupted, every prior version remains recoverable
   from the Firestore console — there is no data loss path that survives
   this safety net. Backups are throttled to one every 30 seconds so we
   don't run up the document count needlessly. */

function snapshotEverything() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('roster.')) out[k] = localStorage.getItem(k);
  }
  return out;
}

let lastBackupAt = 0;
let backupTimer = null;
function scheduleBackup() {
  if (!db) return;
  const now = Date.now();
  const wait = Math.max(0, 30000 - (now - lastBackupAt));
  if (backupTimer) return;
  backupTimer = setTimeout(async () => {
    backupTimer = null;
    lastBackupAt = Date.now();
    const id = String(lastBackupAt);
    try {
      await setDoc(doc(db, 'backups', id), {
        at: lastBackupAt,
        agent: navigator.userAgent.slice(0, 120),
        data: snapshotEverything()
      });
    } catch (e) { console.warn('[firebase] backup failed:', e.message); }
  }, wait);
}

/* ── Tombstones ───────────────────────────────────────────────────────────
   Deletions write a permanent marker to `tombstones/{name}__{id}` so a
   stale cache on another device — or an old invite URL — can never
   resurrect a deleted row. The tombstone listener syncs across every
   device; any write or cache-set that matches a tombstone is rejected.
   Tombstones are additive: removing one (manually via the Firestore
   console, or via Roster.restoreTombstoned) undoes the block. */

const _tombstones = new Set(); // "name:id"
let _tombstonesReady = false;

function _tombstoneKey(name, id) { return `${name}:${id}`; }
function _tombstoneDocId(name, id) { return `${name}__${id}`; }

function isTombstoned(name, id) {
  return _tombstones.has(_tombstoneKey(name, id));
}

async function tombstone(name, id) {
  _tombstones.add(_tombstoneKey(name, id));
  if (!db) return;
  try {
    await setDoc(doc(db, 'tombstones', _tombstoneDocId(name, id)), {
      collection: name, id, at: Date.now()
    });
  } catch (e) { console.warn(`[firebase] tombstone ${name}/${id} failed:`, e.message); }
}

async function restoreTombstoned(name, id) {
  _tombstones.delete(_tombstoneKey(name, id));
  if (!db) return;
  try { await deleteDoc(doc(db, 'tombstones', _tombstoneDocId(name, id))); }
  catch (e) { console.warn(`[firebase] untombstone ${name}/${id} failed:`, e.message); }
}

if (db) {
  onSnapshot(collection(db, 'tombstones'), (snap) => {
    snap.docChanges().forEach(change => {
      const data = change.doc.data() || {};
      if (!data.collection || !data.id) return;
      const key = _tombstoneKey(data.collection, data.id);
      if (change.type === 'removed') _tombstones.delete(key);
      else _tombstones.add(key);
    });
    _tombstonesReady = true;
    /* Sweep every live collection cache so any already-loaded row that
       matches a freshly-seen tombstone is evicted immediately, and fan
       out to subscribers. */
    Object.keys(_collectionListeners).forEach(name => {
      const entry = _collectionListeners[name];
      let changed = false;
      [...entry.cache.keys()].forEach(id => {
        if (isTombstoned(name, id)) { entry.cache.delete(id); changed = true; }
      });
      if (changed) {
        const arr = _arrFromCache(entry.cache);
        entry.subs.forEach(fn => { try { fn(arr); } catch (e) { console.warn(e); } });
      }
    });
  }, (err) => console.warn('[firebase] tombstones listener offline:', err.message));
}

const _collectionListeners = {}; // name → { cache: Map<id,data>, subs: Set<fn>, started: bool }

function _ensureCollection(name) {
  if (_collectionListeners[name]) return _collectionListeners[name];
  const entry = { cache: new Map(), subs: new Set(), started: false };
  _collectionListeners[name] = entry;
  if (!db) return entry;
  const colRef = collection(db, name);
  onSnapshot(colRef, (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') { entry.cache.delete(change.doc.id); return; }
      /* A tombstone always wins: silently drop any doc that's been
         marked deleted, so it can't resurface in the cache. */
      if (isTombstoned(name, change.doc.id)) return;
      entry.cache.set(change.doc.id, change.doc.data());
    });
    entry.started = true;
    const arr = _arrFromCache(entry.cache);
    entry.subs.forEach(fn => { try { fn(arr); } catch (e) { console.warn(e); } });
  }, (err) => console.warn(`[firebase] ${name} listener offline:`, err.message));
  return entry;
}

function _arrFromCache(cache) {
  const arr = [];
  cache.forEach((data, id) => arr.push({ __id: id, ...data }));
  return arr;
}

function subscribeCollection(name, onChange) {
  const entry = _ensureCollection(name);
  entry.subs.add(onChange);
  /* Fire immediately if we already have cached docs from a prior subscriber. */
  if (entry.started) onChange(_arrFromCache(entry.cache));
  return () => entry.subs.delete(onChange);
}

async function writeCollectionDoc(name, id, data) {
  if (!db) return;
  /* Refuse to resurrect a tombstoned row. This is the anti-zombie check:
     migrations from stale devices and permanent invite URLs both funnel
     through here, and this short-circuit stops them cold. */
  if (isTombstoned(name, id)) return;
  await setDoc(doc(db, name, id), data, { merge: true }).catch(e =>
    console.warn(`[firebase] ${name}/${id} write failed:`, e.message));
  /* Optimistically prime the local cache so subsequent reads see the write
     without waiting for the snapshot round-trip. */
  const entry = _collectionListeners[name];
  if (entry) entry.cache.set(id, { ...(entry.cache.get(id) || {}), ...data });
  scheduleBackup();
}

async function deleteCollectionDoc(name, id) {
  if (!db) return;
  /* Write the tombstone BEFORE the delete so a racing read can never
     see the row without also seeing that it's been deleted. */
  await tombstone(name, id);
  await deleteDoc(doc(db, name, id)).catch(e =>
    console.warn(`[firebase] ${name}/${id} delete failed:`, e.message));
  const entry = _collectionListeners[name];
  if (entry) entry.cache.delete(id);
}

window.rosterFirebase = {
  isReady: () => ready,
  pushState, flushNow, submitPresent,
  subscribeCollection, writeCollectionDoc, deleteCollectionDoc,
  isTombstoned, tombstone, restoreTombstoned
};
