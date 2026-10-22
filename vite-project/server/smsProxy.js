import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

// NOTE: this file must NOT import dotenv. dotenv is not a dependency of this
// project - the server loads its environment through Node's own flag
// (`node --env-file=.env.server server/index.js`, see package.json). Importing
// dotenv here crashed the whole server at startup with ERR_MODULE_NOT_FOUND
// before a single request could be served.

const PORT = Number(process.env.PORT) || 8787;
const API_KEY = process.env.YANKEE_VERIFY_API_KEY || process.env.YANKEE_API_KEY;
// SET THIS to the handler URL from your Yankee Verify dashboard/docs
// (the SMS-activate style "handler_api.php" endpoint).
const PROVIDER_URL =
  process.env.YANKEE_VERIFY_API_URL ||
  process.env.YANKEE_API_BASE_URL ||
  process.env.YANKEE_VERIFY_BASE_URL ||
  "https://yankee-verify-api.onrender.com/api/v1/handler_api.php";

const GET_TIMEOUT_MS = 15000;

const router = express.Router();

/**
 * This router is mounted AFTER server/index.js's own /api/sms handlers, so
 * Express only reaches it when nothing earlier matched. A request for a real
 * SMS path that lands here means the app's handlers were bypassed - the key
 * being unset is a normal reason - so answer with the SAME error contract the
 * app's own proxySmsAction uses.
 *
 * The old code answered 503 BAD_KEY here while index.js answers 503
 * PROVIDER_NOT_CONFIGURED for the very same condition. smsProvider.js maps an
 * unknown error code straight into PROVIDER_MESSAGES, where BAD_KEY means "The
 * provider API key is invalid or inactive" - so a missing key was reported to
 * users as a rejected key, which sends them hunting for the wrong problem.
 */
const NOT_CONFIGURED_CODE = "PROVIDER_NOT_CONFIGURED";
const NOT_CONFIGURED_MESSAGE =
  "Add YANKEE_VERIFY_API_KEY to configure SMS purchases.";

/** Reply with the JSON error shape the client's request() understands. */
function fail(res, status, error, message) {
  return res.status(status).json({ error, message });
}

/** Block every route cleanly if config is missing, instead of crashing. */
function requireConfig(req, res, next) {
  if (!API_KEY) {
    return fail(res, 503, NOT_CONFIGURED_CODE, NOT_CONFIGURED_MESSAGE);
  }
  if (!PROVIDER_URL) {
    return fail(
      res,
      503,
      "PROVIDER_UNREACHABLE",
      "Add YANKEE_VERIFY_API_URL to configure the provider endpoint.",
    );
  }
  next();
}

/** Call the provider and return its raw text. */
async function callProvider(action, params = {}, { timeout = true } = {}) {
  const url = new URL(PROVIDER_URL);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const response = await fetch(url, {
    // `signal: undefined` is NOT the same as omitting it. A request with no
    // timeout must pass no signal at all, otherwise the POST that buys a
    // number loses its "never abandon a purchase mid-flight" guarantee.
    ...(timeout ? { signal: AbortSignal.timeout(GET_TIMEOUT_MS) } : {}),
  });
  if (!response.ok) {
    const err = new Error(`Provider HTTP ${response.status}`);
    err.code = "PROVIDER_HTTP_ERROR";
    throw err;
  }
  return (await response.text()).trim();
}

/** Wrap a handler so thrown errors become the client's JSON error shape. */
const route = (handler) => async (req, res) => {
  try {
    const text = await handler(req, res);
    if (text !== undefined) res.type("text/plain").send(text);
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return fail(res, 504, "PROVIDER_TIMEOUT", "The provider timed out.");
    }
    if (error?.code === "PROVIDER_HTTP_ERROR") {
      return fail(res, 502, "PROVIDER_HTTP_ERROR", error.message);
    }
    if (error?.status === 400) {
      return fail(res, 400, "BAD_ACTION", error.message);
    }
    console.error("Provider call failed:", error);
    return fail(
      res,
      502,
      "PROVIDER_UNREACHABLE",
      "Could not reach the provider.",
    );
  }
};

const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });

// Health check, useful to confirm config without calling the provider.
router.get("/health", (req, res) =>
  res.json({
    ok: true,
    keyConfigured: Boolean(API_KEY),
    urlConfigured: Boolean(PROVIDER_URL),
  }),
);

// Everything below requires provider config; a request without it is a clean 503.
router.use(requireConfig);

// GET /api/sms/balance -> ACCESS_BALANCE:<n>
router.get(
  "/balance",
  route(() => callProvider("getBalance")),
);

// GET /api/sms/stock?country=US -> JSON of counts by service
router.get(
  "/stock",
  route((req) => {
    const country = String(req.query.country || "").trim();
    if (!country) throw badRequest("country is required");
    return callProvider("getNumbersStatus", { country });
  }),
);

// POST /api/sms/number -> ACCESS_NUMBER:<id>:<phone>
// No timeout: a purchase is not idempotent, so never abandon it mid-flight.
router.post(
  "/number",
  route((req) => {
    const { service, country, maxPrice } = req.body || {};
    if (!service) throw badRequest("service is required");
    if (country === undefined || country === "")
      throw badRequest("country is required");
    return callProvider(
      "getNumber",
      { service, country, maxPrice },
      { timeout: false },
    );
  }),
);

// GET /api/sms/status?id= -> STATUS_WAIT_CODE | STATUS_OK:<otp> | STATUS_CANCEL
router.get(
  "/status",
  route((req) => {
    const id = String(req.query.id || "").trim();
    if (!id) throw badRequest("id is required");
    return callProvider("getStatus", { id });
  }),
);

// GET /api/sms/set-status?id=&status=  (client calls this as GET)
router.get(
  "/set-status",
  route((req) => {
    const id = String(req.query.id || "").trim();
    const status = Number(req.query.status);
    if (!id) throw badRequest("id is required");
    // The guard also has to be finite: Number(undefined) is NaN, but a
    // non-numeric string is caught here and a valid number passes through.
    if (!Number.isFinite(status) || ![3, 6, 8].includes(status))
      throw badRequest("status must be 3, 6 or 8");
    return callProvider("setStatus", { id, status });
  }),
);

export default router;

// Allow running this file on its own (`node server/smsProxy.js`) for a quick
// provider test. When it is imported by server/index.js the guard below keeps
// the router from binding its own port.
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const app = express();
  app.use(express.json());
  app.use("/api/sms", router);

  // Unknown API routes -> JSON 404 so the client maps it to NOT_FOUND.
  app.use("/api", (req, res) =>
    fail(res, 404, "NOT_FOUND", "Endpoint not found."),
  );

  app.listen(PORT, () => {
    console.log(`SMS proxy listening on :${PORT}`);
    if (!API_KEY) console.warn("YANKEE_VERIFY_API_KEY is not set.");
    if (!PROVIDER_URL) console.warn("YANKEE_VERIFY_API_URL is not set.");
  });
}
