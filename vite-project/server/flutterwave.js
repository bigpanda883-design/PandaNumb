/**
 * Flutterwave NGN Virtual Accounts adapter.
 * ========================================
 *
 * WHY THIS FILE IS SMALL
 * ----------------------
 * It does three things and nothing else: create a permanent virtual account,
 * verify a transaction by id, and verify the webhook secret hash. Crediting,
 * matching a deposit to a user and de-duplication live in db.js, where they can
 * run inside one SQLite transaction; routing lives in index.js.
 *
 * NOTHING HERE GUESSES. Every endpoint and field name below comes from
 * Flutterwave's own documentation (`docs/flutterwave.md` records which page each
 * one came from). If the documentation and this file ever disagree, THIS FILE
 * IS WRONG - fix it against the docs, never against a hunch.
 *
 * CREDENTIALS
 * -----------
 * Read from server-side environment variables ONLY, at call time:
 *
 *   FLW_SECRET_KEY         Secret Key      (FLWSECK-... / FLWSECK_TEST-...)
 *   FLW_WEBHOOK_SECRET_HASH Secret hash     (dashboard -> Settings -> Webhooks)
 *   FLW_PUBLIC_KEY / FLW_ENCRYPTION_KEY are NOT read here: virtual accounts and
 *   webhooks do not need them. The AES encryption key is only for charging
 *   cards from a client, which this wallet does not do.
 *
 * A value is never logged, never returned from any endpoint, and never placed in
 * a URL (Flutterwave wants the key in an Authorization header).
 *
 * TEST VS LIVE
 * ------------
 * Flutterwave marks a key's mode in the key itself: `FLWSECK_TEST-...` is test.
 * `isTestKey()` reports that so the server can REFUSE to credit a live wallet
 * from a test-mode key, and vice versa - see assertModeMatches in db settlement.
 * The secret key is never echoed; only the boolean is.
 */

const FLW_API_BASE = "https://api.flutterwave.com/v3";

/** Bounded retries for reads. A create is NEVER retried automatically. */
const TIMEOUT_MS = 15_000;

export const VIRTUAL_ACCOUNT = {
  /** Permanent (static) NGN account. */
  currency: "NGN",
  /** What appears on the transfer narrative. */
  defaultNarration: "Panda Number wallet",
};

function secretKey() {
  return String(process.env.FLW_SECRET_KEY || "").trim();
}

/** True when the configured secret key is a TEST key. */
export function isTestKey() {
  return /^FLWSECK_TEST-[A-Za-z0-9_-]+$/.test(secretKey());
}

/** True when a usable secret key is present. Never reveals the value. */
export function isConfigured() {
  const key = secretKey();
  const validFormat =
    /^FLWSECK-[A-Za-z0-9_-]+$/.test(key) ||
    /^FLWSECK_TEST-[A-Za-z0-9_-]+$/.test(key);
  return (
    validFormat &&
    !(process.env.NODE_ENV === "production" && isTestKey())
  );
}

/** True when the webhook secret hash is present. */
export function hasWebhookSecret() {
  return String(process.env.FLW_WEBHOOK_SECRET_HASH || "").trim().length > 0;
}

/**
 * What is missing before virtual accounts can work. Empty = ready.
 * Names only - safe to return over HTTP and to log at startup.
 */
export function missingConfig() {
  const missing = [];
  if (!isConfigured()) {
    missing.push(
      process.env.NODE_ENV === "production" && isTestKey()
        ? "FLW_SECRET_KEY (live key required)"
        : "FLW_SECRET_KEY",
    );
  }
  if (!hasWebhookSecret()) missing.push("FLW_WEBHOOK_SECRET_HASH");
  return missing;
}

/**
 * A configuration summary safe for HTTP. It says which pieces are present, the
 * mode the key belongs to, and nothing else. Never include a key, prefix, hash
 * or length: even a partial key is useful to an attacker.
 */
export function describeConfig() {
  return {
    provider: "flutterwave",
    configured: missingConfig().length === 0,
    missing: missingConfig(),
    mode: isConfigured() ? (isTestKey() ? "test" : "live") : null,
    virtualAccountCurrency: VIRTUAL_ACCOUNT.currency,
  };
}

