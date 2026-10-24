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
  AUTH_STORAGE_KEY,
  AUTH_TOKEN_KEY,
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

/**
 * On-device account book.
 *
 * The app is published as static files with no API server behind it, so there
 * is nowhere to verify a password against. Accounts are therefore kept in this
 * browser and checked locally.
 *
 * CONSEQUENCES, so nobody is misled:
 *   - An account exists only on the device that created it. The same email on a
 *     phone and a laptop are two separate accounts.
 *   - Clearing site data, or switching browser, removes the account.
 *   - The password is never stored. Only a salted SHA-256 digest is kept.
 *   - This is a convenience gate, NOT real security: anyone with access to the
 *     browser can read or edit localStorage. Never use it to protect real money.
 *
 * The moment a real backend is available, the auth pages prefer it and fall
 * back to this book only when no server answers.
 */
const LOCAL_ACCOUNTS_KEY = "panda-numbers-local-accounts";

// Deliberately NOT in ACCOUNT_SCOPED_KEYS: signing out must not delete the
// account, or the user could never sign back in on this device.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

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

function readLocalAccounts() {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeLocalAccounts(accounts) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
    return true;
  } catch {
    // Private mode or a full quota; the caller reports the failure.
    return false;
  }
}

function getAccount(accounts, key) {
  // hasOwn stops emails like "constructor" or "__proto__" matching inherited
  // properties of the plain object.
  return key && hasOwn(accounts, key) ? accounts[key] : null;
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Without this, the salt would be 32 zeros for every account.
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return toHex(bytes);
}

/**
 * Hash the password with a per-account salt.
 *
 * Uses SHA-256 via WebCrypto where available (any HTTPS origin, which Vercel
 * is). Falls back to a simple non-cryptographic digest on insecure origins so
 * the flow still works on a plain-HTTP LAN address.
 */
async function hashPassword(password, salt) {
  const input = `${salt}:${password}`;

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input),
    );
    return toHex(new Uint8Array(digest));
  }

  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `fb${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

/** True when an account already exists on this device. */
export function hasLocalAccount(email) {
  return Boolean(getAccount(readLocalAccounts(), normaliseEmail(email)));
}

/**
 * Create an account on this device.
 *
 * Returns `{ ok: false, message }` when the input is invalid, the email is
 * taken or storage is unavailable, otherwise `{ ok: true, user }`.
 */
export async function registerLocalAccount({
  fullName,
  email,
  phone,
  password,
}) {
  const key = normaliseEmail(email);
  if (!EMAIL_PATTERN.test(key)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, message: "Enter a password." };
  }

  const accounts = readLocalAccounts();
  if (getAccount(accounts, key)) {
    return {
      ok: false,
      message:
        "This email is already registered on this device. Please log in.",
    };
  }

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);

  accounts[key] = {
    fullName: String(fullName || "").trim(),
    email: key,
    phone: String(phone || "").trim(),
    salt,
    hash,
    createdAt: Date.now(),
  };

  if (!writeLocalAccounts(accounts)) {
    return {
      ok: false,
      message:
        "This browser is blocking storage, so the account cannot be saved. Enable site data and try again.",
    };
  }

  const { salt: _salt, hash: _hash, ...user } = accounts[key];
  return { ok: true, user };
}

/**
 * Check credentials against the on-device account book.
 *
 * The same message is returned whether the email is unknown or the password is
 * wrong, so the form cannot be used to discover which emails are registered.
 */
export async function authenticateLocalAccount({ email, password }) {
  const failure = { ok: false, message: "Incorrect email or password." };

  const account = getAccount(readLocalAccounts(), normaliseEmail(email));
  if (!account || typeof account.salt !== "string" || !account.hash) {
    return failure;
  }

  const hash = await hashPassword(String(password ?? ""), account.salt);
  if (hash !== account.hash) {
    return failure;
  }

  const { salt: _salt, hash: _hash, ...user } = account;
  return { ok: true, user };
}

export function getAuthUser() {
  try {
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      return;
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Non-fatal.
  }
}

/**
 * Store the signed-in user. Returns false if the browser refused to save it,
 * so the caller can show an error instead of silently "logging in".
 *
 * NOTE: if one account replaces another without signing out, call this BEFORE
 * setAuthToken(), because the old account's token is removed here. For a normal
 * login/signup, prefer {@link saveSession}, which does both in the right order.
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
  // Only a token left by another signed-in account is stale. On a fresh
  // login (no previous user) the token may have just been saved by the caller.
  const switchedAccount = Boolean(previous) && !isSameAccount;

  if (!isSameAccount) {
    ACCOUNT_SCOPED_KEYS.forEach((key) => {
      if (key === AUTH_STORAGE_KEY) return;
      if (key === AUTH_TOKEN_KEY && !switchedAccount) return;
      try {
        localStorage.removeItem(key);
      } catch {
        // Non-fatal.
      }
    });
  }

  try {
    localStorage.setItem(
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
 * @returns {boolean} false when localStorage refused the write.
 */
export function saveSession(user, token) {
  const saved = setAuthUser(user);
  if (!saved) return false;
  setAuthToken(token || "");
  return true;
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

  notifyAccountChange();

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
