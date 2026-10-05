/**
 * Panda Numbers - SMS verification client
 * =======================================
 * Talks to OUR OWN backend (server/index.js), never to the provider directly.
 *
 * The provider API key lives only in the server process, so it can never appear
 * in this bundle, in localStorage, or in a browser network request.
 *
 * The backend forwards to Yankee Verify and returns the provider's raw text, so
 * the parsing below still reflects the real provider responses.
 *
 * Endpoints (all server-side, key hidden):
 *   GET /api/sms/balance            -> ACCESS_BALANCE:<n>
 *   GET /api/sms/stock?country=US   -> { "wa_0": "250344", ... }
 *   POST /api/sms/number                   -> ACCESS_NUMBER:<id>:<phone>
 *   GET /api/sms/status?id=         -> STATUS_WAIT_CODE | STATUS_OK:<otp>
 *   GET /api/sms/set-status?id=&status=  -> ACCESS_ACTIVATION | ACCESS_CANCEL | ...
 */

const API_BASE = import.meta.env?.VITE_SMS_API_BASE || "/api/sms";

/** Provider status codes for setStatus, exactly as documented. */
export const SET_STATUS = {
  REQUEST_ANOTHER_CODE: 3,
  FINISH_NO_REFUND: 6,
  CANCEL_AND_REFUND: 8,
};

/** getStatus codes. */
export const GET_STATUS = {
  WAITING: 1,
  CODE_RECEIVED: 3,
  CANCELLED: 4,
};

/**
 * Every provider token mapped to something a user can act on.
 * Anything unmapped falls through with the raw token so nothing is silent.
 */
const PROVIDER_MESSAGES = {
  NO_NUMBERS:
    "No numbers are available for this service and country right now.",
  NO_BALANCE:
    "The provider account is out of credit, so numbers cannot be issued.",
  BAD_KEY: "The provider API key is invalid or inactive.",
  BAD_ACTION: "The provider rejected the request action.",
  BANNED: "This provider account is banned.",
  WRONG_SERVICE: "The provider does not offer this service.",
  WRONG_COUNTRY: "The provider does not offer this country.",
  WRONG_MAX_PRICE: "The requested maximum price is too low.",
  NO_ACTIVATION: "That activation does not exist or is no longer available.",
  BAD_STATUS: "The provider rejected the requested status change.",
  EARLY_CANCEL_DENIED:
    "Cancellation is not available yet. The provider only allows it after a short waiting period.",
  STATUS_CANCEL: "This activation was cancelled.",
  ERROR: "The provider reported an error. Please try again.",
  PROVIDER_STOCK_ERROR:
    "Yankee rejected the stock lookup. Check the country code supported by the provider and retry.",
  PROVIDER_UNREACHABLE: "Could not reach the verification provider.",
  PROVIDER_TIMEOUT: "The verification provider timed out. Please try again.",
  PROVIDER_HTTP_ERROR: "The verification provider returned an error.",
  // Sent by our own server, not the provider.
  NOT_FOUND: "The backend endpoint was not found.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
};

/** Raised when the provider returns an error token we cannot act on. */
export class SmsProviderError extends Error {
  constructor(code, raw) {
    super(PROVIDER_MESSAGES[code] || `Provider error: ${code}`);
    this.name = "SmsProviderError";
    this.code = code;
    /** Raw provider text, for logging. Never shown to the user. */
    this.raw = raw;
  }
}