/** Thrown for provider failures; message is safe to show to a customer. */
export class FlutterwaveError extends Error {
  constructor(code, message, status = 502, details = null) {
    super(message);
    this.name = "FlutterwaveError";
    this.code = code;
    this.status = status;
    // Provider-side diagnostic text, for the server log only - never returned
    // to a browser as-is (it can echo the request).
    this.details = details;
  }
}

function requireKey() {
  const key = secretKey();
  if (!isConfigured()) {
    throw new FlutterwaveError(
      "PAYMENT_NOT_CONFIGURED",
      "Bank transfer funding is not available yet. Your balance was not changed.",
      503,
    );
  }
  return key;
}

/** One JSON call to Flutterwave with a timeout. Never throws on HTTP status. */
async function flwRequest(pathname, { method = "GET", body } = {}) {
  const key = requireKey();
  const url = `${FLW_API_BASE}${pathname}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new FlutterwaveError(
      timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE",
      timedOut
        ? "Flutterwave did not respond in time. If an account was being created it may still exist; retrying is safe."
        : "Flutterwave could not be reached. Please try again.",
      503,
    );
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return { ok: response.ok, status: response.status, payload, raw: text };
}

/* ------------------------------------------------------------------ *
 * Create a permanent virtual account
 * ------------------------------------------------------------------ */

const IDENTITY_RULES = {
  /** BVN: 11 digits. */
  bvn: /^\d{11}$/,
  /** NIN: 11 digits. */
  nin: /^\d{11}$/,
};

/**
 * Create a permanent NGN virtual account.
 *
 * `identity` is `{ bvn }` or `{ nin }` and is used for THIS REQUEST ONLY. It is
 * never stored, never logged and never returned: the function builds the body,
 * hands it to fetch and lets it go out of scope.
 *
 * Not retried automatically. The caller must reconcile (GET the accounts by
 * email) before retrying, because Flutterwave may have created the account even
 * when this call timed out.
 *
 * @returns {Promise<{accountNumber:string, bankName:string, orderRef:string,
 *   flwRef:string|null, narration:string|null, accountStatus:string,
 *   amountLimit:number|null}>}
 */
export async function createPermanentVirtualAccount({
  email,
  phonenumber,
  firstname,
  lastname,
  narration,
  txRef,
  identity,
}) {
  requireKey();

  const bvn = String(identity?.bvn || "").trim();
  const nin = String(identity?.nin || "").trim();
  const hasBvn = bvn.length > 0;
  const hasNin = nin.length > 0;

  if (hasBvn === hasNin) {
    // Exactly one is required. Both would create ambiguity about which identity
    // Flutterwave verified; neither cannot create a permanent account.
    throw new FlutterwaveError(
      "IDENTITY_REQUIRED",
      "A BVN or NIN is required to create a permanent bank account.",
      400,
    );
  }
  if (hasBvn && !IDENTITY_RULES.bvn.test(bvn)) {
    throw new FlutterwaveError(
      "IDENTITY_INVALID",
      "That BVN is not 11 digits.",
      400,
    );
  }
  if (hasNin && !IDENTITY_RULES.nin.test(nin)) {
    throw new FlutterwaveError(
      "IDENTITY_INVALID",
      "That NIN is not 11 digits.",
      400,
    );
  }
  if (!String(firstname || "").trim() || !String(lastname || "").trim()) {
    throw new FlutterwaveError(
      "IDENTITY_REQUIRED",
      "Your first and last name are required to create a bank account.",
      400,
    );
  }
  if (!String(email || "").trim()) {
    throw new FlutterwaveError(
      "IDENTITY_REQUIRED",
      "An email address is required to create a bank account.",
      400,
    );
  }
  const reference = String(txRef || "").trim();
  if (!/^[A-Za-z0-9_-]{8,50}$/.test(reference)) {
    throw new FlutterwaveError(
      "REFERENCE_INVALID",
      "A valid account reference is required to create a permanent bank account.",
      400,
    );
  }

  const body = {
    email: String(email).trim(),
    is_permanent: true,
    tx_ref: reference,
    narration: narration || VIRTUAL_ACCOUNT.defaultNarration,
    firstname: String(firstname).trim(),
    lastname: String(lastname).trim(),
  };
  // Send exactly one identifier, whichever the customer supplied.
  if (hasBvn) body.bvn = bvn;
  if (hasNin) body.nin = nin;
  if (String(phonenumber || "").trim())
    body.phonenumber = String(phonenumber).trim();

  const { ok, status, payload } = await flwRequest("/virtual-account-numbers", {
    method: "POST",
    body,
  });

  // Flutterwave answers `{status:"success", message, data:{...}}`. Anything else
  // is a failure - a 200 with no account number must never become bank details.
  if (!ok || payload?.status !== "success" || !payload?.data) {
    throw new FlutterwaveError(
      "ACCOUNT_CREATE_FAILED",
      "Flutterwave could not create a bank account for this profile yet.",
      status === 429 ? 429 : 502,
      safeProviderMessage(payload),
    );
  }

  const data = payload.data;
  const responseCode = String(data.response_code || "").trim();
  if (responseCode && responseCode !== "02") {
    throw new FlutterwaveError(
      "ACCOUNT_CREATE_FAILED",
      "Flutterwave did not confirm that the bank account is ready.",
      502,
      safeProviderMessage(payload),
    );
  }
  const accountNumber = String(data.account_number || "").trim();
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new FlutterwaveError(
      "ACCOUNT_CREATE_FAILED",
      "Flutterwave returned no usable account number.",
      502,
      safeProviderMessage(payload),
    );
  }
  const bankName = String(data.bank_name || "").trim();
  if (!bankName) {
    throw new FlutterwaveError(
      "ACCOUNT_CREATE_FAILED",
      "Flutterwave returned incomplete bank account details.",
      502,
      safeProviderMessage(payload),
    );
  }

  return {
    accountNumber,
    bankName,
    accountName: String(data.account_name || "").trim(),
    txRef: reference,
    orderRef: String(data.order_ref || "").trim() || null,
    flwRef: data.flw_ref ? String(data.flw_ref) : null,
    // The docs' create response carries the bank's own wording as `note`
    // ("Please make a bank transfer to ... FLW"), not `narration`.
    narration: data.note ? String(data.note) : body.narration,
    // Permanent was REQUESTED with is_permanent:true; Flutterwave reports the
    // account's own state separately (e.g. "active"). Keep the two facts apart:
    // one is what we asked for, the other is what the provider says.
    kind: "PERMANENT",
    accountStatus: String(
      data.account_status ||
        data.status ||
        (responseCode === "02" ? "ACTIVE" : ""),
    )
      .trim()
      .toUpperCase(),
    // Static accounts report a per-transfer `amount` ("0.00" = no limit); there
    // is no `amount_control` object in the documented response.
    amountLimit:
      isMoney(data.amount) && Number(data.amount) > 0
        ? Number(data.amount)
        : null,
  };
}

/** True when a provider value is a decimal number, as a string or a number. */
function isMoney(value) {
  return typeof value === "number"
    ? Number.isFinite(value)
    : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim());
}

/* ------------------------------------------------------------------ *
 * Look up accounts already created for a customer (reconciliation)
 * ------------------------------------------------------------------ */

/**
 * Ask Flutterwave whether the virtual accounts we already created still exist.
 *
 * Used when a create call may have succeeded but the answer was lost: this is
 * the ONLY safe way to retry, because it repairs the outcome instead of
 * creating a second account.
 *
 * The documented read is "Get a virtual account number" (the only GET under
 * Virtual Account Numbers): GET /virtual-account-numbers?order_ref=... . There
 * is no documented list-by-email and no documented "no such account" answer, so
 * a MISS means "unknown", never "this customer has none".
 *
 * - orderRef known (a previous attempt recorded one): ask for exactly that
 *   account. A 200 without an account number, or a 404, means the account does
 *   not exist - that IS a safe "no account yet" for this reference.
 * - no orderRef known: no match does NOT prove absence, so the caller must not
 *   read an empty answer as authoritative.
 *
 * @param {{orderRefs?:string[]}} lookup
 * @returns {Promise<{accounts:Array, authoritative:boolean}>} `authoritative`
 *   is true only when the answer proves whether an account exists.
 */
export async function findVirtualAccounts({ orderRefs = [] } = {}) {
  requireKey();

  const refs = [
    ...new Set(
      (Array.isArray(orderRefs) ? orderRefs : [orderRefs])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];

  const accounts = [];
  let answered = 0;
  for (const ref of refs) {
    const found = await getVirtualAccountByOrderRef(ref);
    if (found === undefined) continue; // could not be read - not an answer
    answered += 1;
    if (found) accounts.push(found);
  }

  // Every reference asked about was answered ("here it is" or "unknown").
  return {
    accounts,
    authoritative: refs.length > 0 && answered === refs.length,
  };
}

/**
 * GET /virtual-account-numbers?order_ref=...
 * @returns the account object, `null` when the provider says it does not exist,
 *   or `undefined` when the answer could not be read.
 */
async function getVirtualAccountByOrderRef(orderRef) {
  const query = encodeURIComponent(String(orderRef));
  const { ok, status, payload } = await flwRequest(
    `/virtual-account-numbers?order_ref=${query}`,
  );
  if (!ok) {
    // 404 is the documented "no such virtual account"; anything else is unknown.
    return status === 404 ? null : undefined;
  }
  if (payload?.status !== undefined && payload.status !== "success") {
    return undefined;
  }
  // `{status:"success", data:{...account...}}`; an empty object is also
  // possible when the reference is unknown.
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data.account_number ? data : null;
}

/* ------------------------------------------------------------------ *
 * Verify a transaction by id
 * ------------------------------------------------------------------ */

/**
 * Read a transaction's authoritative state: GET /transactions/{id}/verify.
 *
 * Returns normalised fields with `amount` in NAIRA (Flutterwave documents the
 * verify amount in the major unit). Null fields mean "the provider did not say",
 * and a null is never treated as a match or as success by the caller.
 */
export async function verifyTransaction(transactionId) {
  requireKey();
  const id = String(transactionId ?? "").trim();
  if (!/^\d{1,20}$/.test(id)) {
    throw new FlutterwaveError(
      "INVALID_TRANSACTION_ID",
      "The provider transaction id is not valid.",
      400,
    );
  }

  let lastError = null;
  // Verification is a READ, so two bounded retries are safe and cover a blip.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { ok, status, payload } = await flwRequest(
        `/transactions/${id}/verify`,
      );
      if (!ok || payload?.status !== "success" || !payload?.data) {
        // 404 = Flutterwave does not know this transaction yet; that is "not
        // verified", not "paid".
        throw new FlutterwaveError(
          "VERIFY_FAILED",
          "Flutterwave could not confirm this transaction.",
          status === 404 ? 404 : 502,
          safeProviderMessage(payload),
        );
      }
      const data = payload.data;
      return {
        id: Number(data.id),
        status: String(data.status || "").toLowerCase(),
        amount: Number.isFinite(Number(data.amount))
          ? Number(data.amount)
          : null,
        currency: data.currency ? String(data.currency).toUpperCase() : null,
        txRef: data.tx_ref ? String(data.tx_ref) : null,
        flwRef: data.flw_ref ? String(data.flw_ref) : null,
        paymentType: data.payment_type ? String(data.payment_type) : null,
        customerEmail: data.customer?.email
          ? String(data.customer.email).toLowerCase()
          : null,
        customerName: data.customer?.name ? String(data.customer.name) : null,
        processorResponse: data.processor_response
          ? String(data.processor_response)
          : null,
        createdAt: data.created_at ? String(data.created_at) : null,
      };
    } catch (error) {
      lastError = error;
      if (
        error?.code !== "PROVIDER_UNREACHABLE" &&
        error?.code !== "PROVIDER_TIMEOUT"
      ) {
        throw error;
      }
      if (attempt < 2)
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * The reference an account-transfer webhook is about.
 *
 * Flutterwave's PWBT webhook carries the paying bank's narration and the
 * beneficiary account number; different products nest this differently, so every
 * documented location is checked. A null means "cannot identify" - the webhook
 * handler then verifies by transaction id and matches by account number instead
 * of guessing.
 */
export function extractVirtualAccountNumber(data) {
  const candidates = [
    data?.meta?.beneficiary_account,
    data?.meta_data?.beneficiary_account,
    data?.meta?.account_number,
    data?.virtual_account,
    data?.account?.account_number,
    data?.beneficiary_account_number,
  ];
  for (const value of candidates) {
    const account = String(value ?? "").trim();
    if (/^\d{10}$/.test(account)) return account;
  }
  return null;
}

/**
 * Flutterwave's own error text, trimmed to something loggable: the secret key
 * can never appear in a provider error, but the request body might, so only a
 * short plain message is kept.
 */
function safeProviderMessage(payload) {
  const message = payload?.message;
  return typeof message === "string" ? message.slice(0, 300) : null;
}
