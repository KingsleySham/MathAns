// Firebase bridge for the finals study platform.
// Reuses the mathans---roster project. Firestore holds note metadata.
// File blobs are stored as commits in this GitHub repo under
// finals-uploads/{noteId}/{filename} (see /api/upload-note.js).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, increment
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

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, increment
};
