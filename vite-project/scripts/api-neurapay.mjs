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
const SECRET = "webhook-secret-for-tests-only";
const BUSINESS_ID = "merchant-test-id";
const API_KEY = "np_test_sk_test-only";
const results = [];
const accounts = new Map();
const transactions = new Map();
let nextAccountNumber = 8200000000;
let createCalls = 0;
let dataDirectory = "";
let legacyUser = null;

function check(name, passed, details = "") {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${details ? ` — ${details}` : ""}`);
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, MOCK);
  if (
    req.headers.authorization !== `Bearer ${API_KEY}` ||
    req.headers["x-business-id"] !== BUSINESS_ID
  ) {
    return json(res, 401, { status: "error", message: "unauthorized" });
  }

  if (req.method === "POST" && url.pathname === "/api/v1/virtual-accounts") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      createCalls += 1;
      const body = JSON.parse(raw || "{}");
      if (
        !body.customer_name ||
        !body.customer_email ||
        body.provider_channel !== "Paga" ||
        !body.reference ||
        "bvn" in body ||
        "nin" in body
      ) {
        return json(res, 400, { status: "error", message: "invalid account request" });
      }
      const account = {
        account_number: String(nextAccountNumber++),
        bank_name: "Paga",
        account_name: body.customer_name,
        reference: `ACCOUNT-${body.reference}`,
        status: "active",
      };
      accounts.set(account.account_number, account);
      return json(res, 201, { status: "success", data: account });
    });
    return;
  }

  const verify = /^\/api\/v1\/transactions\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && verify) {
    const ref = decodeURIComponent(verify[1]);
    const transaction = transactions.get(ref);
    if (!transaction) {
      return json(res, 404, { status: "error", message: "not found" });
    }
    return json(res, 200, { status: "success", data: transaction });
  }

  return json(res, 404, { status: "error", message: "unknown endpoint" });
});

function startServer() {
  dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "panda-neurapay-"));
  legacyUser = seedLegacyDatabase(dataDirectory);
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(PORT),
    DATA_DIR: dataDirectory,
    FRONTEND_ORIGINS: "http://localhost:5173",
    NEURAPAY_MODE: "test",
    NEURAPAY_SECRET_KEY: API_KEY,
    NEURAPAY_BUSINESS_ID: BUSINESS_ID,
    NEURAPAY_WEBHOOK_SIGNING_SECRET: SECRET,
    NEURAPAY_API_BASE_URL: `${MOCK}/api/v1`,
    ADMIN_RECONCILE_TOKEN: "reconcile-test-token",
  };
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (data) => {
    log += data;
    if (process.env.FUNDING_DEBUG) process.stdout.write(`[server] ${data}`);
  });
  child.stderr.on("data", (data) => {
    log += data;
    if (process.env.FUNDING_DEBUG) process.stdout.write(`[server!] ${data}`);
  });
  child.getLog = () => log;
  return child;
}

async function waitFor(url, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return false;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
}

let token = "";
async function call(method, route, { body, headers = {}, auth = true } = {}) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function sendWebhook(payload, { validSignature = true } = {}) {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(body)
    .digest("hex");
  return call("POST", "/api/webhooks/neurapay", {
    auth: false,
    headers: {
      "Content-Type": "application/json",
      "X-NeuraPay-Signature": validSignature ? signature : "0".repeat(64),
    },
    body: JSON.parse(body),
  });
}

function makeTransaction(reference, accountNumber, overrides = {}) {
  return {
    reference,
    amount: 1500,
    currency: "NGN",
    status: "successful",
    type: "inbound_transfer",
    virtual_account_number: accountNumber,
    provider_reference: `provider-${reference}`,
    customer_name: "Test Payer",
    ...overrides,
  };
}

function seedLegacyDatabase(directory) {
  const database = new Database(path.join(directory, "panda.db"));
  const id = crypto.randomUUID();
  const email = `legacy-${id}@example.test`;
  const tokenValue = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      phone TEXT DEFAULT '', password_hash TEXT NOT NULL, email_verified_at TEXT,
      wallet_balance REAL NOT NULL DEFAULT 0, transactions TEXT NOT NULL DEFAULT '[]',
      notifications TEXT NOT NULL DEFAULT '[]', purchased_numbers TEXT NOT NULL DEFAULT '[]',
      activations TEXT NOT NULL DEFAULT '[]', referral_data TEXT NOT NULL DEFAULT '{}',
      profile_data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE virtual_accounts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'flutterwave', mode TEXT NOT NULL DEFAULT 'live',
      account_number TEXT NOT NULL, bank_name TEXT NOT NULL DEFAULT '',
      account_name TEXT NOT NULL DEFAULT '', narration TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'NGN', kind TEXT NOT NULL DEFAULT 'PERMANENT',
      status TEXT NOT NULL DEFAULT 'ACTIVE', customer_email TEXT NOT NULL DEFAULT '',
      order_ref TEXT NOT NULL DEFAULT '', tx_ref TEXT, flw_ref TEXT, pending_ref TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  database
    .prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, email_verified_at, created_at, updated_at)
       VALUES (?, 'Ada Lovelace', ?, '', 'test-only', ?, ?, ?)`,
    )
    .run(id, email, now, now, now);
  database
    .prepare(
      `INSERT INTO sessions
         (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      id,
      crypto.createHash("sha256").update(tokenValue).digest("hex"),
      new Date(Date.now() + 60 * 60_000).toISOString(),
      now,
    );
  database
    .prepare(
      `INSERT INTO virtual_accounts
         (id, user_id, provider, mode, account_number, bank_name, account_name,
          currency, kind, status, customer_email, order_ref, tx_ref, flw_ref,
          created_at, updated_at)
       VALUES (?, ?, 'flutterwave', 'live', '1111111111', 'Legacy Bank',
               'Ada Lovelace', 'NGN', 'PERMANENT', 'ACTIVE', ?, 'OLD-ORDER',
               'OLD-TX', 'OLD-REF', ?, ?)`,
    )
    .run(crypto.randomUUID(), id, email, now, now);
  database.close();
  token = tokenValue;
  return { id, email };
}

async function run() {
  await new Promise((resolve, reject) => {
    mock.once("error", reject);
    mock.listen(MOCK_PORT, "127.0.0.1", resolve);
  });
  const child = startServer();
  try {
    check("server starts", await waitFor(`${BASE}/api/health`), child.getLog());
    const config = await call("GET", "/api/payments/config", { auth: false });
    check(
      "configured NeuraPay settings are reported without exposing secrets",
      config.status === 200 &&
        config.data?.configured === true &&
        config.data?.provider === "neurapay" &&
        !JSON.stringify(config.data).includes(API_KEY),
    );

    const user = legacyUser;
    const beforeCreate = await call("GET", "/api/wallet/virtual-account");
    check(
      "legacy provider account is not exposed as the active deposit account",
      beforeCreate.status === 200 &&
        beforeCreate.data?.provider === "neurapay" &&
        beforeCreate.data?.account === null,
    );
    const created = await call("POST", "/api/wallet/virtual-account");
    const account = created.data?.account;
    check(
      "account creation uses Paga without BVN/NIN",
      created.status === 201 &&
        account?.accountNumber &&
        account?.status === "ACTIVE" &&
        createCalls === 1,
      `HTTP ${created.status}: ${JSON.stringify(created.data)}`,
    );
    if (!account?.accountNumber) throw new Error("Virtual account was not created.");
    check("account details are private to the authenticated user", Boolean(account));
    const migratedDb = new Database(path.join(dataDirectory, "panda.db"));
    const preservedLegacy = migratedDb
      .prepare("SELECT provider, account_number FROM virtual_accounts WHERE user_id = ? AND provider = 'flutterwave'")
      .get(user.id);
    const providerRows = migratedDb
      .prepare("SELECT COUNT(*) AS count FROM virtual_accounts WHERE user_id = ?")
      .get(user.id).count;
    migratedDb.close();
    check(
      "database migration preserves old account history while allowing a NeuraPay account",
      preservedLegacy?.account_number === "1111111111" && providerRows === 2,
    );
    const repeat = await call("POST", "/api/wallet/virtual-account");
    check("account creation is idempotent", repeat.status === 200 && createCalls === 1);

    const badSignature = await sendWebhook(
      { event: "payment.successful", data: { reference: "bad-signature" } },
      { validSignature: false },
    );
    check("invalid webhook signatures are rejected", badSignature.status === 401);

    const pendingRef = "TXN-PENDING";
    transactions.set(
      pendingRef,
      makeTransaction(pendingRef, account.accountNumber, { status: "pending" }),
    );
    const pending = await sendWebhook({
      id: "event-pending",
      event: "payment.pending",
      data: { reference: pendingRef, amount: 1500, currency: "NGN" },
    });
    check("pending transfers do not credit the wallet", pending.status === 200);

    const failedRef = "TXN-FAILED";
    transactions.set(
      failedRef,
      makeTransaction(failedRef, account.accountNumber, { status: "failed" }),
    );
    const failed = await sendWebhook({
      id: "event-failed",
      event: "payment.failed",
      data: { reference: failedRef, amount: 1500, currency: "NGN" },
    });
    check("failed transfers do not credit the wallet", failed.status === 200);

    const wrongAmountRef = "TXN-WRONG-AMOUNT";
    transactions.set(
      wrongAmountRef,
      makeTransaction(wrongAmountRef, account.accountNumber),
    );
    const wrongAmount = await sendWebhook({
      event: "payment.successful",
      data: { reference: wrongAmountRef, amount: 1499, currency: "NGN" },
    });
    check("webhook amount mismatch is not credited", wrongAmount.data?.reason === "WEBHOOK_TRANSACTION_MISMATCH");

    const mismatchRef = "TXN-OTHER-ACCOUNT";
    transactions.set(
      mismatchRef,
      makeTransaction(mismatchRef, "9999999999"),
    );
    const wrongAccount = await sendWebhook({
      event: "payment.successful",
      data: { reference: mismatchRef, amount: 1500, currency: "NGN" },
    });
    check("unmatched beneficiary accounts are not credited", wrongAccount.data?.reason === "UNMATCHED_ACCOUNT");

    const currencyRef = "TXN-WRONG-CURRENCY";
    transactions.set(
      currencyRef,
      makeTransaction(currencyRef, account.accountNumber, { currency: "USD" }),
    );
    const wrongCurrency = await sendWebhook({
      event: "payment.successful",
      data: { reference: currencyRef, amount: 1500, currency: "USD" },
    });
    check("non-NGN transfers are not credited", wrongCurrency.data?.reason === "CURRENCY_MISMATCH");

    const successRef = "TXN-SUCCESS";
    transactions.set(
      successRef,
      makeTransaction(successRef, account.accountNumber, {
        virtual_account: account.accountNumber,
        virtual_account_number: undefined,
        customer: { name: "Jane Doe", email: "jane.doe@example.com" },
        sender: {
          name: "Jane Smith",
          account_number: "1234567890",
          bank: "Access Bank",
        },
        description: "Transfer from Jane Smith",
      }),
    );
    const success = await sendWebhook({
      id: "event-success",
      event: "payment.successful",
      timestamp: new Date().toISOString(),
      data: {
        reference: successRef,
        provider_reference: `provider-${successRef}`,
        amount: 1500,
        fees: 10,
        net_amount: 1490,
        type: "inbound_transfer",
        status: "successful",
        virtual_account: account.accountNumber,
        bank_name: "Paga",
        customer: { name: "Jane Doe", email: "jane.doe@example.com" },
        sender: {
          name: "Jane Smith",
          account_number: "1234567890",
          bank: "Access Bank",
        },
        description: "Transfer from Jane Smith",
        created_at: new Date().toISOString(),
      },
    });
    const afterSuccess = await call("GET", "/api/wallet/balance");
    check(
      "provider-verified successful transfer credits the correct wallet",
      success.data?.state === "SUCCESS" &&
        afterSuccess.data?.balance === 1500,
    );

    const replay = await sendWebhook({
      id: "event-success",
      event: "payment.successful",
      data: { reference: successRef, amount: 1500, currency: "NGN" },
    });
    const newDelivery = await sendWebhook({
      id: "event-success-retry",
      event: "payment.successful",
      data: { reference: successRef, amount: 1500, currency: "NGN" },
    });
    const finalBalance = await call("GET", "/api/wallet/balance");
    check(
      "duplicate webhook deliveries cannot credit twice",
      replay.data?.duplicate === true &&
        newDelivery.data?.state === "ALREADY_CREDITED" &&
        finalBalance.data?.balance === 1500,
      JSON.stringify({
        replay: replay.data,
        newDelivery: newDelivery.data,
        balance: finalBalance.data?.balance,
      }),
    );

    const deposits = await call("GET", "/api/wallet/deposits");
    const savedDeposits = deposits.data?.deposits || [];
    const confirmedRow = savedDeposits.find(
      (deposit) => deposit.transactionId === successRef,
    );
    const pendingRow = savedDeposits.find(
      (deposit) => deposit.transactionId === pendingRef,
    );
    const failedRow = savedDeposits.find(
      (deposit) => deposit.transactionId === failedRef,
    );
    check(
      "history separates credited, pending, and failed transactions",
      confirmedRow?.status === "CREDITED" &&
        confirmedRow?.newBalance === 1500 &&
        pendingRow?.status === "PENDING" &&
        !pendingRow?.credited &&
        failedRow?.status === "FAILED" &&
        !failedRow?.credited,
    );

    if (results.some(({ passed }) => !passed)) {
      throw new Error("One or more NeuraPay integration checks failed.");
    }
    console.log(`\n${results.length}/${results.length} NeuraPay checks passed.`);
  } finally {
    await stopServer(child);
    mock.close();
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  const failed = results.filter(({ passed }) => !passed);
  if (failed.length) process.exitCode = 1;
  else throw error;
});
