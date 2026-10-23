import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import {
  appendUserNumber,
  appendUserTransaction,
  createUser,
  createPasswordResetCode,
  createPasswordResetToken,
  createSession,
  deleteAllSessionsForUser,
  deleteSessionByToken,
  getLatestPasswordResetCode,
  getPasswordResetTokenByHash,
  getSessionFromToken,
  getUserByEmail,
  getUserById,
  getUserByPhone,
  hashToken,
  incrementPasswordResetAttempts,
  invalidatePasswordResetCodesForUser,
  invalidatePasswordResetTokensForUser,
  markPasswordResetCodeVerified,
  markPasswordResetTokenUsed,
  markPasswordResetUsed,
  safeUser,
  updateUserNumber,
  updateUserPassword,
  updateUserWalletBalance,
} from "./db.js";
import {
  RESET_CODE_TTL_MINUTES,
  isEmailConfigured,
  sendLoginNotificationEmail,
  sendPasswordResetEmail,
} from "./emailService.js";
import {
  getYankeeBalance,
  getYankeeNumbersStatus,
  requestYankeeNumber,
  getYankeeActivationStatus,
  setYankeeActivationStatus,
  getYankeeApiKey,
} from "./yankeeService.js";
import {
  resolveProviderService,
  YANKEE_SERVICE_MAP,
} from "./providerMapping.js";
import smsProxyRouter from "./smsProxy.js";
import smsRouter from "./smsRouter.js";
import { getPricingConfig, getSellingPrice } from "./pricing.js";

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const API_KEY = getYankeeApiKey();
const PRICES_URL =
  process.env.ACC_PRICES_URL ||
  "https://www.accnumbers.com/api/v1/guest/prices";

const loginRateMap = new Map();
const resetRateMap = new Map();
// Codes are short (six digits), so guessing must be throttled separately from
// requesting them. Keyed by "verify:<ip>:<email>".
const resetCodeVerifyRateMap = new Map();

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json({ limit: "1mb" }));
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

app.get("/api/health", (req, res) => {
  const pricing = getPricingConfig();
  res.json({
    ok: true,
    providerConfigured: Boolean(API_KEY),
    // Whether login/reset emails can be sent. Reports only the boolean - never
    // the host, user or password.
    emailConfigured: isEmailConfigured(),
    pricing,
  });
});

