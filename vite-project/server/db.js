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
    email_verified_at TEXT,
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

  CREATE TABLE IF NOT EXISTS email_verification_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user
  ON email_verification_codes(user_id, created_at DESC);

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

  -- Append-only wallet ledger.
  --
  -- The users.wallet_balance column remains the number every screen reads, but
  -- it is now
  -- DERIVED from these rows: every balance change is written here in the same
  -- database transaction that updates the balance, so the two cannot disagree.
  -- Nothing in this table is ever updated or deleted - a mistake is corrected by
  -- inserting a compensating entry, which keeps the history auditable.
  --
  -- (reference, kind) is UNIQUE: that is what makes a deposit or a purchase
  -- credit/debit exactly once even if the same request is retried, the webhook
  -- fires twice, or two purchases race.
  CREATE TABLE IF NOT EXISTS wallet_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('credit', 'debit')),
    amount REAL NOT NULL CHECK (amount > 0),
    balance_after REAL NOT NULL,
    reason TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_unique
  ON wallet_ledger(user_id, reference, reason)
  WHERE reference <> '';

  CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user
  ON wallet_ledger(user_id, created_at DESC);

  -- One row per funding attempt. reference is UNIQUE, so the same payment can
  -- never be recorded twice, and credited_at is the single flag that decides
  -- whether this payment has already been turned into wallet money.
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_status TEXT,
    provider_reference TEXT,
    checkout_url TEXT,
    credited_at TEXT,
    credited_amount REAL,
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);

  -- Every webhook delivery is recorded by its provider signature/event id, so a
  -- retried delivery is recognised instead of processed again.
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_key TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    received_at TEXT NOT NULL,
    processed_at TEXT,
    outcome TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_unique
  ON webhook_events(provider, event_key);
  CREATE INDEX IF NOT EXISTS idx_webhook_events_recent
  ON webhook_events(received_at DESC);

  -- Provider virtual accounts. A user can retain a historical account for a
  -- previous provider while creating one with the currently active provider.
  CREATE TABLE IF NOT EXISTS virtual_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'neurapay',
    mode TEXT NOT NULL DEFAULT 'live',
    account_number TEXT NOT NULL,
    bank_name TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    narration TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'NGN',
    kind TEXT NOT NULL DEFAULT 'PERMANENT',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    customer_email TEXT NOT NULL DEFAULT '',
    order_ref TEXT NOT NULL DEFAULT '',
    tx_ref TEXT,
    flw_ref TEXT,
    pending_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_user_provider
  ON virtual_accounts(provider, user_id);

  -- Empty account numbers are pending slots, not usable bank accounts. Exclude
  -- them so separate users can create accounts concurrently.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_number
  ON virtual_accounts(provider, account_number)
  WHERE account_number <> '';

  CREATE INDEX IF NOT EXISTS idx_virtual_accounts_pending
  ON virtual_accounts(provider, pending_ref)
  WHERE pending_ref IS NOT NULL;

  -- One row per money transfer INTO a virtual account (a deposit).
  --
  -- flw_transaction_id is UNIQUE: that single constraint is what makes the same
  -- transfer impossible to credit twice, across webhook retries, concurrent
  -- deliveries and server restarts. credited_at is set in the SAME database
  -- transaction that increases users.wallet_balance.
  CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    virtual_account_id TEXT,
    provider TEXT NOT NULL DEFAULT 'neurapay',
    mode TEXT NOT NULL DEFAULT 'live',
    flw_transaction_id TEXT NOT NULL UNIQUE,
    flw_ref TEXT,
    tx_ref TEXT,
    account_ref TEXT,
    amount REAL NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_status TEXT,
    payer_name TEXT,
    narration TEXT,
    failure_reason TEXT,
    credited_at TEXT,
    webhook_event_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_deposits_user
  ON deposits(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_deposits_status
  ON deposits(status, created_at DESC);
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

if (!hasColumn("users", "email_verified_at")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT");
  db.prepare(
    "UPDATE users SET email_verified_at = COALESCE(created_at, ?)",
  ).run(nowIso());
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

if (!hasColumn("payments", "confirmed_at")) {
  // Set the moment the PROVIDER reports the payment as successful, before any
  // amount/currency check. Distinct from credited_at, which is only set when the
  // wallet was actually credited.
  db.exec("ALTER TABLE payments ADD COLUMN confirmed_at TEXT");
}

if (!hasColumn("payments", "provider_reference")) {
  db.exec("ALTER TABLE payments ADD COLUMN provider_reference TEXT");
}

if (!hasColumn("payments", "checkout_url")) {
  db.exec("ALTER TABLE payments ADD COLUMN checkout_url TEXT");
}

// A payout/reversal changes money in the opposite direction; recording it next
// to the deposit keeps the audit trail in one place.
if (!hasColumn("deposits", "reversed_at")) {
  db.exec("ALTER TABLE deposits ADD COLUMN reversed_at TEXT");
}

if (!hasColumn("virtual_accounts", "tx_ref")) {
  db.exec("ALTER TABLE virtual_accounts ADD COLUMN tx_ref TEXT");
}

function hasUniqueSingleColumnIndex(table, column) {
  return db
    .prepare(`PRAGMA index_list(${table})`)
    .all()
    .filter((index) => index.unique)
    .some((index) => {
      const safeName = String(index.name).replaceAll('"', '""');
      const columns = db.prepare(`PRAGMA index_info("${safeName}")`).all();
      return columns.length === 1 && columns[0].name === column;
    });
}

if (hasUniqueSingleColumnIndex("virtual_accounts", "user_id")) {
  db.pragma("foreign_keys = OFF");
  db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE virtual_accounts_migrated (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'neurapay',
      mode TEXT NOT NULL DEFAULT 'live',
      account_number TEXT NOT NULL,
      bank_name TEXT NOT NULL DEFAULT '',
      account_name TEXT NOT NULL DEFAULT '',
      narration TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'NGN',
      kind TEXT NOT NULL DEFAULT 'PERMANENT',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      customer_email TEXT NOT NULL DEFAULT '',
      order_ref TEXT NOT NULL DEFAULT '',
      tx_ref TEXT,
      flw_ref TEXT,
      pending_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO virtual_accounts_migrated (
      id, user_id, provider, mode, account_number, bank_name, account_name,
      narration, currency, kind, status, customer_email, order_ref, tx_ref,
      flw_ref, pending_ref, created_at, updated_at
    )
    SELECT
      id, user_id, provider, mode, account_number, bank_name, account_name,
      narration, currency, kind, status, customer_email, order_ref, tx_ref,
      flw_ref, pending_ref, created_at, updated_at
    FROM virtual_accounts;
    DROP TABLE virtual_accounts;
    ALTER TABLE virtual_accounts_migrated RENAME TO virtual_accounts;
    COMMIT;
  `);
  db.pragma("foreign_keys = ON");
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_user_provider
    ON virtual_accounts(provider, user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_number
    ON virtual_accounts(provider, account_number)
    WHERE account_number <> '';
  CREATE INDEX IF NOT EXISTS idx_virtual_accounts_pending
    ON virtual_accounts(provider, pending_ref)
    WHERE pending_ref IS NOT NULL;
`);

db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_tx_ref
   ON virtual_accounts(provider, tx_ref)
   WHERE tx_ref IS NOT NULL AND tx_ref <> ''`,
);

// Settling is keyed by OUR reference, so it must be UNIQUE in the LIVE schema -
// the CREATE above never re-runs on an existing database. A legacy database
// that already contains duplicate references cannot be indexed; that is
// reported at startup instead of being silently skipped.
try {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference)",
  );
} catch (error) {
  console.warn(
    "[db] payments.reference is not unique in this database: " +
      error.message +
      " - remove the duplicate payment rows, then restart.",
  );
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
    email_verified_at: null,
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
    emailVerifiedAt: row.email_verified_at || null,
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
    emailVerified: Boolean(user.emailVerifiedAt),
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

export const updatePasswordAndCreateSession = db.transaction(
  ({ userId, passwordHash, token }) => {
    updateUserPassword(userId, passwordHash);
    deleteAllSessionsForUser(userId);
    return createSession({ userId, token });
  },
);

export const completePasswordReset = db.transaction(
  ({ userId, passwordHash, resetTokenId, sessionToken }) => {
    const now = nowIso();
    const tokenUpdate = db
      .prepare(
        `UPDATE password_reset_tokens
         SET used_at = ?
         WHERE id = ? AND user_id = ? AND used_at IS NULL AND expires_at > ?`,
      )
      .run(now, resetTokenId, userId, now);
    if (tokenUpdate.changes !== 1) return null;

    updateUserPassword(userId, passwordHash);
    invalidatePasswordResetCodesForUser(userId);
    invalidatePasswordResetTokensForUser(userId, resetTokenId);
    deleteAllSessionsForUser(userId);
    return createSession({ userId, token: sessionToken });
  },
);

export function updateUserProfile({ userId, name, phone }) {
  db.prepare(
    `UPDATE users
     SET name = ?, phone = ?, updated_at = ?
     WHERE id = ?`,
  ).run(name, phone, nowIso(), userId);
  return getUserById(userId);
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

export function createEmailVerificationCode({ userId, codeHash, expiresAt }) {
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const create = db.transaction(() => {
    db.prepare(
      `UPDATE email_verification_codes
       SET used_at = ?
       WHERE user_id = ? AND used_at IS NULL`,
    ).run(createdAt, userId);
    db.prepare(
      `INSERT INTO email_verification_codes
         (id, user_id, code_hash, expires_at, attempts, used_at, created_at)
       VALUES (@id, @userId, @codeHash, @expiresAt, 0, NULL, @createdAt)`,
    ).run({ id, userId, codeHash, expiresAt, createdAt });
  });
  create();
  return { id };
}

export function getLatestEmailVerificationCode(userId) {
  return (
    db
      .prepare(
        `SELECT * FROM email_verification_codes
         WHERE user_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(userId) || null
  );
}

export function incrementEmailVerificationAttempts(codeId) {
  db.prepare(
    `UPDATE email_verification_codes
     SET attempts = attempts + 1
     WHERE id = ? AND used_at IS NULL`,
  ).run(codeId);
}

export const verifyUserEmail = db.transaction(({ userId, codeId }) => {
  const now = nowIso();
  const codeUpdate = db
    .prepare(
      `UPDATE email_verification_codes
       SET used_at = ?
       WHERE id = ? AND user_id = ? AND used_at IS NULL
         AND expires_at > ? AND attempts < 5`,
    )
    .run(now, codeId, userId, now);
  if (codeUpdate.changes === 0) return null;

  const user = db
    .prepare("SELECT email_verified_at FROM users WHERE id = ?")
    .get(userId);
  if (!user) return null;

  const verifiedNow = !user.email_verified_at;
  if (verifiedNow) {
    db.prepare(
      `UPDATE users
       SET email_verified_at = ?, updated_at = ?
       WHERE id = ? AND email_verified_at IS NULL`,
    ).run(now, now, userId);
  }
  return { verifiedNow };
});

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

/* ------------------------------------------------------------------ *
 * Wallet accounting
 *
 * Every balance change goes through creditWallet() or debitWallet(). Both run
 * inside ONE better-sqlite3 transaction that:
 *   1. writes the ledger row first,
 *   2. derives the new balance from the stored balance (never from a value the
 *      caller read earlier), and
 *   3. updates the balance in the same transaction.
 *
 * better-sqlite3 transactions are synchronous and exclusive, so two concurrent
 * requests cannot both pass the balance check and then both spend it - the
 * second one sees the first one's committed balance. This is the property the
 * old updateUserWalletBalance()-only path did not have.
 * ------------------------------------------------------------------ */

const LEDGER_REASONS = Object.freeze({
  DEPOSIT: "deposit",
  PURCHASE: "purchase",
  REFUND: "refund",
  ADJUSTMENT: "adjustment",
  REVERSAL: "reversal",
});

export { LEDGER_REASONS };

function assertPositiveAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("LEDGER_INVALID_AMOUNT");
  }
  // Money is stored to the kobo. Rounding here keeps a 0.1 + 0.2 style drift out
  // of a balance that is compared against a price.
  return Math.round(value * 100) / 100;
}

