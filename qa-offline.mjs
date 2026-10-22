// Simulate a phone whose balance/transactions API never answers.
export default async function run(page, ui) {
  const email = `qa${Date.now()}@example.com`;

  // Sign up so we have an authenticated session.
  await page.goto("http://127.0.0.1:5173/signup");
  await page.waitForTimeout(500);
  await page.fill('input[name="fullName"]', "QA Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', "08030000001");
  await page.fill('input[name="password"]', "StrongPass1!");
  await page.fill('input[name="confirmPassword"]', "StrongPass1!");
  const submit = await page.$('button[type="submit"]');
  await submit.click();
  await page.waitForTimeout(2500);

  // Now break the balance + transactions endpoints, as a mobile network would.
  await page.route("**/api/wallet/balance", (route) => route.abort());
  await page.route("**/api/transactions", (route) => route.abort());

  await page.goto("http://127.0.0.1:5173/dashboard");
  await page.waitForTimeout(5000);

  return page.evaluate(() => ({
    hasSkeleton: !!document.querySelector('[aria-busy="true"]'),
    hasBalanceBanner: !!document.querySelector(".balance-card-banner"),
    hasStatsGrid: !!document.querySelector(".stats-cards-grid"),
    hasServices: !!document.querySelector(".popular-services-grid"),
    errorText:
      document.querySelector(".balance-error-text")?.innerText || null,
    retryButton: !!document.querySelector(".balance-retry-btn"),
    bodyChars: document.body.innerText.length,
  }));
}
