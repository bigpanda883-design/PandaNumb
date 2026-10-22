// server/smsRouter.js
// Mount in your existing server:  app.use("/api/sms", smsRouter);
// The Yankee key is read from process.env at request time, so it works no
// matter when your server loads its .env file. It is never logged or returned.
import express, { Router } from "express";

const DEFAULT_PROVIDER_URL =
  "https://yankee-verify-api.onrender.com/api/v1/handler_api.php";

// The provider runs on Render and can take ~50s to wake from idle.
const GET_TIMEOUT_MS = 60000;

/**
 * The key is read from process.env at REQUEST time (see getApiKey below), never
 * captured at import time, so this router still works when the .env is loaded
 * after this module.
 *
 * Both spellings are honoured because the rest of the server accepts either:
 * yankeeService.js reads YANKEE_API_KEY || YANKEE_VERIFY_API_KEY, and the
 * shipped .env.server defines YANKEE_API_KEY (YANKEE_VERIFY_API_KEY is only a
 * commented-out alias). Reading just one spelling reported a perfectly good key
 * as "not configured".
 */
const getApiKey = () =>
  process.env.YANKEE_VERIFY_API_KEY || process.env.YANKEE_API_KEY || "";

const getProviderUrl = () =>
  process.env.YANKEE_VERIFY_API_URL ||
  process.env.YANKEE_API_BASE_URL ||
  process.env.YANKEE_VERIFY_BASE_URL ||
  DEFAULT_PROVIDER_URL;

const router = Router();
router.use(express.json());

function fail(res, status, error, message) {
  return res.status(status).json({ error, message });
}

const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });

// Health check: reports whether config is present, never the key itself.
router.get("/health", (req, res) =>
  res.json({
    ok: true,
    keyConfigured: Boolean(getApiKey()),
    providerUrl: getProviderUrl(),
  }),
);

// Everything below needs the key.
router.use((req, res, next) => {
  if (!getApiKey()) {
    // PROVIDER_NOT_CONFIGURED, matching server/index.js and server/smsProxy.js.
    // BAD_KEY is reserved for "the provider rejected the key we sent", which is
    // a different problem and maps to different user-facing text.
    return fail(
      res,
      503,
      "PROVIDER_NOT_CONFIGURED",
      "Add YANKEE_VERIFY_API_KEY to configure SMS purchases.",
    );
  }
  next();
});

/** Call the provider and return its raw text. */
async function callProvider(action, params = {}, { timeout = true } = {}) {
  const url = new URL(getProviderUrl());
  url.searchParams.set("api_key", getApiKey());
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  let response;
  try {
    response = await fetch(url, {
      // `signal: undefined` is NOT the same as omitting it. A request with no
      // timeout must pass no signal at all, otherwise the POST that buys a
      // number loses its "never abandon a purchase mid-flight" guarantee.
      ...(timeout ? { signal: AbortSignal.timeout(GET_TIMEOUT_MS) } : {}),
    });
  } catch (error) {
    // A DNS/connection failure and a client timeout both arrive here. Tag them
    // so route() reports a timeout as a timeout instead of "unreachable".
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw Object.assign(new Error("The provider timed out."), {
        name: "TimeoutError",
        code: "PROVIDER_TIMEOUT",
      });
    }
    throw error;
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Provider HTTP ${response.status}`), {
      code: "PROVIDER_HTTP_ERROR",
    });
  }
  return (await response.text()).trim();
}

/** Turn thrown errors into the JSON shape the client expects. */
const route = (handler) => async (req, res) => {
  try {
    const text = await handler(req);
    // An empty string is still an answer: res.send("") sends no body, and the
    // client treats that as a valid (bodyless) confirmation for set-status.
    res.type("text/plain").send(text ?? "");
  } catch (error) {
    if (error?.status === 400)
      return fail(res, 400, "BAD_ACTION", error.message);
    if (error?.code === "PROVIDER_TIMEOUT") {
      return fail(res, 504, "PROVIDER_TIMEOUT", "The provider timed out.");
    }
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return fail(res, 504, "PROVIDER_TIMEOUT", "The provider timed out.");
    }
    if (error?.code === "PROVIDER_HTTP_ERROR") {
      return fail(res, 502, "PROVIDER_HTTP_ERROR", error.message);
    }
    // Log the cause only. Never log the URL: it contains the API key.
    console.error(
      "[sms] provider call failed:",
      error?.name,
      error?.code,
      error?.cause?.code,
      error?.message,
    );
    return fail(
      res,
      502,
      "PROVIDER_UNREACHABLE",
      "Could not reach the provider.",
    );
  }
};

// GET /api/sms/balance -> ACCESS_BALANCE:<n>
router.get(
  "/balance",
  route(() => callProvider("getBalance")),
);

// GET /api/sms/stock?country=US -> {"wa_0":"250344",...}
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

// /api/sms/set-status?id=&status=  (3 = another code, 6 = finish, 8 = cancel)
//
// Accepted as BOTH GET and POST: smsProvider.js sends it as a POST so the
// activation id and status do not sit in the URL (and in every access log),
// while the older callers still use GET. `req.query` is parsed on a POST too,
// so a POST with the values in the query string keeps working.
const setStatusHandler = route((req) => {
  const source = { ...(req.query || {}), ...(req.body || {}) };
  const id = String(source.id || "").trim();
  const status = Number(source.status);
  if (!id) throw badRequest("id is required");
  // isFinite first: Number("abc") is NaN and Number(undefined) is NaN, and
  // isFinite(NaN) is false, so this rejects non-numeric input as well.
  if (!Number.isFinite(status) || ![3, 6, 8].includes(status))
    throw badRequest("status must be 3, 6 or 8");
  return callProvider("setStatus", { id, status });
});
router.get("/set-status", setStatusHandler);
router.post("/set-status", setStatusHandler);

export default router;
