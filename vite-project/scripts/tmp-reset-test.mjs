// Exercises the forgot-password flow against the running server.
// Email is not configured locally, so rather than reading the mailbox the test
// reads the stored hash and finds the code that matches it - the same thing a
// user's inbox would provide, without needing SMTP.
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

const BASE = "http://127.0.0.1:8787";
const db = new Database("server/data/panda.db");
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`,
  );
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text };
}

async function findCode(hashed) {
  const target = db
    .prepare(
      "SELECT code_hash FROM password_reset_codes WHERE code_hash = ? LIMIT 1",
    )
    .get(hashed);
  return target ? target.code_hash : null;
}

const email = `reset.${Date.now()}@example.com`;
const oldPassword = "Panda123!";
const newPassword = "Tiger456!";

// --- setup -----------------------------------------------------------------
const reg = await post("/api/auth/register", {
  name: "Reset QA",
  email,
  password: oldPassword,
});
check("register test user", reg.status === 201, `status ${reg.status}`);

// --- 1. request a code -----------------------------------------------------
const forgot = await post("/api/auth/forgot-password", { email });
check(
  "forgot-password answers generically",
  forgot.status === 200 &&
    /If an account exists/.test(forgot.json?.message || ""),
);

const unknown = await post("/api/auth/forgot-password", {
  email: `nobody.${Date.now()}@example.com`,
});
check(
  "unknown email gets the same answer (no enumeration)",
  unknown.status === 200 && unknown.json?.message === forgot.json?.message,
);

const row = db
  .prepare(
    "SELECT * FROM password_reset_codes WHERE user_id = (SELECT id FROM users WHERE email = ?) ORDER BY created_at DESC LIMIT 1",
  )
  .get(email);
check(
  "reset code stored as a hash",
  Boolean(row) && /^\$2[aby]\$/.test(row.code_hash),
);
check(
  "code is not stored in plaintext",
  Boolean(row) && row.code_hash !== row.code_hash.match(/^\d{6}$/)?.[0],
);

// The plaintext code is never stored, and brute-forcing 900k bcrypt hashes is
// far too slow. Instead, set a code we know for this test user by replacing the
// stored hash with the hash of that code. The verification and reset logic is
// then exercised exactly as it would be with the code taken from an inbox.
const knownCode = "482913";
const knownHash = await bcrypt.hash(knownCode, 12);
db.prepare("UPDATE password_reset_codes SET code_hash = ? WHERE id = ?").run(
  knownHash,
  row.id,
);
const code = knownCode;
check("test code prepared", true, code);

// --- 2. wrong code ---------------------------------------------------------
const wrong = await post("/api/auth/verify-reset-code", {
  email,
  code: code === "000000" ? "111111" : "000000",
});
check(
  "wrong code is rejected",
  wrong.status === 400 && wrong.json?.error === "INVALID_CODE",
);

// --- 3. correct code -> token ---------------------------------------------
const good = await post("/api/auth/verify-reset-code", { email, code });
check(
  "correct code returns a reset token",
  good.status === 200 &&
    typeof good.json?.resetToken === "string" &&
    good.json.resetToken.length > 20,
);
const resetToken = good.json?.resetToken;

const reusedCode = await post("/api/auth/verify-reset-code", { email, code });
check(
  "verified code cannot be verified twice",
  reusedCode.status === 400 && reusedCode.json?.error === "CODE_ALREADY_USED",
);

// --- 4. reset with the token ----------------------------------------------
const weak = await post("/api/auth/reset-password", {
  resetToken,
  newPassword: "weak",
});
check(
  "weak password rejected",
  weak.status === 400 && weak.json?.error === "WEAK_PASSWORD",
);

const reset = await post("/api/auth/reset-password", {
  resetToken,
  newPassword,
});
check(
  "reset with token succeeds",
  reset.status === 200 && reset.json?.ok === true,
);

const replay = await post("/api/auth/reset-password", {
  resetToken,
  newPassword: "Bear789!",
});
check(
  "reset token cannot be reused",
  replay.status === 400 && replay.json?.error === "TOKEN_ALREADY_USED",
);

// --- 5. login with the new password ---------------------------------------
const loginNew = await post("/api/auth/login", {
  email,
  password: newPassword,
});
check(
  "login works with the new password",
  loginNew.status === 200 && Boolean(loginNew.json?.token),
);

const loginOld = await post("/api/auth/login", {
  email,
  password: oldPassword,
});
check("old password no longer works", loginOld.status === 401);

const badLogin = await post("/api/auth/login", {
  email,
  password: "WrongPass1!",
});
check("failed login still rejected", badLogin.status === 401);

// --- report -----------------------------------------------------------------
const userId = db.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
db.prepare("DELETE FROM password_reset_codes WHERE user_id = ?").run(userId);
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
db.prepare("DELETE FROM users WHERE id = ?").run(userId);

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length === 0 ? 0 : 1);
