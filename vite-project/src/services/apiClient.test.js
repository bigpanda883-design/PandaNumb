import test from "node:test";
import assert from "node:assert/strict";

import { loginUser } from "./apiClient.js";

const originalBase = globalThis.__PANDA_API_BASE_URL__;
const originalFetch = globalThis.fetch;

test("loginUser falls back to the same-origin /api route when no backend URL is set", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/auth/login");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), {
      email: "user@example.com",
      password: "StrongPass1!",
    });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          fullName: "Test User",
          email: "user@example.com",
          phone: "+123456789",
        },
        token: "abc123",
      }),
    };
  };

  const result = await loginUser({
    email: "user@example.com",
    password: "StrongPass1!",
  });

  assert.deepEqual(result.user.email, "user@example.com");
  assert.equal(result.token, "abc123");
});

test("loginUser posts to the configured auth endpoint and returns the user payload", async () => {
  globalThis.__PANDA_API_BASE_URL__ = "https://example.test";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://example.test/api/auth/login");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), {
      email: "user@example.com",
      password: "StrongPass1!",
    });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          fullName: "Test User",
          email: "user@example.com",
          phone: "+123456789",
        },
        token: "abc123",
      }),
    };
  };

  const result = await loginUser({
    email: "user@example.com",
    password: "StrongPass1!",
  });

  assert.deepEqual(result.user.email, "user@example.com");
  assert.equal(result.token, "abc123");
});

test.after(() => {
  globalThis.__PANDA_API_BASE_URL__ = originalBase;
  globalThis.fetch = originalFetch;
});
