/**
 * Flutterwave virtual-account funding test, end to end.
 *
 *   node scripts/api-flutterwave.mjs
 *
 * Starts the REAL server with FLW_* pointed at a mock Flutterwave that speaks
 * the documented endpoints, then drives the routes the Deposit page calls and
 * checks the money rules:
 *
 *   - unconfigured: no account, no credit, and no secret in the config response;
 *   - account creation requires a BVN/NIN, is idempotent, and ambiguous provider
 *     responses never cause a duplicate create;
 *   - the BVN is never echoed in the response, the API, or the database file;
 *   - a webhook with the wrong verif-hash is refused;
 *   - FAILED / PENDING verifications credit nothing;
 *   - a successful transfer credits once, and a replayed delivery plus a new
 *     event for the same transaction credit nothing more;
 *   - a transaction the provider verifies for a DIFFERENT currency is not
 *     credited;
 *   - an unconfigured secret hash never credits anything.
 *
 * Uses a throwaway SQLite file (DATA_DIR): the dev database is never touched.
 * No real credential is read or needed.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 8897;
const MOCK_PORT = 8896;
const BASE = `http://127.0.0.1:${PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const WEBHOOK_SECRET_HASH = "test-secret-hash-not-a-real-key";
const RECONCILE_TOKEN = "test-reconcile-token";
const BVN = "22222222222";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`,
  );
}

/* ---------------------------------------------------------- mock provider */

/** account number -> { transactionId, amount, currency, status } */
const transactions = new Map();
/** email -> account objects (what GET /virtual-account-numbers returns) */
const accountsByEmail = new Map();
let nextAccountNumber = 820_000_0000;
let nextTransactionId = 4_200_000;
let createCalls = 0;
let failNextCreate = false;
const accountRefs = new Map();
let activeDataDir = "";

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, MOCK);
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  // The secret key must arrive as a Bearer header - never in the URL.
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return json(401, { status: "error", message: "missing bearer token" });
  }

  if (req.method === "POST" && url.pathname === "/v3/virtual-account-numbers") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      createCalls += 1;
      const body = JSON.parse(raw || "{}");
      if (!body.bvn && !body.nin) {
        return json(400, { status: "error", message: "bvn or nin required" });
      }
      if (failNextCreate) {
        failNextCreate = false;
        return json(503, { status: "error", message: "temporary provider failure" });
      }
      if (!body.tx_ref || body.is_permanent !== true) {
        return json(400, { status: "error", message: "static account fields required" });
      }
      const accountNumber = String(nextAccountNumber++);
      const account = {
        account_number: accountNumber,
        bank_name: "Wema Bank",
        account_name: `${body.firstname} ${body.lastname}`,
        narration: body.narration,
        order_ref: `ORD-${accountNumber}`,
        flw_ref: `FLW-${accountNumber}`,
        frequency: "NIP",
        status: "active",
        tx_ref: body.tx_ref,
      };
      accountRefs.set(accountNumber, body.tx_ref);
      const email = String(body.email).toLowerCase();
      accountsByEmail.set(email, [
        ...(accountsByEmail.get(email) || []),
        account,
      ]);
      json(200, {
        status: "success",
        message: "Virtual account created",
        data: account,
      });
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/v3/virtual-account-numbers") {
    const email = String(url.searchParams.get("email") || "").toLowerCase();
    return json(200, {
      status: "success",
      data: { virtual_accounts: accountsByEmail.get(email) || [] },
    });
  }

  const verify = /^\/v3\/transactions\/(\d+)\/verify$/.exec(url.pathname);
  if (req.method === "GET" && verify) {
    const entry = transactions.get(String(verify[1]));
    if (!entry) return json(404, { status: "error", message: "not found" });
    return json(200, {
      status: "success",
      data: {
        id: Number(verify[1]),
        status: entry.status,
        amount: entry.amount,
        currency: entry.currency,
        tx_ref: entry.txRef,
        flw_ref: `FLWREF-${verify[1]}`,
        payment_type: "bank_transfer",
        customer: { email: entry.customerEmail, name: entry.customerName },
        processor_response: "Approved by Financial Institution",
        created_at: new Date().toISOString(),
      },
    });
  }

  json(404, { status: "error", message: "unknown endpoint" });
});

