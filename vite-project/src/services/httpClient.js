/**
 * Panda Numbers - HTTP client
 * ===========================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Calling `response.json()` on a body that is empty - or that is an HTML page
 * from a proxy, a captive portal, or a SPA catch-all rewrite - throws
 *
 *     Failed to execute 'json' on 'Response': Unexpected end of JSON input
 *
 * That is exactly what a phone on mobile data hits: the request leaves the
 * device, is answered by something that is not our JSON API, and the page
 * crashes on a parser error instead of telling the user what went wrong.
 *
 * Every read of a response body in the app goes through `readJson()` here.
 * It NEVER throws on a malformed body; it reports what came back so the
 * caller can turn it into a message a human can act on.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Where the API lives.
 *
 * THE BUG THIS FIXES
 * ------------------
 * On Vercel the app is served as static files by the SPA rewrite in
 * vercel.json: any path that is not `/api/...` becomes index.html. When
 * VITE_API_BASE_URL was unset (or empty), `requestJson("/api/auth/login")`
 * resolved to `https://<app>.vercel.app/api/auth/login` - the FRONTEND host - so
 * the request hit Vercel, not the Render backend. Login, signup and
 * forgot-password then answered with the HTML shell (or a 404) instead of JSON,
 * which is exactly the "works on my laptop, fails on the phone" split: on the
 * laptop the Vite dev proxy forwards /api to the local Express server.
 *
 * Resolution order:
 *   1. `globalThis.__PANDA_API_BASE_URL__` - runtime override (tests, e2e).
 *   2. `VITE_API_URL` / `VITE_API_BASE_URL` / `VITE_BACKEND_URL` at build time -
 *      the Render URL in production. Any of the three names is accepted so an
 *      existing Vercel variable is not silently ignored because it is spelled
 *      differently.
 *   3. A same-origin deployment that serves the API itself (Render also hosts
 *      the build).
 *   4. Only as a LAST resort on a deployed host with no configured base: the
 *      production backend constant below.
 */
const BUNDLED_API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_BACKEND_URL)) ||
  "";

/**
 * The deployed backend, used ONLY when no VITE_* variable made it into a build
 * that is being served from a NON-LOCAL host.
 *
 * This is a PUBLIC URL (it appears in every request the browser makes anyway),
 * not a secret. It exists because a Vercel Production variable only reaches a
 * build created AFTER it is saved: a deploy made before that kept calling
 * `/api/...` on the static Vercel host, which answers with index.html. That is
 * the production-only login failure this removes.
 *
 * It is evaluated at RUNTIME and never on localhost, so `npm run dev`,
 * `vite preview` and the Vite proxy behave exactly as before.
 */
const PRODUCTION_API_BASE_URL = "https://pandanumbers-api.onrender.com";

/**
 * True when a URL points at this machine.
 *
 * A deployed build must never contain one. `VITE_API_URL=http://localhost:8787`
 * left in a Vercel environment makes every browser - including a phone - call
 * the visitor's own machine, failing with a network error whose cause is
 * invisible from the UI.
 */
function isLocalhostUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * True when the page is in a test runner (node), where a relative URL has no
 * origin to resolve against. `import.meta.env.SSR` covers Vite builds.
 */
const IS_NON_BROWSER =
  typeof window === "undefined" ||
  Boolean(typeof import.meta !== "undefined" && import.meta.env?.SSR);

let API_BASE_URL = BUNDLED_API_BASE_URL;

/** Trailing slashes are stripped so `${base}${path}` never becomes `//auth`. */
function normaliseBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * True when the request is going to the page's OWN host, with no configured
 * API host behind it.
 *
 * On a static-only deployment (Vercel) that means the API is NOT reachable -
 * those routes are rewritten to index.html, or the static host answers 404.
 * Detecting it lets the auth pages say "the app is not connected to its server"
 * instead of showing a parser error, and stops the on-device account fallback
 * from papering over a deployment that is pointed at the wrong place.
 *
 * An empty base is the common case: no VITE_API_BASE_URL means same-origin.
 */
function pointsAtFrontendHost() {
  if (typeof window === "undefined") return false;
  // A local dev/preview page normally uses same-origin ON PURPOSE (the Vite
  // proxy forwards /api to the Express server), so it is not a misconfigured
  // deployment. Reporting it as one made `npm run preview` unable to log in.
  if (isDevHost()) return false;
  const baseUrl = getApiBaseUrl();
  // No base at all -> the request goes to window.location.
  if (!baseUrl) return true;
  try {
    return (
      new URL(baseUrl, window.location.origin).host === window.location.host
    );
  } catch {
    return false;
  }
}

