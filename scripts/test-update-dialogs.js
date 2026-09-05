import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "playwright/test";
import yaml from "js-yaml";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, ".artifacts/update-dialogs");
const copy = yaml.load(
  await readFile(join(root, "src/i18n/en.yaml"), "utf8"),
).appPage;
const assets = {
  "/theme.css": ["static/public/theme.css", "text/css"],
  "/ui.js": [
    "node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js",
    "text/javascript",
  ],
  "/global-ui.js": [
    "node_modules/@rettangoli/ui/src/deps/createGlobalUI.js",
    "text/javascript",
  ],
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  for (const width of [320, 360, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      isMobile: width < 768,
      hasTouch: width < 768,
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "routevn.test") return route.abort();
      const asset = assets[url.pathname];
      if (asset) {
        return route.fulfill({
          body: await readFile(join(root, asset[0])),
          contentType: asset[1],
        });
      }
      if (url.pathname.startsWith("/src/") && url.pathname.endsWith(".js")) {
        return route.fulfill({
          body: await readFile(join(root, url.pathname)),
          contentType: "text/javascript",
        });
      }
      if (url.pathname !== "/") return route.abort();
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <link rel="stylesheet" href="/theme.css"><script src="/ui.js"></script>
          </head><body class="dark"><rtgl-global-ui></rtgl-global-ui></body></html>`,
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://routevn.test/");
    await page.waitForFunction(
      () => document.querySelector("rtgl-global-ui").transformedHandlers,
    );
    const runtime = await page.evaluateHandle(async (copy) => {
      const { default: createGlobalUI } = await import("/global-ui.js");
      const { createAndroidUpdater } = await import(
        "/src/deps/clients/android/updater.js"
      );
      const state = { status: "available", calls: [], saved: false };
      const updater = await createAndroidUpdater({
        globalUI: createGlobalUI(document.querySelector("rtgl-global-ui")),
        keyValueStore: new Map(),
        getCopy: () => copy,
        browserEventsClient: {
          subscribeWindowEvent: ({ listener }) => {
            state.onUpdate = listener;
          },
        },
        beforeInstall: () =>
          new Promise((resolve) => {
            state.finishSave = () => {
              state.saved = true;
              resolve();
            };
          }),
        bridge: async (method) => {
          state.calls.push(method);
          if (method === "getAppUpdateSupport") return { status: "supported" };
          if (method === "checkAppUpdate")
            return { status: state.status, versionCode: 6 };
          if (method === "startAppUpdate")
            return { status: "downloading", versionCode: 6 };
          if (method === "completeAppUpdate") {
            if (!state.saved)
              throw new Error("Restart attempted before saving");
            return { status: "installing", versionCode: 6 };
          }
          throw new Error(`Unexpected update method: ${method}`);
        },
      });
      return { state, updater };
    }, copy);

    const verifyDialog = async (name) => {
      const dialog = page.locator("rtgl-dialog[open]");
      await expect(dialog.locator("slot[name=content]")).toBeVisible();
      await page.waitForTimeout(250);
      const metrics = await dialog.evaluate((element) => {
        const surface = element.shadowRoot.querySelector("slot[name=content]");
        const content = element.querySelector("[slot=content]");
        const header = content.firstElementChild;
        const actions = content.querySelector("rtgl-view[d=h]");
        const surfaceRect = surface.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        return {
          leftInset: headerRect.left - surfaceRect.left,
          topInset: headerRect.top - surfaceRect.top,
          actionGap: actions
            ? actions.getBoundingClientRect().top - headerRect.bottom
            : undefined,
          overflow: content.scrollWidth > content.clientWidth,
          buttonsContained: [...content.querySelectorAll("rtgl-button")].every(
            (button) => {
              const rect = button.getBoundingClientRect();
              return (
                rect.left >= surfaceRect.left &&
                rect.right <= surfaceRect.right &&
                rect.bottom <= surfaceRect.bottom
              );
            },
          ),
          visibleWidth:
            surfaceRect.left >= 0 && surfaceRect.right <= window.innerWidth,
        };
      });
      assert.equal(
        metrics.leftInset,
        17,
        `${name}: one 16px inset plus border`,
      );
      assert.equal(metrics.topInset, 17, `${name}: one 16px inset plus border`);
      if (metrics.actionGap !== undefined) assert.equal(metrics.actionGap, 16);
      assert.equal(metrics.overflow, false, `${name}: content fits`);
      assert.equal(metrics.buttonsContained, true, `${name}: actions fit`);
      assert.equal(metrics.visibleWidth, true, `${name}: dialog fits viewport`);
      await page.screenshot({ path: join(output, `${width}-${name}.png`) });
    };

    await runtime.evaluate(({ updater }) => {
      void updater.checkForUpdates();
    });
    await expect(
      page.getByText(copy.googlePlayUpdateAvailable, { exact: true }),
    ).toBeVisible();
    await verifyDialog("available");
    await page.getByText(copy.laterButton, { exact: true }).click();
    assert.equal(
      await runtime.evaluate(({ state }) =>
        state.calls.includes("startAppUpdate"),
      ),
      false,
    );
    await runtime.evaluate(({ updater }) => {
      void updater.checkForUpdates();
    });
    await page.getByText(copy.updateNowButton, { exact: true }).click();
    await expect
      .poll(() =>
        runtime.evaluate(({ state }) => state.calls.includes("startAppUpdate")),
      )
      .toBe(true);
    await runtime.evaluate(({ state }) =>
      state.onUpdate({ detail: { status: "downloaded", versionCode: 6 } }),
    );
    await expect(
      page.getByText(copy.googlePlayUpdateReady, { exact: true }),
    ).toBeVisible();
    await verifyDialog("ready");
    await page.getByText(copy.restartToUpdateButton, { exact: true }).click();
    await expect(page.locator("#routevn-update-progress-dialog")).toBeVisible();
    await verifyDialog("installing");
    await runtime.evaluate(({ state }) => state.finishSave());
    await expect
      .poll(() =>
        runtime.evaluate(({ state }) =>
          state.calls.includes("completeAppUpdate"),
        ),
      )
      .toBe(true);
    await expect(page.locator("#routevn-update-progress-dialog")).toHaveCount(
      0,
    );
    await runtime.evaluate(({ state, updater }) => {
      state.status = "up-to-date";
      void updater.checkForUpdates();
    });
    await expect(
      page.getByText(copy.latestVersionMessage, { exact: true }),
    ).toBeVisible();
    await verifyDialog("current");
    await page.getByText("OK", { exact: true }).click();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS update dialogs at ${width}px: spacing, controls, consent, and save before restart`,
    );
  }
} finally {
  await browser.close();
}
