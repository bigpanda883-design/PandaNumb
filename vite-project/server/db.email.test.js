import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "panda-email-verification-"),
);
process.env.DATA_DIR = dataDirectory;

const {
  createEmailVerificationCode,
  createSession,
  createUser,
  default: db,
  getLatestEmailVerificationCode,
  getSessionFromToken,
  getUserById,
  incrementEmailVerificationAttempts,
  verifyUserEmail,
} = await import("./db.js");

after(() => {
  db.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("email verification codes expire, limit attempts, and can be used once", () => {
  const user = createUser({
    name: "Test User",
    email: `test-${crypto.randomUUID()}@example.com`,
    passwordHash: "test-hash",
  });

  test("a new account can start a session without email verification", () => {
    const token = crypto.randomBytes(32).toString("hex");
    const user = createUser({
      name: "New User",
      email: `signup-${crypto.randomUUID()}@example.com`,
      passwordHash: "test-hash",
      phone: "+2348000000000",
    });
    createSession({ userId: user.id, token });

    assert.equal(user.emailVerifiedAt, null);
    assert.equal(getSessionFromToken(token)?.userId, user.id);
  });
  assert.equal(user.emailVerifiedAt, null);

  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const firstCode = createEmailVerificationCode({
    userId: user.id,
    codeHash: "first-code-hash",
    expiresAt,
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    incrementEmailVerificationAttempts(firstCode.id);
  }
  assert.equal(getLatestEmailVerificationCode(user.id).attempts, 5);
  assert.equal(
    verifyUserEmail({ userId: user.id, codeId: firstCode.id }),
    null,
  );

  const secondCode = createEmailVerificationCode({
    userId: user.id,
    codeHash: "second-code-hash",
    expiresAt,
  });
  assert.equal(getLatestEmailVerificationCode(user.id).id, secondCode.id);
  assert.equal(getLatestEmailVerificationCode(user.id).used_at, null);

  const verification = verifyUserEmail({
    userId: user.id,
    codeId: secondCode.id,
  });
  assert.deepEqual(verification, { verifiedNow: true });
  assert.ok(getUserById(user.id).emailVerifiedAt);
  assert.equal(
    verifyUserEmail({ userId: user.id, codeId: secondCode.id }),
    null,
  );
});