const registerHandler = async (req, res) => {
  const name = String(req.body.name || req.body.fullName || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  const phone = String(req.body.phone || "").trim();

  if (!name || !email || !password) {
    return fail(
      res,
      400,
      "INVALID_INPUT",
      "Name, email and password are required.",
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

  return res.status(201).json({
    user: safeUser(user),
    token,
  });
};

app.post("/api/auth/register", registerHandler);

// Alias: the sign-up UI posts to /api/auth/signup, but the real handler lives
// at /api/auth/register. Forward the body to that handler instead of
// re-dispatching the request through the router (which matched this same route
// again and produced an empty response -> "Unexpected end of JSON input").
app.post("/api/auth/signup", registerHandler);

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

app.get("/api/wallet/balance", authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({
    balance: Number(user?.walletBalance || 0),
    user: safeUser(user),
  });
});

app.post("/api/wallet/deposit", authMiddleware, async (req, res) => {
  const amount = Number(req.body?.amount ?? req.body?.value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return fail(
      res,
      400,
      "INVALID_AMOUNT",
      "Enter a valid amount greater than zero.",
    );
  }

  if (amount < 100) {
    return fail(res, 400, "MINIMUM_DEPOSIT", "The minimum deposit is â‚¦100.");
  }

  const user = getUserById(req.user.id);
  const nextBalance = Number(user?.walletBalance || 0) + amount;
  const now = new Date();

  // Record the deposit so it appears in the user's history and survives a
  // reload - the balance and the transaction must move together.
  const transaction = {
    id: `demo-deposit-${Date.now()}`,
    type: "deposit",
    title: "Wallet deposit",
    amount,
    status: "SUCCESSFUL",
    path: "/deposit",
    reference: `DEMO-${Date.now()}`,
    date: formatTransactionDate(now),
    createdAt: now.getTime(),
  };

  updateUserWalletBalance(user.id, nextBalance);
  const updatedUser = appendUserTransaction(user.id, transaction);

  return res.json({
    ok: true,
    balance: Number(updatedUser?.walletBalance ?? nextBalance),
    transaction,
    user: safeUser(updatedUser),
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
 * Resolve the price to charge, from the provider catalogue - never from the
 * request body. The browser's `price` is only compared against this to detect a
 * stale page, so a user can neither underpay nor be surprised by a new price.
 */
async function quotePurchasePrice({ countrySlug, serviceId, variantId }) {
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

  const variant = findCatalogueVariant(
    payload,
    countrySlug,
    serviceId,
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

  const price = getSellingPrice(variant.cost);
  if (price === null) {
    return {
      error: {
        status: 409,
        code: "OFFER_UNAVAILABLE",
        message:
          "That offer has no usable price right now. Please choose another.",
      },
    };
  }

  return { price, variant };
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
  baseBalance,
  countryCode,
  countrySlug,
  countryName,
  serviceId,
  serviceName,
  mapping,
  variantId,
}) {
  const nextBalance = baseBalance - chargePrice;
  const now = new Date();
  const displayService = serviceName || mapping.displayName || serviceId;

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
    price: `₦${chargePrice.toLocaleString()}`,
    priceValue: chargePrice,
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

  updateUserWalletBalance(userId, nextBalance);
  appendUserNumber(userId, purchasedNumber);
  const updatedUser = appendUserTransaction(userId, transaction);

  const body = {
    number: purchasedNumber,
    balance: Number(updatedUser?.walletBalance ?? nextBalance),
    transaction,
    user: safeUser(updatedUser),
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
  const price = Number(req.body?.price ?? 0);

  if (!serviceId || !countryCode) {
    return fail(
      res,
      400,
      "INVALID_INPUT",
      "A service and a country are required to buy a number.",
    );
  }

  if (!Number.isFinite(price) || price <= 0) {
    return fail(
      res,
      400,
      "INVALID_PRICE",
      "A valid price is required to buy a number.",
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
    return fail(
      res,
      400,
      "SERVICE_NOT_SUPPORTED",
      `The provider does not have a verified mapping for "${serviceId}", so a number cannot be issued for it yet.`,
    );
  }

  // The charge comes from the provider catalogue, NEVER from the body.
  const quote = await quotePurchasePrice({
    countrySlug,
    serviceId,
    variantId,
  });
  if (quote.error) {
    return fail(
      res,
      quote.error.status,
      quote.error.code,
      quote.error.message,
    );
  }
  const chargePrice = quote.price;

  // The body's price is display-only, but a page still showing a different
  // figure must be corrected before anything is bought or charged.
  if (Number.isFinite(price) && price > 0 && price !== chargePrice) {
    return fail(
      res,
      409,
      "PRICE_CHANGED",
      `The price for this number has changed to ₦${chargePrice.toLocaleString()}. Please review and confirm again.`,
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
    baseBalance: currentBalance,
    countryCode,
    countrySlug,
    countryName,
    serviceId,
    serviceName,
    mapping,
    variantId: quote.variant.variantId,
  });

  return res.status(201).json(body);
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

  const refunded = updateUserNumber(user.id, activationId, {
    status: "CANCELLED",
    closedReason: "CANCELLED",
    cancelledAt: new Date().toISOString(),
  });

  return res.json({
    ok: true,
    status: "CANCELLED",
    balance: Number(refunded?.walletBalance || 0),
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

app.get("/api/prices", async (req, res) => {
  const now = Date.now();
  const isFresh =
    pricesCache.payload !== null &&
    now - pricesCache.fetchedAt < PRICES_CACHE_TTL_MS;

  // The catalogue carries the provider's COST. The price we charge is derived
  // from it (server/pricing.js) and attached to each variant here, so the Buy
  // page shows exactly what the purchase route will charge. The cached payload
  // is never mutated, and this is applied on every response so a pricing-config
  // change takes effect without refetching the upstream catalogue.
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
  //     accident - and it was 112k of the 170k entries.
  const withPrices = (payload) => {
    const pricing = getPricingConfig();
    const countries = Object.create(null);

    for (const [slug, services] of Object.entries(payload || {})) {
      if (!services || typeof services !== "object") {
        countries[slug] = services;
        continue;
      }
      const pricedServices = Object.create(null);
      for (const [serviceId, variants] of Object.entries(services)) {
        if (!variants || typeof variants !== "object") {
          pricedServices[serviceId] = variants;
          continue;
        }
        const pricedVariants = Object.create(null);
        for (const [variantId, info] of Object.entries(variants)) {
          if (!info || typeof info !== "object") continue;
          // No stock means nothing to offer; see the note above.
          if (!(Number(info.count) > 0)) continue;
          pricedVariants[variantId] = {
            cost: info.cost,
            count: info.count,
            price: getSellingPrice(info.cost, pricing),
          };
        }
        // Drop services left with no purchasable variant. Keeping an empty
        // object would still make the Buy page list a country for a service
        // that cannot actually be bought there.
        if (Object.keys(pricedVariants).length > 0) {
          pricedServices[serviceId] = pricedVariants;
        }
      }
      if (Object.keys(pricedServices).length > 0) {
        countries[slug] = pricedServices;
      }
    }

    return countries;
  };

  if (isFresh) {
    // `private` keeps the priced copy out of any shared cache, `max-age` lets
    // the browser reuse it for the same window the server considers it fresh,
    // so coming back to the Buy page inside that window costs no download and
    // no JSON.parse at all. A stale entry is served by the server below, so
    // `must-revalidate` is left off deliberately.
    res.set("Cache-Control", "private, max-age=600");
    return res.json(withPrices(pricesCache.payload));
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
    res.set("Cache-Control", "private, max-age=60");
    return res.json(withPrices(pricesCache.payload));
  }

  try {
    // Collapse concurrent misses into ONE upstream request: several users (or
    // the same user reloading) must not each trigger a 100-second fetch.
    const payload = await loadPrices();
    res.set("Cache-Control", "private, max-age=600");
    return res.json(withPrices(payload));
  } catch (error) {
    // A stale copy beats no catalogue at all while the upstream is down.
    if (pricesCache.payload !== null) {
      res.set("Cache-Control", "private, max-age=60");
      return res.json(withPrices(pricesCache.payload));
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
});
