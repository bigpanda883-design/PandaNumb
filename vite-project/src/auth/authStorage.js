const AUTH_STORAGE_KEY = "panda-numbers-auth";

/**
 * Every key that holds data belonging to a signed-in account.
 *
 * Signing out must clear ALL of these, not just the auth record, otherwise the
 * next user to sign in on this browser inherits the previous user's balance,
 * notifications and cached rate.
 */
const ACCOUNT_SCOPED_KEYS = [
  AUTH_STORAGE_KEY,
  "panda-numbers-wallet",
  "panda-numbers-notifications",
  "panda-numbers-notifications-seeded",
  "panda-numbers-transactions",
  "panda-numbers-activations",
  "panda-numbers-usd-ngn-rate",
];

export function getAuthUser() {
  try {
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    return null;
  }
}

export function setAuthUser(user) {
  // If a DIFFERENT account is signing in on this browser, drop the previous
  // account's data first so nothing leaks across users. Re-signing in as the
  // same account keeps its cached data.
  const previous = getAuthUser();
  const isSameAccount =
    previous &&
    user &&
    previous.email &&
    user.email &&
    previous.email === user.email;

  if (!isSameAccount) {
    ACCOUNT_SCOPED_KEYS.forEach((key) => {
      if (key === AUTH_STORAGE_KEY) return;
      try {
        localStorage.removeItem(key);
      } catch {
        // Non-fatal.
      }
    });
  }

  // A fresh sign-in is the newest statement about this account's balance, so
  // stamp it. Any wallet value written earlier is then correctly treated as
  // stale by fetchBalance().
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ ...user, balanceUpdatedAt: Date.now() }),
  );
}

/**
 * Sign out and drop every trace of the previous account from this browser.
 * Any in-memory listeners are notified so open components re-render empty
 * rather than briefly showing the old account's figures.
 */
export function clearAuthUser() {
  ACCOUNT_SCOPED_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable; nothing to clear in that case.
    }
  });

  window.dispatchEvent(new CustomEvent("panda-wallet-change"));
  window.dispatchEvent(new CustomEvent("panda-notifications-change"));
  window.dispatchEvent(new CustomEvent("panda-transactions-change"));
  window.dispatchEvent(new CustomEvent("panda-activations-change"));

  // Let the next session see the WhatsApp announcement again.
  try {
    sessionStorage.removeItem("panda-whatsapp-announcement-seen");
  } catch {
    // Non-fatal.
  }
}

export function isAuthenticated() {
  return Boolean(getAuthUser());
}
