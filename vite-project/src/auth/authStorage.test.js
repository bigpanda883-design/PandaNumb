import assert from "node:assert/strict";
import { test } from "node:test";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

test("auth profile is tab-scoped and legacy local accounts are removed", async () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  localStorage.setItem("panda-numbers-auth", JSON.stringify({ email: "old@example.com" }));
  localStorage.setItem(
    "panda-numbers-local-accounts",
    JSON.stringify({ "old@example.com": { hash: "legacy" } }),
  );
  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = sessionStorage;
  globalThis.window = { dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  };

  const {
    clearAuthUser,
    getAuthToken,
    getAuthUser,
    isAuthenticated,
    saveSession,
  } = await import("./authStorage.js");

  assert.equal(localStorage.getItem("panda-numbers-auth"), null);
  assert.equal(localStorage.getItem("panda-numbers-local-accounts"), null);

  assert.equal(
    saveSession({ fullName: "Test User", email: "test@example.com" }, "token"),
    true,
  );
  assert.equal(localStorage.getItem("panda-numbers-auth"), null);
  assert.equal(localStorage.getItem("panda-numbers-auth-token"), null);
  assert.equal(sessionStorage.getItem("panda-numbers-auth") !== null, true);
  assert.equal(sessionStorage.getItem("panda-numbers-auth-token"), "token");
  assert.equal(getAuthUser()?.email, "test@example.com");
  assert.equal(getAuthToken(), "token");
  assert.equal(isAuthenticated(), true);

  clearAuthUser();
  assert.equal(getAuthUser(), null);
  assert.equal(getAuthToken(), "");
  assert.equal(isAuthenticated(), false);
});
