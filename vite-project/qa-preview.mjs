/** Temporary QA: drive the built app in `vite preview` and report the login result. */
const argv = (process.argv || []).filter((a) => /^https?:\/\//.test(a));
const apiBase =
  argv.find((a) => a.includes(":8787")) || "http://127.0.0.1:8787";

export default async function run(page) {
  const email = `ui.${Date.now()}@example.com`;
  const password = "QaPassw0rd!";

  // The production bundle calls Render (correct for a real deployment); this
  // local run only has the local backend, so point the page at it - the same
  // runtime override the tests use.
  // Same origin as the preview page WITHOUT a port: the browser blocks a
  // non-secure page from calling a loopback/other-port address.
  await page.addInitScript(() => {
    globalThis.__PANDA_API_BASE_URL__ = `http://${location.hostname}:8787`;
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const res = await fetch(`${apiBase}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Preview User", email, phone: "", password }),
  });
  if (res.status !== 201)
    return { error: "seed signup failed", status: res.status };

  // The page is already open at /login (passed as the runner's URL argument).
  await page.locator('input[name="email"]').waitFor({ timeout: 30000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator("button.auth-submit").click();

  let outcome = "timeout";
  try {
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    outcome = "dashboard";
  } catch {
    outcome = await page
      .evaluate(() => {
        const popup = document.querySelector(".auth-mobile-popup");
        return popup ? `toast: ${popup.textContent.trim()}` : "no toast";
      })
      .catch(() => "unknown");
  }

  const state = await page.evaluate(() => ({
    url: location.pathname,
    hasUser: Boolean(localStorage.getItem("panda-numbers-auth")),
    hasToken: Boolean(localStorage.getItem("panda-numbers-auth-token")),
  }));

  return { email, outcome, ...state };
}
