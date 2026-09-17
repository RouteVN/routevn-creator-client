// After build:ios: node tests/ios/startup.browser.mjs
// Runs the packaged iOS frontend with native bridge responses for folder setup.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium, webkit } from "playwright";

const root = path.resolve(
  process.env.IOS_TEST_WEB_ROOT ?? "ios/routevn/routevn/web",
);
const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const filename = path.resolve(root, `.${pathname}`);
  if (!filename.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filename);
    response.setHeader(
      "Content-Type",
      mimeTypes[path.extname(filename)] ?? "application/octet-stream",
    );
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  for (const browserType of [chromium, webkit]) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const scenario of [
        { name: "not configured", configured: false },
        { name: "reconnect required", configured: false, reason: "reconnect" },
        { name: "configured", configured: true },
        {
          name: "configured folder read failure",
          configured: true,
          fails: true,
        },
      ]) {
        const page = await browser.newPage({
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript((scenario) => {
          window.startupTrial = { calls: [], projectMounts: 0, pending: 0 };
          const define = customElements.define.bind(customElements);
          customElements.define = (name, constructor, options) => {
            if (name === "rvn-projects") {
              const connected = constructor.prototype.connectedCallback;
              constructor.prototype.connectedCallback = function () {
                window.startupTrial.projectMounts += 1;
                return connected.call(this);
              };
            }
            return define(name, constructor, options);
          };
          window.webkit = {
            messageHandlers: {
              RouteVNIOS: {
                postMessage({ id, method, payload }) {
                  const trial = window.startupTrial;
                  trial.calls.push({ method, dbPath: payload?.dbPath });
                  if (!id) return;
                  let value = true;
                  let error;
                  if (method === "sqliteQuery") value = [];
                  else if (method === "getProjectFolderSetup") {
                    value = { ...scenario, deviceName: "iPhone" };
                  } else if (method === "getWindowMetrics") {
                    value = { width: 390, height: 844 };
                  } else if (method === "listProjectFolders") {
                    value = [];
                    if (!scenario.configured || scenario.fails) {
                      error = { code: "folder", message: "Folder unavailable" };
                    }
                  }
                  trial.pending += 1;
                  setTimeout(() => {
                    trial.pending -= 1;
                    window.__routeVNIOSBridgeResult({
                      id,
                      ok: !error,
                      value,
                      error,
                    });
                  }, 10);
                },
              },
            },
          };
        }, scenario);
        await page.goto(
          `http://127.0.0.1:${server.address().port}/ios/index.html`,
        );
        if (scenario.configured) {
          await page.locator("rvn-projects").waitFor({ state: "attached" });
          await page.waitForFunction(() =>
            window.startupTrial.calls.some(
              ({ method }) => method === "listProjectFolders",
            ),
          );
        } else {
          await page
            .getByText("Set up your projects folder", { exact: true })
            .waitFor();
        }
        await page.waitForFunction(() => window.startupTrial.pending === 0);
        // Let page handlers finish their queued render after native responses.
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const trial = await page.evaluate(() => window.startupTrial);
        const expectedMounts = scenario.configured ? 1 : 0;
        assert.equal(trial.projectMounts, expectedMounts, scenario.name);
        assert.equal(
          trial.calls.filter(({ method }) => method === "listProjectFolders")
            .length,
          expectedMounts,
          scenario.name,
        );
        assert.equal(
          trial.calls.some(({ dbPath }) => dbPath?.startsWith("projects/")),
          false,
        );
        assert.equal(
          await page
            .getByText("Failed to load projects. Please try again.", {
              exact: true,
            })
            .count(),
          scenario.fails ? 1 : 0,
          scenario.name,
        );
        assert.deepEqual(errors, [], scenario.name);
        console.log(`${browserType.name()}: ${scenario.name} passed`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
