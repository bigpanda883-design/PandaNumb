import { apiRequest, MissingEndpointError } from "./apiClient";
import { getAuthToken } from "../auth/authStorage";

/** Auth header, or a clear error instead of sending "Bearer null". */
function authHeaders(extra = {}) {
  const token = getAuthToken();
  if (!token) {
    const error = new Error("You are signed out. Please log in again.");
    error.code = "NOT_AUTHENTICATED";
    throw error;
  }
  return { Authorization: `Bearer ${token}`, ...extra };
}

/** Fail early on a bad id instead of calling /api/numbers/undefined/verify. */
function requireId(id, label) {
  if (id === undefined || id === null || String(id).trim() === "") {
    throw new Error(`Missing ${label}.`);
  }
  return encodeURIComponent(String(id));
}

export async function fetchMyNumbers({ signal } = {}) {
  const data = await apiRequest("/api/numbers", {
    signal,
    operation: "list purchased numbers",
    headers: authHeaders(),
  });
  return data?.numbers ?? [];
}

/**
 * Buy a number.
 *
 * `price` is sent for display/logging only. The server MUST look up the real
 * price itself and ignore this value, because anything from the browser can be
 * edited by the user.
 *
 * The Idempotency-Key lets the server treat a double-click or a retry as the
 * same purchase. Pass the same `idempotencyKey` when retrying one attempt.
 */
export async function purchaseNumber({
  serviceId,
  countryCode,
  serviceName,
  countryName,
  price,
  idempotencyKey,
  signal,
} = {}) {
  if (!serviceId) throw new Error("Missing service.");
  if (!countryCode) throw new Error("Missing country.");

  const key = idempotencyKey || globalThis.crypto?.randomUUID?.() || undefined;

  const data = await apiRequest("/api/numbers/purchase", {
    method: "POST",
    body: JSON.stringify({
      serviceId,
      countryCode,
      serviceName,
      countryName,
      price,
    }),
    signal,
    operation: "purchase a number",
    headers: authHeaders(key ? { "Idempotency-Key": key } : {}),
  });

  return {
    number: data?.number,
    balance: data?.balance,
    transaction: data?.transaction,
  };
}

export async function requestVerificationCode(numberId, { signal } = {}) {
  const id = requireId(numberId, "number id");
  const data = await apiRequest(`/api/numbers/${id}/verify`, {
    method: "POST",
    signal,
    operation: "request a verification code",
    headers: authHeaders(),
  });
  return {
    status: data?.status,
    code: data?.code,
    receivedAt: data?.receivedAt,
  };
}

export async function cancelNumber(numberId, { signal } = {}) {
  const id = requireId(numberId, "number id");
  const data = await apiRequest(`/api/numbers/${id}/cancel`, {
    method: "POST",
    signal,
    operation: "cancel a number",
    headers: authHeaders(),
  });
  return data;
}

export { MissingEndpointError };