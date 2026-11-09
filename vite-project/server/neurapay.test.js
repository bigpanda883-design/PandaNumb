import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, test } from "node:test";

const originalEnv = {
  key: process.env.NEURAPAY_SECRET_KEY,
  businessId: process.env.NEURAPAY_BUSINESS_ID,
  webhookSecret: process.env.NEURAPAY_WEBHOOK_SIGNING_SECRET,
  mode: process.env.NEURAPAY_MODE,
  nodeEnv: process.env.NODE_ENV,
  serviceName: process.env.RENDER_SERVICE_NAME,
};

const {
  describeConfig,
  isTestKey,
  missingConfig,
  verifyWebhookSignature,
} = await import("./neurapay.js");

function setValidTestConfig() {
  process.env.NEURAPAY_SECRET_KEY = "np_test_sk_test-only";
  process.env.NEURAPAY_BUSINESS_ID = "merchant-test-id";
  process.env.NEURAPAY_WEBHOOK_SIGNING_SECRET = "webhook-test-secret";
  process.env.NEURAPAY_MODE = "test";
  process.env.NODE_ENV = "test";
  delete process.env.RENDER_SERVICE_NAME;
}

after(() => {
  for (const [name, value] of Object.entries({
    NEURAPAY_SECRET_KEY: originalEnv.key,
    NEURAPAY_BUSINESS_ID: originalEnv.businessId,
    NEURAPAY_WEBHOOK_SIGNING_SECRET: originalEnv.webhookSecret,
    NEURAPAY_MODE: originalEnv.mode,
    NODE_ENV: originalEnv.nodeEnv,
    RENDER_SERVICE_NAME: originalEnv.serviceName,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("NeuraPay configuration names missing server-only settings", () => {
  delete process.env.NEURAPAY_SECRET_KEY;
  delete process.env.NEURAPAY_BUSINESS_ID;
  delete process.env.NEURAPAY_WEBHOOK_SIGNING_SECRET;
  process.env.NEURAPAY_MODE = "live";
  process.env.NODE_ENV = "test";
  assert.deepEqual(missingConfig(), [
    "NEURAPAY_SECRET_KEY",
    "NEURAPAY_BUSINESS_ID",
    "NEURAPAY_WEBHOOK_SIGNING_SECRET",
  ]);
  assert.equal(describeConfig().configured, false);
  assert.equal(JSON.stringify(describeConfig()).includes("np_"), false);
});

test("test key is restricted to the isolated production staging service", () => {
  setValidTestConfig();
  process.env.NODE_ENV = "production";
  assert.equal(isTestKey(), true);
  assert.ok(missingConfig().some((item) => item.includes("isolated staging")));
  process.env.RENDER_SERVICE_NAME = "pandanumbers-api-staging";
  assert.deepEqual(missingConfig(), []);
  process.env.RENDER_SERVICE_NAME = "pandanumbers-api";
  assert.ok(missingConfig().some((item) => item.includes("isolated staging")));
});

test("live mode refuses a test secret key", () => {
  setValidTestConfig();
  process.env.NEURAPAY_MODE = "live";
  assert.ok(missingConfig().some((item) => item.includes("test key cannot be used")));
});

test("webhook signature validates raw bytes and rejects tampering", () => {
  setValidTestConfig();
  const rawBody = Buffer.from('{"event":"payment.successful"}');
  const digest = crypto
    .createHmac("sha256", process.env.NEURAPAY_WEBHOOK_SIGNING_SECRET)
    .update(rawBody)
    .digest("hex");
  assert.equal(verifyWebhookSignature(rawBody, digest), true);
  assert.equal(verifyWebhookSignature(rawBody, `sha256=${digest}`), true);
  assert.equal(verifyWebhookSignature(Buffer.from("{}"), digest), false);
  assert.equal(verifyWebhookSignature(rawBody, "not-a-signature"), false);
});
