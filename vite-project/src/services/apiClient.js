import { getAuthToken } from "../auth/authStorage.js";
import { ApiError, getApiBaseUrl, requestJson } from "./httpClient.js";

// Re-exported so existing importers keep a single source of truth for the
// configured base URL and the shared error type.
export { getApiBaseUrl };
export { ApiError };

/**
 * Panda Numbers - API contract
 * ============================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The frontend needs real account data (balance, transactions, numbers, OTP
 * codes). No backend exists in this project yet, so rather than invent numbers
 * and codes client-side, every data requirement is declared here as a named
 * function that THROWS until the endpoint is implemented.
 *
 * Nothing in this file fabricates data. A caller either receives a real
 * response or an explicit "not implemented" error.
 *
 * ---------------------------------------------------------------------------
 * REQUIRED ENDPOINTS  (implement these, then set VITE_API_BASE_URL)
 * ---------------------------------------------------------------------------
 *
 * auth
 *   POST /api/auth/signup        -> { user, token }
 *   POST /api/auth/login         -> { user, token }
 *   POST /api/auth/logout
 *   GET  /api/auth/me            -> { user }
 *
 * wallet
 *   GET  /api/wallet/balance     -> { balance: number }            (naira)
 *   GET  /api/payments/config    -> { configured, missing[], mode, currency }
 *   GET  /api/wallet/virtual-account
 *                                -> { account, state, configured, mode, missing[] }
 *   POST /api/wallet/virtual-account { bvn?|nin?, firstName?, lastName? }
 *                                -> { ok, created, account }
 *   GET  /api/wallet/deposits?limit&offset
 *                                -> { deposits[], total, balance }
 *
 * There is deliberately NO "credit my wallet" call: a balance only grows when
 * Flutterwave confirms a bank transfer into the user's virtual account (see
 * server/flutterwave.js and the webhook in server/index.js), and the old
 * POST /api/wallet/deposit answers 410 DEPOSIT_ENDPOINT_REMOVED.
 *
 * transactions
 *   GET  /api/transactions       -> { transactions: Transaction[] }
 *
 * numbers
 *   GET  /api/numbers            -> { numbers: PurchasedNumber[] }
 *   POST /api/numbers/purchase   -> { number: PurchasedNumber, balance, transaction }
 *   POST /api/numbers/:id/verify -> { code, receivedAt }
 *
 * services (catalogue)
 *   GET  /api/services           -> { services: Service[] }
 *   GET  /api/services/:id/countries -> { countries: Country[] }
 *
 * exchange rate
 *   GET  /api/exchange-rate      -> { base:"USD", quote:"NGN", rate:number }
 *   (a public provider is already wired as the default; see wallet/exchangeRate.js)
 *
 * ---------------------------------------------------------------------------
 * TYPES
 * ---------------------------------------------------------------------------
 * Transaction       { id, type, title, amount, status, date, reference }
 * PurchasedNumber   { id, number, countryCode, countryName, service, price,
 *                     orderId, status, codeReceived }
 * Service           { id, name, price, rawPrice, countries, icon? }
 * Country           { code, name, dial, price, rawPrice, flagUrl }
 */

export function isApiConfigured() {
  return true;
}

/**
 * Raised when the UI needs data the backend has not been built for yet.
 * Messages are written to be shown to the developer, not swallowed.
 */
export class MissingEndpointError extends Error {
  constructor(operation, endpoint) {
    super(
      `No backend endpoint for "${operation}". The frontend needs ` +
        `${endpoint} to return real data - no placeholder values are used.`,
    );
    this.name = "MissingEndpointError";
    this.operation = operation;
    this.endpoint = endpoint;
  }
}

/**
 * Perform a real API request.
 *
 * Delegates to `requestJson`, which reads the body defensively. The previous
 * implementation called `response.json()` directly, so an empty or HTML body
 * surfaced as "Unexpected end of JSON input" instead of a usable error.
 *
 * `operation` is kept in the message so a failure still names the call.
 */
export async function apiRequest(path, options = {}) {
  try {
    return await requestJson(path, options);
  } catch (error) {
    // `requestJson` already names the failing call and, when the server sent a
    // message, uses that message verbatim (see describeFailure in httpClient.js).
    // This used to prefix AGAIN, which is where the doubled
    //   "deposit to wallet: deposit to wallet: Card funding is not available yet."
    // came from. Only label an error that carries no message at all - there is
    // nothing to duplicate in that case.
    if (
      error instanceof ApiError &&
      options.operation &&
      !String(error.message || "").trim()
    ) {
      error.message = `${options.operation} failed. Please try again.`;
    }
    throw error;
  }
}