/** Shape returned by both wallet operations. */
function walletResult(row) {
  return {
    balance: Number(row.balance_after),
    entryId: row.id,
    alreadyApplied: false,
  };
}

/**
 * Credit a wallet exactly once per (reference, reason).
 *
 * Returns `{ balance, entryId, alreadyApplied }`. A replayed reference returns
 * the ORIGINAL entry with `alreadyApplied: true` and does NOT add money again -
 * which is what makes a duplicated webhook or a re-verified payment harmless.
 *
 * Throws "UNKNOWN_USER" when the user does not exist; callers map that to a
 * safe message.
 */
export const creditWallet = db.transaction(
  ({ userId, amount, reason = LEDGER_REASONS.DEPOSIT, reference = "", metadata = {} }) => {
    const value = assertPositiveAmount(amount);

    const result = db
      .prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = ? WHERE id = ?")
      .run(value, nowIso(), userId);
    if (result.changes === 0) throw new Error("UNKNOWN_USER");

    const row = db
      .prepare("SELECT wallet_balance FROM users WHERE id = ?")
      .get(userId);

    const id = crypto.randomUUID();
    try {
      db.prepare(
        `INSERT INTO wallet_ledger
           (id, user_id, kind, amount, balance_after, reason, reference, metadata, created_at)
         VALUES (@id, @userId, 'credit', @amount, @balanceAfter, @reason, @reference, @metadata, @createdAt)`,
      ).run({
        id,
        userId,
        amount: value,
        balanceAfter: Number(row.wallet_balance),
        reason,
        reference: String(reference || ""),
        metadata: JSON.stringify(metadata || {}),
        createdAt: nowIso(),
      });
    } catch (error) {
      // The UNIQUE(user_id, reference, reason) index won the race: another
      // request already applied this exact credit. Undo the balance change and
      // report the original entry instead of crediting twice.
      if (String(error?.message || "").includes("UNIQUE")) {
        db.prepare("UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = ? WHERE id = ?")
          .run(value, nowIso(), userId);
        const existing = db
          .prepare(
            "SELECT id, balance_after FROM wallet_ledger WHERE user_id = ? AND reference = ? AND reason = ?",
          )
          .get(userId, String(reference || ""), reason);
        return { ...walletResult(existing || {}), alreadyApplied: true };
      }
      throw error;
    }

    return walletResult({ id, balance_after: Number(row.wallet_balance) });
  },
);