/** True when the page is being served from this machine (dev / preview). */
function isLocalPage() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
}

/**
 * True when the page is served from the DEVELOPMENT stack: this machine, or
 * another device on the same network reaching it (a phone on the LAN).
 *
 * THE BUG THIS FIXES
 * ------------------
 * `isLocalPage()` only recognised localhost/127.0.0.1. A phone opening
 * http://192.168.1.20:5173 is neither of those, so the base resolved to the
 * PRODUCTION backend: the phone called Render directly while the laptop called
 * the local Express server. Login then "worked on the laptop" but failed or
 * behaved differently on the phone - and every other API did too. Private LAN
 * ranges are exactly the dev server's other address, so they belong here.
 * A public deployment (Vercel/Render) is never in these ranges.
 */
function isDevHost() {
  if (isLocalPage()) return true;
  if (typeof window === "undefined") return false;

  const host = String(window.location.hostname || "").toLowerCase();
  if (!host) return false;

  // 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, and the 169.254.x link-local
  // address a phone falls back to when the router gives out no DHCP lease.
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/**
 * Decide which host the API lives on.
 *
 * - a configured base (VITE_API_URL / VITE_API_BASE_URL / VITE_BACKEND_URL) always
 *   wins, on localhost and deployed alike;
 * - otherwise a LOCAL page (localhost OR a LAN address such as 192.168.x,
 *   which is how a phone reaches the dev server) uses same-origin, so the
 *   request is a relative `/api/...` that the Vite proxy forwards to the local
 *   Express server. Absolute URLs are unchanged, so this never affects a real
 *   deployment);
 * - otherwise (a deployed host with no configured base) the production backend
 *   is used, because same-origin there is the static frontend, which has no
 *   /api routes - that request would be answered with index.html;
 * - in a non-browser (node tests) an empty base is kept relative, exactly as
 *   before.
 *
 * A configured base that points at THIS page's own host is also ignored on a
 * deployed page. That is the "no API URL configured" login failure in another
 * shape: VITE_API_URL set to the Vercel host itself makes every /api request
 * land on the static file server, which has no /api routes.
 */
function resolveApiBaseUrl() {
  const configured =
    API_BASE_URL &&
    (IS_NON_BROWSER ||
      isDevHost() ||
      (!isLocalhostUrl(API_BASE_URL) && !pointsAtPageHost(API_BASE_URL)))
      ? API_BASE_URL
      : "";

  if (configured) return configured;
  if (IS_NON_BROWSER || isDevHost()) return "";

  // No usable configured base (unset, or a localhost URL that cannot work from
  // a deployed page): use the production default rather than the static
  // frontend host, which has no /api routes.
  return PRODUCTION_API_BASE_URL;
}

/**
 * Same-origin in development, the configured backend everywhere else.
 * `globalThis.__PANDA_API_BASE_URL__` is the runtime override used by tests and
 * by deployments that host the API separately.
 *
 * Printed ONCE at startup so the real base URL of a deployment is visible in the
 * browser console without opening the Network tab. A bare relative path in a
 * production build is the single most common cause of "works locally, fails
 * live", so it is called out explicitly.
 */
let baseUrlLogged = false;

/** True when `value` resolves to the host serving this page. */
function pointsAtPageHost(value) {
  if (typeof window === "undefined" || !window.location) return false;
  try {
    return new URL(value, window.location.origin).host === window.location.host;
  } catch {
    return false;
  }
}

export function getApiBaseUrl() {
  const baseUrl = normaliseBaseUrl(
    globalThis.__PANDA_API_BASE_URL__ ||
      (globalThis.__PANDA_API_BASE_URL_LOCKED__ ? "" : resolveApiBaseUrl()),
  );

  if (!baseUrlLogged && typeof window !== "undefined" && !IS_NON_BROWSER) {
    baseUrlLogged = true;
    if (API_BASE_URL && !isDevHost() && isLocalhostUrl(API_BASE_URL)) {
      console.error(
        `[panda] VITE_API_URL is ${API_BASE_URL}, which only exists on a ` +
          "developer's machine. Ignored in this deployment - set it to the " +
          `public backend URL and redeploy. Using ${baseUrl || "same origin"} instead.`,
      );
    } else if (baseUrl && API_BASE_URL && !isDevHost() && pointsAtPageHost(API_BASE_URL)) {
      console.error(
        `[panda] VITE_API_URL is ${API_BASE_URL}, which is this website's own ` +
          "host (static files only, no /api routes). Ignored - the API host is " +
          `${baseUrl}.`,
      );
    } else if (baseUrl) {
      console.info(`[panda] API base URL: ${baseUrl}`);
    } else {
      console.info(
        `[panda] API base URL: same origin (${window.location.origin}) - ` +
          "dev/preview only; a deployed build must set VITE_API_URL.",
      );
    }
  }

  return baseUrl;
}

/**
 * Probe the configured API once and report whether it is really there.
 *
 * Used at startup so a deployment pointed at the wrong host shows one clear
 * message instead of every action failing in its own way. Never throws.
 *
 * @returns {Promise<{ok:boolean, baseUrl:string, status?:number}>}
 */
export async function checkApiHealth({ signal } = {}) {
  const baseUrl = getApiBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      cache: "no-store",
      signal,
    });
    // A JSON body proves the request reached our Express server. An HTML page
    // means a static host answered instead of the backend.
    const { parsed } = await readJson(response);
    return { ok: response.ok && parsed, baseUrl, status: response.status };
  } catch {
    return { ok: false, baseUrl, status: 0 };
  }
}

