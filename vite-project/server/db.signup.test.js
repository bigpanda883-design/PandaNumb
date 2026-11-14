import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "panda-signup-"),
);
process.env.DATA_DIR = dataDirectory;

const {
  createUserWithSession,
  default: db,
  getSessionFromToken,
  getUserByEmail,
} = await import("./db.js");

after(() => {
  db.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("signup stores the user and authenticated session together", () => {
  const email = `signup-${crypto.randomUUID()}@example.com`;
  const token = crypto.randomBytes(32).toString("hex");
  const user = createUserWithSession({
    name: "Signup User",
    email,
    passwordHash: "test-password-hash",
    phone: "+2348000000000",
    token,
  });

  assert.equal(getUserByEmail(email)?.id, user.id);
  assert.equal(getSessionFromToken(token)?.userId, user.id);
});

test("signup rolls back the user when session creation fails", () => {
  const email = `rollback-${crypto.randomUUID()}@example.com`;
  const token = crypto.randomBytes(32).toString("hex");
  db.exec(`
    CREATE TRIGGER reject_signup_session
    BEFORE INSERT ON sessions
    BEGIN
      SELECT RAISE(ABORT, 'test session insert failure');
    END;
  `);

  try {
    assert.throws(
      () =>
        createUserWithSession({
          name: "Rollback User",
          email,
          passwordHash: "test-password-hash",
          token,
        }),
      /test session insert failure/,
    );
  } finally {
    db.exec("DROP TRIGGER reject_signup_session");
  }

  assert.equal(getUserByEmail(email), null);
  assert.equal(getSessionFromToken(token), null);
});
