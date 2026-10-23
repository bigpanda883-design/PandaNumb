export default async function run(page, ui) {
  const results = {};

  for (const path of ["/login", "/signup"]) {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`http://localhost:5173${path}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const doc = document.documentElement;
      const widest = [...document.querySelectorAll("body *")]
        .map((el) => ({
          sel:
            el.className && typeof el.className === "string"
              ? `.${el.className.split(" ").join(".")}`
              : el.tagName,
          right: Math.round(el.getBoundingClientRect().right),
          left: Math.round(el.getBoundingClientRect().left),
        }))
        .filter((el) => el.right > window.innerWidth + 1 || el.left < -1)
        .slice(0, 8);

      const submit = document.querySelector(".auth-submit");
      const rect = submit?.getBoundingClientRect();

      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        docScrollWidth: doc.scrollWidth,
        scrollHeight: doc.scrollHeight,
        horizontalOverflow: doc.scrollWidth > window.innerWidth,
        overflowingElements: widest,
        submitBottom: rect ? Math.round(rect.bottom) : null,
        leftPanelVisible: (() => {
          const p = document.querySelector(".auth-left-panel");
          if (!p) return null;
          return getComputedStyle(p).display !== "none";
        })(),
        inputFontSize: getComputedStyle(
          document.querySelector(".field-group input"),
        ).fontSize,
      };
    });

    results[path] = info;
    await page.screenshot({
      path: `C:\\Users\\owner\\Desktop\\PandaNumb\\.qa${path.replace("/", "-")}-mobile.png`,
    });
  }

  return results;
}
