// Final verification: signup -> logout -> login -> dashboard/buy/my-numbers/active-logs.
export default async function run(page, ui) {
  const out = {};
  const stamp = Date.now();
  const email = `qa${stamp}@example.com`;
  const phone = `0803${String(stamp).slice(-7)}`;
  const password = "StrongPass1!";

  // --- Sign up ---
  await page.goto("http://127.0.0.1:5173/signup");
  await page.waitForTimeout(600);
  await page.fill('input[name="fullName"]', "QA Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', phone);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await (await page.$('button[type="submit"]')).click();
  await page.waitForTimeout(3000);
  out.signupLandedOn = new URL(page.url()).pathname;

  // --- Dashboard (loaded, not stuck) ---
  await page.goto("http://127.0.0.1:5173/dashboard");
  await page.waitForTimeout(2500);
  out.dashboard = await page.evaluate(() => ({
    skeleton: !!document.querySelector('[aria-busy="true"]'),
    banner: !!document.querySelector(".balance-card-banner"),
    stats: !!document.querySelector(".stats-cards-grid"),
    services: !!document.querySelector(".popular-services-grid"),
  }));

  // --- My Numbers: correctly reachable, no 404 ---
  await page.goto("http://127.0.0.1:5173/my-numbers");
  await page.waitForTimeout(2500);
  out.myNumbers = await page.evaluate(() => ({
    path: location.pathname,
    wrapper: !!document.querySelector(".mynumbers-page-wrapper"),
    title: document.querySelector(".main-title")?.innerText || null,
    empty: document.querySelector(".empty-state")?.innerText || null,
    notFound: !!document.querySelector(".not-found-page"),
  }));

  // --- Buy: real catalogue ---
  await page.goto("http://127.0.0.1:5173/buy");
  await page.waitForTimeout(9000);
  out.buy = await page.evaluate(() => ({
    flow: !!document.querySelector(".buy-flow-container"),
    serviceCards: document.querySelectorAll(
      ".services-grid .service-card:not(.sk-row)",
    ).length,
    error: document.querySelector(".purchase-error-card")?.innerText || null,
  }));

  // --- Active Logs ---
  await page.goto("http://127.0.0.1:5173/active-logs");
  await page.waitForTimeout(1500);
  out.activeLogs = await page.evaluate(() => ({
    path: location.pathname,
    heading: document.querySelector("h1")?.innerText || null,
  }));

  // --- Logout then log back in (must not be broken) ---
  await page.goto("http://127.0.0.1:5173/dashboard");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto("http://127.0.0.1:5173/login");
  await page.waitForTimeout(1200);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await (await page.$('button[type="submit"]')).click();
  await page.waitForTimeout(3000);
  out.loginLandedOn = new URL(page.url()).pathname;
  out.loginError = await page.evaluate(
    () => document.querySelector('[role="alert"]')?.innerText || null,
  );

  return out;
}
