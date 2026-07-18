// Firebase bridge for the 鴻安 (Hung On) POS + admin pages.
// Reuses the mathans-final project (same one finals/ and roster/ use) but
// writes to its own hungonProducts / hungonCategories / hungonMeta
// collections, so this feature can never read or clobber unrelated data.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAa-1SGL5WNl9IVkJFBRrL02XTPclLO8EE",
  authDomain: "mathans-final.firebaseapp.com",
  projectId: "mathans-final",
  storageBucket: "mathans-final.firebasestorage.app",
  messagingSenderId: "601524416367",
  appId: "1:601524416367:web:5baccc91a84653587fc29a",
  measurementId: "G-9RFB7TTX26"
};

const PRODUCTS_COL = 'hungonProducts';
const CATEGORIES_COL = 'hungonCategories';
const META_DOC = 'hungonMeta/status';

let db = null;
let ready = false;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  ready = true;
} catch (e) {
  console.warn('[hungon-firebase] init failed, offline mode:', e.message);
}

window.dispatchEvent(new CustomEvent('hungon-firebase-ready'));

function subscribeProducts(onChange) {
  if (!db) return () => {};
  return onSnapshot(collection(db, PRODUCTS_COL), (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    onChange(arr);
  }, (err) => console.warn('[hungon-firebase] products listener offline:', err.message));
}

function subscribeCategories(onChange) {
  if (!db) return () => {};
  return onSnapshot(collection(db, CATEGORIES_COL), (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    onChange(arr);
  }, (err) => console.warn('[hungon-firebase] categories listener offline:', err.message));
}

async function upsertProduct(id, data) {
  if (!db) throw new Error('Firestore not available');
  await setDoc(doc(db, PRODUCTS_COL, id), data, { merge: true });
}

async function deleteProduct(id) {
  if (!db) throw new Error('Firestore not available');
  await deleteDoc(doc(db, PRODUCTS_COL, id));
}

async function upsertCategory(id, data) {
  if (!db) throw new Error('Firestore not available');
  await setDoc(doc(db, CATEGORIES_COL, id), data, { merge: true });
}

async function deleteCategory(id) {
  if (!db) throw new Error('Firestore not available');
  await deleteDoc(doc(db, CATEGORIES_COL, id));
}

/* One-time seed: if the catalogue has never been written to Firestore
   (fresh project, or before this feature existed), copy in the built-in
   starter catalogue from products.js so the shop isn't staring at an
   empty POS. Guarded by hungonMeta/status so it only ever runs once. */
async function seedIfEmpty(seedCategories, seedProducts) {
  if (!db) return;
  try {
    const metaRef = doc(db, META_DOC.split('/')[0], META_DOC.split('/')[1]);
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists() && metaSnap.data().seeded) return;

    const existing = await getDocs(collection(db, PRODUCTS_COL));
    if (!existing.empty) {
      await setDoc(metaRef, { seeded: true }, { merge: true });
      return;
    }

    await Promise.all(seedCategories.map(c =>
      setDoc(doc(db, CATEGORIES_COL, c.id), { name: c.name }, { merge: true })
    ));
    await Promise.all(seedProducts.map(p =>
      setDoc(doc(db, PRODUCTS_COL, p.id), {
        name: p.name, unit: p.unit, price: p.price, category: p.category
      }, { merge: true })
    ));
    await setDoc(metaRef, { seeded: true }, { merge: true });
  } catch (e) {
    console.warn('[hungon-firebase] seed failed:', e.message);
  }
}

window.hungonFirebase = {
  isReady: () => ready,
  subscribeProducts, subscribeCategories,
  upsertProduct, deleteProduct,
  upsertCategory, deleteCategory,
  seedIfEmpty
};