export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiError";
    /** The caller's name for the call ("login", "purchase a number"), or "". */
    this.operation = details.operation ?? "";
    /** HTTP status, or 0 when the request never got a response. */
    this.status = details.status ?? 0;
    /** Machine-readable code from the API, when it sent one. */
    this.code = details.code ?? "REQUEST_FAILED";
    /**
     * What actually went wrong. Drives the message the user sees:
     *   "network"  - request never completed (offline, wrong host, blocked)
     *   "timeout"  - no answer in time (slow mobile data)
     *   "parse"    - a response arrived but the body was not our JSON
     *   "http"     - the API answered with a status code
     */
    this.kind = details.kind ?? "network";
  }
}

/**
 * True when a failure means "there is no API server reachable", as opposed to
 * the server answering with a real error.
 *
 * The app is published as static files, so on a host with no backend the
 * request 404s or returns HTML. Those cases mean the auth pages should fall
 * back to the on-device account book rather than showing a dead end.
 *
 * A genuine 401/409/429 from a live server must NOT fall back: the credentials
 * really are wrong (or you really are throttled), and quietly signing the user
 * in from a stale on-device copy would hide a real security answer.
 *
 * 404/405 used to be treated as "unavailable", which turned a real 404 from the
 * backend (e.g. a missing route) into a silent local login. They are only
 * treated as unavailable when a parse failure came with them - i.e. a static
 * host answered with HTML.
 */
export function isBackendUnavailable(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === "network" || error.kind === "timeout") return true;
  // The server answered 503 UNCONFIGURED: it is running but missing a required
  // secret. That is a deployment fault, not a rejected password - reporting it
  // as "unavailable" lets the auth pages say so instead of "Request failed".
  if (error.status === 503 && error.code === "UNCONFIGURED") return true;
  // An HTML/unparseable body: the request reached something that is not our
  // API (SPA rewrite, proxy error page, captive portal).
  if (error.kind === "parse") return true;
  if (error.status === 401 || error.status === 403 || error.status === 429) {
    return false;
  }
  return error.status === 404 || error.status === 405 || error.status === 502;
}

/**
 * Read a response body as JSON without ever throwing on a bad body.
 *
 * Returns `{ data, parsed, empty, raw }`:
 *   data   - the parsed object, or null when the body was unusable
 *   parsed - true only when the body was valid JSON
 *   empty  - true when the body had no content at all
 *   raw    - the raw text, for diagnostics
 */
export async function readJson(response) {
  // Some callers (and older tests) supply a response-like object that only
  // implements json(). Fall back to it so nothing is silently lost.
  if (typeof response?.text !== "function") {
    if (typeof response?.json !== "function") {
      return { data: null, parsed: false, empty: true, raw: "" };
    }
    try {
      const data = await response.json();
      return { data, parsed: true, empty: false, raw: "" };
    } catch {
      return { data: null, parsed: false, empty: true, raw: "" };
    }
  }

  let raw;
  try {
    raw = await response.text();
  } catch {
    // The body stream itself failed (connection dropped mid-response).
    return { data: null, parsed: false, empty: true, raw: "" };
  }

  if (!raw || !raw.trim()) {
    return { data: null, parsed: false, empty: true, raw: "" };
  }

  try {
    return { data: JSON.parse(raw), parsed: true, empty: false, raw };
  } catch {
    return { data: null, parsed: false, empty: false, raw };
  }
}

/**
 * Build the user-facing message for a failed request.
 *
 * The wording is deliberately non-technical: the person reading it is on a
 * phone, not at a terminal.
 */
