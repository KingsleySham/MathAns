import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Server-side Firestore via the Admin SDK. Returns null when
 * FIREBASE_SERVICE_ACCOUNT is not configured — callers must degrade
 * gracefully (seed rules, no overrides, in-memory stickiness).
 */
export function adminDb(): Firestore | null {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) return null;
    const app =
      getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(sa)) });
    return getFirestore(app);
  } catch {
    return null;
  }
}
