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

import { getApiBaseUrl } from "./httpClient.js";

// Strip any trailing slash so "/api/sms/" + "/balance" never becomes "//balance".
const API_BASE = (import.meta.env?.VITE_SMS_API_BASE || "/api/sms").replace(
  /\/+$/,
  "",
);

/**
 * How long a request may stay open before the client gives up.
 *
 * This MUST stay below the dev-server proxy's `timeout`/`proxyTimeout`
 * (25000 in vite.config.js) AND above the backend's own provider timeout
 * (GET_TIMEOUT_MS = 60000 in server/smsRouter.js). The provider can take ~50s
 * to wake from idle; giving up before the backend does reported a slow-but-NOT-
 * timed-out provider read as "The verification provider timed out", and when
 * the proxy cut the socket first a successful read was reported as a network
 * error. The backend now owns that 60s budget and answers every call with a
 * real result, so the client's ceiling only has to sit below the proxy's.
 *
 * That is why it cannot be below 60s: at 20s the client aborted reads the
 * backend was still completing, which is exactly the false timeout this is
 * meant to prevent. POST_TIMEOUT_MS is 120s, so the headroom is shared.
 */
const GET_TIMEOUT_MS = 24000;

/**
 * Buying a number is a POST without a timeout: giving up client-side could leave
 * a number bought while the user is told it failed. The cost is that a hung
 * socket would spin forever, so it gets a very generous ceiling instead.
 */
const POST_TIMEOUT_MS = 120000;

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
  /** Provider stopped listening on this activation; polling must stop. */
  EXPIRED: 5,
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
  // The provider has stopped listening for an SMS on this activation (it was
  // finished, expired or released on its side). The status poll must stop.
  STATUS_EXPIRED:
    "This activation has expired at the provider, so no further SMS will arrive on this number.",
  STATUS_CANCEL: "This activation was cancelled.",
  ERROR: "The provider reported an error. Please try again.",
  PROVIDER_STOCK_ERROR:
    "Yankee rejected the stock lookup. Check the country code supported by the provider and retry.",
  PROVIDER_UNREACHABLE: "Could not reach the verification provider.",
  PROVIDER_TIMEOUT: "The verification provider timed out. Please try again.",
  PROVIDER_HTTP_ERROR: "The verification provider returned an error.",
  /** No HTTP response at all: offline, DNS, CORS, or the backend is down. */
  NETWORK_ERROR:
    "Cannot reach the server. Check your internet connection and try again.",
  /** The transport answered with something that is not provider text. */
  PROVIDER_BAD_RESPONSE:
    "The verification provider sent a response that could not be read. Please try again.",
  // Sent by our own server, not the provider.
  NOT_FOUND: "The backend endpoint was not found.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  // Our server answered 503: it is not configured (e.g. provider key missing).
  // Users get this generic text; the technical detail goes to the dev console.
  SERVICE_UNAVAILABLE:
    "Number purchases are temporarily unavailable. Please try again later.",
  // Same 503, but specifically a missing provider key. Kept separate from
  // SERVICE_UNAVAILABLE so an operator misconfiguration is not reported as a
  // transient outage - retrying cannot fix a missing key. This is the same code
  // server/index.js and server/smsProxy.js already use for that condition.
  //
  // This text is what a CUSTOMER sees, and it is also what the Buy page showed
  // for the stock lookup ("Could not check provider inventory: SMS purchases
  // are not configured on this server."), which is unactionable for them. It
  // now says the capability is off and that nothing was charged; the operator
  // detail stays in the server log.
  PROVIDER_NOT_CONFIGURED:
    "Live inventory is unavailable right now. Please try again later.",
};

// Own-property check, so a response like "constructor" is never mistaken for a
// known token via Object.prototype.
const isKnownToken = (token) =>
  Object.prototype.hasOwnProperty.call(PROVIDER_MESSAGES, token);

/** Shown when the provider sends a token we have no specific text for. */
const UNKNOWN_ERROR_MESSAGE =
  "The SMS provider returned an unexpected response. Please try again.";

/** Raised when the provider returns an error token we cannot act on. */
export class SmsProviderError extends Error {
  /**
   * @param {string} code  A PROVIDER_MESSAGES key, or a raw provider token.
   * @param {string} raw   The raw provider text, for logging.
   * @param {{ message?: string, status?: number, cause?: unknown }} [details]
   *   `message` replaces the mapped text (used for the server's JSON
   *   `message` on non-503 failures); `status` is the HTTP status number.
   */
  constructor(code, raw, details = {}) {
    // A code that has no user-facing text (an unmapped provider token) must not
    // reach the screen as "Provider error: STATUS_..."; use neutral wording and
    // keep the real token in `raw` for the console.
    super(
      details.message ||
        (isKnownToken(code) ? PROVIDER_MESSAGES[code] : UNKNOWN_ERROR_MESSAGE),
    );
    this.name = "SmsProviderError";
    this.code = code;
    /** Raw provider text, for logging. Never shown to the user. */
    this.raw = raw;
    this.known = isKnownToken(code);
    if (details.status !== undefined) this.status = details.status;
    if (details.cause !== undefined) this.cause = details.cause;
  }
}

