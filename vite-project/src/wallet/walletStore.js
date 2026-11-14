/**
 * Panda Numbers - wallet store
 * -------------------------------------------------
 * The single source of truth for the user's balance. Every screen that shows a
 * balance (dashboard home, buy confirmation, deposit) reads from here, so a
 * purchase or deposit updates all of them at once instead of each page keeping
 * its own copy.
 *
 * The server remains authoritative; this browser value is only a display cache
 * so a recently fetched balance can paint before the next API request.
 */

import { fetchWalletBalance } from "../services/apiClient.js";

const WALLET_STORAGE_KEY = "panda-numbers-wallet";

/** Current balance in kobo-safe naira, or null when never fetched. */
export function getBalance() {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed?.balance) && parsed.balance >= 0
      ? parsed.balance
      : null;
  } catch {
    return null;
  }
}

function writeBalance(balance, source) {
  try {
    localStorage.setItem(
      WALLET_STORAGE_KEY,
      JSON.stringify({ balance, updatedAt: Date.now(), source }),
    );
  } catch {
    // Storage unavailable - the in-memory React state still updates.
  }

  window.dispatchEvent(
    new CustomEvent("panda-wallet-change", { detail: { balance, source } }),
  );
}

/** Set the balance directly (e.g. after an authoritative fetch). */
export function setBalance(balance, source = "sync") {
  if (!Number.isFinite(balance) || balance < 0) return;
  writeBalance(balance, source);
}

/** Credit the wallet, e.g. a confirmed deposit. Returns the new balance. */
export function creditBalance(amount, source = "deposit") {
  const current = getBalance() ?? 0;
  const next = current + Number(amount || 0);
  writeBalance(next, source);
  return next;
}

/**
 * Debit the wallet, e.g. a purchase or withdrawal. Returns the new balance.
 *
 * The result is clamped at 0: a client-side store must never record a negative
 * balance it cannot honour. A real debit that would overdraw has to be rejected
 * by the backend, not silently allowed here.
 */
export function debitBalance(amount, source = "purchase") {
  const current = getBalance() ?? 0;
  const next = Math.max(0, current - Number(amount || 0));
  writeBalance(next, source);
  return next;
}

/**
 * Load the balance from the backend.
 *
 * The balance is fetched from the authenticated backend endpoint; a network
 * failure is surfaced to the caller rather than being replaced with a
 * success-shaped local default.
 *
 * @returns {Promise<number>} the authoritative balance
 */
export async function fetchBalance({ signal } = {}) {
  const balance = await fetchWalletBalance({ signal });
  setBalance(balance, "fetch");
  return balance;
}

/** Subscribe to balance changes; returns an unsubscribe function. */
export function subscribeToWallet(callback) {
  const handler = (event) => callback(event.detail?.balance ?? getBalance());
  window.addEventListener("panda-wallet-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("panda-wallet-change", handler);
    window.removeEventListener("storage", handler);
  };
}
