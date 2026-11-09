import assert from "node:assert/strict";
import { test } from "node:test";

process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
process.env.GOOGLE_EMAIL = "panda@example.com";
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.EMAIL_HOST;
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASSWORD;

const { sendPasswordResetLinkEmail } = await import("./emailService.js");

test("password reset email uses Gmail API and includes the branded Vercel link", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "mock-access-token", expires_in: 3600 });
    }
    return Response.json({ id: "mock-message-id" });
  };

  try {
    const resetUrl =
      "https://panda-numb.vercel.app/reset-password?token=single-use-token";
    const result = await sendPasswordResetLinkEmail("user@example.com", {
      resetUrl,
      expiresInMinutes: 15,
    });

    assert.deepEqual(result, { delivered: true });
    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].url,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    const message = Buffer.from(
      JSON.parse(calls[1].options.body).raw,
      "base64url",
    ).toString("utf8");
    assert.match(message, /Subject: Reset Your Panda Number Password/);
    assert.match(message, /Panda Number/);
    assert.match(message, /expires in 15 minutes/);
    assert.match(message, /ignore this email/);
    assert.ok(message.includes(resetUrl));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
