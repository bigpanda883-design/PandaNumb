import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const databaseDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "server", "data");
fs.mkdirSync(databaseDir, { recursive: true });

export const DATABASE_PATH = path.join(databaseDir, "panda.db");

const db = new Database(DATABASE_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    wallet_balance REAL NOT NULL DEFAULT 0,
    transactions TEXT NOT NULL DEFAULT '[]',
    notifications TEXT NOT NULL DEFAULT '[]',
    purchased_numbers TEXT NOT NULL DEFAULT '[]',
    activations TEXT NOT NULL DEFAULT '[]',
    referral_data TEXT NOT NULL DEFAULT '{}',
    profile_data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON users(phone)
  WHERE phone <> '';

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_reset_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Step F of the reset flow: after a code is verified, the user may change the
  -- password once, using this token. Only a SHA-256 hash is stored, so reading
  -- the database does not hand out working reset links. Optional columns are
  -- added below for databases created before this table existed.
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/**
 * Minimal forward-only migration.
 *
 * `CREATE TABLE IF NOT EXISTS` above does not add columns to a table that a
 * previous deployment already created, so new columns are added here. Each
 * check reads the live schema instead of keeping a version number, which keeps
 * this safe to run on every start.
 */
function hasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
}

if (!hasColumn("password_reset_codes", "verified_at")) {
  // Set when the six-digit code has been checked and accepted. A verified code
  // can no longer be used on its own to change the password - see
  // getVerifiedPasswordResetCode().
  db.exec("ALTER TABLE password_reset_codes ADD COLUMN verified_at TEXT");
}

if (!hasColumn("password_reset_codes", "token_id")) {
  db.exec("ALTER TABLE password_reset_codes ADD COLUMN token_id TEXT");
}

export function nowIso() {
  return new Date().toISOString();
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseJson(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createUser({ name, email, passwordHash, phone = "" }) {
  const now = nowIso();
  const user = {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    phone,
    password_hash: passwordHash,
    wallet_balance: 0,
    transactions: "[]",
    notifications: "[]",
    purchased_numbers: "[]",
    activations: "[]",
    referral_data: JSON.stringify({ referralCode: null, referredBy: null }),
    profile_data: JSON.stringify({ bio: "", avatar: null, timezone: "UTC" }),
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `
      INSERT INTO users (
        id, name, email, phone, password_hash, wallet_balance,
        transactions, notifications, purchased_numbers, activations,
        referral_data, profile_data, created_at, updated_at
      ) VALUES (
        @id, @name, @email, @phone, @password_hash, @wallet_balance,
        @transactions, @notifications, @purchased_numbers, @activations,
        @referral_data, @profile_data, @created_at, @updated_at
      )
    `,
  ).run(user);

  return getUserById(user.id);
}

export function getUserByEmail(email) {
  const row = db
    .prepare(
      `
        SELECT * FROM users WHERE LOWER(email) = LOWER(?)
      `,
    )
    .get(String(email).trim());

  if (!row) return null;
  return normalizeUser(row);
}

export function getUserByPhone(phone) {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) return null;

  const row = db
    .prepare(
      `
        SELECT * FROM users WHERE phone = ?
      `,
    )
    .get(normalizedPhone);

  if (!row) return null;
  return normalizeUser(row);
}

export function getUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!row) return null;
  return normalizeUser(row);
}

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name,
    fullName: row.name,
    email: row.email,
    phone: row.phone || "",
    passwordHash: row.password_hash,
    walletBalance: Number(row.wallet_balance || 0),
    transactions: parseJson(row.transactions, []),
    notifications: parseJson(row.notifications, []),
    numbers: parseJson(row.purchased_numbers, []),
    activations: parseJson(row.activations, []),
    referralData: parseJson(row.referral_data, {}),
    profileData: parseJson(row.profile_data, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.name || user.fullName,
    name: user.name || user.fullName,
    email: user.email,
    phone: user.phone || "",
    walletBalance: Number(user.walletBalance || 0),
    transactions: Array.isArray(user.transactions) ? user.transactions : [],
    notifications: Array.isArray(user.notifications) ? user.notifications : [],
    numbers: Array.isArray(user.numbers) ? user.numbers : [],
    activations: Array.isArray(user.activations) ? user.activations : [],
    referralData: user.referralData || {},
    profileData: user.profileData || {},
  };
}

export function createSession({ userId, token }) {
  const id = crypto.randomUUID();
  const tokenHash = hashToken(token);
  const now = nowIso();
  const expiresAt = new Date(
    Date.now() + 1000 * 60 * 60 * 24 * 7,
  ).toISOString();

  db.prepare(
    `
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
      VALUES (@id, @userId, @tokenHash, @expiresAt, @createdAt)
    `,
  ).run({ id, userId, tokenHash, expiresAt, createdAt: now });

  return { id, token, expiresAt };
}

export function getSessionFromToken(token) {
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `
        SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?
      `,
    )
    .get(tokenHash, nowIso());

  if (!row) return null;
  return { id: row.id, userId: row.user_id, expiresAt: row.expires_at };
}

