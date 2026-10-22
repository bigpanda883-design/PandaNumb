// Verify the Buy page really consumes the catalogue: pick a service, then a country.
export default async function run(page, ui) {
  const email = `qa${Date.now()}@example.com`;

  await page.goto("http://127.0.0.1:5173/signup");
  await page.waitForTimeout(500);
  await page.fill('input[name="fullName"]', "QA Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', `0803${String(Date.now()).slice(-7)}`);
  await page.fill('input[name="password"]', "StrongPass1!");
  await page.fill('input[name="confirmPassword"]', "StrongPass1!");
  const submit = await page.$('button[type="submit"]');
  await submit.click();
  await page.waitForTimeout(2500);

  await page.goto("http://127.0.0.1:5173/buy");
  // Wait for the skeleton to clear and real cards to appear (the catalogue is
  // ~1MB and can take a few seconds to fetch + parse on first load).
  await page
    .waitForFunction(
      () =>
        !document.querySelector('[aria-busy="true"]') &&
        document.querySelectorAll(".services-grid .service-card:not(.sk-row)")
          .length > 0,
      { timeout: 45000 },
    )
    .catch(() => {});

  const step1 = await page.evaluate(() => ({
    serviceCards: document.querySelectorAll(
      ".services-grid .service-card:not(.sk-row)",
    ).length,
    names: [...document.querySelectorAll(".services-grid .service-name")].map(
      (n) => n.innerText,
    ),
  }));

  // Click the first service (WhatsApp should be sorted first).
  const first = page
    .locator(".services-grid .service-card:not(.sk-row)")
    .first();
  await first.click();
  await page.waitForTimeout(3000);

  const step2 = await page.evaluate(() => ({
    heading: document.querySelector(".step-subtitle")?.innerText || null,
    countryCards: document.querySelectorAll(".countries-list .country-card")
      .length,
    firstCountries: [
      ...document.querySelectorAll(".countries-list .country-name"),
    ]
      .slice(0, 5)
      .map((n) => n.innerText),
    noResults: document.querySelector(".no-results")?.innerText || null,
  }));

  return { step1, step2 };
}
