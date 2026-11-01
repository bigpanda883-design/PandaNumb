/**
 * Sign in, then drive the Fund Wallet flow for real so the screenshot shows the
 * page a customer sees. Returns what the UI said after pressing Continue.
 *
 * Pressing steps use Playwright locators with auto-waiting rather than raw ref
 * clicks: the page owns a loading gate (usePageLoading), so a control can exist
 * and be visible while it is still disabled and non-interactive.
 */
export default async function run(page, ui) {
  // randomUUID, not Date.now(): two runs in the same millisecond produced the
  // SAME address, and the second signup was correctly refused with 409.
  const email = `dep-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = "DepositPass1!";

  await page.request.post("http://localhost:5173/api/auth/register", {
    data: { name: "Deposit Walk", email, password },
  });

  await page.goto("http://localhost:5173/login", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("button", { name: /^login$/i })
    .waitFor({ timeout: 30000 });
  await page
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /^login$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 25000,
  });

  await page.goto("http://localhost:5173/deposit", {
    waitUntil: "domcontentloaded",
  });

  // A first-time signed-in session opens the WhatsApp announcement as a modal
  // overlay, which swallows every click underneath it. It appears ~700ms into
  // the session, so wait for it and dismiss it (the dismiss control is a plain
  // <button> whose label is "Maybe later").
  const maybeLater = page.locator(".whatsapp-popup-dismiss");
  try {
    await maybeLater.waitFor({ state: "visible", timeout: 8000 });
    await maybeLater.click();
    await page.waitForTimeout(400);
  } catch {
    // Not every run shows it (it is once per session).
  }

  const cont = page.getByRole("button", { name: /continue to payment/i });
  await cont.waitFor({ state: "visible", timeout: 30000 });
  // Enabled == the skeleton gate has lifted.
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        /continue to payment/i.test(b.textContent || ""),
      );
      return Boolean(btn) && !btn.disabled;
    },
    null,
    { timeout: 30000 },
  );

  const step1 = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
  );

  await cont.click();
  await page.waitForTimeout(1000);

  const step2Text = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").slice(0, 900),
  );

  // Step 2 "Continue" - the provider is not configured, so this must be
  // refused and the balance must not move.
  const before = await page.evaluate(() =>
    document.querySelector(".balance-amount")?.innerText?.trim(),
  );
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForTimeout(3500);

  const alert = await page.evaluate(() => {
    const el = document.querySelector(".deposit-error");
    return el ? el.innerText.trim() : null;
  });
  const after = await page.evaluate(() =>
    document.querySelector(".balance-amount")?.innerText?.trim(),
  );

  // Diagnosis for the unstyled banner: is the visible text styled at all?
  const alertStyle = await page.evaluate(() => {
    const el = document.querySelector(".deposit-error");
    if (!el) return null;
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      color: cs.color,
      background: cs.backgroundColor,
      border: cs.borderTopWidth + " " + cs.borderTopColor,
      height: Math.round(box.height),
      width: Math.round(box.width),
    };
  });

  return {
    step1,
    step2Text,
    alert,
    balanceBefore: before,
    balanceAfter: after,
    alertStyle,
  };
}