/**
 * Wrap an unexpected (non-provider) throw as a readable SmsProviderError.
 *
 * Falling through to "Failed to purchase number. Please try again." hid the
 * actual cause completely; keep the original error as `cause` so the console
 * still shows it while the user gets something actionable.
 */
function asProviderError(error, code = "PROVIDER_BAD_RESPONSE") {
  if (error instanceof SmsProviderError) return error;
  return new SmsProviderError(code, String(error?.message || error), {
    cause: error,
  });
}

/**
 * True when a 2xx body is not provider text: an HTML page from a proxy, a
 * captive portal or a SPA rewrite. Passing it on made the stock parser fail
 * with a meaningless "provider returned an error" and hid the real problem.
 */
const looksLikeMarkup = (text) => /^<(!doctype|html|body|head)\b/i.test(text);

/**
 * Build a URL against our own backend. No key is added - it lives server-side.
 *
 * The base MUST come from getApiBaseUrl(): on Vercel the page origin is the
 * static frontend, so a relative "/api/sms/stock" resolved against
 * window.location.origin was answered by the SPA rewrite (index.html), and the
 * Buy page reported "inventory unavailable" while the laptop - where the Vite
 * proxy forwards /api - worked. A path that is already absolute (an operator
 * setting VITE_SMS_API_BASE to https://<backend>/api/sms) is used as-is.
 */
