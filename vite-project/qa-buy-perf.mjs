// Measures how the Buy page behaves on first load and when it is reopened.
export default async function run(page, ui) {
  const email = `perf.${Math.floor(Math.random() * 99999)}@test.com`;
  const steps = [];
  const mark = (name, ms) => steps.push(`${name}: ${ms}ms`);

  page.on("console", (m) => {
    if (m.type() === "error") steps.push(`CONSOLE ERROR: ${m.text()}`);
  });

  const reg = await page.evaluate(
    async (payload) => {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return r.status;
    },
    { name: "Perf QA", email, password: "Panda123!" },
  );
  steps.push(`register: ${reg}`);

  await page.goto("http://localhost:5173/login");
  await page.waitForSelector("#login-email", { timeout: 20000 });
  await page.fill("#login-email", email);
  await page.fill("#login-password", "Panda123!");
  await page.click("button.auth-submit");
  const tLogin = Date.now();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  mark("login->dashboard", Date.now() - tLogin);

  const priceRequests = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/prices") && !res.url().includes("/status")) {
      priceRequests.push({
        status: res.status(),
        cacheControl: res.headers()["cache-control"] || "",
      });
    }
  });

  const t1 = Date.now();
  await page.goto("http://localhost:5173/buy");
  const sawSkeleton = await page
    .waitForSelector(".service-card-skeleton", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  mark("skeleton visible", Date.now() - t1);
  await page.waitForSelector(".service-card:not(.service-card-skeleton)", {
    timeout: 60000,
  });
  mark("first load -> services", Date.now() - t1);
  const services = await page
    .locator(".service-card:not(.service-card-skeleton)")
    .count();

  await page.goto("http://localhost:5173/dashboard");
  await page.waitForTimeout(500);
  const t2 = Date.now();
  await page.goto("http://localhost:5173/buy");
  await page.waitForSelector(".service-card:not(.service-card-skeleton)", {
    timeout: 30000,
  });
  mark("reopen -> services", Date.now() - t2);

  const t3 = Date.now();
  await page.reload();
  await page.waitForSelector(".service-card:not(.service-card-skeleton)", {
    timeout: 30000,
  });
  mark("reload -> services", Date.now() - t3);

  const whatsappVisible = await page
    .locator(".service-card", { hasText: "WhatsApp" })
    .first()
    .isVisible()
    .catch(() => false);

  return {
    servicesRendered: services,
    whatsappVisible,
    sawSkeleton,
    priceResponses: priceRequests,
    steps,
  };
}
