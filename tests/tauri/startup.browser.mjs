// After build:tauri: node tests/tauri/startup.browser.mjs
// Runs the packaged frontend with an in-memory Tauri bridge. The legacy
// scenario removes constructable stylesheets, as on macOS WebKit 15.4-16.3.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { serveStatic } from "../support/staticServer.js";

const appVersion = JSON.parse(
  await readFile(new URL("../../src-tauri/tauri.conf.json", import.meta.url)),
).version;
const server = await serveStatic("_site");

try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const legacy of [false, true]) {
        const label = `${engineName} ${legacy ? "legacy" : "native"}`;
        const page = await browser.newPage({
          viewport: { width: 1200, height: 800 },
        });
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await page.addInitScript(
          ({ legacy, appVersion }) => {
            if (legacy) {
              delete Document.prototype.adoptedStyleSheets;
              delete ShadowRoot.prototype.adoptedStyleSheets;
              function LegacyCSSStyleSheet() {
                throw new TypeError("Illegal constructor");
              }
              LegacyCSSStyleSheet.prototype = CSSStyleSheet.prototype;
              delete LegacyCSSStyleSheet.prototype.replace;
              delete LegacyCSSStyleSheet.prototype.replaceSync;
              window.CSSStyleSheet = LegacyCSSStyleSheet;
            }

            const values = new Map();
            const callbacks = new Map();
            let nextCallback = 1;
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
          { legacy, appVersion },
        );

        await page.goto(server.origin);
        const createButton = page.locator(
          '[data-testid="create-project-button"]',
        );
        const importButton = page.locator("rvn-projects #openButton");
        await createButton.waitFor({ state: "visible" });
        await importButton.waitFor({ state: "visible" });
        assert.equal(await createButton.innerText(), "Create", label);
        assert.equal(await importButton.innerText(), "Import", label);
        const background = await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        );
        assert.notEqual(background, "rgba(0, 0, 0, 0)", label);

        await createButton.click();
        const nameInput = page.locator(
          '#createProjectForm rtgl-input[data-field-name="name"] input',
        );
        await nameInput.fill("Project One");
        assert.equal(await nameInput.inputValue(), "Project One", label);
        await page.keyboard.press("Escape");
        await page
          .locator("#createProjectDialog")
          .waitFor({ state: "detached" });
        await createButton.waitFor({ state: "visible" });
        assert.deepEqual(errors, [], label);
        console.log(`${label}: PASS`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