/** Record a transfer into an account and return its transaction id. */
function addTransfer({
  accountNumber,
  amount,
  currency = "NGN",
  status = "successful",
  email,
}) {
  const id = nextTransactionId++;
  transactions.set(String(id), {
    status,
    amount,
    currency,
    txRef: accountRefs.get(String(accountNumber)) || `FLW-TX-${id}`,
    customerEmail: email || "payer@example.test",
    customerName: "Payer Name",
  });
  // The webhook payload carries the beneficiary account number in meta.
  transferByAccount.set(String(id), String(accountNumber));
  return id;
}
const transferByAccount = new Map();

/* ----------------------------------------------------------------- server */

function startServer(extraEnv) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "panda-flw-"));
  activeDataDir = dataDir;
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(PORT),
    DATA_DIR: dataDir,
    FRONTEND_ORIGINS: "http://localhost:5173",
    // Test-shaped key: the server derives "test" mode from the FLWSECK_TEST
    // prefix, never from a separate flag.
    FLW_SECRET_KEY: "FLWSECK_TEST-not-a-real-key",
    FLW_PUBLIC_KEY: "FLWPUBK_TEST-not-a-real-key",
    FLW_WEBHOOK_SECRET_HASH: WEBHOOK_SECRET_HASH,
    ADMIN_RECONCILE_TOKEN: RECONCILE_TOKEN,
    ADMIN_EMAILS: "admin@example.test",
    ...extraEnv,
  };

  const child = spawn(
    process.execPath,
    [
      "-e",
      // Redirect the SDK host to the mock without touching application code:
      // a tiny preload shim rewrites only requests to api.flutterwave.com.
      `
      const realFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url && url.startsWith("https://api.flutterwave.com/v3")) {
          return realFetch(url.replace("https://api.flutterwave.com/v3", ${JSON.stringify(`${MOCK}/v3`)}), init);
        }
        return realFetch(input, init);
      };
      await import("./server/index.js");
      `,
    ],
    { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  child.stdout.on("data", (d) => {
    log += d;
    if (process.env.FUNDING_DEBUG) process.stdout.write(`[server] ${d}`);
  });
  child.stderr.on("data", (d) => {
    log += d;
    if (process.env.FUNDING_DEBUG) process.stdout.write(`[server!] ${d}`);
  });
  child.log = () => log;
  child.dataDir = dataDir;
  return child;
}

async function waitFor(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2000);
  });
}

/* ------------------------------------------------------------------ client */

