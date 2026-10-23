// End-to-end check of the Buy page after the loading-speed changes.
export default async function run(page, ui) {
  const email = `perf.${Math.floor(Math.random() * 99999)}@test.com`;
  const log = [];

  // Real sign-up + sign-in so the wallet token is valid.
  await page.evaluate(
    async (payload) => {
      await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    { name: "Perf QA", email, password: "Panda123!" },
  );
  await page.goto("http://localhost:5173/login");
  await page.waitForSelector("#login-email");
  await page.fill("#login-email", email);
  await page.fill("#login-password", "Panda123!");
  await page.click("button.auth-submit");
  await page.waitForURL("**/dashboard", { timeout: 30000 });

  const t0 = Date.now();
  await page.goto("http://localhost:5173/buy");
  await page.waitForSelector(".service-card:not(.service-card-skeleton)", {
    timeout: 60000,
  });
  log.push(`services ready: ${Date.now() - t0}ms`);
  log.push(
    "cards: " +
      (await page.locator(".service-card:not(.service-card-skeleton)").count()),
  );
  log.push(
    "hint: " +
      (await page
        .locator(".service-more-hint")
        .innerText()
        .catch(() => "none")),
  );

  // Search must reach services that are not on the first screen.
  await page.fill(".country-search-bar input", "netflix");
  await page.waitForTimeout(200);
  const netflix = await page
    .locator(".service-card", { hasText: "Netflix" })
    .count();
  log.push(`search "netflix" -> ${netflix} card(s)`);
  await page.fill(".country-search-bar input", "");

  // Buy flow: WhatsApp -> United States -> inventory.
  await page.locator(".service-card", { hasText: "WhatsApp" }).first().click();
  await page
    .locator(".country-card", { hasText: "United States" })
    .first()
    .click();
  const t1 = Date.now();
  await page.waitForSelector(".confirm-card", { timeout: 10000 });
  log.push(`confirm card: ${Date.now() - t1}ms`);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".confirm-value")].some((n) =>
        /numbers|No stock data|Inventory unavailable/.test(n.textContent),
      ),
    { timeout: 20000 },
  );
  log.push(`inventory resolved: ${Date.now() - t1}ms`);
  const stock = await page
    .locator(".confirm-value")
    .filter({ hasText: /numbers|No stock data|Inventory/ })
    .first()
    .innerText();
  log.push(`stock: ${stock.trim()}`);

  return { log };
}