/**
 * Debit a wallet atomically, refusing to overdraw.
 *
 * The balance check and the subtraction are the SAME statement (`wallet_balance
 * >= ?` in the WHERE clause), so no interleaved request can slip between them.
 * Returns `{ ok: false, balance }` when funds are insufficient - never throws
 * for that case, because it is an expected business outcome.
 */
export const debitWallet = db.transaction(
  ({ userId, amount, reason = LEDGER_REASONS.PURCHASE, reference = "", metadata = {} }) => {
    const value = assertPositiveAmount(amount);

    const result = db
      .prepare(
        `UPDATE users SET wallet_balance = ROUND(wallet_balance - ?, 2), updated_at = ?
         WHERE id = ? AND wallet_balance >= ?`,
      )
      .run(value, nowIso(), userId, value);

    if (result.changes === 0) {
      const user = db
        .prepare("SELECT wallet_balance FROM users WHERE id = ?")
        .get(userId);
      if (!user) throw new Error("UNKNOWN_USER");
      return { ok: false, balance: Number(user.wallet_balance) };
    }

    const row = db
      .prepare("SELECT wallet_balance FROM users WHERE id = ?")
      .get(userId);

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO wallet_ledger
         (id, user_id, kind, amount, balance_after, reason, reference, metadata, created_at)
       VALUES (@id, @userId, 'debit', @amount, @balanceAfter, @reason, @reference, @metadata, @createdAt)`,
    ).run({
      id,
      userId,
      amount: value,
      balanceAfter: Number(row.wallet_balance),
      reason,
      reference: String(reference || ""),
      metadata: JSON.stringify(metadata || {}),
      createdAt: nowIso(),
    });

    return { ok: true, ...walletResult({ id, balance_after: Number(row.wallet_balance) }) };
  },
);

/**
 * Recompute a balance from the ledger. Used by tests and by the reconciliation
 * endpoint to prove the stored balance still equals its own history.
 */
export function ledgerBalance(userId) {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount ELSE 0 END), 0) AS credits,
         COALESCE(SUM(CASE WHEN kind = 'debit'  THEN amount ELSE 0 END), 0) AS debits
       FROM wallet_ledger WHERE user_id = ?`,
    )
    .get(userId);
  const credits = Number(row?.credits || 0);
  const debits = Number(row?.debits || 0);
  return { credits, debits, balance: Math.round((credits - debits) * 100) / 100 };
}

/** Entries for one user, newest first. Owner-scoped: takes a user id only. */
export function listLedgerEntries(userId, limit = 100) {
  return db
    .prepare(
      `SELECT id, kind, amount, balance_after, reason, reference, metadata, created_at
       FROM wallet_ledger WHERE user_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(userId, Math.max(1, Math.min(500, Number(limit) || 100)))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: Number(row.amount),
      balanceAfter: Number(row.balance_after),
      reason: row.reason,
      reference: row.reference,
      metadata: parseJson(row.metadata, {}),
      createdAt: row.created_at,
    }));
}

/* ------------------------------------------------------------------ *
 * Payments (funding attempts) and webhook de-duplication
 * ------------------------------------------------------------------ */

/** Create a PENDING payment. `reference` is UNIQUE, so a duplicate throws. */
export function createPayment({
  reference,
  userId,
  amount,
  currency,
  status = "PENDING",
  checkoutUrl = null,
}) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO payments
       (id, reference, user_id, amount, currency, status, provider_status,
        provider_reference, checkout_url, credited_at, confirmed_at,
        credited_amount, failure_reason, created_at, updated_at)
     VALUES (@id, @reference, @userId, @amount, @currency, @status, NULL,
             NULL, @checkoutUrl, NULL, NULL, NULL, NULL, @now, @now)`,
  ).run({
    id: crypto.randomUUID(),
    reference,
    userId,
    amount: Math.round(Number(amount) * 100) / 100,
    currency,
    status,
    checkoutUrl,
    now,
  });

  return getPaymentByReference(reference);
}

export function getPaymentByReference(reference) {
  const row = db
    .prepare("SELECT * FROM payments WHERE reference = ?")
    .get(String(reference || ""));
  return row ? normalizePayment(row) : null;
}

/** Owner-scoped read: a user may only ever see their own payments. */
export function getPaymentForUser(reference, userId) {
  const row = db
    .prepare("SELECT * FROM payments WHERE reference = ? AND user_id = ?")
    .get(String(reference || ""), userId);
  return row ? normalizePayment(row) : null;
}

