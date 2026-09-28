/**
 * Panda Numbers - numbers API
 *
 * The purchase and verification-code operations MUST come from the backend:
 * a number allocated to a user and the SMS code it receives are server-owned
 * facts. There is no client-side fallback that invents either.
 *
 * Until the endpoints in services/apiClient.js are implemented, these throw
 * MissingEndpointError, and the UI surfaces that instead of showing a made-up
 * number or code.
 */
import { apiRequest, MissingEndpointError } from "./apiClient";

/** All numbers belonging to the authenticated user. */
export async function fetchMyNumbers({ signal } = {}) {
  const data = await apiRequest("/api/numbers", {
    signal,
    operation: "list purchased numbers",
  });
  return data?.numbers ?? [];
}

/**
 * Buy a number. The server allocates the real number and returns it together
 * with the updated balance and the created transaction.
 */
export async function purchaseNumber({ serviceId, countryCode, signal } = {}) {
  const data = await apiRequest("/api/numbers/purchase", {
    method: "POST",
    body: JSON.stringify({ serviceId, countryCode }),
    signal,
    operation: "purchase a number",
  });
  return {
    number: data?.number,
    balance: data?.balance,
    transaction: data?.transaction,
  };
}

/** Ask the backend for the verification code for a purchased number. */
export async function requestVerificationCode(numberId, { signal } = {}) {
  const data = await apiRequest(`/api/numbers/${numberId}/verify`, {
    method: "POST",
    signal,
    operation: "request a verification code",
  });
  return { code: data?.code, receivedAt: data?.receivedAt };
}

export { MissingEndpointError };
