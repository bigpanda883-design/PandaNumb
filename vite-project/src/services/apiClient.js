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
 * codes). Every data requirement is declared here as a named function that
 * returns a real response or throws an explicit API error.
 *
 * Nothing in this file fabricates data. A caller either receives a real
 * response or an explicit "not implemented" error.
 *
 * ---------------------------------------------------------------------------
 * BACKEND ENDPOINTS
 * ---------------------------------------------------------------------------
 *
 * auth
 *   POST /api/auth/register      -> { user, token }
 *   POST /api/auth/verify-email  -> legacy pending-signup compatibility
 *   POST /api/auth/resend-verification
 *   POST /api/auth/login         -> { user, token }
 *   POST /api/auth/logout
 *   GET  /api/auth/me            -> { user }
 *
 * wallet
 *   GET  /api/wallet/balance     -> { balance: number }            (naira)
 *   GET  /api/payments/config    -> { provider, configured, missing[], mode, currency }
 *   GET  /api/wallet/virtual-account
 *                                -> { account, state, configured, mode, missing[] }
 *   POST /api/wallet/virtual-account
 *                                -> { account, state, created } after creating
 *                                   a NeuraPay virtual account
 *   GET  /api/wallet/deposits?limit&offset
 *                                -> { deposits[], total, balance }
 *
 * There is deliberately NO "credit my wallet" call: a balance only grows when
 * NeuraPay confirms a bank transfer into a user's virtual account (see
 * server/neurapay.js and the webhook in server/index.js), and the old
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

export async function updateUserProfile({ fullName, phone }, { signal } = {}) {
  const payload = await apiRequest("/api/auth/me", {
    method: "PUT",
    signal,
    operation: "update profile",
    headers: authHeaders(),
    body: JSON.stringify({ fullName, phone }),
  });
  return payload?.user ?? null;
}

