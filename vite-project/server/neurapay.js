import crypto from "node:crypto";

const API_BASE = "https://neurapay.com.ng/api/v1";
const REQUEST_TIMEOUT_MS = 12_000;
const STAGING_SERVICE = "pandanumbers-api-staging";

function apiBase() {
  const override = String(process.env.NEURAPAY_API_BASE_URL || "").trim();
  if (!override) return API_BASE;

  let url;
  try {
    url = new URL(override);
  } catch {
    throw new NeuraPayError("The NeuraPay API base URL is invalid.", {
      code: "INVALID_PROVIDER_URL",
      status: 500,
    });
  }
  if (
    process.env.NODE_ENV === "production" ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "::1", "localhost"].includes(url.hostname)
  ) {
    throw new NeuraPayError("A NeuraPay API override is allowed only for a local test mock.", {
      code: "INVALID_PROVIDER_URL",
      status: 500,
    });
  }
  return url.toString().replace(/\/+$/, "");
}

function secretKey() {
  return String(process.env.NEURAPAY_SECRET_KEY || "").trim();
}

function modeFromEnvironment() {
  const configuredMode = String(process.env.NEURAPAY_MODE || "").trim().toLowerCase();
  if (configuredMode) return configuredMode;
  return secretKey().startsWith("np_test_sk_") ? "test" : "live";
}

export function isTestKey() {
  return secretKey().startsWith("np_test_sk_");
}

export function missingConfig() {
  const missing = [];
  if (!secretKey()) missing.push("NEURAPAY_SECRET_KEY");
  if (!String(process.env.NEURAPAY_BUSINESS_ID || "").trim()) {
    missing.push("NEURAPAY_BUSINESS_ID");
  }
  if (!String(process.env.NEURAPAY_WEBHOOK_SIGNING_SECRET || "").trim()) {
    missing.push("NEURAPAY_WEBHOOK_SIGNING_SECRET");
  }

  const mode = modeFromEnvironment();
  if (mode !== "test" && mode !== "live") {
    missing.push("NEURAPAY_MODE (must be test or live)");
  } else if (mode === "test" && !isTestKey()) {
    missing.push("NEURAPAY_SECRET_KEY (test key required)");
  } else if (mode === "live" && isTestKey()) {
    missing.push("NEURAPAY_MODE (test key cannot be used in live mode)");
  }

  if (
    process.env.NODE_ENV === "production" &&
    mode === "test" &&
    process.env.RENDER_SERVICE_NAME !== STAGING_SERVICE
  ) {
    missing.push("NEURAPAY_MODE (test mode is restricted to isolated staging)");
  }

  return missing;
}

export function describeConfig() {
  const missing = missingConfig();
  return {
    provider: "neurapay",
    configured: missing.length === 0,
    missing,
    mode: modeFromEnvironment(),
    currency: "NGN",
  };
}

export class NeuraPayError extends Error {
  constructor(message, { code = "PROVIDER_ERROR", status = 502 } = {}) {
    super(message);
    this.name = "NeuraPayError";
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const missing = missingConfig();
  if (missing.length) {
    throw new NeuraPayError("NeuraPay server configuration is incomplete.", {
      code: "PAYMENT_NOT_CONFIGURED",
      status: 503,
    });
  }

  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "X-Business-Id": String(process.env.NEURAPAY_BUSINESS_ID).trim(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new NeuraPayError("NeuraPay could not be reached.", {
      code: error?.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE",
      status: 502,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new NeuraPayError("NeuraPay returned an invalid response.", {
      code: "PROVIDER_INVALID_RESPONSE",
      status: 502,
    });
  }

  if (!response.ok || payload?.status === "error") {
    const status = response.status >= 500 ? 502 : response.status;
    throw new NeuraPayError(
      response.status === 401 || response.status === 403
        ? "NeuraPay rejected the server credentials or business ID."
        : "NeuraPay could not complete the request.",
      {
        code:
          response.status === 401 || response.status === 403
            ? "PROVIDER_AUTH_FAILED"
            : "PROVIDER_REQUEST_FAILED",
        status,
      },
    );
  }

  return payload?.data ?? payload;
}

export async function createPermanentVirtualAccount({
  customerName,
  customerEmail,
  reference,
}) {
  if (!customerName?.trim() || !customerEmail?.trim() || !reference?.trim()) {
    throw new NeuraPayError("Customer name, email, and reference are required.", {
      code: "INVALID_ACCOUNT_REQUEST",
      status: 400,
    });
  }

  const result = await request("/virtual-accounts", {
    method: "POST",
    body: {
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim().toLowerCase(),
      provider_channel: "Paga",
      reference: reference.trim(),
    },
  });
  const account = result?.virtual_account ?? result;
  const accountNumber = String(account?.account_number || "").trim();
  const accountReference = String(account?.reference || reference).trim();
  if (!accountNumber || !accountReference) {
    throw new NeuraPayError("NeuraPay returned incomplete account details.", {
      code: "PROVIDER_INVALID_RESPONSE",
      status: 502,
    });
  }

  return {
    accountNumber,
    bankName: String(account?.bank_name || account?.bank || "Paga").trim(),
    accountName: String(account?.account_name || customerName).trim(),
    narration: "",
    orderRef: accountReference,
    txRef: reference.trim(),
    providerReference: accountReference,
    accountStatus:
      String(account?.status || "").toLowerCase() === "active"
        ? "ACTIVE"
        : "PENDING",
    kind: "PERMANENT",
  };
}

export async function verifyTransaction(reference) {
  const transactionReference = String(reference || "").trim();
  if (!transactionReference) {
    throw new NeuraPayError("A transaction reference is required.", {
      code: "INVALID_TRANSACTION_REFERENCE",
      status: 400,
    });
  }

  const transaction = await request(
    `/transactions/${encodeURIComponent(transactionReference)}`,
  );
  const virtualAccount = transaction?.virtual_account;
  const virtualAccountNumber =
    typeof virtualAccount === "string"
      ? virtualAccount
      : virtualAccount?.account_number;
  return {
    reference: String(transaction?.reference || "").trim(),
    amount: Number(transaction?.amount),
    currency: String(transaction?.currency || "").toUpperCase(),
    status: String(transaction?.status || "").trim().toLowerCase(),
    type: String(transaction?.type || transaction?.payment_type || "")
      .trim()
      .toLowerCase(),
    virtualAccountNumber: String(
      transaction?.virtual_account_number ||
        virtualAccountNumber ||
        transaction?.account_number ||
        "",
    ).trim(),
    payerName: String(
      transaction?.customer_name ||
        transaction?.payer_name ||
        transaction?.customer?.name ||
        transaction?.sender?.name ||
        "",
    ).trim(),
    providerReference: String(
      transaction?.provider_reference || transaction?.provider_ref || "",
    ).trim(),
    narration: String(transaction?.narration || transaction?.description || "").trim(),
  };
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = String(process.env.NEURAPAY_WEBHOOK_SIGNING_SECRET || "").trim();
  const provided = String(signature || "")
    .trim()
    .replace(/^sha256=/i, "");
  if (!secret || !Buffer.isBuffer(rawBody) || !/^[a-f\d]{64}$/i.test(provided)) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest();
  const actual = Buffer.from(provided, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
