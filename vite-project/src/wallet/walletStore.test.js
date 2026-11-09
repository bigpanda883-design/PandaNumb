import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;
const originalBase = globalThis.__PANDA_API_BASE_URL__;
const values = new Map();

globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
globalThis.window = new EventTarget();
globalThis.CustomEvent = class extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
};
globalThis.__PANDA_API_BASE_URL__ = "https://api.example.test";

const { fetchBalance, getBalance } = await import("./walletStore.js");

test("wallet store loads the signed-in user's balance from the backend API", async () => {
  values.set("panda-numbers-auth-token", "session-token");
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.example.test/api/wallet/balance");
    assert.equal(options.headers.Authorization, "Bearer session-token");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ balance: 4210.5 }),
    };
  };

  assert.equal(await fetchBalance(), 4210.5);
  assert.equal(getBalance(), 4210.5);
});

test("wallet store does not replace a cached balance when the API fails", async () => {
  values.set("panda-numbers-wallet", JSON.stringify({ balance: 100 }));
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () =>
      JSON.stringify({
        error: "UNAVAILABLE",
        message: "Wallet service unavailable.",
      }),
  });

  await assert.rejects(() => fetchBalance(), /Wallet service unavailable/);
  assert.equal(getBalance(), 100);
});

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalStorage;
  globalThis.window = originalWindow;
  globalThis.CustomEvent = originalCustomEvent;
  globalThis.__PANDA_API_BASE_URL__ = originalBase;
});
