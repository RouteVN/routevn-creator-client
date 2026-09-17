// Native-titlebar shortcut: real keyboard propagation, simulated Tauri API.
// The macOS Swift companion additionally checks a real fullscreen NSWindow.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const directory = await mkdtemp(join(tmpdir(), "rvn-fullscreen-"));
try {
  const bundle = join(directory, "fullscreenEscape.js");
  execFileSync("bun", [
    "build",
    "src/deps/clients/tauri/fullscreenEscape.js",
    "--target",
    "browser",
    "--outfile",
    bundle,
  ]);
  const source = await readFile(bundle, "utf8");
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://fixture.test/**", (route) =>
        route.fulfill({
          contentType: route.request().url().endsWith(".js")
            ? "text/javascript"
            : "text/html",
          body: route.request().url().endsWith(".js")
            ? source
            : '<body><h1>Project One</h1><input id="editor"><dialog><button>Close</button></dialog></body>',
        }),
      );
      await page.goto("https://fixture.test/");
      await page.evaluate(async () => {
        const { createFullscreenEscapeClient } = await import(
          "/fullscreenEscape.js"
        );
        window.nativeWindow = {
          fullscreen: true,
          exits: 0,
          hints: 0,
          errors: [],
        };
        window.cleanupFullscreen = createFullscreenEscapeClient({
          appWindow: {
            isFullscreen: async () => window.nativeWindow.fullscreen,
            setFullscreen: async (value) => {
              window.nativeWindow.fullscreen = value;
              window.nativeWindow.exits += 1;
            },
          },
        }).subscribe({
          onArmed: () => {
            window.nativeWindow.hints += 1;
          },
          onError: (error) => window.nativeWindow.errors.push(error.message),
        });
        document
          .querySelector("#editor")
          .addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
            }
          });
      });
      await page.keyboard.down("Escape");
      await page.waitForFunction(() => window.nativeWindow.hints === 1);
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

      await page.evaluate(() => {
        window.nativeWindow.fullscreen = true;
      });
      for (const interruption of ["timeout", "typing", "editor", "dialog"]) {
        await page.keyboard.press("Escape");
        if (interruption === "timeout") {
          await page.waitForTimeout(1550);
        } else if (interruption === "typing") {
          await page.keyboard.press("a");
        } else if (interruption === "editor") {
          await page.locator("#editor").focus();
          await page.keyboard.press("Escape");
          await page.locator("#editor").evaluate((element) => element.blur());
        } else {
          await page.evaluate(() =>
            document.querySelector("dialog").showModal(),
          );
          await page.keyboard.press("Escape");
          await page.locator("dialog").waitFor({ state: "hidden" });
        }
        await page.keyboard.press("Escape");
        assert.equal(
          await page.evaluate(() => window.nativeWindow.fullscreen),
          true,
          `${name}: ${interruption} resets confirmation`,
        );
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !window.nativeWindow.fullscreen);
        await page.evaluate(() => {
          window.nativeWindow.fullscreen = true;
        });
      }
      assert.deepEqual(
        await page.evaluate(() => window.nativeWindow.errors),
        [],
      );
      assert.deepEqual(errors, []);
      console.log(
        `${name}: native fullscreen Escape pairs, held keys, expiry, editor and dialog handling passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
