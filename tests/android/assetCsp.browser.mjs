// Exercise the actual Android document policy: the renderer fetches project
// images through local blob URLs, not just through <img src>.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const html = await readFile(
  new URL("../../static/android/index.html", import.meta.url),
  "utf8",
);
const policy = html.match(
  /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
)[1];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("https://appassets.androidplatform.net/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    }),
  );
  await page.goto("https://appassets.androidplatform.net/web/index.html");
  const result = await page.evaluate(async () => {
    const url = URL.createObjectURL(new Blob(["local project asset"]));
    try {
      const blob = await (await fetch(url)).text();
      const data = await (
        await fetch("data:text/plain,local%20project%20asset")
      ).text();
      return { blob, data };
    } catch (error) {
      return error.message;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  assert.deepEqual(
    result,
    { blob: "local project asset", data: "local project asset" },
    "Android CSP must allow the renderer to fetch local blob and data assets",
  );
  console.log("Android local asset fetch passed");
} finally {
  await browser.close();
}
