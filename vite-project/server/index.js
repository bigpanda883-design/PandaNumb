import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import {
  appendUserNumber,
  appendUserTransaction,
  createUser,
  createPasswordResetCode,
  createSession,
  deleteAllSessionsForUser,
  deleteSessionByToken,
  getLatestPasswordResetCode,
  getSessionFromToken,
  getUserByEmail,
  getUserById,
  getUserByPhone,
  incrementPasswordResetAttempts,
  markPasswordResetUsed,
  safeUser,
  updateUserNumber,
  updateUserPassword,
  updateUserWalletBalance,
} from "./db.js";
import { sendPasswordResetEmail } from "./emailService.js";
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

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const API_KEY = getYankeeApiKey();
const PRICES_URL =
  process.env.ACC_PRICES_URL ||
  "https://www.accnumbers.com/api/v1/guest/prices";

const loginRateMap = new Map();
const resetRateMap = new Map();

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
  res.json({ ok: true, providerConfigured: Boolean(API_KEY) });
});

app.post("/api/auth/register", async (req, res) => {
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
});

app.post("/api/auth/signup", async (req, res) => {
  return app._router.handle(req, res);
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
    return fail(res, 400, "MINIMUM_DEPOSIT", "The minimum deposit is ₦100.");
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

app.get("/api/numbers", authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({ numbers: user?.numbers ?? [] });
});

app.get("/api/transactions", authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  return res.json({ transactions: user?.transactions ?? [] });
});

app.post("/api/numbers/purchase", authMiddleware, async (req, res) => {
  const serviceId = String(
    req.body?.serviceId ?? req.body?.service ?? "",
  ).trim();
  const countryCode = String(
    req.body?.countryCode ?? req.body?.country ?? "",
  ).trim();
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

  // Balance is checked here, on the server, before we spend anything upstream.
  const user = getUserById(req.user.id);
  const currentBalance = Number(user?.walletBalance || 0);
  if (currentBalance < price) {
    return fail(
      res,
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
    const status = error?.name === "TimeoutError" ? 504 : 502;
    return fail(
      res,
      status,
      code,
      messages[code] ||
        "The provider could not issue a number right now. Please try again.",
    );
  }

  // The provider committed a number: debit the balance and record everything.
  const nextBalance = currentBalance - price;
  const now = new Date();
  const displayService = serviceName || mapping.displayName || serviceId;

  const purchasedNumber = {
    id: allocation.activationId,
    number: allocation.phone,
    countryCode: countryCode.toLowerCase(),
    countryName: countryName || countryCode.toUpperCase(),
    service: displayService,
    price: `₦${price.toLocaleString()}`,
    priceValue: price,
    orderId: allocation.activationId,
    status: "WAITING",
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
    amount: -price,
    status: "SUCCESSFUL",
    path: "/my-numbers",
    reference: allocation.activationId,
    date: purchasedNumber.dateStr,
    createdAt: now.getTime(),
  };

  updateUserWalletBalance(user.id, nextBalance);
  appendUserNumber(user.id, purchasedNumber);
  const updatedUser = appendUserTransaction(user.id, transaction);

  return res.status(201).json({
    number: purchasedNumber,
    balance: Number(updatedUser?.walletBalance ?? nextBalance),
    transaction,
    user: safeUser(updatedUser),
  });
});

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
    // A code is terminal: release the provider activation so it stops billing.
    setYankeeActivationStatus(activationId, 6).catch(() => {});
    return res.json({
      status: "CODE_RECEIVED",
      code: status.code,
      receivedAt,
    });
  }

  if (status.status === "CANCELLED") {
    updateUserNumber(user.id, activationId, { status: "CANCELLED" });
    return res.json({ status: "CANCELLED", code: null, receivedAt: null });
  }

  return res.json({
    status: status.status === "CODE_RECEIVED" ? "WAITING" : status.status,
    code: null,
    receivedAt: null,
  });
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

  if (!API_KEY) {
    return fail(
      res,
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Add YANKEE_API_KEY to cancel activations.",
    );
  }

  try {
    await setYankeeActivationStatus(activationId, 8);
  } catch (error) {
    const code = String(error?.code || error?.message || "PROVIDER_ERROR");
    return fail(
      res,
      error?.name === "TimeoutError" ? 504 : 502,
      code,
      "The provider refused the cancellation. Please try again.",
    );
  }

  updateUserNumber(user.id, activationId, { status: "CANCELLED" });
  return res.json({ ok: true, status: "CANCELLED" });
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

  if (!user) {
    return res.json({
      message:
        "If an account exists for this email, a verification code has been sent.",
    });
  }

  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15).toISOString();
  createPasswordResetCode({ userId: user.id, codeHash, expiresAt });

  await sendPasswordResetEmail(email, code);

  return res.json({
    message:
      "If an account exists for this email, a verification code has been sent.",
  });
});

