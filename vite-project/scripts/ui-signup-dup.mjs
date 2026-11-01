/**
 * Duplicate-phone signup: the server answers 409 PHONE_ALREADY_EXISTS. The UI
 * must say so ON THE PHONE FIELD, not only in a toast that disappears.
 */
export default async function run(page) {
  const taken = `080${String(Date.now()).slice(-8)}`;
  const first = {
    fullName: "Dup One",
    email: `dup1-${Date.now()}@example.test`,
    phone: taken,
    password: "DupPass12!",
  };

  const created = await page.request.post(
    "http://localhost:5173/api/auth/register",
    { data: first },
  );
  if (created.status() !== 201)
    return { setupFailed: created.status(), body: await created.text() };

  await page.goto("http://localhost:5173/signup", {
    waitUntil: "domcontentloaded",
  });
  await page.locator('input[name="fullName"]').fill("Dup Two");
  await page
    .locator('input[name="email"]')
    .fill(`dup2-${Date.now()}@example.test`);
  await page.locator('input[name="phone"]').fill(taken);
  await page.locator('input[name="password"]').fill("DupPass12!");
  await page.locator('input[name="confirmPassword"]').fill("DupPass12!");

  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForTimeout(4000);

  return await page.evaluate(() => {
    const phoneField = document
      .querySelector('input[name="phone"]')
      ?.closest(".field-group")
      ?.querySelector(".field-error");
    const emailField = document
      .querySelector('input[name="email"]')
      ?.closest(".field-group")
      ?.querySelector(".field-error");
    return {
      stayedOnSignup: location.pathname === "/signup",
      phoneError: phoneField ? phoneField.innerText.trim() : null,
      emailError: emailField ? emailField.innerText.trim() : null,
      phoneAriaInvalid: document
        .querySelector('input[name="phone"]')
        ?.getAttribute("aria-invalid"),
    };
  });
}
