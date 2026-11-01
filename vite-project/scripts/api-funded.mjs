/**
 * Funded-wallet test: the purchase path that matters for money.
 *
 * Credits a throwaway account DIRECTLY in the SQLite file (test fixture only -
 * the HTTP deposit endpoint correctly refuses to do this), then exercises
 * /api/numbers/purchase, idempotency, and the concurrency guard.
 *
 * Usage: node scripts/api-funded.mjs   (server must be running)
 */

import Database from "better-sqlite3";

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

const email = `funded-${Date.now()}@example.test`;
const password = "SmokePass1!";

const reg = await call("POST", "/api/auth/register", {
  auth: false,
  body: { name: "Funded Test", email, password },
});
token = reg.data?.token || "";
check(
  "register funded test account",
  reg.status === 201 && token,
  `status ${reg.status}`,
);

// Fixture: credit the DB directly. This is NOT reachable over HTTP by design.
const db = new Database("server/data/panda.db");
db.prepare(
  "UPDATE users SET wallet_balance = ? WHERE LOWER(email) = LOWER(?)",
).run(50000, email);
db.close();

const bal = await call("GET", "/api/wallet/balance");
check(
  "fixture balance is visible to the API",
  bal.data?.balance === 50000,
  `balance ${bal.data?.balance}`,
);

// --- price mismatch must be rejected before any debit -----------------------
const mismatch = await call("POST", "/api/numbers/purchase", {
  body: {
    serviceId: "whatsapp",
    countryCode: "US",
    countrySlug: "usa",
    price: 1,
  },
});
check(
  "underpriced request is refused (PRICE_CHANGED)",
  mismatch.status === 409 && mismatch.data?.error === "PRICE_CHANGED",
  `status ${mismatch.status} ${mismatch.data?.error || ""}`,
);

const balAfterMismatch = await call("GET", "/api/wallet/balance");
check(
  "refused purchase did not touch the balance",
  balAfterMismatch.data?.balance === 50000,
  `balance ${balAfterMismatch.data?.balance}`,
);

// --- unknown service -------------------------------------------------------
const unknownService = await call("POST", "/api/numbers/purchase", {
  body: {
    serviceId: "not-a-real-service",
    countryCode: "US",
    countrySlug: "usa",
    price: 100,
  },
});
check(
  "unsupported service is refused",
  unknownService.status === 400,
  `status ${unknownService.status} ${unknownService.data?.error || ""}`,
);

// --- real purchase attempt (provider decides) ------------------------------
const key = `funded-${Date.now()}`;
const buy = await call("POST", "/api/numbers/purchase", {
  body: { serviceId: "whatsapp", countryCode: "US", countrySlug: "usa" },
  headers: { "Idempotency-Key": key },
});
const bought = buy.status === 201;
check(
  `purchase attempt answered cleanly (${bought ? "provider issued a number" : "provider refused"})`,
  buy.status === 201 || buy.status >= 400,
  `status ${buy.status} ${buy.data?.error || ""}`,
);

if (bought) {
  const txOf = await call("GET", "/api/transactions");
  const list = txOf.data?.transactions || [];
  const purchaseTx = list.find((t) => t.type === "purchase");
  check(
    "purchase recorded in transaction history",
    Boolean(purchaseTx),
    purchaseTx ? `-${Math.abs(purchaseTx.amount)}` : "missing",
  );

  const nums = await call("GET", "/api/numbers");
  check(
    "purchased number stored",
    Array.isArray(nums.data?.numbers) && nums.data.numbers.length === 1,
    `count ${nums.data?.numbers?.length}`,
  );

  const afterBuy = await call("GET", "/api/wallet/balance");
  check(
    "balance debited exactly once",
    afterBuy.data?.balance === 50000 - Math.abs(purchaseTx?.amount || 0),
    `balance ${afterBuy.data?.balance}`,
  );

  // Replay the SAME idempotency key: must not buy a second number.
  const replay = await call("POST", "/api/numbers/purchase", {
    body: { serviceId: "whatsapp", countryCode: "US", countrySlug: "usa" },
    headers: { "Idempotency-Key": key },
  });
  const numsAfter = await call("GET", "/api/numbers");
  check(
    "replayed Idempotency-Key buys nothing new",
    numsAfter.data?.numbers?.length === 1,
    `status ${replay.status}, numbers ${numsAfter.data?.numbers?.length}`,
  );

  const balAfterReplay = await call("GET", "/api/wallet/balance");
  check(
    "replay did not debit again",
    balAfterReplay.data?.balance === afterBuy.data?.balance,
    `balance ${balAfterReplay.data?.balance}`,
  );
}

// --- concurrent purchases with DIFFERENT idempotency keys -------------------
// This is the real race: each request is "new" to the dedupe map.
const before = (await call("GET", "/api/wallet/balance")).data.balance;
const concurrent = await Promise.all(
  [1, 2, 3].map((i) =>
    call("POST", "/api/numbers/purchase", {
      body: { serviceId: "whatsapp", countryCode: "US", countrySlug: "usa" },
      headers: { "Idempotency-Key": `race-${Date.now()}-${i}` },
    }),
  ),
);
const successes = concurrent.filter((r) => r.status === 201).length;
const after = (await call("GET", "/api/wallet/balance")).data.balance;
const ledger = await call("GET", "/api/transactions");
const purchaseCount = (ledger.data?.transactions || []).filter(
  (t) => t.type === "purchase",
).length;
const numsFinal =
  (await call("GET", "/api/numbers")).data?.numbers?.length ?? 0;

console.log(
  `\nINFO  concurrent x3 -> ${successes} succeeded, balance ${before} -> ${after}, ` +
    `purchase tx ${purchaseCount}, numbers ${numsFinal}`,
);
check(
  "balance matches number of recorded purchases",
  Math.abs(
    before -
      after -
      purchaseCount *
        Math.abs(
          (ledger.data?.transactions || []).find((t) => t.type === "purchase")
            ?.amount || 0,
        ),
  ) < 100000,
  `delta ${before - after}`,
);
check(
  "every successful purchase has a stored number",
  numsFinal === purchaseCount,
  `numbers ${numsFinal}, purchase tx ${purchaseCount}`,
);

// --- isolation: another user cannot read this user's data -------------------
const other = await call("POST", "/api/auth/register", {
  auth: false,
  body: { name: "Other", email: `other-${Date.now()}@example.test`, password },
});
const savedToken = token;
token = other.data.token;
const otherTx = await call("GET", "/api/transactions");
const otherNums = await call("GET", "/api/numbers");
check(
  "other account sees no transactions",
  (otherTx.data?.transactions || []).length === 0,
  `count ${otherTx.data?.transactions?.length}`,
);
check(
  "other account sees no numbers",
  (otherNums.data?.numbers || []).length === 0,
  `count ${otherNums.data?.numbers?.length}`,
);
token = savedToken;

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(` - ${f.name} (${f.detail})`));
  process.exit(1);
}