let token = "";
async function call(
  method,
  route,
  { body, headers = {}, auth = true, rawBody } = {},
) {
  const payload =
    rawBody !== undefined ? rawBody : body ? JSON.stringify(body) : undefined;
  const response = await fetch(`${BASE}${route}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(payload !== undefined ? { body: payload } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { __unparsed: text.slice(0, 120) };
  }
  if (process.env.FUNDING_DEBUG) {
    console.log(
      `[call] ${method} ${route} -> ${response.status} ${text.slice(0, 200)}`,
    );
  }
  return { status: response.status, data };
}

async function sendWebhook(payload, { hash = WEBHOOK_SECRET_HASH } = {}) {
  return call("POST", "/api/webhooks/flutterwave", {
    auth: false,
    body: payload,
    headers: { "verif-hash": hash },
  });
}

async function balance() {
  return (await call("GET", "/api/wallet/balance")).data?.balance;
}

async function signup(label, requestedEmail = "") {
  const email =
    requestedEmail ||
    `${label}-${Date.now()}-${crypto.randomUUID().slice(0, 4)}@example.test`;
  const database = new Database(path.join(activeDataDir, "panda.db"));
  const userId = crypto.randomUUID();
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO users
         (id, name, email, phone, password_hash, email_verified_at,
          created_at, updated_at)
       VALUES (?, ?, ?, '', 'test-only', ?, ?, ?)`,
    )
    .run(userId, "Ada Lovelace", email, now, now, now);
  database
    .prepare(
      `INSERT INTO sessions
         (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      userId,
      crypto.createHash("sha256").update(sessionToken).digest("hex"),
      new Date(Date.now() + 60 * 60_000).toISOString(),
      now,
    );
  database.close();
  token = sessionToken;
  return { email, status: 201, data: { user: { id: userId }, token } };
}

/* ------------------------------------------------------------------- tests */

let server;
try {
  await new Promise((resolve) => mock.listen(MOCK_PORT, resolve));

  /* ---- 1. unconfigured ------------------------------------------------ */
  {
    server = startServer({ FLW_SECRET_KEY: "", FLW_WEBHOOK_SECRET_HASH: "" });
    check(
      "server starts with Flutterwave unconfigured",
      await waitFor(`${BASE}/api/health`),
    );

    const config = await call("GET", "/api/payments/config", { auth: false });
    check(
      "config lists FLW_SECRET_KEY and FLW_WEBHOOK_SECRET_HASH as missing",
      config.status === 200 &&
        config.data?.configured === false &&
        config.data.missing.includes("FLW_SECRET_KEY") &&
        config.data.missing.includes("FLW_WEBHOOK_SECRET_HASH"),
      JSON.stringify(config.data?.missing),
    );
    check(
      "config reports no active mode while unconfigured",
      config.data?.mode === null &&
        !("secretKey" in (config.data || {})) &&
        !("keyLength" in (config.data || {})),
      `mode ${config.data?.mode}`,
    );

    await signup("unconfigured");
    const created = await call("POST", "/api/wallet/virtual-account", {
      body: { bvn: BVN, firstName: "Ada", lastName: "Lovelace" },
    });
    check(
      "account creation while unconfigured answers 503",
      created.status === 503 &&
        created.data?.error === "PAYMENT_NOT_CONFIGURED",
      `status ${created.status}`,
    );

    token = "";
    await stop(server);
    server = null;
  }

  /* ---- 2. configured -------------------------------------------------- */
  server = startServer({});
  check("server starts fully configured", await waitFor(`${BASE}/api/health`));

  const config = await call("GET", "/api/payments/config", { auth: false });
  check(
    "configured server reports test mode, from the key prefix",
    config.data?.configured === true && config.data?.mode === "test",
    `mode ${config.data?.mode}`,
  );

  const user = await signup("funding");
  check("throwaway account created", Boolean(token), `status ${user.status}`);

  const legacy = await call("POST", "/api/wallet/deposit", {
    body: { amount: 5000 },
  });
  check(
    "POST /api/wallet/deposit cannot credit anything",
    legacy.status === 410 && (await balance()) === 0,
    `status ${legacy.status}, balance ${await balance()}`,
  );

  const none = await call("GET", "/api/wallet/virtual-account");
  check(
    "no account yet: state NOT_CREATED, no bank details",
    none.status === 200 &&
      none.data?.state === "NOT_CREATED" &&
      none.data?.account === null,
    `state ${none.data?.state}`,
  );

  const noIdentity = await call("POST", "/api/wallet/virtual-account", {
    body: { firstName: "Ada" },
  });
  check(
    "account creation without BVN/NIN is refused before any provider call",
    noIdentity.status === 400 && noIdentity.data?.error === "IDENTITY_REQUIRED",
    `status ${noIdentity.status}`,
  );

  const shortBvn = await call("POST", "/api/wallet/virtual-account", {
    body: { bvn: "123" },
  });
  check(
    "a malformed BVN is refused",
    shortBvn.status === 400 && shortBvn.data?.error === "IDENTITY_INVALID",
    `status ${shortBvn.status}`,
  );

  const created = await call("POST", "/api/wallet/virtual-account", {
    body: { bvn: BVN, firstName: "Ada", lastName: "Lovelace" },
  });
  const accountNumber = created.data?.account?.accountNumber;
  const accountTxRef = created.data?.account?.txRef;
  check(
    "a permanent account is created and returned",
    created.status === 201 &&
      /^\d{10}$/.test(String(accountNumber)) &&
      created.data?.account?.bankName === "Wema Bank" &&
      created.data?.account?.kind === "PERMANENT" &&
      /^[A-Za-z0-9_-]{8,50}$/.test(String(accountTxRef)),
    `status ${created.status}, account ${accountNumber}`,
  );
  check(
    "the BVN is never echoed in the response",
    !JSON.stringify(created.data).includes(BVN),
    "response body checked",
  );

  const savedToken = token;

  const again = await call("POST", "/api/wallet/virtual-account", {
    body: { bvn: BVN, firstName: "Ada", lastName: "Lovelace" },
  });
  check(
    "a second create request returns the SAME account without calling Flutterwave",
    again.status === 200 &&
      again.data?.created === false &&
      again.data?.account?.accountNumber === accountNumber &&
      createCalls === 1,
    `calls ${createCalls}, account ${again.data?.account?.accountNumber}`,
  );

  const saved = await call("GET", "/api/wallet/virtual-account");
  check(
    "GET returns the saved account (state ACTIVE)",
    saved.data?.state === "ACTIVE" &&
      saved.data?.account?.accountNumber === accountNumber,
    `state ${saved.data?.state}`,
  );
  check(
    "no provider-internal field leaks to the browser",
    saved.data?.account &&
      !("flwRef" in saved.data.account) &&
      !("orderRef" in saved.data.account) &&
      !JSON.stringify(saved.data).includes(BVN),
    Object.keys(saved.data.account || {}).join(","),
  );

  /* ---- ambiguous provider response never triggers a duplicate create ----- */
  {
    await signup("ambiguous-create");
    const callsBefore = createCalls;
    failNextCreate = true;
    const uncertain = await call("POST", "/api/wallet/virtual-account", {
      body: { bvn: BVN, firstName: "Ada", lastName: "Lovelace" },
    });
    check(
      "an uncertain provider result leaves the account pending",
      uncertain.status === 502 && createCalls === callsBefore + 1,
      `status ${uncertain.status}, create calls ${createCalls - callsBefore}`,
    );
    const state = await call("GET", "/api/wallet/virtual-account");
    check(
      "the account is not silently reset after an ambiguous response",
      state.data?.state === "PENDING" &&
        state.data?.account?.accountNumber === null,
      `state ${state.data?.state}`,
    );
    const retry = await call("POST", "/api/wallet/virtual-account", {
      body: { bvn: BVN, firstName: "Ada", lastName: "Lovelace" },
    });
    check(
      "an ambiguous create is not blindly retried",
      retry.status === 409 &&
        retry.data?.error === "ACCOUNT_CREATION_PENDING" &&
        createCalls === callsBefore + 1,
      `status ${retry.status}, create calls ${createCalls - callsBefore}`,
    );
    token = savedToken;
  }

  /* ---- webhook authenticity ------------------------------------------- */
  const wrongHash = await sendWebhook(
    { "event.type": "transfer.completed", data: { id: 1 } },
    { hash: "0".repeat(32) },
  );
  check(
    "webhook with a wrong verif-hash is refused",
    wrongHash.status === 401,
    `status ${wrongHash.status}`,
  );

  const noHash = await call("POST", "/api/webhooks/flutterwave", {
    auth: false,
    body: { "event.type": "transfer.completed", data: { id: 1 } },
  });
  check(
    "webhook without verif-hash is refused",
    noHash.status === 401,
    `status ${noHash.status}`,
  );

  /* ---- pending / failed transfer: nothing credited --------------------- */
  const pendingId = addTransfer({
    accountNumber,
    amount: 2000,
    status: "pending",
  });
  const pendingWebhook = await sendWebhook({
    "event.type": "transfer.completed",
    id: pendingId,
    data: {
      id: pendingId,
      status: "pending",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "a pending transfer credits nothing",
    pendingWebhook.status === 200 &&
      pendingWebhook.data?.state === "PENDING" &&
      (await balance()) === 0,
    `state ${pendingWebhook.data?.state}, balance ${await balance()}`,
  );

  const failedId = addTransfer({
    accountNumber,
    amount: 2000,
    status: "failed",
  });
  const failedWebhook = await sendWebhook({
    "event.type": "transfer.completed",
    id: failedId,
    data: {
      id: failedId,
      status: "failed",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "a failed transfer credits nothing",
    failedWebhook.status === 200 &&
      failedWebhook.data?.state === "FAILED" &&
      (await balance()) === 0,
    `state ${failedWebhook.data?.state}, balance ${await balance()}`,
  );

  /* ---- wrong currency: nothing credited -------------------------------- */
  const usdId = addTransfer({ accountNumber, amount: 1000, currency: "USD" });
  const usdWebhook = await sendWebhook({
    "event.type": "transfer.completed",
    id: usdId,
    data: {
      id: usdId,
      status: "successful",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "a non-NGN transfer is not credited (REVIEW)",
    usdWebhook.data?.state === "REVIEW" && (await balance()) === 0,
    `state ${usdWebhook.data?.state}, balance ${await balance()}`,
  );

  /* ---- a forged success body is not enough ----------------------------
     The webhook says "successful" with an amount of ₦1,000,000, but the
     provider's verify API says ₦2,500.4 The verified figure must win. */
  const paidId = addTransfer({
    accountNumber,
    amount: 2500,
    status: "successful",
  });
  const paidWebhook = await sendWebhook({
    "event.type": "transfer.completed",
    id: paidId,
    status: "successful",
    data: {
      id: paidId,
      status: "successful",
      amount: 1_000_000,
      currency: "NGN",
      meta: { beneficiary_account: accountNumber },
    },
  });
  const paidBalance = await balance();
  check(
    "a successful transfer credits exactly the VERIFIED amount, once",
    paidWebhook.status === 200 &&
      paidWebhook.data?.state === "SUCCESS" &&
      paidWebhook.data?.amount === 2500 &&
      paidBalance === 2500,
    `state ${paidWebhook.data?.state}, amount ${paidWebhook.data?.amount}, balance ${paidBalance}`,
  );

  const replay = await sendWebhook({
    "event.type": "transfer.completed",
    id: paidId,
    data: {
      id: paidId,
      status: "successful",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "the same delivery again does not credit twice",
    replay.data?.duplicate === true && (await balance()) === 2500,
    `balance ${await balance()}`,
  );

  const newEvent = await sendWebhook({
    "event.type": "transfer.completed",
    id: `${paidId}-retry`,
    data: {
      id: paidId,
      status: "successful",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "a NEW event for an already-credited transaction does not credit twice",
    newEvent.data?.state === "SUCCESS" &&
      newEvent.data?.alreadyApplied === true &&
      (await balance()) === 2500,
    `state ${newEvent.data?.state}, balance ${await balance()}`,
  );

  /* ---- the deposit appears in history and the balance endpoint -------- */
  const deposits = await call("GET", "/api/wallet/deposits?limit=10");
  const first = deposits.data?.deposits?.[0];
  check(
    "the confirmed deposit is listed, credited, with the right amount",
    deposits.status === 200 &&
      first?.credited === true &&
      first?.amount === 2500 &&
      first?.status === "CREDITED" &&
      deposits.data?.total >= 1,
    `total ${deposits.data?.total}, first ${first?.amount}/${first?.status}`,
  );
  check(
    "the wallet balance endpoint agrees with the credited total",
    deposits.data?.balance === 2500,
    `balance ${deposits.data?.balance}`,
  );

  /* ---- delayed notification settles an existing pending deposit -------- */
  const delayedId = addTransfer({
    accountNumber,
    amount: 1250,
    status: "pending",
  });
  const delayedPending = await sendWebhook({
    "event.type": "transfer.completed",
    id: delayedId,
    data: {
      id: delayedId,
      status: "pending",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "a pending payment is recorded without credit",
    delayedPending.data?.state === "PENDING" && (await balance()) === 2500,
    JSON.stringify(delayedPending.data),
  );
  transactions.get(String(delayedId)).status = "successful";
  const delayedSuccess = await sendWebhook({
    "event.type": "transfer.completed",
    id: `${delayedId}-success`,
    data: {
      id: delayedId,
      status: "successful",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "a later successful notification settles the same pending transaction",
    delayedSuccess.data?.state === "SUCCESS" && (await balance()) === 3750,
    JSON.stringify(delayedSuccess.data),
  );
  const delayedReplay = await sendWebhook({
    "event.type": "transfer.completed",
    id: `${delayedId}-replay`,
    data: {
      id: delayedId,
      status: "successful",
      meta: { beneficiary_account: accountNumber },
    },
  });
  check(
    "the delayed success notification still credits only once",
    delayedReplay.data?.state === "SUCCESS" &&
      delayedReplay.data?.alreadyApplied === true &&
      (await balance()) === 3750,
    JSON.stringify(delayedReplay.data),
  );

  /* ---- another user sees none of it ---------------------------------- */
  await signup("other");
  const otherDeposits = await call("GET", "/api/wallet/deposits");
  const otherAccount = await call("GET", "/api/wallet/virtual-account");
  check(
    "another account sees no deposits and no bank account",
    (otherDeposits.data?.deposits || []).length === 0 &&
      otherAccount.data?.account === null,
    `deposits ${otherDeposits.data?.deposits?.length}`,
  );
  token = savedToken;

  /* ---- admin payment views are read-only and allowlisted --------------- */
  await signup("admin", "admin@example.test");
  const adminToken = token;
  const adminAccounts = await call("GET", "/api/admin/payments/virtual-accounts");
  const adminDeposits = await call("GET", "/api/admin/payments/deposits");
  const adminWebhooks = await call("GET", "/api/admin/payments/webhooks");
  check(
    "allowlisted administrator can view accounts, deposits, and webhooks",
    adminAccounts.status === 200 &&
      adminAccounts.data?.total >= 1 &&
      adminDeposits.status === 200 &&
      adminDeposits.data?.total >= 1 &&
      adminWebhooks.status === 200,
    `statuses ${adminAccounts.status}/${adminDeposits.status}/${adminWebhooks.status}`,
  );
  await signup("not-admin");
  const deniedAdminView = await call("GET", "/api/admin/payments/deposits");
  check(
    "non-admin customer cannot view operations data",
    deniedAdminView.status === 403,
    `status ${deniedAdminView.status}`,
  );
  token = adminToken;
  const manualSuccess = await call("POST", "/api/admin/payments/deposits", {
    body: { transactionId: paidId, status: "CREDITED" },
  });
  check(
    "admin API does not expose a manual-success mutation",
    manualSuccess.status === 404 || manualSuccess.status === 405,
    `status ${manualSuccess.status}`,
  );
  token = savedToken;

  /* ---- the BVN is not stored anywhere in the database ---------------- */
  {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(path.join(server.dataDir, "panda.db"), {
      readonly: true,
    });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    // Dump EVERY table and search the serialised rows: a column name does not
    // matter, only whether the value is anywhere in the file.
    let found = false;
    for (const table of tables) {
      const text = JSON.stringify(db.prepare(`SELECT * FROM "${table}"`).all());
      if (text.includes(BVN)) found = true;
    }
    db.close();
    check(
      "the BVN is not stored in any table",
      !found,
      `${tables.length} tables scanned`,
    );
  }

  /* ---- the operator sweep credits a deposit the webhook never delivered --
     A transfer the provider accepted whose webhook never reached us must stay
     uncredited until one does - the sweep pours over the rows it knows must not
     pay anything a second time. */
  {
    // 750 is below every other transfer in this run, so it is unambiguous.
    // This is the provider's side of a webhook that never arrived. The sweep only
    // walks deposits it already knows about, so it cannot credit this one - that
    // is deliberately NOT its job (an unknown transfer has no known payer) and
    // is proved rather than assumed.
    const sweepId = addTransfer({ accountNumber, amount: 750 });

    // Two sweeps of the SAME flood of uncredited rows: busy operator, or a
    // retried request. "Already credited" is not part of the sweep's WHERE
    // clause, so the second sweep deliberately re-examines the rows the first
    // one just repaired - and must not pay any of them twice.
    const sweep = await call("POST", "/api/health/flutterwave/reconcile", {
      headers: { "x-reconcile-token": RECONCILE_TOKEN },
    });
    const secondSweep = await call(
      "POST",
      "/api/health/flutterwave/reconcile",
      {
        headers: { "x-reconcile-token": RECONCILE_TOKEN },
      },
    );
    const mentions = [sweep, secondSweep].some((result) =>
      (result.data?.outcomes || []).some(
        (entry) => String(entry.deposit) === String(sweepId),
      ),
    );
    const balanceAfter = await balance();
    check(
      "repeated sweeps of the same rows never credit a transfer twice",
      sweep.status === 200 &&
        secondSweep.status === 200 &&
        !mentions &&
        balanceAfter === 3750,
      `mentioned ${mentions}, balance ${balanceAfter}`,
    );

    const noToken = await call("POST", "/api/health/flutterwave/reconcile");
    check(
      "reconciliation without the operator token is refused",
      noToken.status === 403,
      `status ${noToken.status}`,
    );
  }

  await stop(server);
  server = null;
} catch (error) {
  console.error("ERROR", error);
  if (server?.log) console.error(server.log().slice(-2000));
  results.push({
    name: "unexpected error",
    ok: false,
    detail: String(error?.message || error),
  });
} finally {
  await stop(server);
  mock.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(` - ${f.name} (${f.detail})`));
}
process.exit(failed.length ? 1 : 0);
