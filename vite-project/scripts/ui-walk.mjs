/**
 * Browser walk-through: signs up a real account and visits every page.
 * Returns the console/network problems seen on each page so they can be fixed
 * rather than guessed at.
 */
export default async function run(page, ui) {
  const report = { pages: [], consoleErrors: [], failedRequests: [] };

  page.on("console", (msg) => {
    if (msg.type() === "error")
      report.consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("requestfailed", (req) => {
    report.failedRequests.push(
      `${req.method()} ${req.url()} :: ${req.failure()?.errorText}`,
    );
  });

  // randomUUID, not Date.now(): two runs in the same millisecond produced the
  // SAME address, and the second signup was correctly refused with 409.
  const email = `ui-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = "UiWalkPass1!";

  // ---- signup through the real UI -----------------------------------------
  await page.goto("http://localhost:5173/signup", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  let snap = await ui.snapshot();
  report.pages.push({ page: "signup", snapshot: snap.slice(0, 1500) });

  // Fill by label/role so this does not depend on the exact markup.
  const inputs = page.locator("input");
  const count = await inputs.count();
  const fieldNames = [];
  for (let i = 0; i < count; i++) {
    fieldNames.push(
      (await inputs.nth(i).getAttribute("name")) ||
        (await inputs.nth(i).getAttribute("type")),
    );
  }

  try {
    await page
      .locator('input[name="fullName"], input[name="name"]')
      .first()
      .fill("UI Walk");
    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .fill(email);
    // Unique phone: it has a UNIQUE index, so a fixed test number is rejected
    // with 409 PHONE_ALREADY_EXISTS on the second run of the suite.
    const uniquePhone = `080${String(Date.now()).slice(-8)}`;
    const phone = page.locator('input[type="tel"], input[name="phone"]');
    if (await phone.count()) await phone.first().fill(uniquePhone);
    const pw = page.locator('input[type="password"]');
    const pwCount = await pw.count();
    for (let i = 0; i < pwCount; i++) await pw.nth(i).fill(password);

    snap = await ui.snapshot();
    // Case-insensitive: the button reads "Create Account".
    const submitRef =
      snap.match(/@(e\d+) button "create account"/i)?.[1] ||
      snap.match(/@(e\d+) button "sign up"/i)?.[1];
    if (!submitRef)
      throw new Error(`no submit button in: ${snap.slice(0, 400)}`);
    await ui.click(submitRef);
    // Wait for the route to actually change instead of guessing a delay.
    await page.waitForURL((url) => !url.pathname.startsWith("/signup"), {
      timeout: 20000,
    });
    await page.waitForTimeout(2000);
    report.signupFields = fieldNames;
    report.afterSignupUrl = page.url();
  } catch (error) {
    report.signupError = String(error).slice(0, 300);
    report.signupFields = fieldNames;
  }

  // ---- visit every protected page -----------------------------------------
  const routes = [
    "/dashboard",
    "/buy",
    "/deposit",
    "/transactions",
    "/my-numbers",
    "/active-logs",
    "/notifications",
    "/profile",
    "/security",
    "/help-center",
  ];

  for (const route of routes) {
    const before = {
      errors: report.consoleErrors.length,
      failed: report.failedRequests.length,
    };
    await page.goto(`http://localhost:5173${route}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2500);

    const info = await page.evaluate(() => ({
      title: document.title,
      bodyChars: document.body.innerText.trim().length,
      heading: document.querySelector("h1, h2")?.innerText || "",
      hasErrorBoundary: document.body.innerText.includes(
        "Something went wrong",
      ),
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 220),
    }));

    report.pages.push({
      route,
      ...info,
      newConsoleErrors: report.consoleErrors.slice(before.errors),
      newFailedRequests: report.failedRequests.slice(before.failed),
    });
  }

  return report;
}
