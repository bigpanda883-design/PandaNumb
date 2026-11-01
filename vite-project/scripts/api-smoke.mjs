/**
 * API smoke test: exercises every HTTP route the frontend actually calls.
 *
 * Usage:  node scripts/api-smoke.mjs
 * Requires the server to be running on http://127.0.0.1:8787.
 *
 * It creates a throwaway account (random email), walks the wallet/numbers
 * endpoints, and prints a PASS/FAIL line per check. No secrets are printed.
 */

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:8787";
const results = [];
let token = "";

async function call(method, path, { body, headers = {}, auth = true } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { __unparsed: text.slice(0, 120) };
  }
  return { status: res.status, data };
}

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`,
  );
}

const email = `smoke-${Date.now()}@example.test`;
const password = "SmokePass1!";

// ---------------------------------------------------------------- public
{
  const r = await call("GET", "/api/health", { auth: false });
  check(
    "GET /api/health",
    r.status === 200 && r.data?.ok === true,
    `status ${r.status}`,
  );

  const bad = await call("GET", "/api/does-not-exist", { auth: false });
  check(
    "unknown /api route answers JSON 404",
    bad.status === 404 && bad.data?.error === "NOT_FOUND",
    `status ${bad.status}`,
  );

  const badJson = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  const badJsonText = await badJson.text();
  let badJsonParsed = true;
  try {
    JSON.parse(badJsonText);
  } catch {
    badJsonParsed = false;
  }
  check(
    "malformed JSON body answers JSON, not HTML",
    badJsonParsed,
    `status ${badJson.status}`,
  );
}

// ---------------------------------------------------------------- auth
{
  const r = await call("POST", "/api/auth/register", {
    auth: false,
    body: { name: "Smoke Test", email, password, phone: "" },
  });
  check(
    "POST /api/auth/register",
    r.status === 201 && r.data?.token,
    `status ${r.status}`,
  );
  token = r.data?.token || "";

  const dupe = await call("POST", "/api/auth/register", {
    auth: false,
    body: { name: "Smoke Test", email, password },
  });
  check(
    "register rejects duplicate email",
    dupe.status === 409,
    `status ${dupe.status}`,
  );

  const weak = await call("POST", "/api/auth/register", {
    auth: false,
    body: {
      name: "x",
      email: `weak-${Date.now()}@example.test`,
      password: "abc",
    },
  });
  check(
    "register rejects weak password",
    weak.status === 400,
    `status ${weak.status}`,
  );

  const me = await call("GET", "/api/auth/me");
  check(
    "GET /api/auth/me",
    me.status === 200 && me.data?.user?.email === email,
    `status ${me.status}`,
  );

  const noAuth = await call("GET", "/api/auth/me", { auth: false });
  check(
    "GET /api/auth/me without token is 401",
    noAuth.status === 401,
    `status ${noAuth.status}`,
  );

  const login = await call("POST", "/api/auth/login", {
    auth: false,
    body: { email, password },
  });
  check(
    "POST /api/auth/login",
    login.status === 200 && login.data?.token,
    `status ${login.status}`,
  );

  const badLogin = await call("POST", "/api/auth/login", {
    auth: false,
    body: { email, password: "WrongPass1!" },
  });
  check(
    "login rejects wrong password",
    badLogin.status === 401,
    `status ${badLogin.status}`,
  );
}

// ---------------------------------------------------------------- wallet
{
  const r = await call("GET", "/api/wallet/balance");
  check(
    "GET /api/wallet/balance",
    r.status === 200 && r.data?.balance === 0,
    `status ${r.status} balance ${r.data?.balance}`,
  );

  const dep = await call("POST", "/api/wallet/deposit", {
    body: { amount: 5000 },
  });
  const refused =
    dep.status === 503 && dep.data?.error === "PAYMENT_NOT_CONFIGURED";
  check(
    "POST /api/wallet/deposit refuses to create free money",
    refused,
    `status ${dep.status} ${dep.data?.error || ""}`,
  );

  const after = await call("GET", "/api/wallet/balance");
  check(
    "balance unchanged after refused deposit",
    after.data?.balance === 0,
    `balance ${after.data?.balance}`,
  );

  const neg = await call("POST", "/api/wallet/deposit", {
    body: { amount: -100 },
  });
  check(
    "deposit rejects negative amount",
    neg.status >= 400,
    `status ${neg.status}`,
  );

  const unauth = await fetch(`${BASE}/api/wallet/balance`).then(
    (r) => r.status,
  );
  check(
    "wallet balance without token is 401",
    unauth === 401,
    `status ${unauth}`,
  );
}

// ---------------------------------------------------------------- transactions / numbers
{
  const tx = await call("GET", "/api/transactions");
  check(
    "GET /api/transactions",
    tx.status === 200 && Array.isArray(tx.data?.transactions),
    `status ${tx.status}`,
  );

  const nums = await call("GET", "/api/numbers");
  check(
    "GET /api/numbers",
    nums.status === 200 && Array.isArray(nums.data?.numbers),
    `status ${nums.status}`,
  );

  // Broke account must be refused before the provider is called.
  const buy = await call("POST", "/api/numbers/purchase", {
    body: {
      serviceId: "whatsapp",
      countryCode: "US",
      countrySlug: "usa",
      price: 1000,
    },
    headers: { "Idempotency-Key": `smoke-${Date.now()}` },
  });
  const refused = [402, 409, 400, 503].includes(buy.status);
  check(
    "purchase with ₦0 balance is refused (no free number)",
    refused,
    `status ${buy.status} ${buy.data?.error || ""}`,
  );

  const verifyNonExistent = await call(
    "POST",
    "/api/numbers/does-not-exist/verify",
  );
  check(
    "verify of unknown number is 404",
    verifyNonExistent.status === 404,
    `status ${verifyNonExistent.status}`,
  );
}

// ---------------------------------------------------------------- pricing
{
  const prices = await call("GET", "/api/prices", { auth: false });
  check(
    "GET /api/prices",
    prices.status === 200 && prices.data && typeof prices.data === "object",
    `status ${prices.status}`,
  );

  const status = await call("GET", "/api/prices/status", { auth: false });
  check(
    "GET /api/prices/status",
    status.status === 200,
    `status ${status.status}`,
  );

  const audit = await call("GET", "/api/prices/audit", { auth: false });
  check(
    "GET /api/prices/audit",
    audit.status === 200,
    `status ${audit.status}`,
  );

  const detail = await call("GET", "/api/health/detail", { auth: false });
  check(
    "GET /api/health/detail",
    detail.status === 200,
    `status ${detail.status}`,
  );
}

// ---------------------------------------------------------------- sms
{
  const h = await call("GET", "/api/sms/health", { auth: false });
  check("GET /api/sms/health", h.status === 200, `status ${h.status}`);
}

// ---------------------------------------------------------------- CORS
{
  const res = await fetch(`${BASE}/api/health`, {
    headers: { Origin: "https://evil.example.com" },
  });
  check(
    "unlisted origin is refused (403)",
    res.status === 403,
    `status ${res.status}`,
  );

  const ok = await fetch(`${BASE}/api/health`, {
    headers: { Origin: "http://localhost:5173" },
  });
  check(
    "localhost:5173 origin is allowed",
    ok.status === 200,
    `status ${ok.status}`,
  );
}

// ---------------------------------------------------------------- logout
{
  const out = await call("POST", "/api/auth/logout");
  check("POST /api/auth/logout", out.status === 200, `status ${out.status}`);

  const after = await call("GET", "/api/auth/me");
  check(
    "token is dead after logout",
    after.status === 401,
    `status ${after.status}`,
  );
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(` - ${f.name} (${f.detail})`));
  process.exit(1);
}
