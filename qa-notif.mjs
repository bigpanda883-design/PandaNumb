// End-to-end check of the notification system:
//  1. seed unread notifications -> badge shows the REAL unread count
//  2. open the notifications page -> badge reflects the store
//  3. click "Mark all as read" -> badge disappears, cards go read
export default async function run(page, ui) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "panda-numbers-auth",
      JSON.stringify({
        fullName: "Big Panda",
        email: "fxpanda74@gmail.com",
        phone: "09132490567",
        initials: "BP",
      }),
    );
    // Two unread + one read notification = badge should read "2".
    localStorage.setItem(
      "panda-numbers-notifications",
      JSON.stringify([
        {
          id: "a1",
          type: "purchase",
          title: "Number purchased",
          description: "WhatsApp number +1 632 923 4808 is ready.",
          path: "/my-numbers",
          read: false,
          date: "18 Sept 2026, 02:00",
          createdAt: Date.now(),
        },
        {
          id: "a2",
          type: "deposit",
          title: "Deposit successful",
          description: "Your wallet has been credited.",
          path: "/transactions",
          read: false,
          date: "17 Sept 2026, 23:19",
          createdAt: Date.now() - 1000,
        },
        {
          id: "a3",
          type: "code",
          title: "Verification code received",
          description: "Telegram code 917414 arrived.",
          path: "/my-numbers",
          read: true,
          date: "07 Sept 2026, 07:55",
          createdAt: Date.now() - 2000,
        },
      ]),
    );
    // Stop the sample-history seeder from overwriting our fixture.
    localStorage.setItem("panda-numbers-notifications-seeded", "1");
  });

  await page.goto("http://localhost:5177/dashboard", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  const badge = () =>
    page.evaluate(() => {
      const el = document.querySelector(".dashboard-notification-badge");
      return el ? el.textContent.trim() : null;
    });

  const badgeBefore = await badge();

  // Go to the notifications page.
  await page
    .locator(".dashboard-icon-button[aria-label*='Notification']")
    .click();
  await page.waitForTimeout(900);

  const onPage = {
    url: page.url(),
    unreadCards: await page.locator(".notification-card-unread").count(),
    totalCards: await page.locator(".notification-card").count(),
    markAllVisible: await page.locator(".notifications-mark-all-btn").count(),
  };

  // Mark all read.
  const hasBtn = await page.locator(".notifications-mark-all-btn").count();
  if (hasBtn) {
    await page.locator(".notifications-mark-all-btn").click();
    await page.waitForTimeout(600);
  }

  const afterMark = {
    unreadCards: await page.locator(".notification-card-unread").count(),
    markAllVisible: await page.locator(".notifications-mark-all-btn").count(),
    storedUnread: await page.evaluate(() => {
      const raw = JSON.parse(
        localStorage.getItem("panda-numbers-notifications") || "[]",
      );
      return raw.filter((n) => !n.read).length;
    }),
  };

  // Back to the dashboard via the history stack - client-side, so
  // addInitScript does not re-run and re-seed the fixture.
  await page.goBack();
  await page.waitForTimeout(900);
  const badgeAfter = await badge();

  return {
    badgeBefore,
    onPage,
    afterMark,
    badgeAfter,
  };
}
