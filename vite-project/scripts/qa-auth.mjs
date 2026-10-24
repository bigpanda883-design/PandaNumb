/**
 * Live check of the auth contract against a RUNNING backend.
 *
 * Usage:  node scripts/qa-auth.mjs http://127.0.0.1:8787
 *
 * Exercises every route the auth pages call, with the exact paths and methods
 * they use, and asserts on status codes and shapes. It prints one line per
 * check so a failure names the route, not just "something broke".
 *
 * Nothing is fabricated: a route that fails is reported as failed.
 */
const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/+$/, "");

let pass = 0;
let fail = 0;

async function call(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers };
}

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

const email = `qa.${Date.now()}@example.com`;
// Meets the server's rule: upper, lower, digit, special, 8+.
const password = "QaPassw0rd!";
const newPassword = "QaPassw0rd#2";
let token = "";

/* 1. health ---------------------------------------------------------------- */
const health = await call("/api/health");
check(
  "GET /api/health -> 200 JSON { ok:true }",
  health.status === 200 && health.json?.ok === true,
  `status=${health.status} body=${health.text.slice(0, 120)}`,
);

/* 2. signup ---------------------------------------------------------------- */
const signup = await call("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ name: "QA User", email, phone: "", password }),
});
check(
  "POST /api/auth/register -> 201 { user, token }",
  signup.status === 201 &&
    Boolean(signup.json?.user) &&
    Boolean(signup.json?.token),
  `status=${signup.status} body=${signup.text.slice(0, 160)}`,
);
token = signup.json?.token || "";

const signupAlias = await call("/api/auth/signup", {
  method: "POST",
  body: JSON.stringify({ name: "QA Alias", email: `alias.${email}`, password }),
});
check(
  "POST /api/auth/signup (alias) -> 201",
  signupAlias.status === 201,
  `status=${signupAlias.status} body=${signupAlias.text.slice(0, 160)}`,
);

/* 3. login ----------------------------------------------------------------- */
const login = await call("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
check(
  "POST /api/auth/login -> 200 { user, token }",
  login.status === 200 &&
    Boolean(login.json?.user) &&
    Boolean(login.json?.token),
  `status=${login.status} body=${login.text.slice(0, 160)}`,
);
token = login.json?.token || token;

const badLogin = await call("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password: "WrongPassw0rd!" }),
});
check(
  "POST /api/auth/login (wrong password) -> 401 INVALID_CREDENTIALS",
  badLogin.status === 401 && badLogin.json?.error === "INVALID_CREDENTIALS",
  `status=${badLogin.status} body=${badLogin.text.slice(0, 160)}`,
);

/* 4. session --------------------------------------------------------------- */
const me = await call("/api/auth/me", {
  headers: { Authorization: `Bearer ${token}` },
});
check(
  "GET /api/auth/me WITH token -> 200 { user }",
  me.status === 200 && me.json?.user?.email === email,
  `status=${me.status} body=${me.text.slice(0, 160)}`,
);

const meNoToken = await call("/api/auth/me");
check(
  "GET /api/auth/me WITHOUT token -> 401",
  meNoToken.status === 401,
  `status=${meNoToken.status}`,
);

/* 5. forgot password ------------------------------------------------------- */
const forgot = await call("/api/auth/forgot-password", {
  method: "POST",
  body: JSON.stringify({ email }),
});
check(
  "POST /api/auth/forgot-password -> 200 { message }",
  forgot.status === 200 && typeof forgot.json?.message === "string",
  `status=${forgot.status} body=${forgot.text.slice(0, 160)}`,
);

const forgotUnknown = await call("/api/auth/forgot-password", {
  method: "POST",
  body: JSON.stringify({ email: `nobody.${Date.now()}@example.com` }),
});
check(
  "POST /api/auth/forgot-password (unknown email) -> 200, same generic message",
  forgotUnknown.status === 200 &&
    forgotUnknown.json?.message === forgot.json?.message,
  `status=${forgotUnknown.status}`,
);

// The code is emailed, never returned. A wrong code must be rejected - this
// proves the verify route is wired (and that no code is echoed back).
const verifyWrong = await call("/api/auth/verify-reset-code", {
  method: "POST",
  body: JSON.stringify({ email, code: "000" }),
});
check(
  "POST /api/auth/verify-reset-code (wrong code) -> 400 INVALID_CODE",
  verifyWrong.status === 400 && verifyWrong.json?.error === "INVALID_CODE",
  `status=${verifyWrong.status} body=${verifyWrong.text.slice(0, 160)}`,
);

const resetNoToken = await call("/api/auth/reset-password", {
  method: "POST",
  body: JSON.stringify({ newPassword }),
});
check(
  "POST /api/auth/reset-password (no verified session) -> 400",
  resetNoToken.status === 400,
  `status=${resetNoToken.status}`,
);

/* 6. protected route ------------------------------------------------------- */
const balance = await call("/api/wallet/balance", {
  headers: { Authorization: `Bearer ${token}` },
});
check(
  "GET /api/wallet/balance WITH token -> 200 { balance }",
  balance.status === 200 && typeof balance.json?.balance === "number",
  `status=${balance.status} body=${balance.text.slice(0, 160)}`,
);

/* 7. unknown route must be JSON, not HTML ---------------------------------- */
const missing = await call("/api/auth/does-not-exist");
check(
  "GET /api/<unknown> -> 404 JSON (never the SPA's index.html)",
  missing.status === 404 && missing.json?.error === "NOT_FOUND",
  `status=${missing.status} body=${missing.text.slice(0, 120)}`,
);

/* 8. CORS ------------------------------------------------------------------ */
const corsOk = await call("/api/health", {
  headers: { Origin: "https://pandanumbers.vercel.app" },
});
check(
  "CORS: an allow-listed origin gets Access-Control-Allow-Origin",
  corsOk.headers.get("access-control-allow-origin") !== null,
  `acao=${corsOk.headers.get("access-control-allow-origin")}`,
);

const corsBad = await call("/api/health", {
  headers: { Origin: "https://evil.example.com" },
});
check(
  "CORS: an unlisted origin gets 403 ORIGIN_NOT_ALLOWED",
  corsBad.status === 403 && corsBad.json?.error === "ORIGIN_NOT_ALLOWED",
  `status=${corsBad.status} acao=${corsBad.headers.get("access-control-allow-origin")}`,
);

console.log(`\n${pass} passed, ${fail} failed  (${base})`);
process.exit(fail === 0 ? 0 : 1);
