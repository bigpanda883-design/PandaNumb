import nodemailer from "nodemailer";

const SMTP_HOST = process.env.EMAIL_HOST;
const SMTP_PORT = Number(process.env.EMAIL_PORT || 587);
const SMTP_USER = process.env.EMAIL_USER;
const SMTP_PASSWORD = process.env.EMAIL_PASSWORD;
const SMTP_FROM =
  process.env.EMAIL_FROM || SMTP_USER || "no-reply@pandanumbers.test";

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASSWORD
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: String(process.env.EMAIL_SECURE || "false") === "true",
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASSWORD,
        },
      })
    : null;

export async function sendPasswordResetEmail(email, code) {
  const expiresInMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 15);

  if (!transporter) {
    console.info(
      `[email] Password reset requested for ${email}. Code generated for local testing. Expiry: ${expiresInMinutes} minutes.`,
    );
    console.info(`[email] Reset code for ${email}: ${code}`);
    return { delivered: false, fallback: true };
  }

  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "Panda Numbers Password Reset Code",
    text: `Panda Numbers\n\nYour verification code is: ${code}\n\nThis code expires in ${expiresInMinutes} minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f8fafc;">
        <h2 style="margin-bottom: 12px; color: #0f172a;">Panda Numbers</h2>
        <h3 style="margin: 0 0 16px; color: #111827;">Password Reset Code</h3>
        <p style="margin: 0 0 16px; color: #374151;">Your verification code is:</p>
        <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; padding: 18px 12px; background: #ffffff; border-radius: 8px; text-align: center; color: #111827;">${code}</div>
        <p style="margin-top: 16px; color: #374151;">This code expires in ${expiresInMinutes} minutes.</p>
        <p style="margin-top: 12px; color: #6b7280;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  return { delivered: true };
}
