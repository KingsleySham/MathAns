/**
 * Set a user's role as a Firebase custom claim.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' npx tsx scripts/set-role.ts <email> <role>
 *
 * Roles: prefect | vice-head | head | teacher
 * The user must sign out/in (or refresh their token) to pick up the change.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const ROLES = ["prefect", "vice-head", "head", "teacher"] as const;

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !ROLES.includes(role as (typeof ROLES)[number])) {
    console.error("Usage: set-role.ts <email> <prefect|vice-head|head|teacher>");
    process.exit(1);
  }
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    console.error("FIREBASE_SERVICE_ACCOUNT env var is required.");
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(sa)) });
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { role });
  console.log(`Set role '${role}' on ${email} (${user.uid}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
