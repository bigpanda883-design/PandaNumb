// Full QA flow against the running dev server.
export default async function run(page, ui) {
  const out = {};
  const email = `qa${Date.now()}@example.com`;

  // --- Sign up ---
  await page.goto("http://127.0.0.1:5173/signup");
  await page.waitForTimeout(500);
  await page.fill('input[name="fullName"]', "QA Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "08030000000");
  await page.fill('input[name="password"]', "StrongPass1!");
  await page.fill('input[name="confirmPassword"]', "StrongPass1!");
  await ui.snapshot(); // let refs/state settle
  const submit = await page.$('button[type="submit"]');
  await submit.click();
  await page.waitForTimeout(2500);
  out.afterSignupUrl = page.url();

  // --- Dashboard: is it stuck on the skeleton? ---
  await page.goto("http://127.0.0.1:5173/dashboard");
  await page.waitForTimeout(2500);
  out.dashboard = await page.evaluate(() => ({
    hasSkeleton: !!document.querySelector('[aria-busy="true"]'),
    hasBalanceBanner: !!document.querySelector(".balance-card-banner"),
    hasStatsGrid: !!document.querySelector(".stats-cards-grid"),
    hasServices: !!document.querySelector(".popular-services-grid"),
    bodyChars: document.body.innerText.length,
  }));

  // --- Buy page: catalogue load / 404 ---
  await page.goto("http://127.0.0.1:5173/buy");
  await page.waitForTimeout(6000);
  out.buy = await page.evaluate(() => ({
    hasBuyFlow: !!document.querySelector(".buy-flow-container"),
    hasSkeleton: !!document.querySelector('[aria-busy="true"]'),
    serviceCards: document.querySelectorAll(".services-grid .service-card")
      .length,
    errorCard:
      document.querySelector(".purchase-error-card")?.innerText || null,
    bodyChars: document.body.innerText.length,
  }));

  // --- My Numbers ---
  await page.goto("http://127.0.0.1:5173/my-numbers");
  await page.waitForTimeout(2500);
  out.myNumbers = await page.evaluate(() => ({
    hasWrapper: !!document.querySelector(".mynumbers-page-wrapper"),
    hasSkeleton: !!document.querySelector('[aria-busy="true"]'),
    emptyState: document.querySelector(".empty-state")?.innerText || null,
    bodyChars: document.body.innerText.length,
  }));

  // --- Active Logs (renamed) ---
  await page.goto("http://127.0.0.1:5173/active-logs");
  await page.waitForTimeout(1500);
  out.activeLogs = await page.evaluate(() => ({
    url: location.pathname,
    heading: document.querySelector("h1")?.innerText || null,
    overline: document.querySelector(".section-overline")?.innerText || null,
  }));

  // Old path should redirect, not 404
  await page.goto("http://127.0.0.1:5173/active-sms");
  await page.waitForTimeout(1500);
  out.oldActiveSmsPath = await page.evaluate(() => ({
    url: location.pathname,
    heading: document.querySelector("h1")?.innerText || null,
  }));

  return out;
}