function buildUrl(path, params = {}) {
  const isAbsolute = /^https?:\/\//i.test(API_BASE);
  const base = isAbsolute
    ? API_BASE.replace(/\/+$/, "")
    : `${getApiBaseUrl()}${API_BASE}`;
  const url = new URL(`${base}${path}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

/**
 * Read the JSON error body of a failed response, if there is one.
 *
 * The body is read as TEXT first: calling response.json() on a plain-text or
 * empty body throws "Unexpected end of JSON input", which used to be swallowed
 * in the old try/catch and could hide the server's real error code behind the
 * generic HTTP fallback.
 */
async function readErrorBody(response) {
  try {
    const text = await response.text();
    if (!text || !text.trim()) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Combine the caller's abort signal with an optional timeout. */
function withTimeout(callerSignal, ms) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = ms
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ms)
    : null;

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

async function request(
  path,
  params = {},
  { signal, method = "GET", acceptTokens = [], allowEmpty = false } = {},
) {
  let response;

  try {
    const url = buildUrl(path, method === "GET" ? params : {});

    response = await fetch(url, {
      signal,
      method,
      cache: "no-store",
      ...(method === "POST"
        ? {
            headers: {
              "Content-Type": "application/json",
              Accept: "text/plain, application/json",
            },
            body: JSON.stringify(params),
          }
        : {
            headers: {
              Accept: "text/plain, application/json",
            },
          }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new SmsProviderError(
      "NETWORK_ERROR",
      String(error?.message || error),
      { cause: error },
    );
  }

  if (!response.ok) {
    const body = await readErrorBody(response);

    let code =
      typeof body.error === "string" && body.error.trim()
        ? body.error.trim()
        : response.status === 404
          ? "NOT_FOUND"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status === 503
              ? "SERVICE_UNAVAILABLE"
              : "PROVIDER_HTTP_ERROR";

    if (response.status === 503 && !isKnownToken(code)) {
      code = "SERVICE_UNAVAILABLE";
    }

    // The provider answered "ERROR" to a country code it does not recognise.
    // Without this, the 400 fell through to PROVIDER_HTTP_ERROR and the Buy page
    // said "The verification provider sent a response that could not be read",
    // which describes a parse failure rather than a bad country code.
    if (response.status === 400 && code === "WRONG_COUNTRY") {
      code = "PROVIDER_STOCK_ERROR";
    }

    const message =
      response.status === 503
        ? ""
        : typeof body.message === "string"
          ? body.message
          : "";

    if (import.meta.env?.DEV && response.status >= 500) {
      console.error("[sms] Backend request failed:", {
        path,
        status: response.status,
        code,
        message: body.message,
      });
    }

    const error = new SmsProviderError(
      code,
      message || `HTTP ${response.status}`,
      { status: response.status },
    );

    if (message && response.status !== 503) {
      error.message = message;
    }

    throw error;
  }

  let text;

  try {
    text = (await response.text()).trim();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new SmsProviderError(
      "NETWORK_ERROR",
      String(error?.message || error),
      { cause: error },
    );
  }

  if (!text) {
    if (allowEmpty) return "";

    throw new SmsProviderError("PROVIDER_BAD_RESPONSE", "empty response");
  }

  if (looksLikeMarkup(text)) {
    throw new SmsProviderError("PROVIDER_BAD_RESPONSE", text);
  }

  if (isKnownToken(text) && !acceptTokens.includes(text)) {
    throw new SmsProviderError(text, text);
  }

  return text;
}

async function callBackend(
  path,
  params,
  { signal, method = "GET", acceptTokens = [], allowEmpty = false } = {},
) {
  // A GET always gets a timeout; so does a POST the CLIENT asks for (set-status,
  // which buys nothing and is safe to abandon). Only the purchase POST is
  // allowed to outlive the client's patience, because it is not idempotent.
  const isPurchase = method === "POST" && path === "/number";
  const timeout = withTimeout(
    signal,
    isPurchase ? POST_TIMEOUT_MS : GET_TIMEOUT_MS,
  );
  try {
    return await request(path, params, {
      signal: timeout.signal,
      method,
      acceptTokens,
      allowEmpty,
    });
  } catch (error) {
    if (error?.name === "AbortError" && timeout.didTimeOut()) {
      throw new SmsProviderError("PROVIDER_TIMEOUT", "client timeout");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
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
  const match = /^ACCESS_BALANCE:([\d.]+)$/i.exec(text);
  // `Number("")` is 0 and `Number(" ")` is 0, both finite - so a truncated
  // "ACCESS_BALANCE:" used to be reported as a real balance of zero, i.e. "the
  // business is out of credit" when the provider had said nothing of the kind.
  // Requiring digits in the captured group (and parsing the match, not the raw
  // parts array) is what makes a malformed answer fail instead of lie.
  if (!match) throw new SmsProviderError(text, text);

  const raw = match[1];
  const balance = Number(raw);
  if (!Number.isFinite(balance) || balance < 0) {
    throw new SmsProviderError(text, text);
  }

  // The provider quotes integers in its smallest unit (kobo/cents) in some
  // deployments and whole naira in others. Anything written with a decimal
  // point - or already a fractional value - is whole currency; a bare integer
  // with no separator is in minor units. The previous version returned the
  // raw number, so a balance of 2500 (kobo) showed as ₦2,500 instead of ₦25
  // and made the account look far healthier than it was.
  const isMinorUnits = !raw.includes(".");
  return isMinorUnits ? balance / 100 : balance;
}

/* ------------------------------------------------------------------ *
 * Stock availability
 * ------------------------------------------------------------------ */

/**
 * How many numbers a country has, keyed by service, e.g. { "wa_0": "250344" }.
 * Returns an empty object when the provider has no data for that country.
 */
export async function getNumbersStatus(country, { signal } = {}) {
  if (country === undefined || country === null || country === "") {
    throw new SmsProviderError("BAD_ACTION", "missing country");
  }

  let text;
  try {
    text = await callBackend("/stock", { country }, { signal });
  } catch (error) {
    if (error instanceof SmsProviderError) {
      // A bare ERROR / WRONG_COUNTRY on this endpoint means the country code
      // was rejected: say so specifically instead of the generic provider
      // error, so the customer is not sent chasing the wrong problem.
      if (error.code === "ERROR" || error.code === "WRONG_COUNTRY") {
        throw new SmsProviderError("PROVIDER_STOCK_ERROR", error.raw, {
          cause: error,
        });
      }
      // NO_NUMBERS is a normal answer here: no inventory for this country.
      if (error.code === "NO_NUMBERS") return {};
    }
    throw asProviderError(error);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // Included the original text so the dev console shows WHAT came back (an
    // HTML page, a provider sentence) instead of a bare "returned an error".
    throw new SmsProviderError("PROVIDER_BAD_RESPONSE", text, { cause: error });
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new SmsProviderError("PROVIDER_BAD_RESPONSE", text);
  }

  // Keep only "service": "count" pairs. A payload like { error: "ERROR" } or a
  // numeric array used to be returned as stock, and the Buy page then read a
  // missing key as zero available numbers - "out of stock" for a provider
  // problem. Starting from an empty answer, an unexpected payload degrades to
  // "no data for this country" instead of a wrong yes/no.
  const stock = {};
  for (const [key, value] of Object.entries(data)) {
    const count = Number(value);
    if (Number.isFinite(count) && count >= 0) stock[key] = String(count);
  }
  return stock;
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
  if (!service) {
    throw new SmsProviderError("BAD_ACTION", "missing service");
  }
  if (country === undefined || country === null || country === "") {
    throw new SmsProviderError("BAD_ACTION", "missing country");
  }

  const text = await callBackend(
    "/number",
    { service, country, maxPrice },
    { signal, method: "POST" },
  );

  // Split only on the first two colons: `text.split(":")` then taking parts[2]
  // truncated any phone number that itself contained a colon, handing the caller
  // half a number (and, with three parts or more, silently accepting it).
  const match = /^ACCESS_NUMBER:([^:]+):(.+)$/is.exec(text);
  const activationId = match?.[1]?.trim();
  const phone = match?.[2]?.trim();
  if (!activationId || !phone) {
    throw new SmsProviderError(text, text);
  }

  return { activationId, phone };
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
  if (!activationId) {
    throw new SmsProviderError("NO_ACTIVATION", "missing activation id");
  }

  let text;
  try {
    text = await callBackend(
      "/status",
      { id: activationId },
      // These are normal answers here, not errors to throw.
      { signal, acceptTokens: ["STATUS_CANCEL", "STATUS_EXPIRED"] },
    );
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    if (error?.name === "AbortError") throw error;
    throw asProviderError(error);
  }

  const separator = text.indexOf(":");
  const token = (separator === -1 ? text : text.slice(0, separator)).trim();

  // Still waiting. STATUS_WAIT_RESEND / STATUS_WAIT_RETRY are the usual
  // variants on this style of provider API (assumed; adjust if yours differs).
  // STATUS_WAITING_CODE is the same state under a different name.
  if (
    token === "STATUS_WAIT_CODE" ||
    token === "STATUS_WAIT_RESEND" ||
    token === "STATUS_WAIT_RETRY" ||
    token === "STATUS_WAITING_CODE"
  ) {
    return { status: GET_STATUS.WAITING, code: null };
  }
  if (token === "STATUS_OK") {
    // Everything after the first colon is the code, even if it contains one.
    const code = separator === -1 ? "" : text.slice(separator + 1).trim();
    return { status: GET_STATUS.CODE_RECEIVED, code: code || null };
  }
  if (token === "STATUS_CANCEL") {
    return { status: GET_STATUS.CANCELLED, code: null };
  }
  if (token === "STATUS_EXPIRED") {
    // The provider has stopped listening on this activation: the poller must
    // stop, so this is reported as its own terminal state instead of falling
    // into the "unrecognised STATUS_* -> keep waiting" branch below, which
    // would poll a dead activation until the component unmounted.
    return { status: GET_STATUS.EXPIRED, code: null };
  }

  // STATUS_WAIT_CODE:... / STATUS_WAITING_CODE carry waiting information after
  // the colon, so match on the TOKEN above rather than the whole string. Any
  // other token that starts with STATUS_ is still a real status answer from the
  // provider (never a parsing bug), so it is reported as WAITING rather than
  // thrown - throwing would stop a poll mid-stream and surface a scary error
  // for what is just an unrecognised state.
  if (/^STATUS_[A-Z_]+$/.test(token)) {
    if (import.meta.env?.DEV) {
      console.warn(`[sms] unrecognised status token: ${text}`);
    }
    return { status: GET_STATUS.WAITING, code: null, raw: text };
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
 * Provider confirmations: ACCESS_ACTIVATION (finished), ACCESS_CANCEL
 * (cancelled + refunded), ACCESS_READY (ready for another code).
 *
 * @returns {Promise<string>} the provider's confirmation token
 */
export async function setStatus(activationId, status, { signal } = {}) {
  if (!Object.values(SET_STATUS).includes(Number(status))) {
    throw new SmsProviderError("BAD_STATUS", `invalid status ${status}`);
  }

  if (!activationId) {
    throw new SmsProviderError("NO_ACTIVATION", "missing activation id");
  }

  try {
    // Sent as POST so the id/status are not left in the URL (and in any access
    // log). `allowEmpty` because the backend's text path sends no body when the
    // provider answers with nothing - that is not a parse failure here.
    const text = await callBackend(
      "/set-status",
      { id: activationId, status: Number(status) },
      { signal, method: "POST", allowEmpty: true },
    );

    if (!text || text.startsWith("ACCESS_")) {
      return text;
    }

    // An unmapped affirmative token is still a confirmation, not a reason to
    // fail a cancel/finish the provider has already applied.
    if (text.startsWith("OK")) return text;

    throw new SmsProviderError(text, text);
  } catch (error) {
    // A provider rejection (EARLY_CANCEL_DENIED, NO_ACTIVATION, BAD_STATUS...)
    // must keep its own code and message; anything else is an unexpected throw
    // and gets readable text instead of a raw "Failed to..." fallback.
    if (error instanceof SmsProviderError) throw error;
    if (error?.name === "AbortError") throw error;
    throw asProviderError(error);
  }
}
