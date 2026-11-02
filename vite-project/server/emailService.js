import nodemailer from "nodemailer";

/**
 * Panda Numbers - outgoing email
 * ==============================
 *
 * Mail is sent through the configured Gmail mailbox over SMTP
 * with a Google App Password. Credentials live ONLY in the backend environment;
 * nothing here is ever bundled into the React app or returned in an API response.
 *
 * Canonical variables (as configured on Render):
 *   SMTP_HOST  smtp.gmail.com
 *   SMTP_PORT  465            (port 587 with SMTP_SECURE=false also works)
 *   SMTP_USER  pandanumbersms@gmail.com
 *   SMTP_PASS  <Google App Password>
 *   MAIL_FROM  Panda Number <pandanumbersms@gmail.com>
 *
 * The older EMAIL_* names are still honoured so an existing deployment keeps
 * working after this change.
 *
 * NOTE: environment values are read when this module is first imported. On
 * Render the variables exist before the process starts, so that is correct
 * there. Locally, start the server with `--env-file=.env.server` (which
 * `npm run dev` and `npm run dev:server` already do) so they are present first.
 */

const SMTP_HOST = process.env.SMTP_HOST || process.env.EMAIL_HOST || "";
const SMTP_PORT = Number(
  process.env.SMTP_PORT || process.env.EMAIL_PORT || 465,
);
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || "";
const SMTP_PASSWORD = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || "";
const SMTP_FROM =
  process.env.MAIL_FROM ||
  process.env.EMAIL_FROM ||
  "Panda Number <pandanumbersms@gmail.com>";

/**
 * Port 465 is implicit TLS; 587 (and 25) use STARTTLS. Getting this backwards
 * makes the connection hang instead of failing fast, so it is derived from the
 * port unless EMAIL_SECURE explicitly overrides it.
 */
const SMTP_SECURE =
  process.env.EMAIL_SECURE !== undefined
    ? String(process.env.EMAIL_SECURE) === "true"
    : SMTP_PORT === 465;

/** How long a reset code stays valid. Shared by the email and the server. */
export const RESET_CODE_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_TTL_MINUTES || 10,
);

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASSWORD
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASSWORD,
        },
      })
    : null;

/** True when SMTP is configured. Never exposes the credentials themselves. */
export function isEmailConfigured() {
  return Boolean(transporter);
}

export function getEmailSender() {
  return SMTP_FROM;
}

/**
 * Shared HTML shell so every Panda Number email looks like one product.
 * Inline styles only - Gmail and Outlook strip <style> blocks.
 */
function renderLayout({ heading, bodyHtml }) {
  return `
    <div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="background:#0066ff;padding:20px 24px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">Panda Number</span>
        </div>
        <div style="padding:28px 24px;">
          <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">${heading}</h2>
          ${bodyHtml}
        </div>
        <div style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
          This is an automated message from Panda Number. Please do not reply.
        </div>
      </div>
    </div>
  `;
}

/**
 * Escape user-controlled text before it enters HTML. Without this, a display
 * name such as `<b>x</b>` would be rendered as markup in the recipient's inbox.
 */
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send one message. NEVER throws.
 *
 * Callers use the result for logging only: a mail outage must not turn a
 * successful login or a stored reset code into a user-facing failure.
 *
 * @returns {Promise<{delivered:boolean, reason?:string}>}
 */
async function send({ to, subject, text, html }) {
  if (!transporter) {
    // No SMTP configured (local development). Never print the body: it can
    // contain a reset code.
    console.warn(
      `[email] SMTP is not configured - "${subject}" was NOT sent to ${to}. ` +
        "Set SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM.",
    );
    return { delivered: false, reason: "NOT_CONFIGURED" };
  }

  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { delivered: true };
  } catch (error) {
    console.error(
      `[email] Delivery failed for "${subject}":`,
      error?.code || error?.responseCode || error?.message,
    );
    return {
      delivered: false,
      reason: error?.code || error?.responseCode || "SEND_FAILED",
    };
  }
}

/**
 * Successful-login notification.
 *
 * Sent only after the backend has verified the credentials. Delivery failure is
 * deliberately swallowed: the user IS signed in, and telling them the login
 * failed because the mailbox was unreachable would be false.
 */
