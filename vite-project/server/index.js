import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import {
  appendUserNumber,
  appendUserTransaction,
  assertModeMatches as assertDepositModeMatches,
  clearWebhookEvent,
  createUser,
  createEmailVerificationCode,
  createPasswordResetCode,
  createPasswordResetToken,
  createSession,
  creditWallet,
  DATABASE_PATH,
  debitWallet,
  findUserForDeposit,
  getDepositByTransactionId,
  getWebhookEvent,
  getVirtualAccountForUser,
  listDepositsForAdmin,
  listDepositsForUser,
  listVirtualAccountsForAdmin,
  listWebhookEventsForAdmin,
  listUncreditedDeposits,
  claimVirtualAccountSlot,
  reclaimVirtualAccountSlot,
  saveVirtualAccountDetails,
  markVirtualAccountFailure,
  recordConfirmedDeposit,
  recordUnconfirmedDeposit,
  LEDGER_REASONS,
  ledgerBalance,
  markWebhookProcessed,
  recordWebhookEvent,
  deleteAllSessionsForUser,
  deleteSessionByToken,
  getLatestPasswordResetCode,
  getLatestEmailVerificationCode,
  getPasswordResetTokenByHash,
  getSessionFromToken,
  getUserByEmail,
  getUserById,
  getUserByPhone,
  hashToken,
  incrementPasswordResetAttempts,
  incrementEmailVerificationAttempts,
  invalidatePasswordResetCodesForUser,
  invalidatePasswordResetTokensForUser,
  markPasswordResetCodeVerified,
  markPasswordResetTokenUsed,
  markPasswordResetUsed,
  safeUser,
  updatePasswordAndCreateSession,
  updateUserProfile,
  updateUserNumber,
  updateUserPassword,
  verifyUserEmail,
} from "./db.js";
import {
  RESET_CODE_TTL_MINUTES,
  isEmailConfigured,
  sendLoginNotificationEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendWelcomeEmail,
} from "./emailService.js";
import db from "./db.js";
import {
  getYankeeBalance,
  getYankeeNumbersStatus,
  requestYankeeNumber,
  getYankeeActivationStatus,
  setYankeeActivationStatus,
  getYankeeApiKey,
} from "./yankeeService.js";
import {
  resolveProviderCountry,
  resolveProviderService,
} from "./providerMapping.js";
import smsProxyRouter from "./smsProxy.js";
import smsRouter from "./smsRouter.js";
import {
  describeConfig as describeFlutterwaveConfig,
  createPermanentVirtualAccount,
  extractVirtualAccountNumber,
  isTestKey as isFlutterwaveTestKey,
  FlutterwaveError,
  verifyTransaction as verifyFlutterwaveTransaction,
} from "./flutterwave.js";
import { DEPOSIT_LIMITS } from "./depositLimits.js";
import {
  BLOCKED_SERVICES,
  getBlockedReason,
  getCardTiers,
  getPricingConfig,
  getTierConfig,
  priceVariant,
  resolveCatalogueService,
  resolveTierKey,
  PRICE_TIERS,
  SELLABLE_SERVICES,
} from "./pricing.js";

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const API_KEY = getYankeeApiKey();
const PRICES_URL =
  process.env.ACC_PRICES_URL ||
  "https://www.accnumbers.com/api/v1/guest/prices";

const loginRateMap = new Map();
const registrationRateMap = new Map();
const verificationSendRateMap = new Map();
const verificationCodeRateMap = new Map();
const passwordChangeRateMap = new Map();
const resetRateMap = new Map();
// Codes are short (six digits), so guessing must be throttled separately from
// requesting them. Keyed by "verify:<ip>:<email>".
const resetCodeVerifyRateMap = new Map();
const virtualAccountRateMap = new Map();
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

// Browser origins allowed to call this API with credentials. Vercel preview
// deployments are allowed by suffix so a PR preview is not blocked either.
//
// `origin: true` used to reflect ANY origin. CORS itself is not the security
// boundary here (auth is a Bearer token, not an ambient cookie), but echoing
// every origin plus `credentials: true` is what makes a mis-pointed frontend
// look like it "worked" while phone traffic went elsewhere. An explicit list
// makes a wrong API URL fail loudly and visibly instead of silently.
const ALLOWED_ORIGINS = String(
  process.env.FRONTEND_ORIGINS ||
    "https://pandanumbers.vercel.app,https://panda-numb.vercel.app,https://pandanumb.vercel.app,https://*.vercel.app,http://localhost:5173,http://localhost:4173",
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, health checks, same-origin server calls
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.host.toLowerCase();

  // A phone testing the dev server reaches it as http://<lan-ip>:5173, which no
  // static allow-list can predict (it changes per network). Every request from
  // that phone was refused with 403 ORIGIN_NOT_ALLOWED, so login and every other
  // API failed on mobile while the laptop worked. This is only ever a plain-HTTP
  // private/LAN address - a public deployment is https and never matches - and
  // the app's auth is a Bearer token, not ambient cookies, so allowing it grants
  // a local-network device nothing a browser on the laptop does not already
  // have.
  if (url.protocol === "http:" && isPrivateHost(url.hostname)) return true;

  // Wildcard entries are matched against the HOST, so "https://*.vercel.app"
  // covers every preview URL without listing them.
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed.startsWith("*") || allowed.includes("://*.")) {
      const suffix = allowed.slice(allowed.indexOf("*.") + 2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    try {
      return new URL(allowed).host.toLowerCase() === host;
    } catch {
      return false;
    }
  });
}

/**
 * True for localhost and private IPv4 ranges (the LAN the dev server binds to).
 * A public hostname or public IP is never private, so production access still
 * has to be listed explicitly.
 */
function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  return (
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      // No error: answer WITHOUT CORS headers, so the browser blocks it and the
      // request never reaches the handlers. The status stays a normal 403 with
      // a JSON body so a non-browser caller still gets a readable answer.
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    maxAge: 86400,
  }),
);
// One JSON parser for every route, webhook included: Flutterwave authenticates
// its webhook with a secret hash in a header (`verif-hash`), not with a
// signature over the raw bytes, so the parsed object is all that is needed.
app.use(express.json({ limit: "1mb" }));

// A browser request from an origin that is not allow-listed is refused HERE,
// before any route runs. It writes its JSON directly instead of calling fail():
// this middleware is registered before fail() is defined, and depending on that
// ordering silently disabled the check once (the request fell through to the
// route and the cors package still echoed the origin).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      error: "ORIGIN_NOT_ALLOWED",
      message: `The origin ${origin} is not allowed to call this API. Add it to FRONTEND_ORIGINS.`,
    });
  }
  return next();
});

// Health must never need a provider API key: it is the probe that tells a
// deployment whether the process is alive and reachable at all. It sits AFTER
// the origin check, so an unlisted origin is still refused here.
//
// `dbOk` / `accounts` are what tell "the backend is up" apart from "the backend
// is up but looking at a different (or freshly emptied) database" - the exact
// cause of "my account exists locally but not on the live site". Only a COUNT is
// reported: no email address, hash or token is ever returned.
app.get("/api/health", (req, res) => {
  let dbOk = true;
  let accounts = null;
  try {
    accounts = db.prepare("SELECT COUNT(*) AS c FROM users").get()?.c ?? 0;
  } catch {
    dbOk = false;
  }
  return res.json({
    ok: true,
    dbOk,
    accounts,
    persistentStorage: Boolean(process.env.DATA_DIR),
  });
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

function rateLimitKey(ip, email = "") {
  return `${ip}:${email}`;
}

function applyRateLimit(map, key, maxRequests, windowMs) {
  const now = Date.now();
  const existing = map.get(key);

  if (!existing || now > existing.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  existing.count += 1;
  if (existing.count > maxRequests) {
    return true;
  }
  return false;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function validatePassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(
    String(password || ""),
  );
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return fail(res, 401, "UNAUTHORIZED", "Authentication token is required.");
  }

  const session = getSessionFromToken(token);
  if (!session) {
    return fail(
      res,
      401,
      "UNAUTHORIZED",
      "Your session has expired or is invalid.",
    );
  }

  const user = getUserById(session.userId);
  if (!user) {
    return fail(res, 401, "UNAUTHORIZED", "User no longer exists.");
  }
  req.user = user;
  req.token = token;
  next();
}

function adminMiddleware(req, res, next) {
  if (!ADMIN_EMAILS.has(String(req.user?.email || "").toLowerCase())) {
    return fail(res, 403, "FORBIDDEN", "This area is not available.");
  }
  return next();
}

app.get("/api/health/detail", async (req, res) => {
  const pricing = getPricingConfig();

  // The provider's OWN wallet balance, read live. This is the number that
  // decides whether a purchase can succeed: the provider answers NO_BALANCE
  // when its account has no credit, and no amount of credit in a USER's wallet
  // can change that. Exposing it here means the operator can tell "out of
  // provider credit" apart from "out of stock" or "provider key wrong" without
  // reading server logs. Read-only - it never buys anything.
  let providerBalance = null;
  let providerBalanceError = null;
  if (API_KEY) {
    try {
      providerBalance = await getYankeeBalance();
    } catch (error) {
      providerBalanceError = String(
        error?.code || error?.message || "PROVIDER_ERROR",
      );
    }
  }

  res.json({
    ok: true,
    providerConfigured: Boolean(API_KEY),
    // Whole currency units (see getProviderBalance in smsProvider.js for why a
    // bare integer is treated as minor units). null = could not be read.
    providerBalance,
    providerBalanceError,
    // A purchase will be refused by the provider while this is <= 0.
    providerCanIssueNumbers:
      typeof providerBalance === "number" ? providerBalance > 0 : null,
    // Whether login/reset emails can be sent. Reports only the boolean - never
    // the host, user or password.
    emailConfigured: isEmailConfigured(),
    pricing,
  });
});

async function issueEmailVerificationCode(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(
    Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  createEmailVerificationCode({ userId: user.id, codeHash, expiresAt });
  return sendEmailVerificationEmail(user.email, code);
}

const registerHandler = async (req, res) => {
  const name = String(req.body.name || req.body.fullName || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  const phone = String(req.body.phone || "").trim();

  if (!name || !email || !phone || !password) {
    return fail(
      res,
      400,
      "INVALID_INPUT",
      "Name, email, phone number and password are required.",
    );
  }

  if (name.length < 2 || name.length > 80 || !/^[a-zA-Z\s'-]+$/.test(name)) {
    return fail(
      res,
      400,
      "INVALID_NAME",
      "Enter a valid name between 2 and 80 characters.",
    );
  }

  if (!validateEmail(email)) {
    return fail(
      res,
      400,
      "INVALID_EMAIL",
      "Please enter a valid email address.",
    );
  }

  const phoneDigits = phone.replace(/\D/g, "");
  if (
    !/^\+?[0-9\s-]+$/.test(phone) ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    return fail(res, 400, "INVALID_PHONE", "Enter a valid phone number.");
  }

  if (
    applyRateLimit(
      registrationRateMap,
      rateLimitKey(req.ip, email),
      5,
      60 * 60_000,
    )
  ) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many registration attempts. Please try again later.",
    );
  }

  if (!validatePassword(password)) {
    return fail(
      res,
      400,
      "WEAK_PASSWORD",
      "Password must contain uppercase, lowercase, number and special character.",
    );
  }

  if (getUserByEmail(email)) {
    return fail(
      res,
      409,
      "EMAIL_ALREADY_EXISTS",
      "This email is already registered. Please use another email or log in.",
    );
  }

  if (phone && getUserByPhone(phone)) {
    return fail(
      res,
      409,
      "PHONE_ALREADY_EXISTS",
      "This phone number has already been used. Please use another number.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let user;
  try {
    user = createUser({
      name,
      email,
      passwordHash,
      phone,
    });
  } catch (error) {
    if (
      String(error?.message || "").includes("UNIQUE") ||
      String(error?.message || "").includes("unique")
    ) {
      return fail(
        res,
        409,
        "ACCOUNT_ALREADY_EXISTS",
        "This account already exists. Please use another email or log in.",
      );
    }
    throw error;
  }

  const token = generateToken();
  createSession({ userId: user.id, token });
  sendWelcomeEmail({ email: user.email, name: user.name }).catch((error) => {
    console.error("[auth] welcome email error:", error?.message || error);
  });

  return res.status(201).json({
    user: safeUser(user),
    token,
    message: "Your account is ready.",
  });
};

app.post("/api/auth/register", registerHandler);

// Alias: the sign-up UI posts to /api/auth/signup, but the real handler lives
// at /api/auth/register. Forward the body to that handler instead of
// re-dispatching the request through the router (which matched this same route
// again and produced an empty response -> "Unexpected end of JSON input").
app.post("/api/auth/signup", registerHandler);

app.post("/api/auth/resend-verification", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  if (!validateEmail(email)) {
    return fail(
      res,
      400,
      "INVALID_EMAIL",
      "Please enter a valid email address.",
    );
  }
  if (
    applyRateLimit(
      verificationSendRateMap,
      rateLimitKey(req.ip, email),
      3,
      60_000,
    )
  ) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many verification requests. Please wait a minute and try again.",
    );
  }

  const user = getUserByEmail(email);
  if (user && !user.emailVerifiedAt) {
    await issueEmailVerificationCode(user);
  }
  return res.json({
    emailConfigured: isEmailConfigured(),
    message:
      "If this email has an account that still needs verification, a new code was requested.",
  });
});

app.post("/api/auth/verify-email", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const code = String(req.body.code || "").trim();
  if (!validateEmail(email)) {
    return fail(
      res,
      400,
      "INVALID_EMAIL",
      "Please enter a valid email address.",
    );
  }
  if (!/^\d{6}$/.test(code)) {
    return fail(
      res,
      400,
      "INVALID_CODE",
      "Enter the 6-digit verification code.",
    );
  }
  if (
    applyRateLimit(
      verificationCodeRateMap,
      rateLimitKey(req.ip, email),
      10,
      60_000,
    )
  ) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many code attempts. Please wait a minute and try again.",
    );
  }

  const user = getUserByEmail(email);
  const verificationCode = user
    ? getLatestEmailVerificationCode(user.id)
    : null;
  const invalidCode = () =>
    fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect or has expired.",
    );

  if (!user || !verificationCode || verificationCode.used_at) {
    return invalidCode();
  }
  if (new Date(verificationCode.expires_at).getTime() < Date.now()) {
    return fail(
      res,
      400,
      "CODE_EXPIRED",
      "This verification code has expired. Request a new one.",
    );
  }
  if (Number(verificationCode.attempts || 0) >= 5) {
    return fail(
      res,
      400,
      "CODE_LOCKED",
      "Too many failed attempts. Request a new code.",
    );
  }

  const matches = await bcrypt.compare(code, verificationCode.code_hash);
  if (!matches) {
    incrementEmailVerificationAttempts(verificationCode.id);
    return invalidCode();
  }

  const result = verifyUserEmail({
    userId: user.id,
    codeId: verificationCode.id,
  });
  if (!result) return invalidCode();

  const token = generateToken();
  createSession({ userId: user.id, token });
  if (result.verifiedNow) {
    sendWelcomeEmail({ email: user.email, name: user.name }).catch((error) => {
      console.error("[auth] welcome email error:", error?.message || error);
    });
  }

  return res.json({
    user: safeUser(getUserById(user.id)),
    token,
    message: "Your email has been verified.",
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  const key = rateLimitKey(req.ip, email);

  if (applyRateLimit(loginRateMap, key, 8, 60_000)) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many login attempts. Please try again later.",
    );
  }

  if (!email || !password) {
    return fail(res, 400, "INVALID_INPUT", "Email and password are required.");
  }

  if (!validateEmail(email)) {
    return fail(
      res,
      400,
      "INVALID_EMAIL",
      "Please enter a valid email address.",
    );
  }

  const user = getUserByEmail(email);
  if (!user) {
    return fail(
      res,
      401,
      "INVALID_CREDENTIALS",
      "Incorrect email or password.",
    );
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return fail(
      res,
      401,
      "INVALID_CREDENTIALS",
      "Incorrect email or password.",
    );
  }

  const token = generateToken();
  createSession({ userId: user.id, token });

  // Credentials are verified and the session exists - only now is the
  // notification sent. Every failure path above returns before this line, so a
  // wrong password or unknown email can never trigger a "successful login"
  // email. Delivery is NOT awaited: a slow or unreachable mailbox must not delay
  // the sign-in, and its failure must never turn a successful login into an
  // error (see sendLoginNotificationEmail, which never throws).
  sendLoginNotificationEmail({ email: user.email, name: user.name }).catch(
    (error) => {
      console.error(
        "[auth] login notification error:",
        error?.message || error,
      );
    },
  );

  return res.json({
    user: safeUser(user),
    token,
  });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  return res.json({ user: safeUser(req.user) });
});

