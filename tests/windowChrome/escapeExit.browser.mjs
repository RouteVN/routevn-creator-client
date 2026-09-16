// Run with node tests/windowChrome/escapeExit.browser.mjs.
// Real window-chrome DOM and keyboard events with a simulated Tauri window API.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 700 },
    });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<!doctype html><body class="dark">
      <main><h1>Project One</h1><input id="editor"></main>
      <dialog><button>Dialog action</button></dialog>
    </body>`);
    await page.addStyleTag({ path: "static/public/theme.css" });
    await page.evaluate(() => {
      window.nativeWindow = { fullscreen: false, calls: [] };
      window.__TAURI__ = {
        window: {
          getCurrentWindow: () => ({
            isFullscreen: async () => window.nativeWindow.fullscreen,
            isMaximized: async () => false,
            setFullscreen: async (value) => {
              window.nativeWindow.fullscreen = value;
              window.nativeWindow.calls.push(value);
            },
            setDecorations: async () => {},
            onResized: async () => () => {},
            onFocusChanged: async (callback) => {
              window.changeNativeFocus = (focused) =>
                callback({ payload: focused });
              return () => {};
            },
          }),
        },
      };
      document.querySelector("#editor").addEventListener("keydown", (event) => {
        if (event.key === "Escape") event.preventDefault();
      });
    });
    await page.addScriptTag({ path: "static/public/windowChrome.js" });
    const hint = page.locator(".rvn-window-chrome-status");
    const enterFullscreen = async () => {
      await page.keyboard.press("F11");
      await page.waitForFunction(() => window.nativeWindow.fullscreen);
    };
    await page.waitForFunction(
      () => document.documentElement.dataset.rvnWindowChrome === "custom",
    );
    await enterFullscreen();
    await page.keyboard.down("Escape");
    await hint.waitFor({ state: "visible" });
    assert.equal(await hint.innerText(), "Press Esc again to exit fullscreen");
    assert.equal(
      await page.evaluate(() => window.nativeWindow.fullscreen),
      true,
    );
    await page.keyboard.down("Escape");
    assert.equal(
      await page.evaluate(() => window.nativeWindow.fullscreen),
      true,
    );
    await page.keyboard.up("Escape");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !window.nativeWindow.fullscreen);
    await hint.waitFor({ state: "hidden" });

    await enterFullscreen();
    await page.keyboard.press("Escape");
    await hint.waitFor({ state: "visible" });
    await hint.waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await hint.waitFor({ state: "visible" });
    assert.equal(
      await page.evaluate(() => window.nativeWindow.fullscreen),
      true,
    );
    await page.keyboard.press("a");
    await hint.waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await hint.waitFor({ state: "visible" });
    await page.evaluate(() => window.changeNativeFocus(false));
    await hint.waitFor({ state: "hidden" });
    await page.evaluate(() => window.changeNativeFocus(true));

    await page.evaluate(() => document.querySelector("dialog").showModal());
    await page.keyboard.press("Escape");
    await page.locator("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => window.nativeWindow.fullscreen),
      true,
    );
    assert.equal(await hint.isVisible(), false);
    await page.locator("#editor").focus();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() => window.nativeWindow.fullscreen),
      true,
    );
    assert.equal(await hint.isVisible(), false);
    await page.locator("#editor").evaluate((element) => element.blur());
    await page.keyboard.press("Escape");
    await hint.waitFor({ state: "visible" });
    assert.equal(
      await page.evaluate(() => window.nativeWindow.fullscreen),
      true,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !window.nativeWindow.fullscreen);
    assert.deepEqual(await page.evaluate(() => window.nativeWindow.calls), [
      true,
      false,
      true,
      false,
    ]);
    assert.deepEqual(errors, []);
    console.log(
      `${name}: native-window Escape confirmation and dialog handling passed`,
    );
  } finally {
    await browser.close();
  }
}
