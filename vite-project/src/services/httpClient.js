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
 *   2. `VITE_API_BASE_URL` at build time - the Render URL in production.
 *   3. `VITE_BACKEND_URL` - alias kept so an existing project env still works.
 *   4. Same origin - correct in dev (Vite proxy) and when Render also serves
 *      the build.
 */
const BUNDLED_API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL)) ||
  "";

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

/**
 * Same-origin by default. `globalThis.__PANDA_API_BASE_URL__` is the runtime
 * override used by tests and by deployments that host the API separately.
 */
export function getApiBaseUrl() {
  return normaliseBaseUrl(
    globalThis.__PANDA_API_BASE_URL__ ||
      (globalThis.__PANDA_API_BASE_URL_LOCKED__ ? "" : API_BASE_URL),
  );
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

  // Every message ends with the operation name (when the caller supplied one),
  // so a failure is never an anonymous "Request failed (500).".
  const withOperation = (message) =>
    operation ? `${operation}: ${message}` : message;

  if (kind === "network") {
    return withOperation(
      serverMessage ||
        "Cannot reach the server. Check your internet connection and try again.",
    );
  }

  if (kind === "timeout") {
    return withOperation(
      serverMessage || "The server took too long to respond. Please try again.",
    );
  }

  if (kind === "parse") {
    // A 404/405 from a static host means the request hit the wrong server.
    if (status === 404 || status === 405) {
      return withOperation(
        "The app is not connected to its server yet. Please try again in a moment.",
      );
    }
    return withOperation(
      serverMessage ||
        "The server sent an unexpected response. Please try again.",
    );
  }

  if (status === 429) {
    return withOperation(
      serverMessage || "Too many attempts. Please wait and try again.",
    );
  }

  return withOperation(
    serverMessage || `Request failed (${status || "unknown"}).`,
  );
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
    // explicitly asks for them. Sending `credentials: "include"` on every call
    // makes the browser refuse a plain `Access-Control-Allow-Origin: *`, which
    // is exactly what a missing CORS header on mobile data looks like.
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
        { kind: "http", status: response.status },
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
      { kind: "parse", status: response.status },
    );
  }

  return data;
}