export async function sendLoginNotificationEmail({ email, name }) {
  const displayName = String(name || "").trim() || "there";
  const safeName = escapeHtml(displayName);

  const html = renderLayout({
    heading: "Successful login notification",
    bodyHtml: `
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">Hello ${safeName},</p>
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">
        You have successfully logged in to your Panda Number account.
      </p>
      <p style="margin:0 0 8px;color:#334155;line-height:1.6;">You can now:</p>
      <ul style="margin:0 0 18px;padding-left:20px;color:#334155;line-height:1.8;">
        <li>Buy virtual numbers for supported services.</li>
        <li>Receive verification codes and check your active logs.</li>
        <li>Manage your numbers, transactions and account balance.</li>
        <li>View your profile and account notifications.</li>
      </ul>
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">
        If this wasn't you, please secure your account by changing your password.
      </p>
      <p style="margin:0;color:#334155;line-height:1.6;">
        Thank you for using Panda Number.<br />
        <strong>The Panda Number Team</strong>
      </p>
    `,
  });

  const text = [
    `Hello ${displayName},`,
    "",
    "You have successfully logged in to your Panda Number account.",
    "",
    "You can now:",
    "- Buy virtual numbers for supported services.",
    "- Receive verification codes and check your active logs.",
    "- Manage your numbers, transactions and account balance.",
    "- View your profile and account notifications.",
    "",
    "If this wasn't you, please secure your account by changing your password.",
    "",
    "Thank you for using Panda Number.",
    "",
    "The Panda Number Team",
  ].join("\n");

  return send({
    to: email,
    subject: "You have successfully logged in to Panda Number",
    text,
    html,
  });
}

export async function sendEmailVerificationEmail(email, code) {
  const expiresInMinutes = RESET_CODE_TTL_MINUTES;
  const html = renderLayout({
    heading: "Verify your email address",
    bodyHtml: `
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">
        Enter this code to finish creating your Panda Number account:
      </p>
      <div style="margin:0 0 16px;padding:18px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;font-size:32px;letter-spacing:10px;font-weight:700;color:#0f172a;">
        ${escapeHtml(code)}
      </div>
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">
        This code expires in ${expiresInMinutes} minutes and can be used once.
      </p>
      <p style="margin:0;color:#64748b;line-height:1.6;">
        If you did not create a Panda Number account, you can ignore this email.
      </p>
    `,
  });
  const text = [
    "Panda Number",
    "",
    `Your email verification code is: ${code}`,
    "",
    `This code expires in ${expiresInMinutes} minutes and can be used once.`,
    "",
    "If you did not create a Panda Number account, you can ignore this email.",
  ].join("\n");

  return send({
    to: email,
    subject: "Verify your Panda Number email",
    text,
    html,
  });
}

export async function sendWelcomeEmail({ email, name }) {
  const displayName = String(name || "").trim() || "there";
  const safeName = escapeHtml(displayName);
  const html = renderLayout({
    heading: "Welcome to Panda Number",
    bodyHtml: `
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">Hello ${safeName},</p>
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">
        Your registration was successful. Welcome to Panda Number!
      </p>
      <p style="margin:0;color:#334155;line-height:1.6;">
        You can now log in and start using the platform.
      </p>
    `,
  });
  const text = [
    `Hello ${displayName},`,
    "",
    "Your registration was successful. Welcome to Panda Number!",
    "Welcome to Panda Number!",
    "",
    "You can now log in and start using the platform.",
  ].join("\n");

  return send({
    to: email,
    subject: "Welcome to Panda Number",
    text,
    html,
  });
}

/**
 * The six-digit password reset code.
 *
 * The code exists only in this email and as a bcrypt hash in the database: it is
 * never logged, returned by the API, or stored in plaintext.
 */
export async function sendPasswordResetEmail(email, code) {
  const expiresInMinutes = RESET_CODE_TTL_MINUTES;

  const html = renderLayout({
    heading: "Password reset code",
    bodyHtml: `
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">
        We received a request to reset the password for your Panda Number account.
        Enter this code to continue:
      </p>
      <div style="margin:0 0 16px;padding:18px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;font-size:32px;letter-spacing:10px;font-weight:700;color:#0f172a;">
        ${escapeHtml(code)}
      </div>
      <p style="margin:0 0 14px;color:#334155;line-height:1.6;">
        This code expires in ${expiresInMinutes} minutes and can be used once.
      </p>
      <p style="margin:0;color:#64748b;line-height:1.6;">
        If you did not request this, you can ignore this email - your password
        will not change.
      </p>
    `,
  });

  const text = [
    "Panda Number",
    "",
    `Your password reset code is: ${code}`,
    "",
    `This code expires in ${expiresInMinutes} minutes and can be used once.`,
    "",
    "If you did not request this, you can ignore this email - your password will not change.",
  ].join("\n");

  return send({
    to: email,
    subject: "Panda Number password reset code",
    text,
    html,
  });
}
