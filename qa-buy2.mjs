// Focused Buy check: sign up, then wait for the catalogue to fully settle.
export default async function run(page, ui) {
  const stamp = Date.now();
  const email = `qa${stamp}@example.com`;

  await page.goto("http://127.0.0.1:5173/signup");
  await page.waitForTimeout(600);
  await page.fill('input[name="fullName"]', "QA Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', `0803${String(stamp).slice(-7)}`);
  await page.fill('input[name="password"]', "StrongPass1!");
  await page.fill('input[name="confirmPassword"]', "StrongPass1!");
  await (await page.$('button[type="submit"]')).click();
  await page.waitForTimeout(3000);

  const pricesDone = page.waitForResponse(
    (r) => r.url().includes("/api/prices"),
    { timeout: 60000 },
  );
  await page.goto("http://127.0.0.1:5173/buy");
  const resp = await pricesDone.catch(() => null);

  // Let React re-render the loaded catalogue into the grid.
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => ({
    flow: !!document.querySelector(".buy-flow-container"),
    error: document.querySelector(".purchase-error-card")?.innerText || null,
    cards: document.querySelectorAll(
      ".services-grid .service-card:not(.sk-row)",
    ).length,
    names: [...document.querySelectorAll(".services-grid .service-name")].map(
      (n) => n.innerText,
    ),
  }));

  return { pricesStatus: resp ? resp.status() : "no-response", state };
}
