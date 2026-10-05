/**
 * Panda Numbers - wallet store
 * -------------------------------------------------
 * The single source of truth for the user's balance. Every screen that shows a
 * balance (dashboard home, buy confirmation, deposit) reads from here, so a
 * purchase or deposit updates all of them at once instead of each page keeping
 * its own copy.
 *
 * Same localStorage + event pattern as authStorage / notificationStore, which
 * keeps this dependency-free and in sync across components and tabs.
 */

const WALLET_STORAGE_KEY = "panda-numbers-wallet";

/** Current balance in kobo-safe naira, or null when never fetched. */
export function getBalance() {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.balance === "number" ? parsed.balance : null;
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

  // Mirror the balance back onto the auth record as well.
  //
  // Without this the two drift apart: the wallet held the post-deposit figure
  // while `panda-numbers-auth` still held the balance from sign-in, and any
  // later fetchBalance() would overwrite the wallet with that stale value -
  // which is exactly how a confirmed deposit appeared to vanish.
  try {
    const rawUser = localStorage.getItem("panda-numbers-auth");
    if (rawUser) {
      const user = JSON.parse(rawUser);
      if (user && typeof user === "object") {
        localStorage.setItem(
          "panda-numbers-auth",
          JSON.stringify({
            ...user,
            balance,
            // Stamp the write so fetchBalance() can tell which record is newer.
            balanceUpdatedAt: Date.now(),
          }),
        );
      }
    }
  } catch {
    // A malformed auth record is not worth failing the balance write over.
  }

  window.dispatchEvent(
    new CustomEvent("panda-wallet-change", { detail: { balance, source } }),
  );
}

/** Set the balance directly (e.g. after an authoritative fetch). */
export function setBalance(balance, source = "sync") {
  if (typeof balance !== "number" || Number.isNaN(balance)) return;
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
 * No backend endpoint exists in this project yet, so this derives the opening
 * balance from the authenticated user record instead of inventing a number: it
 * reads whatever balance the auth/session payload already carries, and falls
 * back to 0 for a genuinely new account. Point `fetchBalance` at a real
 * endpoint by setting VITE_BALANCE_ENDPOINT; nothing else has to change.
 *
 * @returns {Promise<number>} the authoritative balance
 */
export async function fetchBalance({ signal } = {}) {
  const endpoint =
    import.meta.env?.VITE_BALANCE_ENDPOINT ||
    (typeof window !== "undefined" && window.location.origin
      ? `${window.location.origin}/api/wallet/balance`
      : "");

  // A real network request has latency; a localStorage read does not. Without
  // this floor the loading state would resolve within a single frame and the
  // skeleton would never paint. It only delays the *display* of the value -
  // the value itself is always the authoritative one below.
  const minimumLatency = new Promise((resolve) => setTimeout(resolve, 550));

  if (endpoint) {
    const token = localStorage.getItem("panda-numbers-auth-token");
    const response = await fetch(endpoint, {
      signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Balance request failed (${response.status})`);
    }
    const data = await response.json();
    const value =
      data.balance ??
      data.walletBalance ??
      data.availableBalance ??
      data.amount;
    if (typeof value !== "number") {
      throw new Error("Balance endpoint returned no numeric balance");
    }
    const balance = value;
    await minimumLatency;
    setBalance(balance, "fetch");
    return balance;
  }

  // No endpoint configured: use the authenticated user's own balance if the
  // session carries one. Never invent a figure.
  // No initial value: the catch assigns null, and nothing reads this before
  // one of the two branches has run.
  let storedUser;
  try {
    storedUser = JSON.parse(
      localStorage.getItem("panda-numbers-auth") || "null",
    );
  } catch {
    storedUser = null;
  }

  const sessionBalance =
    typeof storedUser?.balance === "number" ? storedUser.balance : 0;

  // Prefer an existing wallet value when it is NEWER than the auth record.
  //
  // A deposit updates the wallet immediately while the auth record only
  // reflects it afterwards, so blindly trusting the auth value here would roll
  // a confirmed deposit back on the next page load.
  const existingWallet = getBalance();
  const walletIsNewer = hasNewerWalletValue();
  const balance =
    existingWallet !== null && walletIsNewer ? existingWallet : sessionBalance;

  await minimumLatency;
  setBalance(balance, "session");
  return balance;
}

/**
 * Has the wallet been written more recently than the auth record?
 * Used to decide which of the two is authoritative when there is no API.
 */
function hasNewerWalletValue() {
  try {
    const rawWallet = JSON.parse(
      localStorage.getItem(WALLET_STORAGE_KEY) || "null",
    );
    const rawUser = JSON.parse(
      localStorage.getItem("panda-numbers-auth") || "null",
    );
    if (!rawWallet || !rawUser) return false;

    const walletTime = rawWallet.updatedAt || 0;
    const authTime = rawUser.balanceUpdatedAt || 0;
    return walletTime > authTime;
  } catch {
    return false;
  }
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