app.put("/api/auth/me", authMiddleware, (req, res) => {
  const name = String(req.body.fullName || "").trim();
  const phone = String(req.body.phone || "").trim();

  if (name.length < 2 || name.length > 80) {
    return fail(
      res,
      400,
      "INVALID_NAME",
      "Full name must be between 2 and 80 characters.",
    );
  }
  if (phone && !/^\+?[0-9][0-9\s()-]{6,19}$/.test(phone)) {
    return fail(res, 400, "INVALID_PHONE", "Enter a valid phone number.");
  }

  const existingPhoneUser = getUserByPhone(phone);
  if (existingPhoneUser && existingPhoneUser.id !== req.user.id) {
    return fail(
      res,
      409,
      "PHONE_ALREADY_EXISTS",
      "That phone number is already associated with another account.",
    );
  }

  const user = updateUserProfile({ userId: req.user.id, name, phone });
  return res.json({ user: safeUser(user) });
});

app.post("/api/auth/change-password", authMiddleware, async (req, res) => {
  if (
    applyRateLimit(
      passwordChangeRateMap,
      rateLimitKey(req.ip, req.user.id),
      5,
      60 * 60 * 1000,
    )
  ) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many password change attempts. Please try again later.",
    );
  }

  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (!currentPassword || !newPassword) {
    return fail(
      res,
      400,
      "INVALID_INPUT",
      "Current and new passwords are required.",
    );
  }
  if (!validatePassword(newPassword)) {
    return fail(
      res,
      400,
      "WEAK_PASSWORD",
      "Password must contain uppercase, lowercase, number and special character.",
    );
  }

  const currentMatches = await bcrypt.compare(
    currentPassword,
    req.user.passwordHash,
  );
  if (!currentMatches) {
    return fail(
      res,
      401,
      "INVALID_CURRENT_PASSWORD",
      "Your current password is incorrect.",
    );
  }
  if (currentPassword === newPassword) {
    return fail(
      res,
      400,
      "PASSWORD_UNCHANGED",
      "Choose a new password that differs from your current password.",
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const token = generateToken();
  updatePasswordAndCreateSession({
    userId: req.user.id,
    passwordHash,
    token,
  });
  return res.json({
    user: safeUser(getUserById(req.user.id)),
    token,
    message: "Password changed successfully. Other sessions were signed out.",
  });
});

app.get("/api/wallet/balance", authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({
    balance: Number(user?.walletBalance || 0),
    user: safeUser(user),
  });
});

/* ------------------------------------------------------------------ *
 * Funding (Flutterwave virtual accounts)
 *
 * A Panda wallet can only be credited by recordConfirmedDeposit(), and that is
 * only reached after Flutterwave's own verify API confirms a successful NGN
 * transfer into an account belonging to THIS user. There is no request a browser
 * can make that increases its own balance: the old free-credit endpoint answers
 * 410, and a webhook is treated as a notification, never as proof.
 *
 * While FLW_* configuration is incomplete, every funding route answers
 * 503 PAYMENT_NOT_CONFIGURED and /api/payments/config names what is missing.
 * Nothing here ever simulates a payment or invents bank details.
 * ------------------------------------------------------------------ */

/** The Flutterwave mode this process is running in: "test" or "live". */
function flutterwaveMode() {
  return isFlutterwaveTestKey() ? "test" : "live";
}

/**
 * Report what funding needs and what it has. Public, secret-free, and the first
 * thing to look at when funding is disabled.
 */
app.get("/api/payments/config", (req, res) => {
  return res.json({
    ...describeFlutterwaveConfig(),
    // The funding rules the Deposit page shows and the server enforces. They
    // are business limits, not secrets, so the UI never has to invent them.
    depositLimits: {
      minimum: DEPOSIT_LIMITS.minimum,
      maximum: DEPOSIT_LIMITS.maximum,
      currency: DEPOSIT_LIMITS.currency,
    },
  });
});

/** The explicit refusal for every legacy "credit my wallet" call. */
app.post("/api/wallet/deposit", authMiddleware, (req, res) =>
  fail(
    res,
    410,
    "DEPOSIT_ENDPOINT_REMOVED",
    "Direct wallet credits are no longer supported. Fund your wallet by bank transfer to your account on the Deposit page.",
  ),
);

/** Safe public shape of a virtual account. Never includes provider internals. */
function publicAccount(account) {
  if (!account) return null;
  return {
    accountNumber: account.accountNumber || null,
    bankName: account.bankName || null,
    accountName: account.accountName || null,
    narration: account.narration || null,
    currency: account.currency || "NGN",
    status: account.status,
    kind: account.kind,
    mode: account.mode,
    createdAt: account.createdAt,
  };
}

/**
 * A. GET my virtual account.
 *
 * Reads only the SAVED row: the Deposit page must not call Flutterwave on every
 * render, so a page load is one indexed query.
 */
app.get("/api/wallet/virtual-account", authMiddleware, (req, res) => {
  const account = getVirtualAccountForUser(req.user.id);
  const config = describeFlutterwaveConfig();
  const state = account?.accountNumber
    ? account.status === "ACTIVE"
      ? "ACTIVE"
      : account.status || "PENDING"
    : account?.pendingRef
      ? "PENDING"
      : account?.status === "FAILED"
        ? "FAILED"
        : "NOT_CREATED";
  return res.json({
    account: publicAccount(account),
    currency: "NGN",
    provider: "flutterwave",
    configured: config.configured,
    mode: config.mode,
    missing: config.missing,
    accountCreationSupported: config.configured,
    state,
  });
});

app.post("/api/wallet/virtual-account", authMiddleware, async (req, res) => {
  const existing = getVirtualAccountForUser(req.user.id);
  if (existing?.accountNumber) {
    return res.json({
      account: publicAccount(existing),
      created: false,
      state: existing.status || "PENDING",
    });
  }

  if (!describeFlutterwaveConfig().configured) {
    const config = describeFlutterwaveConfig();
    return fail(
      res,
      503,
      "PAYMENT_NOT_CONFIGURED",
      `Bank transfer funding is unavailable. Configure ${config.missing.join(", ")} on the server.`,
    );
  }

  if (
    applyRateLimit(
      virtualAccountRateMap,
      rateLimitKey(req.ip, req.user.id),
      3,
      60 * 60_000,
    )
  ) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many account setup attempts. Please wait and try again.",
    );
  }

  const bvn = typeof req.body?.bvn === "string" ? req.body.bvn.trim() : "";
  const nin = typeof req.body?.nin === "string" ? req.body.nin.trim() : "";
  if (Boolean(bvn) === Boolean(nin)) {
    return fail(
      res,
      400,
      "IDENTITY_REQUIRED",
      "Enter either your BVN or NIN to request a permanent bank account.",
    );
  }
  if (
    (bvn && !/^\d{11}$/.test(bvn)) ||
    (nin && !/^\d{11}$/.test(nin))
  ) {
    return fail(
      res,
      400,
      "IDENTITY_INVALID",
      "BVN and NIN must contain exactly 11 digits.",
    );
  }

  const nameParts = String(req.user.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (nameParts.length < 2) {
    return fail(
      res,
      400,
      "PROFILE_NAME_REQUIRED",
      "Add your first and last name to your profile before setting up a bank account.",
    );
  }

  let slot;
  if (existing) {
    if (existing.pendingRef) {
      return fail(
        res,
        409,
        "ACCOUNT_CREATION_PENDING",
        "Account setup is still being confirmed. Please contact support before retrying.",
      );
    }
    slot = reclaimVirtualAccountSlot(req.user.id);
  } else {
    slot = claimVirtualAccountSlot({
      userId: req.user.id,
      mode: isFlutterwaveTestKey() ? "test" : "live",
      customerEmail: req.user.email,
      pendingRef: `PN-${crypto.randomUUID()}`,
    });
  }

  if (!slot?.claimed) {
    const account = slot?.account || getVirtualAccountForUser(req.user.id);
    if (account?.accountNumber) {
      return res.json({ account: publicAccount(account), created: false });
    }
    return fail(
      res,
      409,
      "ACCOUNT_CREATION_PENDING",
      "Account setup is already in progress. Please wait before trying again.",
    );
  }

  try {
    const account = await createPermanentVirtualAccount({
      email: req.user.email,
      phonenumber: req.user.phone,
      firstname: nameParts[0],
      lastname: nameParts.slice(1).join(" "),
      txRef:
        slot.account?.pendingRef ||
        getVirtualAccountForUser(req.user.id)?.pendingRef,
      identity: bvn ? { bvn } : { nin },
    });
    const saved = saveVirtualAccountDetails(req.user.id, {
      ...account,
      accountName: account.accountName,
      status: account.accountStatus || "UNKNOWN",
    });
    if (!saved?.accountNumber) {
      throw new Error("VIRTUAL_ACCOUNT_SAVE_FAILED");
    }
    return res.status(201).json({
      account: publicAccount(saved),
      created: true,
      state: saved.status,
    });
  } catch (error) {
    const uncertain =
      error?.code === "PROVIDER_TIMEOUT" ||
      error?.code === "PROVIDER_UNREACHABLE" ||
      Number(error?.status || 0) >= 500;
    if (!uncertain) markVirtualAccountFailure(req.user.id);
    console.error(
      `[flutterwave] virtual account creation ${req.user.id} failed: ${error?.code || "PROVIDER_ERROR"}`,
    );
    if (error instanceof FlutterwaveError) {
      return fail(
        res,
        error.status || 502,
        error.code,
        uncertain
          ? "Flutterwave could not confirm whether the account was created. Contact support before trying again."
          : error.message,
      );
    }
    return fail(
      res,
      502,
      "ACCOUNT_CREATE_FAILED",
      "Flutterwave could not complete bank account setup. Please try again later.",
    );
  }
});