/**
 * `Authorization` header for a protected call, or `{}` when signed out.
 *
 * A missing token must NOT be sent as `Bearer undefined`: the server answers
 * 401 for a bare header anyway, but "Bearer " looks like a corrupt token in
 * logs and made the real reason (signed out) impossible to see.
 */
function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loginUser({ email, password }, { signal } = {}) {
  const payload = await apiRequest("/api/auth/login", {
    method: "POST",
    signal,
    operation: "login",
    body: JSON.stringify({ email, password }),
  });

  return {
    user: payload?.user,
    token: payload?.token,
  };
}

export async function signUpUser(
  { fullName, email, phone, password },
  { signal } = {},
) {
  const payload = await apiRequest("/api/auth/signup", {
    method: "POST",
    signal,
    operation: "sign up",
    body: JSON.stringify({ fullName, email, phone, password }),
  });

  return {
    user: payload?.user,
    token: payload?.token,
  };
}

export async function fetchCurrentUser({ signal } = {}) {
  // THE BUG: this call used to send no Authorization header, so /api/auth/me
  // always answered 401 and a user who had just logged in was reported as
  // "not recognised" on the next load. The stored token is attached here now,
  // from the same place every other protected call reads it.
  const payload = await apiRequest("/api/auth/me", {
    method: "GET",
    signal,
    operation: "load current user",
    headers: authHeaders(),
  });

  return payload?.user ?? null;
}

export async function logoutUser({ signal } = {}) {
  // The server needs the token to delete the session row. Without a token there
  // is no server session to end, so this succeeds locally instead of calling
  // the API with a header the server would reject.
  const headers = authHeaders();
  if (!headers.Authorization) return;

  await apiRequest("/api/auth/logout", {
    method: "POST",
    signal,
    operation: "logout",
    headers,
  });
}

export async function fetchWalletBalance({ signal } = {}) {
  const payload = await apiRequest("/api/wallet/balance", {
    signal,
    operation: "load wallet balance",
    headers: authHeaders(),
  });

  return typeof payload?.balance === "number" ? payload.balance : 0;
}

/**
 * What bank-transfer funding still needs before it can run. Public and
 * secret-free: it reports which settings are present and whether the server is
 * on a Flutterwave test or live key - never a key, prefix or length.
 */
export async function fetchPaymentsConfig({ signal } = {}) {
  return apiRequest("/api/payments/config", {
    signal,
    operation: "load payment configuration",
  });
}

/**
 * The user's saved virtual bank account (or `account: null` with a `state` of
 * NOT_CREATED / FAILED / PENDING). One indexed read on the server: this does not
 * call Flutterwave, so it is safe to run on every Deposit page load.
 */
export async function fetchVirtualAccount({ signal } = {}) {
  return apiRequest("/api/wallet/virtual-account", {
    signal,
    operation: "load bank account",
    headers: authHeaders(),
  });
}

/**
 * Create the user's permanent virtual account. Idempotent: when one already
 * exists the server returns it instead of creating a second.
 *
 * `bvn`/`nin` are sent ONCE, over HTTPS, to be forwarded to Flutterwave for this
 * step only. They are not stored by our backend and are never returned.
 */
export async function createVirtualAccount(
  { bvn, nin, firstName, lastName } = {},
  { signal } = {},
) {
  const body = {};
  if (bvn) body.bvn = String(bvn).replace(/\D/g, "");
  if (nin) body.nin = String(nin).replace(/\D/g, "");
  if (firstName) body.firstName = String(firstName).trim();
  if (lastName) body.lastName = String(lastName).trim();

  return apiRequest("/api/wallet/virtual-account", {
    method: "POST",
    signal,
    operation: "create bank account",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

/**
 * The user's bank-transfer deposits, newest first. `limit` is capped server-side
 * at 100, so a large value cannot turn this into a heavy query.
 */
export async function fetchDeposits({ limit = 10, offset = 0, signal } = {}) {
  const query = `?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;
  return apiRequest(`/api/wallet/deposits${query}`, {
    signal,
    operation: "load deposits",
    headers: authHeaders(),
  });
}
