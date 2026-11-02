import assert from "node:assert/strict";
import { after, test } from "node:test";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.YANKEE_API_KEY;
process.env.YANKEE_API_KEY = "test-provider-key";
const { getYankeeActivationStatus } = await import("./yankeeService.js");

after(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.YANKEE_API_KEY;
  else process.env.YANKEE_API_KEY = originalApiKey;
});

async function respondWith(body) {
  globalThis.fetch = async () => new Response(body, { status: 200 });
}

test("Yankee waiting and retry statuses stay pollable", async () => {
  for (const response of ["STATUS_WAIT_CODE", "STATUS_WAIT_RETRY"]) {
    await respondWith(response);
    assert.deepEqual(await getYankeeActivationStatus("activation-1"), {
      status: "WAITING",
      code: null,
    });
  }
});

test("Yankee verification code is preserved as a string", async () => {
  await respondWith("STATUS_OK:001234");
  assert.deepEqual(await getYankeeActivationStatus("activation-1"), {
    status: "CODE_RECEIVED",
    code: "001234",
  });
});

test("Yankee missing activations and provider errors are not reported as waiting", async () => {
  await respondWith("NO_ACTIVATION");
  await assert.rejects(getYankeeActivationStatus("activation-1"), {
    code: "NO_ACTIVATION",
  });

  await respondWith("BAD_KEY");
  await assert.rejects(getYankeeActivationStatus("activation-1"), {
    code: "BAD_KEY",
  });
});
