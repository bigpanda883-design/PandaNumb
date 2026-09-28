/**
 * Panda Numbers - server-side API proxy
 * =====================================
 * Keeps the Yankee Verify API key on the server. The frontend calls these
 * endpoints; only this process ever talks to the provider.
 *
 * Uses only Node built-ins - no dependencies to install, so `npm run dev` works
 * straight away.
 *
 * Run:  npm run dev:server        (port 8787 by default)
 * Env:  YANKEE_VERIFY_API_KEY=<key>        (required, server-side only)
 *       YANKEE_VERIFY_BASE_URL=<override>  (optional)
 *       PORT=<override>                    (optional)
 *
 * Production note: deploy this behind your real backend and keep the key in the
 * host's environment. The frontend should point VITE_SMS_API_BASE at it.
 */
import http from "node:http";

const PORT = Number(process.env.PORT) || 8787;
const API_KEY = process.env.YANKEE_VERIFY_API_KEY;
const BASE_URL =
  process.env.YANKEE_VERIFY_BASE_URL ||
  "https://yankee-verify-api.onrender.com/api/v1/handler_api.php";

/**
 * ACC Numbers price catalogue (services, costs, stock per country).
 *
 * Proxied through this server because the endpoint sends no
 * `Access-Control-Allow-Origin` header, so a browser fetch from the Vite origin
 * is blocked by CORS. A server-side fetch is not subject to CORS at all.
 */
const PRICES_URL =
  process.env.ACC_PRICES_URL ||
  "https://www.accnumbers.com/api/v1/guest/prices";

if (!API_KEY) {
  console.error(
    "[panda-server] YANKEE_VERIFY_API_KEY is not set.\n" +
      "              Copy .env.example to .env.server, add the key, then run:\n" +
      "              npm run dev:server",
  );
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Simple per-IP rate limit - stops a runaway poll loop burning the key.       */
/* -------------------------------------------------------------------------- */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 180;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

/* -------------------------------------------------------------------------- */
/* Provider call - the key is appended here and never sent to the client.      */
/* -------------------------------------------------------------------------- */
async function callProvider(action, params = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });

  const response = await fetch(url, { headers: { Accept: "text/plain" } });
  const text = (await response.text()).trim();

  // Raw provider reply goes to the server log only, never to the browser.
  console.log(`[panda-server] ${action} ${JSON.stringify(params)} -> ${text}`);

  return { ok: response.ok, status: response.status, text };
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Each route maps a frontend path to a provider action.
 * `params(query)` pulls the provider arguments out of the query string.
 */
const ROUTES = {
  "/api/sms/balance": { action: "getBalance", params: () => ({}) },
  // Not a provider action - handled directly by the catalogue route below.
  // Listed here so it is rate-limited like everything else.
  "/api/prices": { action: null, params: () => ({}) },
  "/api/sms/stock": {
    action: "getNumbersStatus",
    params: (q) => ({ country: q.get("country") }),
  },
  "/api/sms/number": {
    action: "getNumber",
    params: (q) => ({
      service: q.get("service"),
      country: q.get("country"),
      maxPrice: q.get("maxPrice"),
    }),
  },
  "/api/sms/status": {
    action: "getStatus",
    params: (q) => ({ id: q.get("id") }),
  },
  "/api/sms/set-status": {
    action: "setStatus",
    params: (q) => ({ id: q.get("id"), status: q.get("status") }),
  },
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ip = req.socket.remoteAddress || "unknown";

  // Health check - confirms the key loaded without revealing it.
  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, providerConfigured: true });
  }

  const route = ROUTES[url.pathname];
  if (!route) {
    return sendJson(res, 404, { error: "NOT_FOUND" });
  }

  if (isRateLimited(ip)) {
    return sendJson(res, 429, { error: "RATE_LIMITED" });
  }

  // The catalogue is served straight through from ACC Numbers: the frontend
  // parses the same JSON shape either way, so it is not rewritten here.
  if (url.pathname === "/api/prices") {
    try {
      const upstream = await fetch(PRICES_URL, {
        headers: { Accept: "application/json" },
      });

      if (!upstream.ok) {
        console.error(
          `[panda-server] prices upstream returned ${upstream.status}`,
        );
        return sendJson(res, 502, { error: "PRICES_UPSTREAM_ERROR" });
      }

      // Streamed rather than buffered: the payload is ~8 MB and there is no
      // reason to hold a second copy of it in memory.
      const body = await upstream.json();
      const payload = JSON.stringify(body);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        // Cached by the frontend for 10 minutes; let the CDN/browser agree.
        "Cache-Control": "public, max-age=600",
      });
      return res.end(payload);
    } catch (error) {
      console.error("[panda-server] prices fetch failed:", error.message);
      return sendJson(res, 502, { error: "PRICES_UNREACHABLE" });
    }
  }

  try {
    const { ok, status, text } = await callProvider(
      route.action,
      route.params(url.searchParams),
    );

    if (!ok) {
      return sendJson(res, 502, { error: "PROVIDER_HTTP_ERROR", status });
    }

    // Provider answers in plain text; the frontend parses it.
    return sendText(res, 200, text);
  } catch (error) {
    console.error(`[panda-server] ${route.action} failed:`, error.message);
    return sendJson(res, 502, { error: "PROVIDER_UNREACHABLE" });
  }
});

server.listen(PORT, () => {
  console.log(`[panda-server] listening on http://localhost:${PORT}`);
  console.log("[panda-server] provider key stays server-side");
});