/** Build a URL against our own backend. No key is added - it lives server-side. */
function buildUrl(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function callBackend(path, params, { signal, method = "GET" } = {}) {
  let response;
  try {
    response = await fetch(buildUrl(path, method === "GET" ? params : {}), {
      signal,
      method,
      cache: "no-store",
      ...(method === "POST"
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          }
        : {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new SmsProviderError("PROVIDER_UNREACHABLE", String(error));
  }

  if (!response.ok) {
    // The backend answers JSON on failure, plain text on success. A transport
    // failure (server down, Vite proxy missing) is NOT a provider error, so it
    // must not be reported as one.
    let code =
      response.status >= 500 ? "PROVIDER_UNREACHABLE" : "PROVIDER_HTTP_ERROR";
    let message = "";
    try {
      const body = await response.json();
      if (body?.error) code = body.error;
      if (typeof body?.message === "string") message = body.message;
    } catch {
      /* keep the default code */
    }
    const error = new SmsProviderError(code, `HTTP ${response.status}`);
    if (message) error.message = message;
    error.status = response.status;
    throw error;
  }

  const text = (await response.text()).trim();

  // A bare error token is a failure, not data.
  if (PROVIDER_MESSAGES[text]) {
    throw new SmsProviderError(text, text);
  }
  return text;
}

/* ------------------------------------------------------------------ *
 * Provider balance (NOT the user's app balance)
 * ------------------------------------------------------------------ */

/**
 * The Yankee Verify wallet balance, in NGN.
 *
 * This is the PROVIDER's money, used only to show whether the business can
 * issue numbers. It must never be shown as the user's balance.
 */
export async function getProviderBalance({ signal } = {}) {
  const text = await callBackend("/balance", {}, { signal });
  const parts = text.split(":");
  if (parts[0] !== "ACCESS_BALANCE") {
    throw new SmsProviderError(text, text);
  }
  return Number(parts[1]);
}

/* ------------------------------------------------------------------ *
 * Stock availability
 * ------------------------------------------------------------------ */

/**
 * How many numbers a country has, keyed by service, e.g. { "wa_0": "250344" }.
 * Returns an empty object when the provider has no data for that country.
 */
export async function getNumbersStatus(country, { signal } = {}) {
  const text = await callBackend("/stock", { country }, { signal });

  if (text === "ERROR") {
    throw new SmsProviderError("PROVIDER_STOCK_ERROR", text);
  }

  if (PROVIDER_MESSAGES[text]) {
    throw new SmsProviderError(text, text);
  }

  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new SmsProviderError("PROVIDER_HTTP_ERROR", text);
    }
    return data;
  } catch {
    throw new SmsProviderError("PROVIDER_HTTP_ERROR", text);
  }
}

/* ------------------------------------------------------------------ *
 * Purchase
 * ------------------------------------------------------------------ */

/**
 * Buy a number. Returns the activation id and the real phone number.
 *
 * The activation id is what every later status/finish/cancel call needs - it is
 * returned separately so it can never be confused with the phone number.
 *
 * @returns {Promise<{activationId:string, phone:string}>}
 */
export async function requestNumber({
  service,
  country,
  maxPrice,
  signal,
} = {}) {
  const text = await callBackend(
    "/number",
    { service, country, maxPrice },
    { signal, method: "POST" },
  );

  const parts = text.split(":");
  if (parts[0] !== "ACCESS_NUMBER" || parts.length < 3) {
    throw new SmsProviderError(text, text);
  }

  return { activationId: parts[1], phone: parts[2] };
}

/* ------------------------------------------------------------------ *
 * Status / OTP
 * ------------------------------------------------------------------ */

/**
 * Check an activation.
 *
 * @returns {Promise<{status:number, code:string|null}>}
 */
export async function checkStatus(activationId, { signal } = {}) {
  const text = await callBackend("/status", { id: activationId }, { signal });
  const parts = text.split(":");

  if (parts[0] === "STATUS_WAIT_CODE") {
    return { status: GET_STATUS.WAITING, code: null };
  }
  if (parts[0] === "STATUS_OK") {
    return { status: GET_STATUS.CODE_RECEIVED, code: parts[1] ?? null };
  }
  if (parts[0] === "STATUS_CANCEL") {
    return { status: GET_STATUS.CANCELLED, code: null };
  }

  throw new SmsProviderError(text, text);
}

/* ------------------------------------------------------------------ *
 * Status changes
 * ------------------------------------------------------------------ */

/**
 * Update an activation.
 * Use SET_STATUS.FINISH_NO_REFUND when done, CANCEL_AND_REFUND to release it,
 * or REQUEST_ANOTHER_CODE to ask for a fresh SMS on the same number.
 *
 * @returns {Promise<string>} the provider's confirmation token
 */
export async function setStatus(activationId, status, { signal } = {}) {
  const text = await callBackend(
    "/set-status",
    { id: activationId, status },
    { signal },
  );

  // Distinct outcomes the caller reacts to differently.
  const known = [
    "ACCESS_ACTIVATION", // finished
    "ACCESS_CANCEL", // cancelled + refunded
    "ACCESS_READY", // ready for another code
  ];

  if (known.includes(text) || text.startsWith("ACCESS_")) {
    return text;
  }

  throw new SmsProviderError(text, text);
}
