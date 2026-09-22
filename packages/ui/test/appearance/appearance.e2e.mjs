// Run Vite from repo root with this directory's vite.config.mjs before this script.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const output = "output/mgcode-review";
await mkdir(output, { recursive: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5188/packages/ui/test/appearance/index.html");
  await page.getByRole("combobox").first().waitFor();
  const select = async (name) => {
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name, exact: true }).click();
  };
  const verify = async (theme, dark) => {
    await page.waitForFunction(
      ({ theme, dark }) =>
        localStorage.getItem("zcode-theme") === theme &&
        document.documentElement.classList.contains("dark") === dark,
      { theme, dark },
    );
    const actual = await page.evaluate(() => ({
      theme: localStorage.getItem("zcode-theme"),
      mango: document.documentElement.classList.contains("theme-mango"),
      dark: document.documentElement.classList.contains("dark"),
      custom: document.documentElement.getAttribute("data-theme-applied"),
    }));
    assert.equal(actual.theme, theme);
    assert.equal(actual.mango, theme === "mango");
    assert.equal(actual.dark, dark);
    assert.equal(actual.custom, null);
  };
  for (const [label, theme, dark] of [
    ["浅色", "zai-light", false],
    ["芒果AI", "mango", true],
    ["深色", "zai-dark", true],
    ["芒果AI", "mango", true],
  ]) {
    await select(label);
    await verify(theme, dark);
    await page.reload();
    await page.getByRole("combobox").first().waitFor();
    await verify(theme, dark);
  }
  await page.getByRole("button", { name: "保存并应用" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme-applied"), "custom");
  assert.equal(
    await page.locator("html").evaluate((e) => e.classList.contains("theme-mango")),
    false,
  );
  await select("芒果AI");
  await verify("mango", true);
  assert.equal(await page.getByRole("button", { name: "移除当前主题" }).count(), 0);
  await page.getByRole("button", { name: "保存并应用" }).click();
  await page.getByRole("button", { name: "移除当前主题" }).click();
  await verify("mango", true);
  await page.getByRole("button", { name: "system", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await verify("system", false);
  await page.emulateMedia({ colorScheme: "dark" });
  await verify("system", true);
  await page.getByRole("button", { name: "mango", exact: true }).click();
  await verify("mango", true);
  const contrast = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const luminance = (hex) => {
      const v = hex
        .trim()
        .slice(1)
        .match(/../g)
        .map((c) => parseInt(c, 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    };
    const result = [];
    for (const fg of ["foreground", "foreground-subtle", "foreground-subtlest"])
      for (const bg of [
        "background",
        "panel",
        "card",
        "popover",
        "input",
        "selected",
        "menu-hover",
        "tooltip",
      ]) {
        const a = luminance(css.getPropertyValue("--color-" + fg)),
          b = luminance(css.getPropertyValue("--color-" + bg));
        result.push({ fg, bg, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
      }
    const a = luminance(css.getPropertyValue("--color-primary")),
      b = luminance(css.getPropertyValue("--color-primary-foreground"));
    result.push({
      fg: "primary-foreground",
      bg: "primary",
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    });
    return result;
  });
  assert.ok(
    contrast.every((p) => p.ratio >= 4.5),
    JSON.stringify(contrast.filter((p) => p.ratio < 4.5)),
  );
  await page.getByRole("button", { name: "发送消息" }).evaluate((el) => el.blur());
  await page.locator("[data-review-scroll]").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.mouse.move(1400, 10);
  await page.screenshot({ path: output + "/desktop.png", animations: "disabled" });
  const logo = page.getByTestId("root-startup-loading").getByRole("img", { name: "mgcode" });
  assert.ok(await logo.evaluate((im) => im.complete && im.naturalWidth === 512));
  assert.equal(await page.getByTestId("root-startup-loading").locator("svg").count(), 0);
  await logo.screenshot({ path: output + "/startup.png", animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-review-scroll]").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: output + "/mobile.png", animations: "disabled" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await select("浅色");
  await select("芒果AI");
  await verify("mango", true);
  assert.deepEqual(errors, []);
  await writeFile(
    output + "/verification.json",
    JSON.stringify(
      {
        scenarios: "built-in round trips/reload/custom return/remove/system/390px/startup",
        minimumTextContrast: Math.min(...contrast.map((p) => p.ratio)),
        contrast,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: theme switching, persistence, custom theme cleanup, system mode, mobile, startup and contrast.",
  );
} finally {
  await browser.close();
}