app.post("/api/auth/verify-reset-code", async (req, res) => {
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
      "Reset code must be a 6-digit number.",
    );
  }

  const user = getUserByEmail(email);
  if (!user) {
    return fail(
      res,
      404,
      "ACCOUNT_NOT_FOUND",
      "No account was found for this email.",
    );
  }

  const resetRecord = getLatestPasswordResetCode(user.id);
  if (!resetRecord) {
    return fail(
      res,
      400,
      "INVALID_CODE",
      "No reset code was found for this account.",
    );
  }

  if (resetRecord.used_at) {
    return fail(
      res,
      400,
      "CODE_ALREADY_USED",
      "This reset code has already been used.",
    );
  }

  if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
    return fail(res, 400, "CODE_EXPIRED", "This reset code has expired.");
  }

  if (Number(resetRecord.attempts || 0) >= 5) {
    return fail(
      res,
      400,
      "CODE_LOCKED",
      "Too many failed reset attempts. Request a new code.",
    );
  }

  const isValid = await bcrypt.compare(code, resetRecord.code_hash);
  if (!isValid) {
    incrementPasswordResetAttempts(resetRecord.id);
    return fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect.",
    );
  }

  return res.json({
    valid: true,
    message: "Reset code verified successfully.",
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const code = String(req.body.code || "").trim();
  const newPassword = String(req.body.newPassword || "");

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

  if (!validatePassword(newPassword)) {
    return fail(
      res,
      400,
      "WEAK_PASSWORD",
      "New password must contain uppercase, lowercase, number and special character.",
    );
  }

  const user = getUserByEmail(email);
  if (!user) {
    return fail(
      res,
      404,
      "ACCOUNT_NOT_FOUND",
      "No account was found for this email.",
    );
  }

  const resetRecord = getLatestPasswordResetCode(user.id);
  if (!resetRecord) {
    return fail(
      res,
      400,
      "INVALID_CODE",
      "No reset code was found for this account.",
    );
  }

  if (resetRecord.used_at) {
    return fail(
      res,
      400,
      "CODE_ALREADY_USED",
      "This reset code has already been used.",
    );
  }

  if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
    return fail(res, 400, "CODE_EXPIRED", "This reset code has expired.");
  }

  const isValid = await bcrypt.compare(code, resetRecord.code_hash);
  if (!isValid) {
    incrementPasswordResetAttempts(resetRecord.id);
    return fail(
      res,
      400,
      "INVALID_CODE",
      "The verification code is incorrect.",
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  updateUserPassword(user.id, passwordHash);
  markPasswordResetUsed(resetRecord.id);
  deleteAllSessionsForUser(user.id);

  const token = generateToken();
  createSession({ userId: user.id, token });

  return res.json({
    ok: true,
    user: safeUser(getUserById(user.id)),
    token,
    message: "Password reset was successful.",
  });
});

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

app.get("/api/prices", async (req, res) => {
  try {
    const upstream = await fetch(PRICES_URL, {
      headers: { Accept: "application/json" },
    });

    if (!upstream.ok) {
      return fail(
        res,
        502,
        "PRICES_UPSTREAM_ERROR",
        "The catalogue service is unavailable.",
      );
    }

    const payload = await upstream.json();
    return res.json(payload);
  } catch (error) {
    return fail(
      res,
      502,
      "PRICES_UNREACHABLE",
      "Could not reach the catalogue service.",
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

app.get("/api/sms/:action", (req, res) =>
  proxySmsAction(req.params.action, req, res),
);
app.post("/api/sms/number", (req, res) => proxySmsAction("number", req, res));

app.listen(PORT, () => {
  console.log(`[panda-server] listening on http://localhost:${PORT}`);
  console.log("[panda-server] authentication and SMS routes are active");
});
