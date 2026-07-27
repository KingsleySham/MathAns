/**
 * Firestore security rules tests. Run against the emulator:
 *   npm run test:rules
 * (requires firebase-tools; the emulator host is provided by
 * `firebase emulators:exec`, or set FIRESTORE_EMULATOR_HOST manually.)
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

let env: RulesTestEnvironment;

function ctx(uid: string | null, role?: string) {
  if (!uid) return env.unauthenticatedContext();
  return env.authenticatedContext(uid, role ? { role } : {});
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-prefect-hub",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe("notices", () => {
  it("signed-out users cannot read", async () => {
    await assertFails(ctx(null).firestore().collection("notices").doc("n1").get());
  });

  it("a prefect can read but not write", async () => {
    const db = ctx("p1", "prefect").firestore();
    await assertSucceeds(db.collection("notices").doc("n1").get());
    await assertFails(
      db.collection("notices").doc("n1").set({ title: "spoof" })
    );
  });

  it("head, vice-head and teacher can write", async () => {
    for (const role of ["head", "vice-head", "teacher"]) {
      await assertSucceeds(
        ctx(`u-${role}`, role)
          .firestore()
          .collection("notices")
          .doc(`n-${role}`)
          .set({ title: "ok" })
      );
    }
  });
});

describe("weather override and rules", () => {
  it("a prefect cannot set the override or edit rules", async () => {
    const db = ctx("p1", "prefect").firestore();
    await assertFails(
      db.collection("weatherOverride").doc("current").set({ preNo8: true })
    );
    await assertFails(
      db.collection("weatherRules").doc("SUSPEND_TC8").set({ severity: "normal" })
    );
  });

  it("a head can set the override", async () => {
    await assertSucceeds(
      ctx("h1", "head")
        .firestore()
        .collection("weatherOverride")
        .doc("current")
        .set({ preNo8: true, manualActive: false })
    );
  });

  it("a user with no role claim cannot write even when signed in", async () => {
    await assertFails(
      ctx("norole")
        .firestore()
        .collection("weatherOverride")
        .doc("current")
        .set({ preNo8: true })
    );
  });
});

describe("users", () => {
  it("a prefect can read their own profile but not others'", async () => {
    const db = ctx("p1", "prefect").firestore();
    await assertSucceeds(db.collection("users").doc("p1").get());
    await assertFails(db.collection("users").doc("p2").get());
  });

  it("a prefect cannot promote themselves", async () => {
    await assertFails(
      ctx("p1", "prefect")
        .firestore()
        .collection("users")
        .doc("p1")
        .set({ role: "head" })
    );
  });

  it("staff can manage the roster", async () => {
    await assertSucceeds(
      ctx("t1", "teacher")
        .firestore()
        .collection("users")
        .doc("p9")
        .set({ name: "New Prefect", role: "prefect", active: true })
    );
  });
});

describe("auditLog", () => {
  it("nobody can write from the client, not even head", async () => {
    await assertFails(
      ctx("h1", "head")
        .firestore()
        .collection("auditLog")
        .doc("a1")
        .set({ action: "spoof" })
    );
  });

  it("head and teacher can read; vice-head and prefect cannot", async () => {
    await assertSucceeds(
      ctx("h1", "head").firestore().collection("auditLog").doc("a1").get()
    );
    await assertSucceeds(
      ctx("t1", "teacher").firestore().collection("auditLog").doc("a1").get()
    );
    await assertFails(
      ctx("v1", "vice-head").firestore().collection("auditLog").doc("a1").get()
    );
    await assertFails(
      ctx("p1", "prefect").firestore().collection("auditLog").doc("a1").get()
    );
  });
});

describe("dailyArrangement", () => {
  it("readable when signed in, never client-writable", async () => {
    const day = "2026-07-27";
    await assertSucceeds(
      ctx("p1", "prefect").firestore().collection("dailyArrangement").doc(day).get()
    );
    await assertFails(
      ctx("h1", "head")
        .firestore()
        .collection("dailyArrangement")
        .doc(day)
        .set({ severity: "suspended" })
    );
  });
});
