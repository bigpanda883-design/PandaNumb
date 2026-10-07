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

let API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "";

/**
 * Same-origin by default. `globalThis.__PANDA_API_BASE_URL__` is the runtime
 * override used by tests and by deployments that host the API separately.
 */
export function getApiBaseUrl() {
  return globalThis.__PANDA_API_BASE_URL__ || API_BASE_URL || "";
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
 * A genuine 401/409 from a live server must NOT fall back: the credentials
 * really are wrong.
 */
export function isBackendUnavailable(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === "network" || error.kind === "timeout") return true;
  if (error.kind === "parse") return true;
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
function describeFailure({ kind, status, data }) {
  const serverMessage =
    typeof data?.message === "string" && data.message.trim()
      ? data.message.trim()
      : "";

  if (kind === "network") {
    return (
      serverMessage ||
      "Cannot reach the server. Check your internet connection and try again."
    );
  }

  if (kind === "timeout") {
    return (
      serverMessage || "The server took too long to respond. Please try again."
    );
  }

  if (kind === "parse") {
    // A 404/405 from a static host means the request hit the wrong server.
    if (status === 404 || status === 405) {
      return (
        "The app is not connected to its server yet. Please try again in a moment."
      );
    }
    return (
      serverMessage || "The server sent an unexpected response. Please try again."
    );
  }

  if (status === 429) {
    return serverMessage || "Too many attempts. Please wait and try again.";
  }

  return serverMessage || `Request failed (${status || "unknown"}).`;
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
  } = options;

  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}${path}` : path;

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
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(hasBody
        ? { body: isRawBody ? body : JSON.stringify(body) }
        : {}),
      signal: controller.signal,
    });
  } catch (error) {
    // An abort the caller asked for is theirs to handle; do not relabel it.
    if (signal?.aborted) throw error;
    const kind = timedOut ? "timeout" : "network";
    throw new ApiError(describeFailure({ kind }), { kind });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abortFromCaller);
  }

  // 204 No Content is a valid success with nothing to parse.
  if (response.status === 204) {
    if (!response.ok) {
      throw new ApiError(
        describeFailure({ kind: "http", status: response.status, data: null }),
        { kind: "http", status: response.status },
      );
    }
    return null;
  }

  const { data, parsed } = await readJson(response);

  if (!response.ok) {
    throw new ApiError(
      describeFailure({ kind: "http", status: response.status, data }),
      {
        kind: "http",
        status: response.status,
        code: data?.error || "REQUEST_FAILED",
      },
    );
  }

  if (!parsed) {
    // 2xx with an unreadable body: the app is pointed at something that is not
    // our API. Never let this reach the caller as a parser error.
    throw new ApiError(
      describeFailure({ kind: "parse", status: response.status, data: null }),
      { kind: "parse", status: response.status },
    );
  }

  return data;
}
