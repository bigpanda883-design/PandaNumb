import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, readJson, requestJson } from "./httpClient.js";

const originalBase = globalThis.__PANDA_API_BASE_URL__;
const originalFetch = globalThis.fetch;

/** Build a response-like object with a real body, like the browser returns. */
function makeResponse({ status = 200, body = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

test("readJson reports an empty body instead of throwing", async () => {
  const result = await readJson(makeResponse({ body: "" }));
  assert.equal(result.parsed, false);
  assert.equal(result.empty, true);
  assert.equal(result.data, null);
});

test("readJson reports a non-JSON (HTML) body instead of throwing", async () => {
  const html = "<!DOCTYPE html><html><body>Vercel</body></html>";
  const result = await readJson(makeResponse({ body: html }));
  assert.equal(result.parsed, false);
  assert.equal(result.data, null);
});

test("readJson returns parsed data for a valid JSON body", async () => {
  const result = await readJson(
    makeResponse({ body: JSON.stringify({ token: "abc" }) }),
  );
  assert.equal(result.parsed, true);
  assert.equal(result.data.token, "abc");
});

test("requestJson surfaces the API message on a 401 instead of a parse error", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  globalThis.fetch = async () =>
    makeResponse({
      status: 401,
      body: JSON.stringify({
        error: "INVALID_CREDENTIALS",
        message: "Incorrect email or password.",
      }),
    });

  await assert.rejects(
    () => requestJson("/api/auth/login", { method: "POST", body: {} }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, "http");
      assert.equal(error.status, 401);
      assert.equal(error.code, "INVALID_CREDENTIALS");
      assert.equal(error.message, "Incorrect email or password.");
      return true;
    },
  );
});

test("requestJson turns an empty 200 into a readable parse error, not a crash", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  // This is the exact body that used to produce
  // "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
  globalThis.fetch = async () => makeResponse({ status: 200, body: "" });

  await assert.rejects(
    () => requestJson("/api/auth/register", { method: "POST", body: {} }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, "parse");
      assert.doesNotMatch(error.message, /Unexpected end of JSON input/);
      return true;
    },
  );
});

test("requestJson turns an HTML 200 into a readable parse error", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  globalThis.fetch = async () =>
    makeResponse({ status: 200, body: "<!DOCTYPE html><html></html>" });

  await assert.rejects(
    () => requestJson("/api/auth/login", { method: "POST", body: {} }),
    (error) => {
      assert.equal(error.kind, "parse");
      assert.doesNotMatch(error.message, /Unexpected end of JSON input/);
      return true;
    },
  );
});

test("requestJson reports a network failure (offline phone) as kind 'network'", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  await assert.rejects(
    () => requestJson("/api/auth/login", { method: "POST", body: {} }),
    (error) => {
      assert.equal(error.kind, "network");
      assert.equal(error.status, 0);
      assert.match(error.message, /internet connection/i);
      return true;
    },
  );
});

test("requestJson returns the parsed payload on success", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  globalThis.fetch = async () =>
    makeResponse({
      status: 201,
      body: JSON.stringify({ user: { email: "a@b.com" }, token: "t" }),
    });

  const data = await requestJson("/api/auth/register", {
    method: "POST",
    body: { email: "a@b.com" },
  });
  assert.equal(data.token, "t");
  assert.equal(data.user.email, "a@b.com");
});

test("requestJson serialises an object body and sends a string body as-is", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  const sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push(options.body);
    return makeResponse({ body: "{}" });
  };

  await requestJson("/api/auth/login", { method: "POST", body: { a: 1 } });
  await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ b: 2 }),
  });

  assert.equal(sent[0], JSON.stringify({ a: 1 }));
  assert.equal(sent[1], JSON.stringify({ b: 2 }));
});

test("requestJson prefixes the operation name so failures name the call", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  globalThis.fetch = async () => makeResponse({ status: 500, body: "" });

  await assert.rejects(
    () =>
      requestJson("/api/auth/login", {
        method: "POST",
        body: {},
        operation: "login",
      }),
    /login/,
  );
});

test("a server message is shown verbatim, without the operation label", async () => {
  // The operation is a developer label. Prepending it made the UI read
  // "sign up: This phone number has already been used." - see describeFailure.
  globalThis.__PANDA_API_BASE_URL__ = "";
  globalThis.fetch = async () =>
    makeResponse({
      status: 409,
      body: JSON.stringify({
        error: "PHONE_ALREADY_EXISTS",
        message: "This phone number has already been used.",
      }),
    });

  await assert.rejects(
    () =>
      requestJson("/api/auth/register", {
        method: "POST",
        body: {},
        operation: "sign up",
      }),
    (error) => {
      assert.equal(error.message, "This phone number has already been used.");
      // Still available for logs and diagnostics.
      assert.equal(error.operation, "sign up");
      assert.equal(error.code, "PHONE_ALREADY_EXISTS");
      return true;
    },
  );
});

test.after(() => {
  globalThis.__PANDA_API_BASE_URL__ = originalBase;
  globalThis.fetch = originalFetch;
});