export function deleteSessionByToken(token) {
  const tokenHash = hashToken(token);
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteAllSessionsForUser(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function updateUserPassword(userId, passwordHash) {
  db.prepare(
    `
      UPDATE users
      SET password_hash = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(passwordHash, nowIso(), userId);
}

export function updateUserWalletBalance(userId, balance) {
  const nextBalance = Number(balance || 0);
  db.prepare(
    `
      UPDATE users
      SET wallet_balance = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(nextBalance, nowIso(), userId);

  return getUserById(userId);
}

/**
 * Append one transaction record to a user's history (newest first).
 *
 * The whole history lives in a single JSON column, so the update is a read -
 * unshift - write. It returns the user so the caller can answer with the new
 * balance and history in one round trip.
 */
export function appendUserTransaction(userId, transaction) {
  const user = getUserById(userId);
  if (!user) return null;

  const history = Array.isArray(user.transactions) ? user.transactions : [];
  const nextHistory = [transaction, ...history].slice(0, 500);

  db.prepare(
    `
      UPDATE users
      SET transactions = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(JSON.stringify(nextHistory), nowIso(), userId);

  return getUserById(userId);
}

/** Append one purchased number record (newest first). */
export function appendUserNumber(userId, number) {
  const user = getUserById(userId);
  if (!user) return null;

  const numbers = Array.isArray(user.numbers) ? user.numbers : [];
  const nextNumbers = [number, ...numbers].slice(0, 500);

  db.prepare(
    `
      UPDATE users
      SET purchased_numbers = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(JSON.stringify(nextNumbers), nowIso(), userId);

  return getUserById(userId);
}

/** Update a stored purchased number in place (e.g. its status/code). */
export function updateUserNumber(userId, numberId, patch) {
  const user = getUserById(userId);
  if (!user) return null;

  const numbers = Array.isArray(user.numbers) ? user.numbers : [];
  const nextNumbers = numbers.map((entry) =>
    entry.id === numberId ? { ...entry, ...patch } : entry,
  );

  db.prepare(
    `
      UPDATE users
      SET purchased_numbers = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(JSON.stringify(nextNumbers), nowIso(), userId);

  return getUserById(userId);
}

export function createPasswordResetCode({ userId, codeHash, expiresAt }) {
  const id = crypto.randomUUID();

  db.prepare(
    `
      INSERT INTO password_reset_codes (id, user_id, code_hash, expires_at, attempts, used_at, created_at)
      VALUES (@id, @userId, @codeHash, @expiresAt, 0, NULL, @createdAt)
    `,
  ).run({
    id,
    userId,
    codeHash,
    expiresAt,
    createdAt: nowIso(),
  });

  return { id };
}

export function getLatestPasswordResetCode(userId) {
  return db
    .prepare(
      `
        SELECT * FROM password_reset_codes
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(userId);
}

export function incrementPasswordResetAttempts(codeId) {
  db.prepare(
    `
      UPDATE password_reset_codes
      SET attempts = attempts + 1
      WHERE id = ?
    `,
  ).run(codeId);
}

export function markPasswordResetUsed(codeId) {
  db.prepare(
    `
      UPDATE password_reset_codes
      SET used_at = ?, attempts = attempts + 1
      WHERE id = ?
    `,
  ).run(nowIso(), codeId);
}

export function getPasswordResetAttempts(codeId) {
  const row = db
    .prepare("SELECT attempts FROM password_reset_codes WHERE id = ?")
    .get(codeId);
  return Number(row?.attempts || 0);
}

export default db;

/* ------------------------------------------------------------------ *
 * Password reset: verified-code state and single-use reset tokens
 * ------------------------------------------------------------------ */

/**
 * Mark a reset code as verified and attach the token issued for it.
 *
 * Once this is set the code itself is spent: a repeated attempt to verify it,
 * or to reset with it, is refused. The short-lived token is the only proof that
 * can change the password.
 */
export function markPasswordResetCodeVerified(codeId, tokenId) {
  db.prepare(
    `
      UPDATE password_reset_codes
      SET verified_at = ?, token_id = ?
      WHERE id = ?
    `,
  ).run(nowIso(), tokenId, codeId);
}

/**
 * The newest code for this user that was verified but not yet used, together
 * with the token id it issued. Null when there is no such code.
 *
 * Expiry of the token itself is checked by the caller, which needs the token
 * row anyway.
 */
export function getVerifiedPasswordResetCode(userId) {
  const row = db
    .prepare(
      `
        SELECT * FROM password_reset_codes
        WHERE user_id = ? AND verified_at IS NOT NULL AND used_at IS NULL
        ORDER BY verified_at DESC
        LIMIT 1
      `,
    )
    .get(userId);

  return row || null;
}

/**
 * Invalidate every reset code a user still has outstanding.
 *
 * Called when a password is changed (or a new code is issued for the same
 * account would be too aggressive - new codes simply supersede older ones by
 * being newer), so no older code can be replayed afterwards.
 */
export function invalidatePasswordResetCodesForUser(userId) {
  db.prepare(
    `
      UPDATE password_reset_codes
      SET used_at = ?
      WHERE user_id = ? AND used_at IS NULL
    `,
  ).run(nowIso(), userId);
}

/** Delete every reset token a user holds, EXCEPT one that must survive.
 *
 * On a completed reset the used token row is deliberately kept: it is what
 * lets a replay of the same token be recognised ("already used") instead of
 * looking like a token that never existed. */
export function invalidatePasswordResetTokensForUser(userId, keepTokenId = null) {
  if (keepTokenId) {
    db.prepare(
      "DELETE FROM password_reset_tokens WHERE user_id = ? AND id <> ?",
    ).run(userId, keepTokenId);
    return;
  }
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
}

export function createPasswordResetToken({ userId, tokenHash, expiresAt }) {
  const id = crypto.randomUUID();

  db.prepare(
    `
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
      VALUES (@id, @userId, @tokenHash, @expiresAt, NULL, @createdAt)
    `,
  ).run({ id, userId, tokenHash, expiresAt, createdAt: nowIso() });

  return { id, expiresAt };
}

export function getPasswordResetTokenByHash(tokenHash) {
  return (
    db
      .prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?")
      .get(String(tokenHash || "")) || null
  );
}

export function markPasswordResetTokenUsed(tokenId) {
  db.prepare(
    "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
  ).run(nowIso(), tokenId);
}