/**
 * D. My deposit transactions (paged).
 *
 * Only rows belonging to the authenticated user, and only the safe fields.
 */
app.get("/api/wallet/deposits", authMiddleware, (req, res) => {
  const page = listDepositsForUser(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  return res.json({
    deposits: page.deposits.map((deposit) => ({
      id: deposit.id,
      reference: deposit.txRef || deposit.transactionId,
      transactionId: deposit.transactionId,
      flutterwaveReference: deposit.flwRef,
      amount: deposit.amount,
      currency: deposit.currency,
      status: deposit.status,
      credited: Boolean(deposit.creditedAt),
      creditedAt: deposit.creditedAt,
      previousBalance: deposit.previousBalance,
      newBalance: deposit.newBalance,
      narration: deposit.narration,
      createdAt: deposit.createdAt,
    })),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    balance: Number(getUserById(req.user.id)?.walletBalance || 0),
  });
});

app.get(
  "/api/admin/me",
  authMiddleware,
  adminMiddleware,
  (_req, res) => res.json({ isAdmin: true }),
);

app.get(
  "/api/admin/payments/virtual-accounts",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    const result = listVirtualAccountsForAdmin({
      search: String(req.query.search || "").slice(0, 100),
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json(result);
  },
);

app.get(
  "/api/admin/payments/deposits",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    const status = String(req.query.status || "").trim().toUpperCase();
    if (status && !["CREDITED", "PENDING", "REVIEW", "FAILED"].includes(status)) {
      return fail(res, 400, "INVALID_STATUS", "Choose a valid deposit status.");
    }
    return res.json(
      listDepositsForAdmin({
        status,
        search: String(req.query.search || "").slice(0, 100),
        limit: req.query.limit,
        offset: req.query.offset,
      }),
    );
  },
);

app.get(
  "/api/admin/payments/webhooks",
  authMiddleware,
  adminMiddleware,
  (req, res) =>
    res.json(
      listWebhookEventsForAdmin({
        limit: req.query.limit,
        offset: req.query.offset,
      }),
    ),
);

/* ------------------------------------------------------------------ *
 * E. The transfer webhook
 *
 * Flutterwave authenticates a webhook with the secret hash it was configured
 * with, sent as the `verif-hash` header. There is no signature over the body, so
 * the header alone is only a "this came from our webhook URL" check - it is
 * necessary but NOT sufficient. Every transfer is therefore re-verified through
 * GET /transactions/{id}/verify before a kobo moves, and the paying account is
 * matched against our own rows. A fixed IP allowlist is deliberately NOT used.
 *
 * IMPORTANT: the body is parsed with express.json() like every other route. A
 * raw body would also work, but the secret-hash scheme needs no bytes-exact
 * access, and consistency avoids re-parsing bugs.
 * ------------------------------------------------------------------ */

app.post("/api/webhooks/flutterwave", async (req, res) => {
  const expectedHash = String(process.env.FLW_WEBHOOK_SECRET_HASH || "").trim();
  const providedHash = String(req.headers["verif-hash"] || "").trim();

  if (!expectedHash) {
    console.error(
      "[flutterwave] webhook received but FLW_WEBHOOK_SECRET_HASH is not set",
    );
    return fail(
      res,
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Webhook is not configured.",
    );
  }

  // Constant-time compare: a byte-by-byte early exit leaks the correct prefix.
  const a = Buffer.from(providedHash);
  const b = Buffer.from(expectedHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn("[flutterwave] webhook rejected: verif-hash mismatch");
    return fail(
      res,
      401,
      "INVALID_SIGNATURE",
      "Webhook signature could not be verified.",
    );
  }

  const payload = req.body && typeof req.body === "object" ? req.body : {};
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : {};
  const eventKey =
    String(payload["event.type"] || payload.event || payload.event_type || "") +
    ":" +
    String(payload.id ?? data.id ?? "");

  // Persist the delivery BEFORE doing any work. If processing then fails, the
  // retry is recognised; if the process dies, the row is a durable record that
  // this event arrived.
  const dedupeKey =
    eventKey.trim().replace(/:+$/, "") ||
    crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const { duplicate } = recordWebhookEvent({
    provider: "flutterwave",
    eventKey: dedupeKey,
    payload: {
      type: payload["event.type"] ?? payload.event ?? null,
      transactionId: data.id ?? null,
    },
  });
  if (duplicate) {
    const previous = getWebhookEvent(dedupeKey, "flutterwave");
    if (
      previous?.processed_at &&
      ["SUCCESS", "ALREADY_CREDITED"].includes(previous.outcome)
    ) {
      return res.json({ ok: true, duplicate: true });
    }
  }

  try {
    const outcome = await processTransferWebhook({ payload, data });
    markWebhookProcessed(dedupeKey, outcome.state, "flutterwave");
    if (outcome.state === "ERROR") {
      clearWebhookEvent(dedupeKey, "flutterwave");
      return fail(
        res,
        500,
        "WEBHOOK_PROCESSING_FAILED",
        "The deposit could not be processed yet.",
      );
    }
    return res.json({ ok: true, ...outcome });
  } catch (error) {
    // 500 makes Flutterwave retry; the event row is removed so the retry is
    // actually processed instead of being acknowledged as a duplicate.
    clearWebhookEvent(dedupeKey, "flutterwave");
    console.error(
      `[flutterwave] webhook ${dedupeKey} failed: ${error?.code || ""} ${error?.message || error}`,
    );
    return fail(
      res,
      500,
      "WEBHOOK_PROCESSING_FAILED",
      "The deposit could not be processed yet.",
    );
  }
});

/**
 * Turn one webhook into a decision. Returns `{ state, ... }` - never throws for
 * an expected outcome (unknown account, pending, failed), only for a real error
 * so the provider retries.
 */
async function processTransferWebhook({ payload, data }) {
  const transactionId = Number(data.id);
  if (!Number.isFinite(transactionId) || transactionId <= 0) {
    return { state: "IGNORED", ignored: "NO_TRANSACTION_ID" };
  }

  // A reversal or a refund of a deposit this wallet already received is money
  // leaving again; it is recorded for review and NEVER silently ignored.
  const kind = String(
    payload["event.type"] || payload.event || "",
  ).toLowerCase();
  if (/reverse|refund|reversal/.test(kind)) {
    const deposit = getDepositByTransactionId(transactionId);
    if (!deposit) return { state: "IGNORED", ignored: "UNKNOWN_DEPOSIT" };
    return { state: "REVERSAL_RECORDED", requiresReview: true, transactionId };
  }

  // Already credited? Answer without another provider round trip. The event key
  // is per delivery, so this also covers a provider re-sending "successful".
  const known = getDepositByTransactionId(transactionId);
  if (known?.creditedAt) {
    return { state: "ALREADY_CREDITED", transactionId };
  }

  // Verify with Flutterwave. The webhook body is a notification, not proof.
  let verified;
  try {
    verified = await verifyFlutterwaveTransaction(transactionId);
  } catch (error) {
    if (
      error?.code === "VERIFY_FAILED" ||
      error?.code === "INVALID_TRANSACTION_ID"
    ) {
      return { state: "UNVERIFIED", transactionId };
    }
    throw error;
  }
  if (Number(verified.id) !== transactionId) {
    return { state: "REVIEW", reason: "TRANSACTION_ID_MISMATCH", transactionId };
  }
  const eventTxRef = String(data.tx_ref || payload.tx_ref || "").trim();
  if (eventTxRef && verified.txRef && eventTxRef !== verified.txRef) {
    return { state: "REVIEW", reason: "TRANSACTION_REFERENCE_MISMATCH", transactionId };
  }

  // Who paid? The account number from the payload, then the customer email that
  // Flutterwave has for this transaction's customer.
  const accountNumber =
    extractVirtualAccountNumber(data) ||
    extractVirtualAccountNumber(payload) ||
    null;

  const account =
    findUserForDeposit({
      accountNumber,
      customerEmail: verified.customerEmail,
      txRef: verified.txRef,
    }) ?? (known ? getVirtualAccountForUser(known.userId) : null);

  if (!account) {
    // Money arrived that we cannot attribute. Never guess: leave it uncredited
    // and say so in the log. Nothing is credited from an unmatched transfer.
    console.warn(
      `[flutterwave] deposit ${transactionId} could not be matched to a Panda user (account ${accountNumber || "unknown"})`,
    );
    // `recordUnconfirmedDeposit` needs an owner to file a row against and there
    // is none, so this one is deliberately NOT stored: the log line above is the
    // durable record, and nothing may be fabricated to attach it to.
    return { state: "REVIEW", reason: "UNMATCHED_ACCOUNT", transactionId };
  }

  return settleVerifiedDeposit({ account, verified });
}

/**
 * The ONE place a verified Flutterwave transaction becomes wallet money.
 *
 * Every check happens before recordConfirmedDeposit(); any doubt leaves the
 * deposit uncredited and recorded as REVIEW with the reason.
 */
function settleVerifiedDeposit({ account, verified }) {
  const mode = flutterwaveMode();

  if (!account.accountNumber) {
    return { state: "REVIEW", reason: "ACCOUNT_NOT_READY" };
  }
  if (!verified.txRef || verified.txRef !== account.txRef) {
    recordUnconfirmedDeposit({
      account,
      mode,
      transactionId: verified.id,
      amount: verified.amount,
      currency: verified.currency,
      status: "REVIEW",
      providerStatus: verified.status,
      reason: "TRANSACTION_REFERENCE_MISMATCH",
    });
    return { state: "REVIEW", reason: "TRANSACTION_REFERENCE_MISMATCH" };
  }
  if (account.status !== "ACTIVE") {
    return { state: "REVIEW", reason: "ACCOUNT_NOT_ACTIVE" };
  }
  if (!assertDepositModeMatches(account, mode)) {
    // A test-mode account must never fund a live wallet.
    recordUnconfirmedDeposit({
      account,
      mode,
      transactionId: verified.id,
      amount: verified.amount,
      currency: verified.currency,
      status: "REVIEW",
      providerStatus: verified.status,
      reason: "MODE_MISMATCH",
    });
    return { state: "REVIEW", reason: "MODE_MISMATCH" };
  }

  const status = verified.status;
  const amount = verified.amount;

  if (status !== "successful") {
    const failed = /fail|cancel|declin|revers|error/.test(status);
    recordUnconfirmedDeposit({
      account,
      mode,
      transactionId: verified.id,
      amount,
      currency: verified.currency,
      status: failed ? "FAILED" : "PENDING",
      providerStatus: status,
      reason: null,
      payerName: verified.customerName,
      narration: verified.processorResponse,
    });
    return { state: failed ? "FAILED" : "PENDING", transactionId: verified.id };
  }

  if (!verified.txRef || !/bank.?transfer/i.test(verified.paymentType || "")) {
    recordUnconfirmedDeposit({
      account,
      mode,
      transactionId: verified.id,
      amount,
      currency: verified.currency,
      status: "REVIEW",
      providerStatus: status,
      reason: !verified.txRef ? "REFERENCE_MISSING" : "PAYMENT_METHOD_MISMATCH",
      payerName: verified.customerName,
      narration: verified.processorResponse,
    });
    return {
      state: "REVIEW",
      reason: !verified.txRef ? "REFERENCE_MISSING" : "PAYMENT_METHOD_MISMATCH",
    };
  }

  if (
    String(verified.currency || "").toUpperCase() !==
    account.currency.toUpperCase()
  ) {
    recordUnconfirmedDeposit({
      account,
      mode,
      transactionId: verified.id,
      amount,
      currency: verified.currency,
      status: "REVIEW",
      providerStatus: status,
      reason: "CURRENCY_MISMATCH",
    });
    return { state: "REVIEW", reason: "CURRENCY_MISMATCH" };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    recordUnconfirmedDeposit({
      account,
      mode,
      transactionId: verified.id,
      amount: null,
      currency: verified.currency,
      status: "REVIEW",
      providerStatus: status,
      reason: "AMOUNT_INVALID",
    });
    return { state: "REVIEW", reason: "AMOUNT_INVALID" };
  }

  // Overpayments and underpayments are REAL money against a named account with
  // no amount to match against, so the customer is credited exactly what
  // Flutterwave confirms - never a guessed or capped figure. The case is logged
  // so an operator can see it happened if a dispute arises.
  if (amount >= DEPOSIT_LIMITS.maximum) {
    console.warn(
      `[flutterwave] deposit ${verified.id} for ${account.userId} is ₦${amount} (max expected ₦${DEPOSIT_LIMITS.maximum})`,
    );
  }

  const result = recordConfirmedDeposit({
    account,
    mode,
    transactionId: verified.id,
    amount,
    currency: verified.currency,
    providerStatus: status,
    txRef: verified.txRef || "",
    flwRef: verified.flwRef,
    payerName: verified.customerName,
    narration: verified.processorResponse,
  });

  if (!result.ok) {
    return { state: "REVIEW", reason: result.reason };
  }

  if (!result.alreadyApplied && result.balance !== null) {
    appendUserTransaction(account.userId, {
      id: `deposit-${verified.id}`,
      type: "deposit",
      title: "Bank transfer deposit",
      amount: result.deposit.amount,
      status: "SUCCESSFUL",
      path: "/deposit",
      reference: `flw:${verified.id}`,
      date: formatTransactionDate(new Date()),
      createdAt: Date.now(),
    });
  }

  return {
    state: "SUCCESS",
    transactionId: verified.id,
    amount: result.deposit.amount,
    alreadyApplied: result.alreadyApplied,
  };
}

/**
 * C. Wallet balance - the authoritative figure, read from the database.
 * (Declared above this block; kept here as the contract the Deposit page uses.)
 *
 * Reconciliation endpoint for the operator: retries every deposit that is
 * recorded but NOT credited. It walks only rows we already know, so a lost or
 * failed webhook can be repaired without touching anything else.
 */
app.post(
  "/api/health/flutterwave/reconcile",
  authMiddleware,
  async (req, res) => {
    // Admin-only: gated on the same operator secret the ledger check uses, plus a
    // signed-in session, so this is never a public "credit me" button.
    const expected = String(process.env.ADMIN_RECONCILE_TOKEN || "").trim();
    const provided = String(req.headers["x-reconcile-token"] || "").trim();
    if (!expected || provided !== expected) {
      return fail(res, 403, "FORBIDDEN", "This endpoint is not available.");
    }

    const pending = listUncreditedDeposits({ limit: 50 });
    const outcomes = [];
    for (const deposit of pending) {
      try {
        // A row is only ever filed against a user, so a missing account row means
        // the row is orphaned, not that the customer has no account.
        const account = getVirtualAccountForUser(deposit.userId);
        if (!account) {
          outcomes.push({ deposit: deposit.transactionId, state: "NO_ACCOUNT" });
          continue;
        }
        const verified = await verifyFlutterwaveTransaction(
          deposit.transactionId,
        );
        outcomes.push({
          deposit: deposit.transactionId,
          ...settleVerifiedDeposit({ account, verified }),
        });
      } catch (error) {
        // One unreachable provider call must not abort the whole sweep, and the
        // code is what tells an operator whether a retry can help.
        outcomes.push({
          deposit: deposit.transactionId,
          state: "ERROR",
          code: error?.code,
        });
      }
    }

    return res.json({ checked: pending.length, outcomes });
  },
);

/**
 * Reconciliation: does every stored balance still equal its own ledger?
 * Read-only and operator-facing; it never changes money.
 */
app.get("/api/health/ledger", (req, res) => {
  const rows = db
    .prepare("SELECT id, wallet_balance FROM users")
    .all();

  const mismatches = [];
  for (const row of rows) {
    const computed = ledgerBalance(row.id);
    if (Math.abs(computed.balance - Number(row.wallet_balance)) > 0.01) {
      // Accounts that predate the ledger have history stored only in the old
      // JSON column. They are reported, never "corrected" silently.
      mismatches.push({
        userId: row.id,
        storedBalance: Number(row.wallet_balance),
        ledgerBalance: computed.balance,
      });
    }
  }

  return res.json({
    checked: rows.length,
    mismatches: mismatches.length,
    // No balances, emails or hashes are exposed - only counts and ids.
    details: req.query.verbose === "1" ? mismatches.slice(0, 50) : undefined,
  });
});

app.post("/api/auth/logout", authMiddleware, (req, res) => {
  deleteSessionByToken(req.token);
  return res.json({ ok: true, message: "Logged out successfully." });
});

/* ------------------------------------------------------------------ *
 * Numbers: purchase, list and verification-code polling.
 *
 * A number and the SMS it receives are server-owned facts. The provider API
 * key never leaves this process, the balance is debited here (not in the
 * browser), and a purchase is only recorded once the provider has actually
 * issued a real number. Nothing on this path fabricates a number or a code.
 * ------------------------------------------------------------------ */

function formatTransactionDate(date = new Date()) {
  return `${date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

/**
 * Find one catalogue variant and its provider COST.
 *
 * `variantId` is optional: without it the cheapest in-stock variant for the
 * service in that country is used, matching the first offer the Buy page shows.
 *
 * @returns {{cost:number, variantId:string, count:number}|null}
 */
function findCatalogueVariant(payload, countrySlug, serviceId, variantId) {
  const services = payload?.[countrySlug]?.[serviceId];
  if (!services || typeof services !== "object") return null;

  const entries = Object.entries(services)
    .filter(([, info]) => info && typeof info === "object")
    .map(([id, info]) => ({ variantId: id, ...info }));

  if (variantId) {
    const match = entries.find((entry) => entry.variantId === variantId);
    if (!match) return null;
    const cost = Number(match.cost);
    const count = Number(match.count);
    return Number.isFinite(cost) && cost > 0
      ? { cost, variantId, count: Number.isFinite(count) ? count : 0 }
      : null;
  }

  const inStock = entries
    .filter((entry) => Number(entry.count) > 0 && Number(entry.cost) > 0)
    .sort((left, right) => Number(left.cost) - Number(right.cost));
  if (inStock.length === 0) return null;

  return {
    cost: Number(inStock[0].cost),
    variantId: inStock[0].variantId,
    count: Number(inStock[0].count),
  };
}

/**
 * Resolve the price to charge for one variant, from the provider catalogue and
 * server/pricing.js - never from the request body.
 *
 * The browser's `price` is only compared against the result (PRICE_CHANGED) so
 * a user can neither underpay nor be surprised by a new price. A variant whose
 * cost leaves no profit is refused by name, with the actual cost, instead of
 * silently charging a different amount.
 */
async function quotePurchasePrice({
  countrySlug,
  serviceId,
  variantId,
  providerService,
}) {
  let payload = pricesCache.payload;
  if (
    payload === null ||
    Date.now() - pricesCache.fetchedAt >= PRICES_CACHE_TTL_MS
  ) {
    try {
      payload = await loadPrices();
    } catch {
      // A stale catalogue still gives a real (if possibly old) price. Only an
      // empty cache is fatal, and that is reported as "unavailable" below.
      payload = pricesCache.payload;
    }
  }

  if (!payload) {
    return {
      error: {
        status: 503,
        code: "PRICES_UNAVAILABLE",
        message:
          "Prices are temporarily unavailable. Please try again in a moment.",
      },
    };
  }

  // Variants live under the card's CATALOGUE service: "gmail" is sold from the
  // google_* variants because ACC has no gmail entry, so looking up the body's
  // id directly would report every Gmail offer as unavailable.
  const catalogueService = resolveCatalogueService(serviceId) || serviceId;
  const variant = findCatalogueVariant(
    payload,
    countrySlug,
    catalogueService,
    variantId,
  );
  if (!variant) {
    return {
      error: {
        status: 409,
        code: "OFFER_UNAVAILABLE",
        message:
          "That offer is no longer available. Please go back and choose again.",
      },
    };
  }

  const priced = priceVariant({
    cost: variant.cost,
    serviceId,
    variantId: variant.variantId,
  });
  if (!priced) {
    return {
      error: {
        status: 409,
        code: "OFFER_UNAVAILABLE",
        message:
          "That offer has no usable price right now. Please choose another.",
      },
    };
  }

  // Profit = price - provider cost - fees. A sale that does not reach the
  // configured minimum profit is refused LOUDLY (and reported on
  // /api/prices/audit) rather than being sold at a loss or re-priced silently.
  if (priced.status === "below-min-profit") {
    console.warn(
      `[pricing] refusing purchase: ${serviceId}/${variant.variantId} in ${countrySlug} ` +
        `costs ?${priced.cost} but would sell at ?${priced.price} (profit ?${priced.profit}).`,
    );
    return {
      error: {
        status: 409,
        code: "PRICE_NOT_PROFITABLE",
        message:
          `This number can no longer be sold: the provider now charges ?${priced.cost.toLocaleString()}. ` +
          "Please choose another service.",
      },
    };
  }

  // The provider may not know the mapped service code at all. Checking here
  // costs nothing (the stock payload is already cached upstream) and replaces
  // a confusing NO_NUMBERS after the balance check with a clear answer.
  if (providerService) {
    const offered = await providerOffersService(countrySlug, providerService);
    if (offered === false) {
      return {
        error: {
          status: 409,
          code: "SERVICE_NOT_AVAILABLE",
          message:
            "The provider does not offer this service for that country yet. Please choose another.",
        },
      };
    }
  }

  return { price: priced.price, variant, priced };
}

/**
 * Does the provider's stock payload for this country contain a variant of this
 * service code? `true` / `false` when the payload was readable, `null` when it
 * could not be checked (in which case the purchase is NOT blocked: the provider
 * still has the final say).
 */
async function providerOffersService(countrySlug, providerService) {
  const code = String(providerService || "").toLowerCase();
  if (!code) return null;

  const iso = (() => {
    try {
      return resolveProviderCountry(countrySlug);
    } catch {
      return countrySlug;
    }
  })();
  if (!iso) return null;

  try {
    const stock = await getYankeeNumbersStatus(iso);
    const keys = Object.keys(stock || {});
    if (keys.length === 0) return null;
    return keys.some((key) => {
      const base = key.toLowerCase().replace(/_\d+$/, "");
      return base === code || base.startsWith(`${code}_`);
    });
  } catch {
    return null;
  }
}

// A purchase is not idempotent upstream, so two requests carrying the same
// Idempotency-Key (a double click, or a retry after a dropped response) must not
// buy two numbers. The first request owns the key; the others wait for its
// outcome and are then answered with the same result.
const purchaseInflight = new Map();
const PURCHASE_DEDUPE_MS = 5 * 60 * 1000;

function prunePurchaseInflight() {
  const cutoff = Date.now() - PURCHASE_DEDUPE_MS;
  for (const [key, entry] of purchaseInflight) {
    if (entry.settledAt && entry.settledAt < cutoff) purchaseInflight.delete(key);
  }
}

app.get("/api/numbers", authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({ numbers: user?.numbers ?? [] });
});

app.get("/api/transactions", authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({ transactions: user?.transactions ?? [] });
});

/**
 * Debit the wallet and record a number the provider has ALREADY issued.
 *
 * Called only after a real allocation, so every failure before this point costs
 * the user nothing, and this function has no early returns that could leave the
 * provider's number unrecorded.
 */
function recordPurchase({
  userId,
  allocation,
  idempotencyKey,
  chargePrice,
  providerCost,
  countryCode,
  countrySlug,
  countryName,
  serviceId,
  serviceName,
  mapping,
  variantId,
}) {
  const now = new Date();
  const displayService = serviceName || mapping.displayName || serviceId;
  // Audit trail: what the number cost us vs. what was charged. Kept on the
  // user's own record (no provider cost is ever sent to a different user).
  const margin =
    Number.isFinite(Number(providerCost)) && Number(providerCost) > 0
      ? chargePrice - Number(providerCost)
      : null;

  const purchasedNumber = {
    id: allocation.activationId,
    number: allocation.phone,
    countryCode: countryCode.toLowerCase(),
    countrySlug,
    countryName: countryName || countryCode.toUpperCase(),
    service: displayService,
    serviceId,
    variantId,
    providerService: mapping.providerService,
    price: `?${chargePrice.toLocaleString()}`,
    priceValue: chargePrice,
    providerCost: margin === null ? null : Number(providerCost),
    profit: margin,
    orderId: allocation.activationId,
    status: "WAITING",
    // Set when the provider stops listening for this activation.
    closedReason: null,
    code: null,
    codeReceived: false,
    receivedAt: null,
    dateStr: formatTransactionDate(now),
    createdAt: now.toISOString(),
  };

  const transaction = {
    id: `purchase-${allocation.activationId}`,
    type: "purchase",
    title: `${displayService} number ${allocation.phone}`,
    amount: -chargePrice,
    status: "SUCCESSFUL",
    path: "/my-numbers",
    reference: allocation.activationId,
    date: purchasedNumber.dateStr,
    createdAt: now.getTime(),
  };

  // The debit is the authoritative one. `baseBalance` was read BEFORE the
  // provider call, so it could be stale if another purchase settled meanwhile -
  // debitWallet() re-reads and subtracts in a single statement that refuses to
  // go below zero. That is what makes three simultaneous purchases safe.
  const debit = debitWallet({
    userId,
    amount: chargePrice,
    reason: LEDGER_REASONS.PURCHASE,
    reference: allocation.activationId,
    metadata: {
      serviceId,
      countrySlug,
      variantId,
      providerService: mapping.providerService,
      providerCost: margin === null ? null : Number(providerCost),
    },
  });

  // The number EXISTS upstream by now, so it must be recorded even if the debit
  // was refused for insufficient funds: otherwise the user paid nothing and the
  // number is lost, and support has no record of it. `insufficientFunds` marks
  // exactly that case for reconciliation instead of silently pretending it was
  // free.
  const storedNumber = debit.ok
    ? purchasedNumber
    : {
        ...purchasedNumber,
        unpaid: true,
        paymentStatus: "INSUFFICIENT_FUNDS",
      };

  appendUserNumber(userId, storedNumber);
  const updatedUser = debit.ok
    ? appendUserTransaction(userId, transaction)
    : getUserById(userId);

  const body = {
    number: storedNumber,
    balance: Number(debit.balance),
    transaction: debit.ok ? transaction : null,
    user: safeUser(updatedUser),
    insufficientFunds: !debit.ok,
  };

  if (idempotencyKey) {
    const entry = purchaseInflight.get(`${userId}:${idempotencyKey}`);
    if (entry) entry.resolve(201, body);
  }

  return body;
}

app.post("/api/numbers/purchase", authMiddleware, async (req, res) => {
  const serviceId = String(
    req.body?.serviceId ?? req.body?.service ?? "",
  ).trim();
  const countryCode = String(
    req.body?.countryCode ?? req.body?.country ?? "",
  ).trim();
  // The catalogue's country slug (e.g. "nigeria") locates the entry whose price
  // is charged. It normally matches countryCode, but the catalogue has its own
  // keying, so the client sends it explicitly.
  const countrySlug =
    String(req.body?.countrySlug ?? "").trim() || countryCode.toLowerCase();
  // Which catalogue variant (price tier) the user chose, e.g. "virtual34".
  const variantId = String(req.body?.variantId ?? "").trim();
  const serviceName = String(req.body?.serviceName ?? "").trim();
  const countryName = String(req.body?.countryName ?? "").trim();

  // The body's price is OPTIONAL. It is display-only: the charge always comes
  // from quotePurchasePrice() below, never from the browser. Requiring it turned
  // a perfectly valid request (any API client that omits a display hint) into
  // "A valid price is required to buy a number." even though the server had
  // already looked up the real price. A malformed value is still refused, so a
  // NaN can never reach the comparison further down.
  const rawPrice = req.body?.price;
  const hasClientPrice =
    rawPrice !== undefined && rawPrice !== null && rawPrice !== "";
  const price = hasClientPrice ? Number(rawPrice) : 0;

  if (!serviceId || !countryCode) {
    return fail(
      res,
      400,
      "INVALID_INPUT",
      "A service and a country are required to buy a number.",
    );
  }

  if (hasClientPrice && (!Number.isFinite(price) || price <= 0)) {
    return fail(
      res,
      400,
      "INVALID_PRICE",
      "The price sent with this request is not valid.",
    );
  }

  if (!API_KEY) {
    return fail(
      res,
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Add YANKEE_API_KEY to configure number purchases.",
    );
  }

  // The provider issues numbers under its OWN service codes. Refuse rather than
  // guess when we do not know the mapping - a guessed code would return a number
  // for the wrong service.
  const mapping = resolveProviderService(serviceId);
  if (!mapping) {
    const blocked = getBlockedReason(serviceId);
    return fail(
      res,
      400,
      "SERVICE_NOT_SUPPORTED",
      blocked ||
        `The provider does not have a verified mapping for "${serviceId}", so a number cannot be issued for it yet.`,
    );
  }

  // A service without a configured tier has no selling price; never fall back
  // to the provider cost for it.
  if (!resolveTierKey(serviceId, variantId)) {
    return fail(
      res,
      400,
      "SERVICE_NOT_PRICED",
      getBlockedReason(serviceId) ||
        `"${serviceId}" does not have a selling price configured, so it cannot be bought yet.`,
    );
  }

  // The charge comes from the provider catalogue + our price tiers, NEVER from
  // the body.
  const quote = await quotePurchasePrice({
    countrySlug,
    serviceId,
    variantId,
    providerService: mapping.providerService,
  });
  if (quote.error) {
    return fail(
      res,
      quote.error.status,
      quote.error.code,
      quote.error.message,
    );
  }
  // Every figure the customer sees comes from this quote: the debit below uses
  // chargePrice (never the body), and it is the same number GET /api/prices
  // attaches to the variant.
  const chargePrice = quote.price;
  const providerCost = quote.priced.cost;

  // A page still showing a different figure must be corrected before anything
  // is bought or charged. Only compares when a price was actually sent.
  if (hasClientPrice && price !== chargePrice) {
    return fail(
      res,
      409,
      "PRICE_CHANGED",
      `The price for this number has changed to ?${chargePrice.toLocaleString()}. Please review and confirm again.`,
    );
  }

  // ---- Idempotency -------------------------------------------------------
  // A purchase is not idempotent upstream, so a double click or a retry after a
  // dropped response must never buy a second number. The first request owns the
  // key; later ones wait for its outcome and replay the same answer.
  const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
  const key = idempotencyKey ? `${req.user.id}:${idempotencyKey}` : "";

  if (key) {
    prunePurchaseInflight();
    const existing = purchaseInflight.get(key);
    if (existing) {
      const settled = await existing.promise.catch(() => null);
      if (settled) return res.status(settled.status).json(settled.body);
      return fail(
        res,
        409,
        "PURCHASE_IN_PROGRESS",
        "This purchase is still being processed. Check My numbers before trying again.",
      );
    }
  }

  let settleKey = null;
  if (key) {
    let settle;
    const entry = {
      settledAt: 0,
      promise: new Promise((resolve) => {
        settle = resolve;
      }),
      resolve: (status, body) => {
        entry.settledAt = Date.now();
        settle({ status, body });
      },
    };
    settleKey = entry.resolve;
    purchaseInflight.set(key, entry);
  }

  // Any exit before a number is recorded settles the key with that failure, so
  // the user's genuine retry (with the same key) is not blocked by a ghost.
  const failPurchase = (status, code, message) => {
    if (settleKey) settleKey(status, { error: code, message });
    return fail(res, status, code, message);
  };

  // Balance is checked here, on the server, before we spend anything upstream.
  // This is an early, friendly refusal only - the REAL guarantee is the atomic
  // debit inside recordPurchase(), which cannot overdraw even when several
  // purchases for this user are in flight at the same time.
  const user = getUserById(req.user.id);
  const currentBalance = Number(user?.walletBalance || 0);
  if (currentBalance < chargePrice) {
    return failPurchase(
      402,
      "INSUFFICIENT_FUNDS",
      "Your wallet balance is not enough to complete this purchase.",
    );
  }

  // Ask the provider for a REAL number. If this fails, no money moves.
  let allocation;
  try {
    allocation = await requestYankeeNumber(
      mapping.providerService,
      countryCode,
    );
  } catch (error) {
    const code = String(error?.code || error?.message || "PROVIDER_ERROR");
    const messages = {
      NO_NUMBERS:
        "No numbers are available for this service and country right now.",
      NO_BALANCE:
        "The provider account is out of credit, so numbers cannot be issued.",
      BAD_KEY: "The provider API key is invalid or inactive.",
      WRONG_SERVICE: "The provider does not offer this service.",
      WRONG_COUNTRY: "The provider does not offer this country.",
      PROVIDER_TIMEOUT: "The provider timed out. Please try again.",
      PROVIDER_NOT_CONFIGURED:
        "Add YANKEE_API_KEY to configure number purchases.",
    };
    return failPurchase(
      error?.name === "TimeoutError" ? 504 : 502,
      code,
      messages[code] ||
        "The provider could not issue a number right now. Please try again.",
    );
  }

  // The provider committed a number: debit and record. From here the number
  // exists upstream, so this work must not be skipped.
  const body = recordPurchase({
    userId: req.user.id,
    allocation,
    idempotencyKey,
    chargePrice,
    providerCost,
    baseBalance: currentBalance,
    countryCode,
    countrySlug,
    countryName,
    serviceId,
    serviceName,
    mapping,
    variantId: quote.variant.variantId,
  });

  // A number WAS issued, but the wallet could not cover it (another purchase
  // settled first). Answer 402 so the client shows a payment problem instead of
  // a green "number purchased", while the number stays recorded for support.
  return res.status(body.insufficientFunds ? 402 : 201).json(body);
});

// How long WE wait for the SMS before telling the user the number expired. The
// provider expires activations on its own schedule; this only bounds the
// waiting UI so it cannot spin forever on a number nobody will text.
const ACTIVATION_WAIT_MINUTES = Number(process.env.ACTIVATION_WAIT_MINUTES) || 20;

/**
 * Check one purchased number's activation at the provider.
 *
 * This is a READ. It never charges, and it never changes the activation at the
 * provider - releasing a finished activation is done once, in finalizeNumber.
 */
app.post("/api/numbers/:id/verify", authMiddleware, async (req, res) => {
  const activationId = String(req.params.id || "").trim();
  if (!activationId) {
    return fail(res, 400, "INVALID_INPUT", "A number id is required.");
  }

  const user = getUserById(req.user.id);
  const record = (user?.numbers ?? []).find(
    (entry) => entry.id === activationId,
  );
  if (!record) {
    return fail(
      res,
      404,
      "NUMBER_NOT_FOUND",
      "That number does not belong to your account.",
    );
  }

  // A stored code is final: return it without calling the provider again. The
  // provider has already been released for it, so polling it would only fail.
  if (record.code) {
    return res.json({
      status: "CODE_RECEIVED",
      code: record.code,
      receivedAt: record.receivedAt || null,
    });
  }

  // Closed records (cancelled/expired) carry no further ticks.
  if (record.status === "CANCELLED" || record.status === "EXPIRED") {
    return res.json({
      status: record.status,
      code: null,
      receivedAt: null,
    });
  }

  if (!API_KEY) {
    return fail(
      res,
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Add YANKEE_API_KEY to fetch verification codes.",
    );
  }

  let status;
  try {
    status = await getYankeeActivationStatus(activationId);
  } catch (error) {
    const code = String(error?.code || error?.message || "PROVIDER_ERROR");
    const status5xx = error?.name === "TimeoutError" ? 504 : 502;

    // The provider no longer knows this activation, so no SMS can arrive on it.
    // Report a terminal state instead of a retryable error that would leave the
    // user polling a dead number.
    if (code === "NO_ACTIVATION") {
      const patch = { status: "EXPIRED", closedReason: "NO_ACTIVATION" };
      updateUserNumber(user.id, activationId, patch);
      return res.json({ status: "EXPIRED", code: null, receivedAt: null });
    }

    return fail(
      res,
      status5xx,
      code,
      code === "PROVIDER_TIMEOUT"
        ? "The provider timed out. Please try again."
        : "Could not reach the verification provider. Please try again.",
    );
  }

  if (status.status === "CODE_RECEIVED" && status.code) {
    const receivedAt = new Date().toISOString();
    updateUserNumber(user.id, activationId, {
      status: "CODE_RECEIVED",
      code: status.code,
      codeReceived: true,
      receivedAt,
    });
    return res.json({
      status: "CODE_RECEIVED",
      code: status.code,
      receivedAt,
    });
  }

  // Everything the provider says that is not a waiting state means it has
  // stopped listening on this activation.
  const terminal = {
    STATUS_CANCEL: "CANCELLED",
    CANCELLED: "CANCELLED",
    STATUS_EXPIRED: "EXPIRED",
    EXPIRED: "EXPIRED",
    STATUS_FINISH: "COMPLETED",
    STATUS_FINISHED: "COMPLETED",
    FINISHED: "COMPLETED",
    STATUS_USED: "COMPLETED",
  }[status.status];

  if (terminal) {
    updateUserNumber(user.id, activationId, {
      status: terminal,
      closedReason: status.status,
    });
    return res.json({ status: terminal, code: null, receivedAt: null });
  }

  // An unrecognised provider answer is a waiting state, not a failure: throwing
  // here would stop the poll and show an error for a number that may still
  // receive its SMS.
  const isWaiting =
    status.status === "WAITING" || /^STATUS_(WAIT|WAITING)/.test(status.status);
  if (!isWaiting) {
    return res.json({ status: "WAITING", code: null, receivedAt: null });
  }

  // We stop waiting after our own timeout even if the provider still says
  // WAITING, so the UI can offer a new number instead of spinning forever.
  const startedAt = new Date(record.createdAt || 0).getTime();
  const waitedMs = Number.isFinite(startedAt)
    ? Date.now() - startedAt
    : ACTIVATION_WAIT_MINUTES * 60 * 1000;
  if (waitedMs > ACTIVATION_WAIT_MINUTES * 60 * 1000) {
    updateUserNumber(user.id, activationId, {
      status: "EXPIRED",
      closedReason: "WAIT_TIMEOUT",
    });
    return res.json({ status: "EXPIRED", code: null, receivedAt: null });
  }

  return res.json({ status: "WAITING", code: null, receivedAt: null });
});

app.post("/api/numbers/:id/cancel", authMiddleware, async (req, res) => {
  const activationId = String(req.params.id || "").trim();
  const user = getUserById(req.user.id);
  const record = (user?.numbers ?? []).find(
    (entry) => entry.id === activationId,
  );
  if (!record) {
    return fail(
      res,
      404,
      "NUMBER_NOT_FOUND",
      "That number does not belong to your account.",
    );
  }

  if (record.status === "CANCELLED") {
    return res.json({ ok: true, status: "CANCELLED", alreadyClosed: true });
  }

  if (!API_KEY) {
    return fail(
      res,
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Add YANKEE_API_KEY to cancel activations.",
    );
  }

  // A code that already arrived means the number was used, so there is nothing
  // to refund and nothing left to cancel.
  if (record.code) {
    return fail(
      res,
      409,
      "CODE_ALREADY_RECEIVED",
      "This number already received its verification code, so it cannot be cancelled.",
    );
  }

  let confirmation;
  try {
    confirmation = await setYankeeActivationStatus(activationId, 8);
  } catch (error) {
    const code = String(error?.code || error?.message || "PROVIDER_ERROR");
    return fail(
      res,
      error?.name === "TimeoutError" ? 504 : 502,
      code,
      "The provider refused the cancellation. Please try again.",
    );
  }

  // The provider answers ACCESS_CANCEL when it accepted the release (and
  // refunded its own balance). Anything else is a refusal we must not dress up
  // as a successful cancellation.
  if (!String(confirmation || "").startsWith("ACCESS_CANCEL")) {
    return fail(
      res,
      502,
      String(confirmation || "PROVIDER_REFUSED"),
      "The provider refused the cancellation. Please try again.",
    );
  }

  const cancelledAt = new Date().toISOString();
  const charged = Number(record.priceValue ?? 0);

  // The provider accepted the release and refunded ITS OWN balance, so the
  // customer is refunded the exact amount they were charged for this number
  // (the recorded priceValue, not today's catalogue price).
  //
  // creditWallet() - not a balance overwrite - because it writes the ledger row
  // in the same transaction and is keyed on (user, reference "refund:<id>",
  // reason), so a repeated release can never refund twice. It also removes the
  // old read-then-write: a number purchase committing in between would have been
  // erased by writing back a stale `existingBalance + charged`.
  if (Number.isFinite(charged) && charged > 0) {
    creditWallet({
      userId: user.id,
      amount: charged,
      reason: LEDGER_REASONS.REFUND,
      reference: `refund:${activationId}`,
      metadata: { activationId, service: record.service || null },
    });
  }

  if (Number.isFinite(charged) && charged > 0) {
    appendUserTransaction(user.id, {
      id: `refund-${activationId}`,
      type: "refund",
      title: `Refund - ${record.service || "Number"} ${record.number || ""}`.trim(),
      amount: charged,
      status: "SUCCESSFUL",
      path: "/my-numbers",
      reference: activationId,
      date: formatTransactionDate(new Date(cancelledAt)),
      createdAt: Date.now(),
    });
  }

  const updated = updateUserNumber(user.id, activationId, {
    status: "CANCELLED",
    closedReason: "CANCELLED",
    cancelledAt,
    refundedAmount: Number.isFinite(charged) ? charged : 0,
  });

  // The balance is read back AFTER the credit: the refund above is the only
  // change, so this figure is the authoritative post-refund wallet.
  return res.json({
    ok: true,
    status: "CANCELLED",
    refunded: Number.isFinite(charged) ? charged : 0,
    balance: Number(
      updated?.walletBalance ?? getUserById(user.id)?.walletBalance ?? 0,
    ),
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const key = rateLimitKey(req.ip, email);

  if (applyRateLimit(resetRateMap, key, 5, 60_000)) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many password reset requests. Please try again later.",
    );
  }

  if (!validateEmail(email)) {
    return fail(
      res,
      400,
      "INVALID_EMAIL",
      "Please enter a valid email address.",
    );
  }

  const user = getUserByEmail(email);

  // Same answer whether or not the address is registered. Returning "no such
  // account" would let anyone test which emails have a Panda Number account.
  const genericResponse = () =>
    res.json({
      message:
        "If an account exists for this email, a verification code has been sent.",
    });

  if (!user) return genericResponse();

  // Six digits from the CSPRNG. crypto.randomInt is uniform, unlike
  // Math.random()-based codes, and the value is never logged or returned.
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(
    Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  createPasswordResetCode({ userId: user.id, codeHash, expiresAt });

  // The email is the only place the code appears. If delivery fails the user is
  // told the generic message and can request a new code; the failure is logged
  // server-side only, so an SMTP outage cannot confirm which emails exist.
  await sendPasswordResetEmail(email, code);

  return genericResponse();
});

/**
 * Step C - check the six-digit code.
 *
 * On success a SHORT-LIVED SINGLE-USE TOKEN is issued. The code itself is then
 * spent: knowing six digits must not be permanent permission to set a new
 * password, and the token can be invalidated the moment it is used.
 */
app.post("/api/auth/verify-reset-code", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const code = String(req.body.code || "").trim();
  const key = `verify:${rateLimitKey(req.ip, email)}`;

  if (applyRateLimit(resetCodeVerifyRateMap, key, 10, 60_000)) {
    return fail(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many code attempts. Please wait a minute and try again.",
    );
  }

  if (!validateEmail(email)) {
    return fail(
      res,
      400,
      "INVALID_EMAIL",
      "Please enter a valid email address.",
    );
  }

  if (!/^\d{6}$/.test(code)) {
    return fail(
      res,
      400,
      "INVALID_CODE",
      "Reset code must be a 6-digit number.",
    );
  }

  // Deliberately the same message for "unknown email" and "no code": the
  // caller already knows the address they typed, and a different answer would
  // reveal whether it is registered.
  const invalidCode = () =>
    fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect or has expired.",
    );

  const user = getUserByEmail(email);
  if (!user) return invalidCode();

  const resetRecord = getLatestPasswordResetCode(user.id);
  if (!resetRecord) return invalidCode();

  if (resetRecord.used_at) {
    return fail(
      res,
      400,
      "CODE_ALREADY_USED",
      "This reset code has already been used. Request a new one.",
    );
  }

  if (resetRecord.verified_at) {
    return fail(
      res,
      400,
      "CODE_ALREADY_USED",
      "This reset code has already been verified. Request a new one.",
    );
  }

  if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
    return fail(
      res,
      400,
      "CODE_EXPIRED",
      "This reset code has expired. Please request a new one.",
    );
  }

  if (Number(resetRecord.attempts || 0) >= 5) {
    return fail(
      res,
      400,
      "CODE_LOCKED",
      "Too many failed attempts. Please request a new code.",
    );
  }

  const isValid = await bcrypt.compare(code, resetRecord.code_hash);
  if (!isValid) {
    incrementPasswordResetAttempts(resetRecord.id);
    return fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect or has expired.",
    );
  }

  // 15 minutes is enough to type a new password, and short enough that a leaked
  // token is of little use.
  const resetToken = generateToken();
  const tokenRecord = createPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(resetToken),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  markPasswordResetCodeVerified(resetRecord.id, tokenRecord.id);

  return res.json({
    valid: true,
    // Handed to the browser ONCE, and only after a correct code. It is stored
    // hashed, so the value in the database cannot be used to reset anything.
    resetToken,
    message: "Reset code verified successfully.",
  });
});

/**
 * Steps D + E - set the new password.
 *
 * Authentication here is the reset TOKEN, never the six-digit code: the code
 * was already exchanged for the token in verify-reset-code.
 *
 * Accepts either:
 *   { resetToken, newPassword }
 *   { email, code, newPassword }   (verified server-side in one step)
 * The second form exists so a client that skipped the explicit verify step
 * still cannot change a password with only a code - the code is checked here,
 * spent, and exchanged for the same one-time path.
 */
app.post("/api/auth/reset-password", async (req, res) => {
  const resetToken = String(req.body.resetToken || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const code = String(req.body.code || "").trim();
  const newPassword = String(req.body.newPassword || "");

  if (!validatePassword(newPassword)) {
    return fail(
      res,
      400,
      "WEAK_PASSWORD",
      "Password must contain uppercase, lowercase, number and special character.",
    );
  }

  if (!resetToken && (!email || !code)) {
    return fail(
      res,
      400,
      "INVALID_REQUEST",
      "A verification session is required. Please verify your code again.",
    );
  }

  // ---- Path 1: the token from verify-reset-code -------------------------
  if (resetToken) {
    const record = getPasswordResetTokenByHash(hashToken(resetToken));

    if (!record) {
      return fail(
        res,
        400,
        "INVALID_TOKEN",
        "This reset link is not valid. Please start again.",
      );
    }

    if (record.used_at) {
      return fail(
        res,
        400,
        "TOKEN_ALREADY_USED",
        "This reset session has already been used. Please start again.",
      );
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return fail(
        res,
        400,
        "TOKEN_EXPIRED",
        "This reset session has expired. Please request a new code.",
      );
    }

    const user = getUserById(record.user_id);
    if (!user) {
      return fail(
        res,
        400,
        "INVALID_TOKEN",
        "This reset link is not valid. Please start again.",
      );
    }

    return applyNewPassword(res, user, newPassword, record.id);
  }

  // ---- Path 2: email + code, verified here ------------------------------
  if (!validateEmail(email) || !/^\d{6}$/.test(code)) {
    return fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect or has expired.",
    );
  }

  const user = getUserByEmail(email);
  if (!user) {
    return fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect or has expired.",
    );
  }

  const resetRecord = getLatestPasswordResetCode(user.id);
  if (!resetRecord || resetRecord.used_at) {
    return fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect or has expired.",
    );
  }

  if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
    return fail(
      res,
      400,
      "CODE_EXPIRED",
      "This reset code has expired. Please request a new one.",
    );
  }

  if (Number(resetRecord.attempts || 0) >= 5) {
    return fail(
      res,
      400,
      "CODE_LOCKED",
      "Too many failed attempts. Please request a new code.",
    );
  }

  // A code already exchanged for a token may not be replayed here.
  if (resetRecord.verified_at) {
    return fail(
      res,
      400,
      "CODE_ALREADY_USED",
      "This reset code has already been used. Request a new one.",
    );
  }

  const isValid = await bcrypt.compare(code, resetRecord.code_hash);
  if (!isValid) {
    incrementPasswordResetAttempts(resetRecord.id);
    return fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect or has expired.",
    );
  }

  return applyNewPassword(res, user, newPassword, null, resetRecord.id);
});

/**
 * Save the new password and close every other way into the account.
 *
 * The token/code is marked used BEFORE the password is written, so a failure
 * part-way through cannot leave a reusable reset path behind.
 */
async function applyNewPassword(
  res,
  user,
  newPassword,
  resetTokenId = null,
  resetCodeId = null,
) {
  if (resetTokenId) markPasswordResetTokenUsed(resetTokenId);
  if (resetCodeId) markPasswordResetUsed(resetCodeId);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  updateUserPassword(user.id, passwordHash);

  // No older code or token may survive a completed reset, and every existing
  // session is dropped so anyone already signed in must use the new password.
  // The token just used is kept (marked used) so a replay gets TOKEN_ALREADY_USED
  // rather than looking like a token that never existed.
  invalidatePasswordResetCodesForUser(user.id);
  invalidatePasswordResetTokensForUser(user.id, resetTokenId);
  deleteAllSessionsForUser(user.id);

  const token = generateToken();
  createSession({ userId: user.id, token });

  return res.json({
    ok: true,
    user: safeUser(getUserById(user.id)),
    token,
    message: "Password reset was successful.",
  });
}

// Proxy routes for the SMS provider and ACC catalogue.
const ROUTES = {
  "/api/sms/balance": { action: "getBalance", params: () => ({}) },
  "/api/sms/stock": {
    action: "getNumbersStatus",
    params: (query) => ({ country: query.country }),
  },
  "/api/sms/number": {
    action: "getNumber",
    params: (query) => ({
      service: query.service,
      country: query.country,
      maxPrice: query.maxPrice,
    }),
  },
  "/api/sms/status": {
    action: "getStatus",
    params: (query) => ({ id: query.id }),
  },
  "/api/sms/set-status": {
    action: "setStatus",
    params: (query) => ({ id: query.id, status: query.status }),
  },
};

// The catalogue is ~8-9 MB and the upstream takes ~100s to produce it, while
// the changes slowly (prices/stock only). Fetching it per request meant the
// browser's client-side timeout fired long before the data arrived, so the Buy
// page always reported "took too long". Cache it in memory and serve the copy.
const PRICES_CACHE_TTL_MS = 10 * 60 * 1000;
const PRICES_UPSTREAM_TIMEOUT_MS = 180 * 1000;
const pricesCache = {
  payload: null,
  fetchedAt: 0,
  inflight: null,
  lastError: null,
};

async function fetchPricesUpstream() {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    PRICES_UPSTREAM_TIMEOUT_MS,
  );
  try {
    const upstream = await fetch(PRICES_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const error = new Error(`upstream ${upstream.status}`);
      error.code = "PRICES_UPSTREAM_ERROR";
      throw error;
    }
    return await upstream.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the catalogue once and keep it in memory, collapsing concurrent
 * callers (including the background warm-up) into a single upstream request.
 * Shared by GET /api/prices and the start-up warm-up below.
 */
function loadPrices() {
  if (!pricesCache.inflight) {
    pricesCache.inflight = fetchPricesUpstream()
      .then((payload) => {
        pricesCache.payload = payload;
        pricesCache.fetchedAt = Date.now();
        pricesCache.lastError = null;
        return payload;
      })
      .catch((error) => {
        pricesCache.lastError = error?.code || error?.message || "UNKNOWN";
        throw error;
      })
      .finally(() => {
        pricesCache.inflight = null;
      });
  }
  return pricesCache.inflight;
}

// Cheap status endpoint for the client. The first catalogue fetch can take ~50s
// (upstream produces ~8.6 MB) and there is no way to show meaningful progress
// from GET /api/prices alone, which just looks like a hang. The Buy page polls
// this instead of re-issuing the huge request, and backs off while it is ready.
//
// "ready" is true as soon as a copy exists, even a stale one: the catalogue
// route serves stale data rather than failing, so the UI must not keep waiting.
//
// MUST be registered BEFORE "/api/prices": Express 5 path-to-regexp matches
// "/api/prices" against the longer "/api/prices/status" as well, so declaring
// it after would make that handler swallow this request and the client would
// get "Cannot GET" instead of a status.
app.get("/api/prices/status", (req, res) => {
  const ready = pricesCache.payload !== null;
  const fresh =
    ready && Date.now() - pricesCache.fetchedAt < PRICES_CACHE_TTL_MS;

  return res.json({
    ready,
    fresh,
    loading: pricesCache.inflight !== null,
    fetchedAt: ready ? pricesCache.fetchedAt : null,
    ageMs: ready ? Date.now() - pricesCache.fetchedAt : null,
    lastError: pricesCache.lastError,
  });
});

// Price audit: what each sold service costs us, what we charge, and the margin.
// Read-only, no keys or provider secrets. `problems` lists every service whose
// provider cost is above the configured price so the operator can see exactly
// what cannot be sold and why (never a silent re-price).
//
// `?full=1&limit=N` includes the per-country variant breakdown. The summary is
// small enough to read by hand; the breakdown is for spot checks.
app.get("/api/prices/audit", (req, res) => {
  const payload = pricesCache.payload;
  if (!payload) {
    return fail(
      res,
      503,
      "PRICES_NOT_READY",
      "The price catalogue is still loading. Try again in a moment.",
    );
  }

  const pricing = getPricingConfig();
  const limit = Math.min(Number(req.query.limit) || 20, 200);
  const full = req.query.full === "1" || req.query.full === "true";

  const services = [];
  const problems = [];

  for (const [serviceId, entry] of Object.entries(SELLABLE_SERVICES)) {
    const tier = getTierConfig(entry.tier);
    const catalogueService = entry.catalogueService || serviceId;
    const rows = [];

    for (const [slug, catalogueServices] of Object.entries(payload)) {
      const variants = catalogueServices?.[catalogueService];
      if (!variants || typeof variants !== "object") continue;
      for (const [variantId, info] of Object.entries(variants)) {
        if (!info || typeof info !== "object") continue;
        if (!(Number(info.count) > 0)) continue;
        const priced = priceVariant(
          { cost: info.cost, serviceId, variantId },
          pricing,
        );
        if (!priced) continue;
        rows.push({
          country: slug,
          variantId,
          providerCost: priced.cost,
          sellingPrice: priced.price,
          profit: priced.profit,
          status: priced.status,
          note: priced.note,
        });
      }
    }

    const inStock = rows.filter((row) => row.status !== "below-min-profit");
    const cheapest = inStock.length
      ? inStock.reduce((a, b) => (a.providerCost <= b.providerCost ? a : b))
      : null;
    const dearest = rows.length
      ? rows.reduce((a, b) => (a.providerCost >= b.providerCost ? a : b))
      : null;
    const blocked = rows.filter((row) => row.status === "below-min-profit");

    services.push({
      serviceId,
      displayName: entry.displayName,
      providerService: entry.provider,
      catalogueService,
      tier: entry.tier,
      tierLabel: tier?.label ?? null,
      mode: tier?.mode ?? null,
      priceWindow: { min: tier?.min ?? null, max: tier?.max ?? null },
      countriesWithStock: new Set(rows.map((row) => row.country)).size,
      variantsInStock: rows.length,
      sellableVariants: inStock.length,
      blockedVariants: blocked.length,
      cheapest: cheapest
        ? { country: cheapest.country, cost: cheapest.providerCost, price: cheapest.sellingPrice, profit: cheapest.profit }
        : null,
      dearest: dearest
        ? { country: dearest.country, cost: dearest.providerCost, price: dearest.sellingPrice, profit: dearest.profit }
        : null,
    });

    blocked.slice(0, limit).forEach((row) => {
      problems.push({
        serviceId,
        country: row.country,
        variantId: row.variantId,
        providerCost: row.providerCost,
        requestedPrice: row.sellingPrice,
        profit: row.profit,
        note: row.note,
      });
    });

    if (full) services[services.length - 1].variants = rows.slice(0, limit);
  }

  return res.json({
    pricing: {
      feeNaira: pricing.feeNaira,
      minProfitNaira: pricing.minProfitNaira,
      overCeilingMarkupPercent: pricing.overCeilingMarkupPercent,
    },
    tiers: Object.fromEntries(
      Object.keys(PRICE_TIERS).map((key) => [key, getTierConfig(key)]),
    ),
    blockedServices: Object.fromEntries(
      Object.entries(BLOCKED_SERVICES).map(([id, entry]) => [id, entry.reason]),
    ),
    services,
    problems: problems.slice(0, limit),
    problemCount: problems.length,
    auditedAt: new Date().toISOString(),
  });
});

app.get("/api/prices", async (req, res) => {
  const now = Date.now();
  const isFresh =
    pricesCache.payload !== null &&
    now - pricesCache.fetchedAt < PRICES_CACHE_TTL_MS;

  // The catalogue carries the provider's COST. The price we charge comes from
  // server/pricing.js and is attached to each variant here, so the Buy page
  // shows exactly what the purchase route will charge. The cached payload is
  // never mutated, and this runs on every response so a pricing-config change
  // takes effect without refetching the upstream catalogue.
  //
  // SIZE MATTERS HERE. The upstream catalogue is ~10.7 MB uncompressed (170k
  // variants) and the Buy page could show nothing until all of it had arrived
  // and been JSON-parsed on the phone. Two things shrink it without changing
  // what the page can offer:
  //   - the provider's `rate`/`rateNN` hold-time fields are not read by the
  //     client catalogue (only `cost`, `count`, `price` and `variantId` are), so
  //     they are not forwarded;
  //   - variants with zero stock are dropped. The Buy page only asks whether a
  //     service exists for a country, and purchasing re-quotes from the server's
  //     cached copy, so an omitted out-of-stock variant cannot be bought by
  //     accident - and it was 112k of the 170k entries;
  //   - a service without a configured tier (or blocked by name) is left out
  //     entirely, so nothing is listed without a real selling price.
  //
  // Every variant carries `price`, `cost` and `profit`. A variant that cannot
  // be sold profitably keeps `price: null` and a `blocked` reason (with the real
  // cost) so the Buy page can say WHY, instead of showing a fake price.
  const withPrices = (payload) => {
    const pricing = getPricingConfig();
    const cards = Object.entries(SELLABLE_SERVICES);

    // country -> card -> variant -> priced entry. Cards borrow the catalogue
    // service that holds their variants ("gmail" -> "google"), and each card is
    // priced by ITS OWN tiers so two cards never show the same price by accident.
    const priced = Object.create(null);

    for (const [slug, services] of Object.entries(payload || {})) {
      if (!services || typeof services !== "object") continue;

      for (const [cardId, entry] of cards) {
        const catalogueService = entry.catalogueService || cardId;
        const variants = services[catalogueService];
        if (!variants || typeof variants !== "object") continue;

        for (const [variantId, info] of Object.entries(variants)) {
          if (!info || typeof info !== "object") continue;
          // No stock means nothing to offer; see the note above.
          if (!(Number(info.count) > 0)) continue;

          const quote = priceVariant(
            { cost: info.cost, serviceId: cardId, variantId },
            pricing,
          );
          // Not sellable here (unpriced card, or cost too high). There is no
          // honest price to show, so no price is invented.
          if (!quote) continue;

          const sellable = quote.status !== "below-min-profit";
          const bucket = (priced[slug] ||= Object.create(null));
          const card = (bucket[cardId] ||= Object.create(null));
          card[variantId] = {
            cost: info.cost,
            count: info.count,
            price: sellable ? quote.price : null,
            profit: sellable ? quote.profit : null,
            tier: quote.tierKey,
            blocked: sellable ? null : quote.note,
          };
        }
      }
    }

    // The catalogue service that holds a card's variants, so the purchase route
    // can look up the cost/variant that was charged.
    const catalogueServiceByCard = Object.fromEntries(
      cards.map(([cardId, entry]) => [cardId, entry.catalogueService || cardId]),
    );

    // The lowest price each card can actually be bought at, anywhere.
    const sold = Object.create(null);
    for (const bucket of Object.values(priced)) {
      for (const [cardId, variants] of Object.entries(bucket)) {
        for (const variant of Object.values(variants)) {
          if (variant.blocked) continue;
          const current = sold[cardId];
          if (!current || variant.price < current.price) {
            sold[cardId] = {
              price: variant.price,
              tier: variant.tier,
              tierLabel: getTierConfig(variant.tier)?.label ?? null,
            };
          }
        }
      }
    }

    for (const cardId of Object.keys(sold)) {
      sold[cardId].catalogueService = catalogueServiceByCard[cardId];
    }

    return { countries: priced, sold, catalogueServiceByCard };
  };

  // Services the Buy page can show a reason for. It is one small object, so it
  // is sent with the catalogue instead of being guessed in the browser.
  const serviceStatus = () => {
    const status = Object.create(null);
    for (const serviceId of Object.keys(BLOCKED_SERVICES)) {
      status[serviceId] = {
        sellable: false,
        reason: BLOCKED_SERVICES[serviceId].reason,
      };
    }
    for (const [serviceId, entry] of Object.entries(SELLABLE_SERVICES)) {
      const tiers = getCardTiers(serviceId).map((key) => getTierConfig(key));
      const from = tiers.reduce(
        (low, tier) => (tier?.min != null && tier.min < low ? tier.min : low),
        Number.MAX_SAFE_INTEGER,
      );
      const to = tiers.reduce(
        (high, tier) => (tier?.max != null && tier.max > high ? tier.max : high),
        0,
      );
      status[serviceId] = {
        sellable: true,
        tier: entry.tier,
        label: entry.displayName,
        providerService: entry.provider,
        catalogueService: resolveCatalogueService(serviceId),
        priceFrom: from === Number.MAX_SAFE_INTEGER ? null : from,
        priceTo: to || null,
        // The distinct tiers this card's variants are sold at. One entry means
        // every variant is the same product (Telegram today), so the Buy page
        // must not label them as different products.
        variantTiers: getCardTiers(serviceId),
        variants: entry.variants || null,
      };
    }
    return status;
  };

  const respond = (payload, maxAge) => {
    const { countries, sold, catalogueServiceByCard } = withPrices(payload);
    res.set("Cache-Control", `private, max-age=${maxAge}`);
    return res.json({
      countries,
      sold,
      catalogueServiceByCard,
      serviceStatus: serviceStatus(),
      pricedAt: Date.now(),
    });
  };

  if (isFresh) {
    // `private` keeps the priced copy out of any shared cache, `max-age` lets
    // the browser reuse it for the same window the server considers it fresh,
    // so coming back to the Buy page inside that window costs no download and
    // no JSON.parse at all. A stale entry is served by the server below, so
    // `must-revalidate` is left off deliberately.
    return respond(pricesCache.payload, 600);
  }

  // STALE, BUT PRESENT. The previous version fell through to `await loadPrices()`
  // here, so every request after the 10-minute window blocked on a full upstream
  // refetch (~10s, and up to 180s when the upstream is slow). The browser's own
  // timeout fired first and it aborted the request, which is why the Buy page sat
  // on the loading skeleton forever.
  //
  // Serve the copy we already have immediately and refresh in the BACKGROUND.
  // Prices and stock drift slowly, so a minutes-old catalogue is far better than
  // a page that never loads; the response is stale only by our own TTL, not by
  // the upstream's.
  if (pricesCache.payload !== null) {
    // Kick off the refresh without awaiting it. loadPrices() collapses
    // concurrent callers, so this schedules at most one upstream fetch.
    if (pricesCache.inflight === null) {
      loadPrices().catch(() => {
        // The stale copy stays in use; the error is already recorded in
        // pricesCache.lastError and surfaced by /api/prices/status.
      });
    }
    return respond(pricesCache.payload, 60);
  }

  try {
    // Collapse concurrent misses into ONE upstream request: several users (or
    // the same user reloading) must not each trigger a 100-second fetch.
    const payload = await loadPrices();
    return respond(payload, 600);
  } catch (error) {
    // A stale copy beats no catalogue at all while the upstream is down.
    if (pricesCache.payload !== null) {
      return respond(pricesCache.payload, 60);
    }
    const timedOut = error?.name === "AbortError";
    return fail(
      res,
      502,
      timedOut ? "PRICES_UPSTREAM_TIMEOUT" : "PRICES_UNREACHABLE",
      timedOut
        ? "The catalogue service took too long to respond."
        : "Could not reach the catalogue service.",
    );
  }
});

async function proxySmsAction(action, req, res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  const route = ROUTES[`/api/sms/${action}`];
  if (!route) {
    return fail(res, 404, "NOT_FOUND", "Unknown SMS endpoint.");
  }

  if (action === "number" && req.method !== "POST") {
    return fail(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Number purchases must use POST.",
    );
  }

  if (!API_KEY) {
    return fail(
      res,
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Add YANKEE_VERIFY_API_KEY to configure SMS purchases.",
    );
  }

  try {
    const params = route.params(req.method === "POST" ? req.body : req.query);
    let text = "";

    if (route.action === "getBalance") {
      text = String(await getYankeeBalance());
    } else if (route.action === "getNumbersStatus") {
      const payload = await getYankeeNumbersStatus(params.country);
      return res.json(payload);
    } else if (route.action === "getNumber") {
      const payload = await requestYankeeNumber(
        params.service,
        params.country,
        params.maxPrice,
      );
      return res
        .type("text/plain")
        .send(`ACCESS_NUMBER:${payload.activationId}:${payload.phone}`);
    } else if (route.action === "getStatus") {
      const payload = await getYankeeActivationStatus(params.id);
      text =
        payload.status === "WAITING"
          ? "STATUS_WAIT_CODE"
          : payload.status === "CODE_RECEIVED"
            ? `STATUS_OK:${payload.code}`
            : "STATUS_CANCEL";
    } else if (route.action === "setStatus") {
      text = await setYankeeActivationStatus(params.id, params.status);
    }

    return res.type("text/plain").send(text);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError";
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "[panda-server] provider request failed",
        JSON.stringify({
          action: route.action,
          name: error?.name || "Error",
          message: error?.message || "",
          code: error?.cause?.code || null,
          causeName: error?.cause?.name || null,
          causeMessage: error?.cause?.message || null,
        }),
      );
    }
    return fail(
      res,
      timedOut ? 504 : 502,
      timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE",
      timedOut
        ? "The verification provider timed out. Please try again."
        : "Could not connect to the verification provider. Please try again.",
    );
  }
}

// SMS provider proxy. Registered BEFORE the app's own /api/sms routes below,
// because Express matches in registration order: the app's
// `app.get("/api/sms/:action")` handler is a wildcard that would otherwise
// swallow every SMS path - including /api/sms/health - and answer with its own
// "Unknown SMS endpoint" 404 before this router was ever reached.
//
// Two routers back the same paths on purpose:
//   smsRouter  - reads process.env at request time and falls back to the
//                default provider URL, so it works even when the .env is
//                loaded after this module (see server/smsRouter.js).
//   smsProxy   - kept as the fallback for paths smsRouter does not define.
app.use("/api/sms", smsRouter);
app.use("/api/sms", smsProxyRouter);

// The app's own, richer handlers (they debit the wallet and record the
// activation). Kept as the last SMS registration so they win for the paths
// they cover.
app.get("/api/sms/:action", (req, res) =>
  proxySmsAction(req.params.action, req, res),
);
app.post("/api/sms/number", (req, res) => proxySmsAction("number", req, res));

// Unknown /api routes must answer with JSON. Express's built-in 404 sends an
// HTML page, which the browser cannot parse as JSON - that surfaces as
// "Unexpected end of JSON input" on a phone.
app.use("/api", (req, res) =>
  fail(res, 404, "NOT_FOUND", "That endpoint does not exist."),
);

// Express's default error handler answers with an HTML page. A malformed or
// oversized body would then reach the browser as HTML, and the client's
// response.json() would fail with "Unexpected end of JSON input" instead of
// showing the real reason. Always answer with JSON.
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const isBodyTooLarge = error?.type === "entity.too.large";
  const isBodyError = isBodyTooLarge || error?.type === "entity.parse.failed";

  if (isBodyError) {
    return fail(
      res,
      isBodyTooLarge ? 413 : 400,
      "INVALID_REQUEST",
      isBodyTooLarge
        ? "The request body is too large."
        : "The request body could not be read as JSON.",
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.error("[panda-server] unhandled error", error);
  }

  return fail(
    res,
    500,
    "SERVER_ERROR",
    "Something went wrong on our end. Please try again.",
  );
});

// Warm the catalogue cache as soon as the process starts. Without this the
// first buyer pays the full ~50s upstream fetch; with it, the data is usually
// already in memory by the time anyone opens the Buy page.
function warmPricesCache() {
  loadPrices()
    .then((payload) => {
      const countries =
        payload && typeof payload === "object"
          ? Object.keys(payload).length
          : 0;
      console.log(
        `[panda-server] price catalogue cached (${countries} countries)`,
      );
    })
    .catch((error) => {
      console.warn(
        "[panda-server] price catalogue warm-up failed:",
        error?.code || error?.message || error,
      );
    });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[panda-server] listening on http://localhost:${PORT}`);
  warmPricesCache();
  console.log(
    `[panda-server] also reachable on the LAN - use the Vite URL printed by ` +
      `the dev server (http://<your-lan-ip>:5173) to test on a phone.`,
  );
  console.log("[panda-server] authentication and SMS routes are active");

  // Where accounts are actually stored. A production login that "worked on the
  // laptop" almost always means the browser is talking to a DIFFERENT database
  // than the one the account was created in, so print the resolved path and the
  // account count at every start (no email addresses, no password hashes).
  // On Render, unless DATA_DIR points at a mounted disk (e.g. /var/data), this
  // path lives in the container's ephemeral filesystem and is emptied on every
  // deploy/restart - see DATA_DIR in the deployment notes.
  {
    let accountCount = "unknown";
    try {
      accountCount = db.prepare("SELECT COUNT(*) AS c FROM users").get()?.c ?? 0;
    } catch {
      // Leave "unknown": the database itself failed to open, which /api/health
      // reports as dbOk:false.
    }
    console.log(
      `[panda-server] database: ${DATABASE_PATH} (${accountCount} accounts, ${
        process.env.DATA_DIR
          ? "persistent DATA_DIR"
          : "no DATA_DIR - ephemeral on Render"
      })`,
    );
  }

  // Fail loudly at startup when the provider key is missing. Without this the
  // server looks healthy while every /api/sms request answers 503, and the UI
  // reports it as "temporarily unavailable" - which sends people into a retry
  // loop for a problem only a key can fix.
  if (!API_KEY) {
    console.warn(
      "[panda-server] YANKEE_API_KEY is NOT set - number purchases and SMS " +
        "verification are disabled. Add it to .env.server and restart. " +
        "Check GET /api/sms/health (keyConfigured) to confirm.",
    );
  }

  // The browser origins allowed to call this API. A frontend on a host that is
  // not listed here gets 403 ORIGIN_NOT_ALLOWED for every request, which looks
  // exactly like "login is broken in production". Printing the effective list
  // (public information, no secret) makes that visible in the Render log.
  console.log(
    `[panda-server] allowed frontend origins: ${ALLOWED_ORIGINS.join(", ")}`,
  );
});