export async function changeUserPassword(
  { currentPassword, newPassword },
  { signal } = {},
) {
  return apiRequest("/api/auth/change-password", {
    method: "POST",
    signal,
    operation: "change password",
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
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

  if (!Number.isFinite(payload?.balance) || payload.balance < 0) {
    throw new Error("The server returned an invalid wallet balance.");
  }

  return payload.balance;
}

/**
 * What bank-transfer funding still needs before it can run. Public and
 * secret-free: it reports configuration state and test/live mode, never keys.
 */
export async function fetchPaymentsConfig({ signal } = {}) {
  return apiRequest("/api/payments/config", {
    signal,
    operation: "load payment configuration",
  });
}

/**
 * The user's saved virtual bank account. One indexed read on the server: this
 * does not call NeuraPay.
 */
export async function fetchVirtualAccount({ signal } = {}) {
  return apiRequest("/api/wallet/virtual-account", {
    signal,
    operation: "load bank account",
    headers: authHeaders(),
  });
}

/**
 * Request a dedicated account without requesting BVN or NIN.
 */
export async function createVirtualAccount({ signal } = {}) {
  const headers = authHeaders();
  return apiRequest("/api/wallet/virtual-account", {
    method: "POST",
    signal,
    operation: "create bank account",
    headers,
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

function adminQuery({ search = "", status = "", limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  return `?${params}`;
}

export async function fetchAdminStatus({ signal } = {}) {
  return apiRequest("/api/admin/me", {
    signal,
    operation: "check administrator access",
    headers: authHeaders(),
  });
}

export async function fetchAdminVirtualAccounts(options = {}) {
  return apiRequest(
    `/api/admin/payments/virtual-accounts${adminQuery(options)}`,
    {
      signal: options.signal,
      operation: "load virtual accounts",
      headers: authHeaders(),
    },
  );
}

export async function fetchAdminDeposits(options = {}) {
  return apiRequest(
    `/api/admin/payments/deposits${adminQuery(options)}`,
    {
      signal: options.signal,
      operation: "load payment records",
      headers: authHeaders(),
    },
  );
}

export async function fetchAdminWebhooks(options = {}) {
  return apiRequest(
    `/api/admin/payments/webhooks${adminQuery(options)}`,
    {
      signal: options.signal,
      operation: "load webhook events",
      headers: authHeaders(),
    },
  );
}

export async function fetchAdminPaymentSummary({ signal } = {}) {
  return apiRequest("/api/admin/payments/summary", {
    signal,
    operation: "load payment summary",
    headers: authHeaders(),
  });
}

export async function fetchAdminUsers(options = {}) {
  // `presence` is "online" | "offline" | "". The server decides it from a live
  // session with a recent heartbeat, so it is never an account-status guess.
  return apiRequest(
    `/api/admin/users${adminQuery(options)}${queryString({
      presence: options.presence,
    })}`,
    {
      signal: options.signal,
      operation: "load users",
      headers: authHeaders(),
    },
  );
}

/** Staff members (every role except "customer"). */
export async function fetchAdminStaff(options = {}) {
  return apiRequest(
    `/api/admin/staff${adminQuery(options)}`,
    {
      signal: options.signal,
      operation: "load staff",
      headers: authHeaders(),
    },
  );
}

/** One customer's live sessions, for the Admin & Staff / Security screens. */
export async function fetchAdminUserSessions(userId, options = {}) {
  return apiRequest(
    `/api/admin/users/${encodeURIComponent(userId)}/sessions`,
    {
      signal: options.signal,
      operation: "load user sessions",
      headers: authHeaders(),
    },
  );
}

export async function fetchAdminUser(userId, options = {}) {
  const payload = await apiRequest(
    `/api/admin/users/${encodeURIComponent(userId)}`,
    {
      signal: options.signal,
      operation: "load user details",
      headers: authHeaders(),
    },
  );
  return payload?.user || null;
}

export async function fetchAdminPurchases(options = {}) {
  return apiRequest(
    `/api/admin/purchases${adminQuery(options)}`,
    {
      signal: options.signal,
      operation: "load purchases",
      headers: authHeaders(),
    },
  );
}

export async function fetchAdminTransactions(options = {}) {
  return apiRequest(
    `/api/admin/transactions${adminQuery(options)}`,
    {
      signal: options.signal,
      operation: "load transactions",
      headers: authHeaders(),
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Admin console: presence, inventory, announcements, audit and settings      */
/* -------------------------------------------------------------------------- */

function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Customers currently online (live session + recent browser heartbeat). */
export async function fetchAdminPresence({ signal } = {}) {
  return apiRequest("/api/admin/presence", {
    signal,
    operation: "load online status",
    headers: authHeaders(),
  });
}

/** The admin's own heartbeat. Marks this session online for the console. */
export async function sendPresenceHeartbeat({ signal } = {}) {
  return apiRequest("/api/presence/heartbeat", {
    method: "POST",
    signal,
    operation: "send presence heartbeat",
    headers: authHeaders(),
  });
}

export async function fetchAdminInventory(options = {}) {
  return apiRequest(
    `/api/admin/inventory${queryString({
      search: options.search,
      country: options.country,
      card: options.card,
      limit: options.limit,
      offset: options.offset,
    })}`,
    {
      signal: options.signal,
      operation: "load inventory",
      headers: authHeaders(),
    },
  );
}

export async function refreshAdminInventory(options = {}) {
  return apiRequest("/api/admin/inventory/refresh", {
    method: "POST",
    signal: options.signal,
    operation: "refresh inventory",
    headers: authHeaders(),
  });
}

export async function updateSellingPrice({ countrySlug, cardId, variantId, price }) {
  return apiRequest("/api/admin/inventory/price", {
    method: "PUT",
    operation: "save selling price",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ countrySlug, cardId, variantId, price }),
  });
}

export async function bulkUpdateSellingPrice({ countrySlug, cardId, price }) {
  return apiRequest("/api/admin/inventory/prices/bulk", {
    method: "PUT",
    operation: "save bulk prices",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ countrySlug, cardId, price }),
  });
}

export async function resetSellingPrice({ countrySlug, cardId, variantId }) {
  return apiRequest(
    `/api/admin/inventory/price${queryString({ countrySlug, cardId, variantId })}`,
    {
      method: "DELETE",
      operation: "reset selling price",
      headers: authHeaders(),
    },
  );
}

export async function setServiceEnabled({ cardId, sellable }) {
  return apiRequest("/api/admin/inventory/service", {
    method: "PUT",
    operation: sellable ? "enable service" : "disable service",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, sellable }),
  });
}

export async function fetchAdminAnnouncements(options = {}) {
  return apiRequest(
    `/api/admin/announcements${queryString({
      status: options.status,
      limit: options.limit,
      offset: options.offset,
    })}`,
    {
      signal: options.signal,
      operation: "load announcements",
      headers: authHeaders(),
    },
  );
}

export async function fetchAnnouncementAudience({ signal } = {}) {
  return apiRequest("/api/admin/announcements/audience", {
    signal,
    operation: "load announcement audience",
    headers: authHeaders(),
  });
}

/**
 * Save an announcement. `send: true` asks the server to create one
 * notification per recipient; the response reports created/failed counts.
 */
export async function saveAnnouncement(payload) {
  return apiRequest("/api/admin/announcements", {
    method: "POST",
    operation: payload.send ? "send announcement" : "save announcement",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateAnnouncement(id, payload) {
  return apiRequest(`/api/admin/announcements/${encodeURIComponent(id)}`, {
    method: "PUT",
    operation: "update announcement",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteAnnouncement(id) {
  return apiRequest(`/api/admin/announcements/${encodeURIComponent(id)}`, {
    method: "DELETE",
    operation: "delete announcement",
    headers: authHeaders(),
  });
}

export async function fetchAdminActivityLogs(options = {}) {
  return apiRequest(
    `/api/admin/activity-logs${queryString({
      search: options.search,
      actorId: options.actorId,
      action: options.action,
      status: options.status,
      from: options.from,
      to: options.to,
      limit: options.limit,
      offset: options.offset,
    })}`,
    {
      signal: options.signal,
      operation: "load activity logs",
      headers: authHeaders(),
    },
  );
}

export async function fetchAdminSettings({ signal } = {}) {
  return apiRequest("/api/admin/settings", {
    signal,
    operation: "load settings",
    headers: authHeaders(),
  });
}

export async function saveAdminProfile({ fullName, phone, email, avatar }) {
  return apiRequest("/api/admin/settings/profile", {
    method: "PUT",
    operation: "save profile",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, phone, email, avatar }),
  });
}

export async function saveAdminPreferences(patch) {
  return apiRequest("/api/admin/settings/preferences", {
    method: "PUT",
    operation: "save preferences",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function endOtherSessions() {
  return apiRequest("/api/admin/settings/sessions", {
    method: "DELETE",
    operation: "sign out other sessions",
    headers: authHeaders(),
  });
}

export async function endSession(sessionId) {
  return apiRequest(
    `/api/admin/settings/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      operation: "end session",
      headers: authHeaders(),
    },
  );
}

export async function endUserSession(userId, sessionId) {
  return apiRequest(
    `/api/admin/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      operation: "end user session",
      headers: authHeaders(),
    },
  );
}

/* ---- Customer side ------------------------------------------------------ */

export async function fetchNotifications({ signal } = {}) {
  return apiRequest("/api/notifications", {
    signal,
    operation: "load notifications",
    headers: authHeaders(),
  });
}

export async function markNotificationReadOnServer(id) {
  return apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    operation: "mark notification read",
    headers: authHeaders(),
  });
}

export async function markAllNotificationsReadOnServer() {
  return apiRequest("/api/notifications/read-all", {
    method: "POST",
    operation: "mark all notifications read",
    headers: authHeaders(),
  });
}