function describeFailure({ kind, status, data, operation = "" }) {
  const serverMessage =
    typeof data?.message === "string" && data.message.trim()
      ? data.message.trim()
      : "";

  // The caller's operation name makes a GENERIC failure name the call, so it is
  // never an anonymous "Request failed (500).".
  const withOperation = (message) =>
    operation ? `${operation}: ${message}` : message;

  // ...but it is a developer label, not something a customer should read. When
  // the server already explained itself, that sentence is the message: prefixing
  // it produced "sign up: This phone number has already been used." and
  // "purchase a number: Your wallet balance is not enough...". The operation is
  // still kept on `ApiError.operation` for logs and diagnostics.
  const explain = (fallback) => serverMessage || withOperation(fallback);

  if (kind === "network") {
    return explain(
      "Cannot reach the server. Check your internet connection and try again.",
    );
  }

  if (kind === "timeout") {
    return explain("The server took too long to respond. Please try again.");
  }

  if (kind === "parse") {
    // A 404/405 from a static host means the request hit the wrong server.
    if (status === 404 || status === 405) {
      return withOperation(
        "The app is not connected to its server yet. Please try again in a moment.",
      );
    }
    return explain("The server sent an unexpected response. Please try again.");
  }

  if (status === 429) {
    return explain("Too many attempts. Please wait and try again.");
  }

  return explain(`Request failed (${status || "unknown"}).`);
}

/**
 * True when the configured API base points at this page's own host.
 *
 * Exported so an auth page can explain the situation ("the app is not connected
 * to its server") instead of showing a parser error.
 */
export function isApiOnFrontendHost() {
  return pointsAtFrontendHost();
}

/**
 * Perform a JSON request against the API and return its parsed body.
 *
 * Throws `ApiError` - and only `ApiError` - on every failure path, so callers
 * never see a raw `SyntaxError` from `JSON.parse`.
 */
export async function requestJson(path, options = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    // The caller's name for this call. Appended to every failure message so a
    // "Request failed (500)." still says which operation it was.
    operation = "",
    // Session mode. The backend authenticates with a Bearer token that the
    // pages store themselves, so cookies are only needed when a caller
    // explicitly asks for them. Production calls are cross-origin
    // (Vercel -> Render) and use the Authorization header only, so nothing
    // ambient (a cookie) is ever sent.
    credentials = "omit",
  } = options;

  // Always a leading slash: `${base}/api/auth/login` must never become
  // `.../apiapi/auth/login` or `...api/auth/login` depending on how the
  // configured base was written.
  const safePath = String(path || "").startsWith("/")
    ? String(path)
    : `/${String(path || "")}`;
  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}${safePath}` : safePath;

  // `body` may be an object (serialised here) or an already-serialised string
  // (sent as-is), which keeps the existing apiClient contract intact.
  const isRawBody = typeof body === "string";
  const hasBody = body !== undefined && body !== null;

  // Combine the caller's abort signal with our own timeout so a hung mobile
  // connection cannot leave the submit button spinning forever.
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials,
      // Credentials are matched to the session, and a stale token must never be
      // served from an HTTP cache on a phone that came back online.
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(hasBody ? { body: isRawBody ? body : JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    // An abort the caller asked for is theirs to handle; do not relabel it.
    if (signal?.aborted) throw error;
    const kind = timedOut ? "timeout" : "network";
    throw new ApiError(describeFailure({ kind, operation }), { kind });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abortFromCaller);
  }

  // 204 No Content is a valid success with nothing to parse.
  if (response.status === 204) {
    if (!response.ok) {
      throw new ApiError(
        describeFailure({
          kind: "http",
          status: response.status,
          data: null,
          operation,
        }),
        { kind: "http", status: response.status, operation },
      );
    }
    return null;
  }

  const { data, parsed } = await readJson(response);

  if (!response.ok) {
    // The server's own code, when it sent one, so callers can branch on it
    // (e.g. UNAUTHORIZED -> sign out) instead of matching message text.
    const serverCode =
      typeof data?.error === "string" && data.error.trim()
        ? data.error.trim()
        : "REQUEST_FAILED";
    throw new ApiError(
      describeFailure({
        kind: "http",
        status: response.status,
        data,
        operation,
      }),
      {
        kind: "http",
        status: response.status,
        code: serverCode,
        operation,
      },
    );
  }

  if (!parsed) {
    // 2xx with an unreadable body: the app is pointed at something that is not
    // our API. Never let this reach the caller as a parser error.
    throw new ApiError(
      describeFailure({
        kind: "parse",
        status: response.status,
        data: null,
        operation,
      }),
      { kind: "parse", status: response.status, operation },
    );
  }

  return data;
}
