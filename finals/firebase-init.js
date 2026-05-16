// Firebase bridge for the finals study platform.
// Reuses the mathans---roster project; adds the `notes` collection
// (Firestore) and the `notes/{id}/` path (Storage).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyDbZMNj5deQR4dlNDNcCEipQb_iYv3T508",
  authDomain: "mathans---roster.firebaseapp.com",
  projectId: "mathans---roster",
  storageBucket: "mathans---roster.firebasestorage.app",
  messagingSenderId: "321304885494",
  appId: "1:321304885494:web:4d840406f3b98e391194d7",
  measurementId: "G-5QJTH1NN0P"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

export {
  collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
  ref, uploadBytesResumable, getDownloadURL, deleteObject
};
