import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "panda-password-reset-"),
);
process.env.DATA_DIR = dataDirectory;

const {
  completePasswordReset,
  createPasswordResetToken,
  createSession,
  createUser,
  default: db,
  getPasswordResetTokenByHash,
  getSessionFromToken,
  getUserById,
} = await import("./db.js");

after(() => {
  db.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

function createTestUser() {
  return createUser({
    name: "Reset Test",
    email: `reset-${crypto.randomUUID()}@example.com`,
    passwordHash: "old-password-hash",
  });
}

test("password reset token is single-use and replaces existing sessions", () => {
  const user = createTestUser();
  const tokenHash = crypto.randomBytes(32).toString("hex");
  const reset = createPasswordResetToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const oldSessionToken = crypto.randomBytes(32).toString("hex");
  const newSessionToken = crypto.randomBytes(32).toString("hex");
  createSession({ userId: user.id, token: oldSessionToken });

  const result = completePasswordReset({
    userId: user.id,
    passwordHash: "new-password-hash",
    resetTokenId: reset.id,
    sessionToken: newSessionToken,
  });

  assert.equal(result.token, newSessionToken);
  assert.equal(getUserById(user.id).passwordHash, "new-password-hash");
  assert.equal(getSessionFromToken(oldSessionToken), null);
  assert.equal(getSessionFromToken(newSessionToken)?.userId, user.id);
  assert.ok(getPasswordResetTokenByHash(tokenHash).used_at);
  assert.equal(
    completePasswordReset({
      userId: user.id,
      passwordHash: "replayed-password-hash",
      resetTokenId: reset.id,
      sessionToken: crypto.randomBytes(32).toString("hex"),
    }),
    null,
  );
  assert.equal(getUserById(user.id).passwordHash, "new-password-hash");
});

test("expired password reset token cannot update the password", () => {
  const user = createTestUser();
  const reset = createPasswordResetToken({
    userId: user.id,
    tokenHash: crypto.randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });

  assert.equal(
    completePasswordReset({
      userId: user.id,
      passwordHash: "new-password-hash",
      resetTokenId: reset.id,
      sessionToken: crypto.randomBytes(32).toString("hex"),
    }),
    null,
  );
  assert.equal(getUserById(user.id).passwordHash, "old-password-hash");
});
