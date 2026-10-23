// Buy -> WhatsApp -> United States, reporting the confirm rows.
export default async function run(page, ui) {
  await page.goto("http://localhost:5173/login");
  await page.evaluate(() =>
    localStorage.setItem(
      "panda-numbers-auth",
      JSON.stringify({
        fullName: "QA",
        email: "perf.check@test.com",
        phone: "",
        initials: "QA",
        balanceUpdatedAt: Date.now(),
      }),
    ),
  );

  await page.goto("http://localhost:5173/buy");
  await page.waitForSelector(".service-card:not(.service-card-skeleton)", {
    timeout: 60000,
  });

  // The fixed dashboard header covers the card, so a pointer click hits the
  // header. Dispatch the click on the element itself instead.
  await page
    .locator(".service-card", { hasText: "WhatsApp" })
    .first()
    .evaluate((el) => el.click());

  await page.waitForSelector(".country-card", { timeout: 15000 });
  await page
    .locator(".country-card", { hasText: "United States" })
    .first()
    .evaluate((el) => el.click());

  await page.waitForSelector(".confirm-card", { timeout: 15000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".confirm-value")].some((n) =>
        /numbers|No stock data|Inventory unavailable/.test(n.textContent),
      ),
    { timeout: 25000 },
  );

  return await page.evaluate(() => ({
    rows: [...document.querySelectorAll(".confirm-row")].map((r) =>
      r.innerText.replace(/\s+/g, " ").trim(),
    ),
    errors: [...document.querySelectorAll(".insufficient-text")].map(
      (n) => n.innerText,
    ),
    stockText: [...document.querySelectorAll(".confirm-value")]
      .map((n) => n.innerText)
      .find((t) => /numbers|No stock data|Inventory/.test(t)),
  }));
}
