const AUTH_STORAGE_KEY = "panda-numbers-auth";
const AUTH_TOKEN_KEY = "panda-numbers-auth-token";

/**
 * Every key that holds data belonging to a signed-in account.
 *
 * Signing out must clear ALL of these, not just the auth record, otherwise the
 * next user to sign in on this browser inherits the previous user's balance,
 * notifications and cached rate.
 */
const ACCOUNT_SCOPED_KEYS = [
  "panda-numbers-wallet",
  "panda-numbers-notifications",
  "panda-numbers-notifications-seeded",
  "panda-numbers-transactions",
  "panda-numbers-activations",
  "panda-numbers-usd-ngn-rate",
];

const CHANGE_EVENTS = [
  "panda-wallet-change",
  "panda-notifications-change",
  "panda-transactions-change",
  "panda-activations-change",
];

function normaliseEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function notifyAccountChange() {
  CHANGE_EVENTS.forEach((name) => {
    window.dispatchEvent(new CustomEvent(name));
  });
}

// Delete accounts created by older offline-only builds. Authentication is now
// server-only. The legacy profile cache moves to sessionStorage so it is not
// retained as a permanent local account record.
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("panda-numbers-local-accounts");
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
} catch {
  // Storage may be unavailable in private browsing or server-side rendering.
}
export function getAuthUser() {
  try {
    const storedUser = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      return true;
    }
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Store the display profile for this tab. The API token is stored separately
 * and is the only credential used to authenticate backend requests.
 */
export function setAuthUser(user) {
  // If a DIFFERENT account is signing in on this browser, drop the previous
  // account's data first so nothing leaks across users. Re-signing in as the
  // same account keeps its cached data.
  const previous = getAuthUser();
  const isSameAccount = Boolean(
    previous?.email &&
    user?.email &&
    normaliseEmail(previous.email) === normaliseEmail(user.email),
  );
  if (!isSameAccount) {
    ACCOUNT_SCOPED_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Non-fatal.
      }
    });
  }

  try {
    sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ ...user, balanceUpdatedAt: Date.now() }),
    );
  } catch {
    return false;
  }

  if (!isSameAccount) {
    // Open components must drop the previous account's figures.
    notifyAccountChange();
  }

  return true;
}

/**
 * Store a user AND their session token together, as one step.
 *
 * THE BUG THIS FIXES
 * ------------------
 * Login and signup used to call setAuthUser() and then setAuthToken(). When a
 * different account had previously been signed in on that browser/phone,
 * setAuthUser() treats this as an account switch and deletes the old account's
 * token - but it runs BEFORE the new token is written, and the pages wrote the
 * token after. So the order was safe... except for the OTHER order in a few
 * places (forgot-password stored the token first). On a phone, where people
 * switch between family accounts far more often, that left the app with a
 * logged-in user and NO token, so every protected call answered 401 and the
 * app "lost the session".
 *
 * Doing both here removes the ordering trap entirely: previous account data is
 * cleared first, then the new user and the new token are written.
 *
 * @returns {boolean} false when browser session storage refused the write.
 */
export function saveSession(user, token) {
  const saved = setAuthUser(user);
  if (!saved) return false;
  return setAuthToken(token || "");
}

/**
 * A 401 from the API means the server no longer knows this token (expired,
 * revoked, or the server restarted with a fresh database). Drop the local
 * session so the UI shows the login page instead of a half-signed-in state.
 */
export function handleSessionExpired() {
  clearAuthUser();
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
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Storage can be unavailable; nothing to clear in that case.
  }

  notifyAccountChange();

  // Let the next session see the WhatsApp announcement again.
  try {
    sessionStorage.removeItem("panda-whatsapp-announcement-seen");
  } catch {
    // Non-fatal.
  }
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}
