// After build:tauri: node tests/tauri/startup.browser.mjs
// Runs the packaged frontend with an isolated, in-memory Tauri bridge.
// STARTUP_URL can target a running Tauri watch server instead of packaged assets.
// Legacy scenarios emulate missing browser features, not an entire old macOS.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const root = path.resolve(process.env.STARTUP_WEB_ROOT ?? "_site");
const artifacts = process.env.STARTUP_ARTIFACTS;
let origin = process.env.STARTUP_URL;
const appVersion = JSON.parse(
  await readFile(new URL("../../src-tauri/tauri.conf.json", import.meta.url)),
).version;
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
  const entryPath = pathname.endsWith("/")
    ? `${pathname}index.html`
    : path.extname(pathname)
      ? pathname
      : `${pathname}/index.html`;
  const filename = path.resolve(root, `.${entryPath}`);
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
if (!origin) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
}

const results = [];
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (
      process.env.STARTUP_ENGINE &&
      process.env.STARTUP_ENGINE !== engineName
    ) {
      continue;
    }
    const browser = await engine.launch({ headless: true });
    try {
      for (const { scenario, entryPath } of [
        "native",
        "legacy-stylesheets",
        "legacy-stylesheets-colors",
      ].flatMap((scenario) =>
        ["/", "/projects"].map((entryPath) => ({ scenario, entryPath })),
      )) {
        const page = await browser.newPage({
          viewport: { width: 1200, height: 800 },
        });
        page.setDefaultTimeout(15000);
        const errors = [];
        const consoleErrors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        await page.addInitScript(
          ({ scenario, appVersion }) => {
            if (scenario !== "native") {
              delete Document.prototype.adoptedStyleSheets;
              delete ShadowRoot.prototype.adoptedStyleSheets;
              const NativeCSSStyleSheet = CSSStyleSheet;
              function LegacyCSSStyleSheet() {
                throw new TypeError("Illegal constructor");
              }
              LegacyCSSStyleSheet.prototype = NativeCSSStyleSheet.prototype;
              delete LegacyCSSStyleSheet.prototype.replace;
              delete LegacyCSSStyleSheet.prototype.replaceSync;
              window.CSSStyleSheet = LegacyCSSStyleSheet;
            }

            const values = new Map();
            const callbacks = new Map();
            let nextCallback = 1;
            window.startupCalls = [];
            window.__TAURI_INTERNALS__ = {
              metadata: {
                currentWindow: { label: "main" },
                currentWebview: { windowLabel: "main", label: "main" },
              },
              transformCallback(callback) {
                const id = nextCallback++;
                callbacks.set(id, callback);
                return id;
              },
              unregisterCallback(id) {
                callbacks.delete(id);
              },
              convertFileSrc(file, protocol = "asset") {
                return `${protocol}://localhost/${encodeURIComponent(file)}`;
              },
              async invoke(command, args = {}) {
                window.startupCalls.push(command);
                switch (command) {
                  case "plugin:sql|load":
                    return args.db;
                  case "plugin:sql|execute":
                    if (
                      /INSERT.*INTO kv/i.test(args.query) &&
                      args.values.length === 2
                    ) {
                      values.set(args.values[0], args.values[1]);
                    }
                    return [1, 0];
                  case "plugin:sql|select":
                    return values.has(args.values[0])
                      ? [{ value: values.get(args.values[0]) }]
                      : [];
                  case "plugin:app|version":
                    return appVersion;
                  case "plugin:event|listen":
                    return args.handler;
                  case "plugin:event|unlisten":
                  case "get_project_media_server_origin":
                  case "set_discord_presence_details":
                  case "check_client_update":
                    return;
                  case "get_linux_appimage_desktop_integration_status":
                    return { available: false };
                  case "get_update_device_info":
                    return {};
                  default:
                    throw new Error(`Unmocked Tauri command: ${command}`);
                }
              },
            };
            window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
              unregisterListener() {},
            };
          },
          { scenario, appVersion },
        );
        if (scenario === "legacy-stylesheets-colors") {
          // Unsupported functions remain valid custom-property token streams,
          // then invalidate consuming declarations. @supports must also fail.
          await page.route("**/public/theme.css", async (route) => {
            const response = await route.fetch();
            await route.fulfill({
              response,
              body: (await response.text()).replace(
                /\b(?:oklch|color-mix)\(/g,
                "unsupported-color(",
              ),
            });
          });
        }
        let failure;
        try {
          await page.goto(new URL(entryPath, origin).href);
          const createButton = page.locator(
            '[data-testid="create-project-button"]',
          );
          await createButton.waitFor({ state: "visible" });
          await page.locator("rvn-projects #openButton").waitFor({
            state: "visible",
          });
          assert.equal(await createButton.innerText(), "Create");
          assert.equal(
            await page.locator("rvn-projects #openButton").innerText(),
            "Import",
          );
          const background = await page.evaluate(
            () => getComputedStyle(document.body).backgroundColor,
          );
          assert.notEqual(background, "rgba(0, 0, 0, 0)");
          assert.notEqual(background, "transparent");

          await createButton.click();
          const nameInput = page.locator(
            '#createProjectForm rtgl-input[data-field-name="name"] input',
          );
          await nameInput.fill("Project One");
          assert.equal(await nameInput.inputValue(), "Project One");
          await page.keyboard.press("Escape");
          await page.locator("#createProjectDialog").waitFor({
            state: "detached",
          });
          await createButton.waitFor({ state: "visible" });
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(consoleErrors, []);
        } catch (error) {
          failure = error.message;
        }
        const result = {
          engine: engineName,
          scenario,
          entryPath,
          failure,
          errors,
          consoleErrors,
        };
        if (artifacts) {
          await mkdir(artifacts, { recursive: true });
          await page.screenshot({
            path: path.join(
              artifacts,
              `${engineName}-${scenario}-${entryPath === "/" ? "root" : "projects"}.png`,
            ),
          });
        }
        results.push(result);
        console.log(JSON.stringify(result));
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server.listening) server.close();
}
if (artifacts) {
  await writeFile(
    path.join(artifacts, "results.json"),
    JSON.stringify(results, null, 2),
  );
}
assert.ok(results.length > 0, "No browser scenarios were selected");
assert.deepEqual(
  results.filter((result) => result.failure),
  [],
  "Packaged Tauri startup failed",
);
