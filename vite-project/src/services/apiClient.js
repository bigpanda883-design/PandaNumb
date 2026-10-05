import { getAuthToken } from "../auth/authStorage";

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
 *   POST /api/wallet/deposit     -> { balance, transaction }
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

let API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "";

export function getApiBaseUrl() {
  return globalThis.__PANDA_API_BASE_URL__ || API_BASE_URL || "";
}

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
 * Throws MissingEndpointError when VITE_API_BASE_URL is not configured, so a
 * caller can never mistake an absent backend for a successful empty response.
 */
export async function apiRequest(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}${path}` : path;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = new Error(
      `${options.operation || path} failed (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }

  return response.status === 204 ? null : response.json();
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
  const payload = await apiRequest("/api/auth/me", {
    signal,
    operation: "load current user",
  });

  return payload?.user ?? null;
}

export async function logoutUser({ signal } = {}) {
  await apiRequest("/api/auth/logout", {
    method: "POST",
    signal,
    operation: "logout",
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
}

export async function fetchWalletBalance({ signal } = {}) {
  const payload = await apiRequest("/api/wallet/balance", {
    signal,
    operation: "load wallet balance",
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });

  return typeof payload?.balance === "number" ? payload.balance : 0;
}

export async function depositToWallet(amount, { signal } = {}) {
  const payload = await apiRequest("/api/wallet/deposit", {
    method: "POST",
    signal,
    operation: "deposit to wallet",
    headers: { Authorization: `Bearer ${getAuthToken()}` },
    body: JSON.stringify({ amount }),
  });

  return {
    balance: payload?.balance,
    transaction: payload?.transaction,
    user: payload?.user,
  };
}