function normalizePayment(row) {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    providerStatus: row.provider_status,
    providerReference: row.provider_reference,
    checkoutUrl: row.checkout_url,
    creditedAt: row.credited_at,
    // When the provider CONFIRMED the money (null while unconfirmed). Kept
    // apart from credited_at so a payment that confirmed but failed the amount
    // check can be told apart from one that was never confirmed at all.
    confirmedAt: row.confirmed_at ?? null,
    creditedAmount: row.credited_amount === null ? null : Number(row.credited_amount),
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updatePayment(reference, patch) {
  const current = getPaymentByReference(reference);
  if (!current) return null;

  const next = { ...current, ...patch };

  db.prepare(
    `UPDATE payments SET
       status = @status,
       provider_status = @providerStatus,
       provider_reference = @providerReference,
       checkout_url = @checkoutUrl,
       failure_reason = @failureReason,
       confirmed_at = @confirmedAt,
       updated_at = @updatedAt
     WHERE reference = @reference`,
  ).run({
    reference,
    // A CREDITED payment is final: status can never be moved off SUCCESS once
    // the wallet has been credited for it.
    status: current.creditedAt ? "SUCCESS" : next.status,
    providerStatus: next.providerStatus ?? null,
    providerReference: next.providerReference ?? null,
    checkoutUrl: next.checkoutUrl ?? null,
    failureReason: next.failureReason ?? null,
    confirmedAt: next.confirmedAt ?? null,
    updatedAt: nowIso(),
  });

  return getPaymentByReference(reference);
}

/**
 * Record a webhook delivery. Returns `{ duplicate: true }` when this exact
 * event was already stored, so a provider retry is acknowledged without being
 * processed a second time.
 */
export function recordWebhookEvent({ provider, eventKey, payload }) {
  try {
    db.prepare(
      `INSERT INTO webhook_events (id, provider, event_key, payload, received_at, processed_at, outcome)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(crypto.randomUUID(), provider, eventKey, JSON.stringify(payload || {}), nowIso());
    return { duplicate: false };
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) return { duplicate: true };
    throw error;
  }
}

export function markWebhookProcessed(eventKey, outcome, provider = "neurapay") {
  db.prepare(
    `UPDATE webhook_events SET processed_at = ?, outcome = ?
     WHERE provider = ? AND event_key = ?`,
  ).run(nowIso(), String(outcome || ""), provider, eventKey);
}

/**
 * Forget a delivery that FAILED to process, so the provider's retry is handled
 * instead of being acknowledged as a duplicate of a broken attempt.
 */
export function clearWebhookEvent(eventKey, provider = "neurapay") {
  db.prepare(
    "DELETE FROM webhook_events WHERE provider = ? AND event_key = ?",
  ).run(provider, eventKey);
}

export function getWebhookEvent(eventKey, provider = "neurapay") {
  return (
    db
      .prepare(
        "SELECT * FROM webhook_events WHERE provider = ? AND event_key = ?",
      )
      .get(provider, eventKey) ?? null
  );
}

/* ------------------------------------------------------------------ *
 * Provider virtual accounts (wallet funding)
 *
 * The wallet stays exactly where it was: users.wallet_balance plus the
 * wallet_ledger rows, updated together by creditWallet(). These functions only
 * decide WHICH user gets a deposit and whether it has already been applied.
 * ------------------------------------------------------------------ */

function normalizeVirtualAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    mode: row.mode,
    accountNumber: row.account_number,
    bankName: row.bank_name,
    accountName: row.account_name,
    narration: row.narration,
    currency: row.currency,
    kind: row.kind,
    status: row.status,
    customerEmail: row.customer_email,
    orderRef: row.order_ref,
    txRef: row.tx_ref || null,
    providerReference: row.flw_ref,
    pendingRef: row.pending_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeDeposit(row) {
  if (!row) return null;
  const newBalance =
    row.new_balance === null || row.new_balance === undefined
      ? null
      : Number(row.new_balance);
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    mode: row.mode,
    transactionId: row.flw_transaction_id,
    providerReference: row.flw_ref,
    txRef: row.tx_ref,
    accountRef: row.account_ref,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    providerStatus: row.provider_status,
    payerName: row.payer_name ?? null,
    narration: row.narration ?? null,
    failureReason: row.failure_reason ?? null,
    creditedAt: row.credited_at ?? null,
    reversedAt: row.reversed_at ?? null,
    previousBalance:
      newBalance === null
        ? null
        : Math.round((newBalance - Number(row.amount)) * 100) / 100,
    newBalance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getVirtualAccountForUser(userId, { provider = "neurapay" } = {}) {
  return normalizeVirtualAccount(
    db
      .prepare("SELECT * FROM virtual_accounts WHERE user_id = ? AND provider = ?")
      .get(String(userId || ""), provider),
  );
}

export function getVirtualAccountByNumber(accountNumber, { provider = "neurapay" } = {}) {
  return normalizeVirtualAccount(
    db
      .prepare(
        "SELECT * FROM virtual_accounts WHERE provider = ? AND account_number = ?",
      )
      .get(provider, String(accountNumber || "")),
  );
}

export function getVirtualAccountByTransactionRef(
  txRef,
  { provider = "neurapay" } = {},
) {
  const reference = String(txRef || "").trim();
  if (!reference) return null;
  return normalizeVirtualAccount(
    db
      .prepare(
        "SELECT * FROM virtual_accounts WHERE provider = ? AND tx_ref = ?",
      )
      .get(provider, reference),
  );
}

/**
 * Claim the right to create an account for this user.
 *
 * The INSERT is the lock: `(provider, user_id)` is UNIQUE, so of two concurrent requests
 * exactly one inserts. The loser gets `{ claimed: false, account }` and must use
 * the row that already exists instead of calling Flutterwave again.
 *
 * `pending_ref` is stored BEFORE the provider call so a crash or a lost response
 * leaves a marker that reconciliation can find.
 */
export const claimVirtualAccountSlot = db.transaction(
  ({ userId, provider = "neurapay", mode = "live", customerEmail = "", pendingRef }) => {
    const existing = getVirtualAccountForUser(userId, { provider });
    if (existing) return { claimed: false, account: existing };

    const now = nowIso();
    try {
      db.prepare(
        `INSERT INTO virtual_accounts
           (id, user_id, provider, mode, account_number, bank_name, account_name,
            narration, currency, kind, status, customer_email, order_ref, flw_ref,
            pending_ref, created_at, updated_at)
         VALUES (@id, @userId, @provider, @mode, '', '', '', '', 'NGN', 'PERMANENT',
                 'PENDING', @customerEmail, '', NULL, @pendingRef, @now, @now)`,
      ).run({
        id: crypto.randomUUID(),
        userId,
        provider,
        mode,
        customerEmail: String(customerEmail || "").toLowerCase(),
        pendingRef,
        now,
      });
      return { claimed: true, account: null };
    } catch (error) {
      // Lost the race on UNIQUE(provider, user_id): the winner's row is the account.
      if (String(error?.message || "").includes("UNIQUE")) {
        return {
          claimed: false,
          account: getVirtualAccountForUser(userId, { provider }),
        };
      }
      throw error;
    }
  },
);

/**
 * Take over an account row that a PREVIOUS attempt left mid-flight.
 *
 * `claimVirtualAccountSlot` only inserts when no row exists, and a row with an
 * empty account_number and status PENDING is a claim whose provider call never
 * finished (a crash, a restart, or an answer that went missing). Without this,
 * the user could never create an account again: every retry saw "already
 * claimed", skipped creation and the Deposit page stayed on "being set up"
 * forever. Only an empty-number row is touched, so an account that already
 * exists can never be replaced by a second one.
 *
 * @returns {{claimed:boolean, account:object|null}}
 */
export function reclaimVirtualAccountSlot(userId, { provider = "neurapay" } = {}) {
  const current = getVirtualAccountForUser(userId, { provider });
  if (!current) return { claimed: false, account: null };
  if (current.accountNumber) return { claimed: false, account: current };

  const result = db
    .prepare(
      `UPDATE virtual_accounts
          SET status = 'PENDING', pending_ref = @pendingRef, updated_at = @now
        WHERE user_id = @userId AND provider = @provider AND account_number = ''`,
    )
    .run({
      userId,
      provider,
      pendingRef: `PN-${userId}-${Date.now()}`,
      now: nowIso(),
    });

  return {
    claimed: result.changes > 0,
    account: getVirtualAccountForUser(userId, { provider }),
  };
}

/**
 * Store provider account details in the row claimed above.
 *
 * A retry for a DIFFERENT account number on an already-numbered row is ignored
 * (the first one wins): an account number is permanent, and silently swapping it
 * would send the customer's money to an account we no longer show them.
 */
export function saveVirtualAccountDetails(userId, details) {
  const current = getVirtualAccountForUser(userId, {
    provider: details.provider || "neurapay",
  });
  if (!current) return null;
  if (current.accountNumber && current.accountNumber !== details.accountNumber) {
    return current;
  }

  db.prepare(
    `UPDATE virtual_accounts SET
       account_number = @accountNumber,
       bank_name = @bankName,
       account_name = @accountName,
       narration = @narration,
       kind = @kind,
       status = @status,
       order_ref = @orderRef,
       tx_ref = @txRef,
       flw_ref = @providerReference,
       pending_ref = NULL,
       updated_at = @updatedAt
     WHERE user_id = @userId AND provider = @provider`,
  ).run({
    userId,
    provider: current.provider,
    accountNumber: details.accountNumber,
    bankName: details.bankName || "",
    accountName: details.accountName || "",
    narration: details.narration || "",
    kind: details.kind || "PERMANENT",
    status: details.status || "UNKNOWN",
    orderRef: details.orderRef || "",
    txRef: details.txRef || null,
    providerReference: details.providerReference || null,
    updatedAt: nowIso(),
  });

  return getVirtualAccountForUser(userId, { provider: current.provider });
}

/**
 * Mark a claimed-but-unfilled slot as failed, so the Deposit page offers the
 * setup form again. The provider error text is NOT stored: it can echo the
 * request, and it is already in the server log.
 */
export function markVirtualAccountFailure(userId, { provider = "neurapay" } = {}) {
  db.prepare(
    `UPDATE virtual_accounts
        SET status = 'FAILED', pending_ref = NULL, updated_at = ?
      WHERE user_id = ? AND provider = ? AND account_number = ''`,
  ).run(nowIso(), userId, provider);
  return getVirtualAccountForUser(userId, { provider });
}

/**
 * Is an account row of this mode allowed to fund this user's wallet?
 *
 * Test money must never land in a live wallet, and a live transfer must never be
 * credited by a server running on a test key. `mode` is recorded per row, so the
 * rule holds even if the environment is switched later.
 */
export function assertModeMatches(account, mode) {
  return Boolean(account) && account.mode === mode;
}

/**
 * Map a paying account number (or the emailed customer) to a Panda user.
 * Returns null when the transfer cannot be attributed - never a guess.
 */
export function findUserForDeposit({
  accountNumber,
  customerEmail,
  txRef,
  provider = "neurapay",
}) {
  if (accountNumber) {
    const byNumber = getVirtualAccountByNumber(accountNumber, { provider });
    if (byNumber) return byNumber;
  }
  if (txRef) {
    const byReference = getVirtualAccountByTransactionRef(txRef, { provider });
    if (byReference) return byReference;
  }
  if (customerEmail) {
    const row = db
      .prepare(
        `SELECT * FROM virtual_accounts
          WHERE provider = ? AND LOWER(customer_email) = LOWER(?)
          LIMIT 1`,
      )
      .get(provider, String(customerEmail).trim());
    return normalizeVirtualAccount(row);
  }
  return null;
}

/**
 * Record a confirmed deposit and credit the wallet exactly once.
 *
 * Ordering, all inside ONE SQLite transaction:
 *   1. Reuse an existing pending row, or INSERT one keyed by
 *      flw_transaction_id (UNIQUE).
 *   2. Claim the row with `credited_at IS NULL`.
 *   3. creditWallet() with reference = the provider's transaction id, whose
 *      UNIQUE(user_id, reference, reason) index is the second line of defence.
 *
 * If the balance update fails, the whole transaction rolls back - the deposit is
 * not left marked as credited with no money behind it, and vice versa.
 *
 * BEGIN IMMEDIATE: the transaction takes the write lock up front instead of
 * upgrading on its first write. Two deliveries of the same transaction arriving
 * together would otherwise BOTH pass the SELECT existence check (a deferred
 * transaction only holds a read lock there), and the loser would fail with
 * SQLITE_BUSY instead of the clean `alreadyApplied` answer. It also keeps a
 * read-to-write upgrade from deadlocking against another writer.
 */
export const recordConfirmedDeposit = db.transaction(
  ({
    account,
    mode,
    provider = account?.provider || "neurapay",
    transactionId,
    amount,
    currency,
    providerStatus,
    txRef = "",
    providerReference = null,
    payerName = null,
    narration = null,
    eventKey = null,
  }) => {
    const value = assertPositiveAmount(amount);
    const now = nowIso();

    const existing = db
      .prepare("SELECT * FROM deposits WHERE flw_transaction_id = ?")
      .get(String(transactionId));
      if (existing && existing.provider !== provider) {
        return { ok: false, reason: "TRANSACTION_PROVIDER_MISMATCH" };
      }
      if (existing?.credited_at) {
      return {
        ok: true,
        alreadyApplied: true,
        deposit: normalizeDeposit(existing),
        balance: null,
      };
    }
    if (existing && existing.user_id !== account.userId) {
      return { ok: false, reason: "TRANSACTION_OWNER_MISMATCH" };
    }
    // A test-mode account (or a server running on a test key) must never fund a
    // live wallet, and vice versa.
    if (!assertModeMatches(account, mode)) {
      return { ok: false, reason: "MODE_MISMATCH" };
    }
    if (String(account.currency).toUpperCase() !== String(currency || "").toUpperCase()) {
      return { ok: false, reason: "CURRENCY_MISMATCH" };
    }

    const id = existing?.id || crypto.randomUUID();
    if (existing) {
      db.prepare(
        `UPDATE deposits SET
           virtual_account_id = @virtualAccountId,
           provider = @provider,
           mode = @mode,
           flw_ref = @providerReference,
           tx_ref = @txRef,
           account_ref = @accountRef,
           amount = @amount,
           currency = @currency,
           status = 'PENDING',
           provider_status = @providerStatus,
           payer_name = @payerName,
           narration = @narration,
           failure_reason = NULL,
           webhook_event_key = @eventKey,
           updated_at = @now
         WHERE flw_transaction_id = @transactionId AND credited_at IS NULL`,
      ).run({
        virtualAccountId: account.id,
        provider,
        mode,
        providerReference,
        txRef,
        accountRef: account.accountNumber,
        amount: value,
        currency: String(currency || "NGN").toUpperCase(),
        providerStatus,
        payerName,
        narration,
        eventKey,
        now,
        transactionId: String(transactionId),
      });
    } else {
      db.prepare(
        `INSERT INTO deposits
           (id, user_id, virtual_account_id, provider, mode, flw_transaction_id,
            flw_ref, tx_ref, account_ref, amount, currency, status,
            provider_status, payer_name, narration, failure_reason, credited_at,
            webhook_event_key, created_at, updated_at)
         VALUES (@id, @userId, @virtualAccountId, @provider, @mode,
                 @transactionId, @providerReference, @txRef, @accountRef, @amount, @currency,
                 'PENDING', @providerStatus, @payerName, @narration, NULL, NULL,
                 @eventKey, @now, @now)`,
      ).run({
        id,
        userId: account.userId,
        virtualAccountId: account.id,
        provider,
        mode,
        transactionId: String(transactionId),
        providerReference,
        txRef,
        accountRef: account.accountNumber,
        amount: value,
        currency: String(currency || "NGN").toUpperCase(),
        providerStatus,
        payerName,
        narration,
        eventKey,
        now,
      });
    }

    const credit = creditWallet({
      userId: account.userId,
      amount: value,
      reason: LEDGER_REASONS.DEPOSIT,
      reference: `${provider === "flutterwave" ? "flw" : provider}:${transactionId}`,
      metadata: {
        provider,
        mode,
        transactionId,
        accountRef: account.accountNumber,
      },
    });

    // creditWallet() answering "already applied" means a ledger row with this
    // reference already exists for the user - i.e. this wallet was credited
    // before but THIS deposit row was not filed yet (an earlier attempt that
    // died between the two writes). Writing a brand-new deposit row would show
    // a "Confirmed" deposit for money that already had one, so the row is
    // corrected to match the ledger instead.
    //
    // Anything else that is not a fresh success (no `balance`, not ok) is also
    // not a reason to leave a row claiming to be CREDITED with no ledger entry
    // behind it: that row is marked for review and the caller is told it failed,
    // so the webhook is retried rather than acknowledged.
    if (credit.alreadyApplied) {
      db.prepare(
        `UPDATE deposits
            SET status = 'CREDITED', credited_at = @now, provider_status = @providerStatus,
                     failure_reason = NULL, flw_ref = @providerReference, tx_ref = @txRef,
                     amount = @amount, currency = @currency, updated_at = @now
               WHERE flw_transaction_id = @transactionId`,
      ).run({
        transactionId: String(transactionId),
        providerStatus,
        providerReference,
        txRef,
        amount: value,
        currency: String(currency || "NGN").toUpperCase(),
        now,
      });
      return {
        ok: true,
        alreadyApplied: true,
        deposit: normalizeDeposit(
          db
            .prepare("SELECT * FROM deposits WHERE flw_transaction_id = ?")
            .get(String(transactionId)),
        ),
        balance: null,
      };
    }

    // No balance came back from a credit that was not a replayed reference: the
    // row must not stay "CREDITED" with no ledger entry behind it. It is marked
    // for review and reported as a failure, so the webhook is retried rather
    // than acknowledged for money nobody received.
    if (typeof credit.balance !== "number") {
      db.prepare(
        `UPDATE deposits
            SET status = 'REVIEW', failure_reason = 'CREDIT_NOT_APPLIED', updated_at = ?
          WHERE flw_transaction_id = ?`,
      ).run(now, String(transactionId));
      return {
        ok: false,
        reason: "CREDIT_NOT_APPLIED",
        deposit: normalizeDeposit(
          db
            .prepare("SELECT * FROM deposits WHERE flw_transaction_id = ?")
            .get(String(transactionId)),
        ),
      };
    }

    db.prepare(
      `UPDATE deposits
          SET status = 'CREDITED', credited_at = @now,
              failure_reason = NULL, updated_at = @now
        WHERE flw_transaction_id = @transactionId
          AND provider = @provider AND credited_at IS NULL`,
    ).run({
      transactionId: String(transactionId),
      provider,
      now,
    });

    return {
      ok: true,
      alreadyApplied: false,
      deposit: normalizeDeposit(db.prepare("SELECT * FROM deposits WHERE id = ?").get(id)),
      balance: credit.balance,
    };
  },
  { behavior: "immediate" },
);

/**
 * Record a transfer that did NOT confirm (failed / pending / not found).
 * Never touches the wallet. Pending/failed transfers with a valid amount are
 * retained for support and admin review. Returns null when there is nothing
 * safe to record:
 *
 *   - the transaction is already CREDITED: a failure notice for money the
 *     wallet already received must never rewrite it;
 *   - the transfer has no valid positive amount, which the deposits table does
 *     not permit and cannot be safely represented;
 *   - the stored row is already credited or awaiting review.
 */
export function recordUnconfirmedDeposit({
  account,
  mode,
  provider = account?.provider || "neurapay",
  transactionId,
  amount = null,
  currency = null,
  status,
  providerStatus = null,
  reason = null,
  payerName = null,
  narration = null,
  eventKey = null,
}) {
  const key = String(transactionId ?? "");
  const existing = key
    ? db
        .prepare("SELECT * FROM deposits WHERE flw_transaction_id = ? AND provider = ?")
        .get(key, provider)
    : null;
  if (existing) {
    if (existing.provider !== provider) return null;
    if (existing.credited_at) return null;
    return normalizeDeposit(existing);
  }
  if (!account) return null;

  const now = nowIso();
  const id = crypto.randomUUID();
  const value =
    Number.isFinite(Number(amount)) && Number(amount) > 0
      ? Math.round(Number(amount) * 100) / 100
      : null;
  if (value === null) return null;

  try {
    db.prepare(
      `INSERT INTO deposits
         (id, user_id, virtual_account_id, provider, mode, flw_transaction_id,
          flw_ref, tx_ref, account_ref, amount, currency, status,
          provider_status, payer_name, narration, failure_reason, credited_at,
          webhook_event_key, created_at, updated_at)
       VALUES (@id, @userId, @virtualAccountId, @provider, @mode,
               @transactionId, NULL, @transactionId, @accountRef, @amount, @currency, @status,
               @providerStatus, @payerName, @narration, @reason, NULL, @eventKey,
               @now, @now)`,
    ).run({
      id,
      userId: account.userId,
      virtualAccountId: account.id,
      provider,
      mode,
      transactionId: key || `unverified:${id}`,
      accountRef: account.accountNumber,
      amount: value,
      currency: currency ? String(currency).toUpperCase() : account.currency,
      status,
      providerStatus,
      payerName,
      narration,
      reason,
      eventKey,
      now,
    });
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      return normalizeDeposit(
        db
          .prepare("SELECT * FROM deposits WHERE flw_transaction_id = ? AND provider = ?")
          .get(key, provider),
      );
    }
    throw error;
  }

  return normalizeDeposit(db.prepare("SELECT * FROM deposits WHERE id = ?").get(id));
}

/** Deposits for one user, newest first, with a bounded page size. */
export function listDepositsForUser(userId, { limit = 20, offset = 0 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = Math.max(Number(offset) || 0, 0);
  const rows = db
    .prepare(
      `SELECT deposits.*,
              wallet_ledger.balance_after AS new_balance
         FROM deposits
         LEFT JOIN wallet_ledger
           ON wallet_ledger.user_id = deposits.user_id
          AND wallet_ledger.reference = CASE
            WHEN deposits.provider = 'flutterwave' THEN 'flw:' || deposits.flw_transaction_id
            ELSE deposits.provider || ':' || deposits.flw_transaction_id
          END
          AND wallet_ledger.reason = 'deposit'
        WHERE deposits.user_id = ?
        ORDER BY deposits.created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(String(userId), take, skip);
  const total = db
    .prepare("SELECT COUNT(*) AS c FROM deposits WHERE user_id = ?")
    .get(String(userId))?.c;
  return {
    deposits: rows.map(normalizeDeposit),
    total: Number(total || 0),
    limit: take,
    offset: skip,
  };
}

function boundedPage({ limit = 50, offset = 0 } = {}) {
  return {
    limit: Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100),
    offset: Math.max(Number.parseInt(offset, 10) || 0, 0),
  };
}

/** Read-only operator view of virtual accounts, bounded to one page. */
export function listVirtualAccountsForAdmin({ search = "", limit, offset } = {}) {
  const page = boundedPage({ limit, offset });
  const needle = String(search || "").trim().toLowerCase();
  const rows = db
    .prepare(
      `SELECT virtual_accounts.*, users.name AS user_name, users.email AS user_email
         FROM virtual_accounts
         JOIN users ON users.id = virtual_accounts.user_id
        WHERE (? = ''
           OR instr(lower(users.name), ?) > 0
           OR instr(lower(users.email), ?) > 0
           OR instr(virtual_accounts.account_number, ?) > 0)
        ORDER BY virtual_accounts.created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(
      needle,
      needle,
      needle,
      String(search || "").trim(),
      page.limit,
      page.offset,
    );
  const total = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM virtual_accounts
         JOIN users ON users.id = virtual_accounts.user_id
        WHERE (? = ''
           OR instr(lower(users.name), ?) > 0
           OR instr(lower(users.email), ?) > 0
           OR instr(virtual_accounts.account_number, ?) > 0)`,
    )
    .get(
      needle,
      needle,
      needle,
      String(search || "").trim(),
    )?.c;
  return {
    items: rows.map((row) => ({
      ...normalizeVirtualAccount(row),
      userName: row.user_name,
      userEmail: row.user_email,
    })),
    total: Number(total || 0),
    ...page,
  };
}

/** Read-only operator view of deposits and their corresponding ledger balances. */
export function listDepositsForAdmin({
  status = "",
  search = "",
  limit,
  offset,
} = {}) {
  const page = boundedPage({ limit, offset });
  const state = String(status || "").trim().toUpperCase();
  const needle = String(search || "").trim().toLowerCase();
  const where = `(? = '' OR deposits.status = ?)
    AND (? = ''
      OR instr(lower(users.name), ?) > 0
      OR instr(lower(users.email), ?) > 0
      OR instr(deposits.flw_transaction_id, ?) > 0
      OR instr(lower(COALESCE(deposits.tx_ref, '')), ?) > 0
      OR instr(lower(COALESCE(deposits.flw_ref, '')), ?) > 0)`;
  const params = [
    state,
    state,
    needle,
    needle,
    needle,
    String(search || "").trim(),
    needle,
    needle,
  ];
  const rows = db
    .prepare(
      `SELECT deposits.*,
              wallet_ledger.balance_after AS new_balance,
              users.name AS user_name, users.email AS user_email
         FROM deposits
         JOIN users ON users.id = deposits.user_id
         LEFT JOIN wallet_ledger
           ON wallet_ledger.user_id = deposits.user_id
          AND wallet_ledger.reference = CASE
            WHEN deposits.provider = 'flutterwave' THEN 'flw:' || deposits.flw_transaction_id
            ELSE deposits.provider || ':' || deposits.flw_transaction_id
          END
          AND wallet_ledger.reason = 'deposit'
        WHERE ${where}
        ORDER BY deposits.created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, page.limit, page.offset);
  const total = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM deposits
         JOIN users ON users.id = deposits.user_id
        WHERE ${where}`,
    )
    .get(...params)?.c;
  return {
    items: rows.map((row) => ({
      ...normalizeDeposit(row),
      userName: row.user_name,
      userEmail: row.user_email,
    })),
    total: Number(total || 0),
    ...page,
  };
}

/** Read-only webhook audit feed; stored payloads contain only a safe summary. */
export function listWebhookEventsForAdmin({ limit, offset } = {}) {
  const page = boundedPage({ limit, offset });
  const rows = db
    .prepare(
      `SELECT provider, event_key, payload, received_at, processed_at, outcome
         FROM webhook_events
        ORDER BY received_at DESC
        LIMIT ? OFFSET ?`,
    )
    .all(page.limit, page.offset);
  const total = db
    .prepare("SELECT COUNT(*) AS c FROM webhook_events")
    .get()?.c;
  return {
    items: rows.map((row) => ({
      provider: row.provider,
      eventKey: row.event_key,
      payload: parseJson(row.payload, {}),
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      outcome: row.outcome,
    })),
    total: Number(total || 0),
    ...page,
  };
}

/**
 * Record a CONFIRMED deposit that belongs to no Panda user.
 *
 * The money is real and the webhook was authentic, but nothing links it to an
 * account we own. It is stored against the beneficiary account number, with a
 * NULL owner, so an operator can find and resolve it later - credited_at stays
 * NULL, so it can never fund a wallet by itself. Two delivery styles are
 * handled: no reference at all is a new row (a transaction id that is already
 * stored is left exactly as it is).
 *
 * @returns the stored row, or null when it could not be filed.
 */
export function recordUnmatchedDeposit({
  provider = "neurapay",
  mode,
  transactionId = null,
  amount = null,
  currency = null,
  accountRef = null,
  providerStatus = null,
  payerName = null,
  narration = null,
  reason = "UNMATCHED_ACCOUNT",
  eventKey = null,
}) {
  const now = nowIso();
  const id = crypto.randomUUID();
  // flw_transaction_id is NOT NULL, so a delivery without one gets a locally
  // unique placeholder rather than a shared "unknown" value.
  const key =
    String(transactionId ?? "").trim() || `unmatched:${id}`;

  try {
    db.prepare(
      `INSERT INTO deposits
         (id, user_id, virtual_account_id, provider, mode, flw_transaction_id,
          flw_ref, tx_ref, account_ref, amount, currency, status,
          provider_status, payer_name, narration, failure_reason, credited_at,
          webhook_event_key, created_at, updated_at)
       VALUES (@id, NULL, NULL, @provider, @mode, @transactionId,
               NULL, '', @accountRef, @amount, @currency, 'REVIEW',
               @providerStatus, @payerName, @narration, @reason, NULL, @eventKey,
               @now, @now)`,
    ).run({
      id,
      provider,
      mode,
      transactionId: key,
      accountRef,
      amount:
        Number.isFinite(Number(amount)) && Number(amount) > 0
          ? Math.round(Number(amount) * 100) / 100
          : null,
      currency: currency ? String(currency).toUpperCase() : null,
      providerStatus,
      payerName,
      narration,
      reason,
      eventKey,
      now,
    });
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      return normalizeDeposit(
        db.prepare("SELECT * FROM deposits WHERE flw_transaction_id = ?").get(key),
      );
    }
    throw error;
  }

  return normalizeDeposit(db.prepare("SELECT * FROM deposits WHERE id = ?").get(id));
}

/**
 * Give a CREDITED deposit a real entry in the user's own transaction history.
 *
 * Keyed by its own id (`deposit-<provider id>`), so a replayed webhook or a
 * reconciliation sweep that finds the same transfer again cannot append the
 * same row twice. Best effort: a history row is a convenience, and failing to
 * write it must never undo a settled deposit.
 */
export function appendDepositTransactionIfMissing(
  userId,
  { transactionId, amount, date },
) {
  if (!userId || !transactionId) return false;
  try {
    appendUserTransaction(userId, {
      id: `deposit-${transactionId}`,
      type: "deposit",
      title: "Bank transfer deposit",
      amount,
      status: "SUCCESSFUL",
      path: "/deposit",
      reference: `flw:${transactionId}`,
      date,
      createdAt: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn(
      `[db] could not append the deposit transaction for ${transactionId}: ${error?.message || error}`,
    );
    return false;
  }
}

/** A deposit still waiting for a decision - used by reconciliation. */
export function listUncreditedDeposits({ limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT * FROM deposits
        WHERE provider = 'neurapay'
          AND credited_at IS NULL AND status IN ('PENDING', 'REVIEW', 'FAILED')
        ORDER BY created_at ASC
        LIMIT ?`,
    )
    .all(Math.min(Math.max(Number(limit) || 50, 1), 200))
    .map(normalizeDeposit);
}

export function getDepositByTransactionId(
  transactionId,
  { provider = "neurapay" } = {},
) {
  return normalizeDeposit(
    db
      .prepare("SELECT * FROM deposits WHERE flw_transaction_id = ? AND provider = ?")
      .get(String(transactionId), provider),
  );
}

/** Deposits that matched no user (user_id NULL), newest first, for an operator. */
export function listUnmatchedDeposits({ limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT * FROM deposits
        WHERE user_id IS NULL
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(Math.min(Math.max(Number(limit) || 50, 1), 200))
    .map(normalizeDeposit);
}
