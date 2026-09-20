// Run against the existing watch server. Each browser uses isolated web storage;
// failures are injected in memory, without changing saved project files.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    page.setDefaultTimeout(30000);
    await page.addInitScript(() => {
      window.RTGL_VT_RESET_APP_STATE = true;
    });
    await page.route(/\/src\/setup\.(tauri|ios|android)\.js/, async (route) => {
      const response = await route.fetch({
        url: route
          .request()
          .url()
          .replace(/setup\.(tauri|ios|android)\.js/, "setup.web.js"),
      });
      await route.fulfill({ response });
    });
    await page.goto(origin + "/projects");
    await page.locator('[data-testid="create-project-button"]').click();
    await page
      .locator('#createProjectForm rtgl-input[data-field-name="name"] input')
      .fill("Project One");
    await page
      .locator('#createProjectForm rtgl-button[data-action-id="submit"]')
      .click();
    await page.locator("#projectItem0").click();
    const result = await page.evaluate(async (modulePath) => {
      const contexts = new Map();
      const rendererCanvases = new Set();
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const result = originalGetContext.apply(this, args);
        if (result && typeof result.isContextLost === "function")
          contexts.set(this, result);
        return result;
      };
      const { createGraphicsService } = await import(modulePath);
      const service = await createGraphicsService({
        subject: { dispatch() {} },
      });
      const host = document.createElement("div");
      document.body.append(host);
      const activeCounts = [];
      try {
        for (let i = 0; i < 5; i++) {
          const options = { canvas: host, width: 64, height: 64 };
          await Promise.all([
            service
              .init(options)
              .then(() => rendererCanvases.add(service.getCanvas())),
            service
              .init(options)
              .then(() => rendererCanvases.add(service.getCanvas())),
            service
              .init(options)
              .then(() => rendererCanvases.add(service.getCanvas())),
          ]);
          await service.destroy();
          activeCounts.push(
            [...contexts.values()].filter((context) => !context.isContextLost())
              .length,
          );
        }
      } finally {
        await service.destroy();
        host.remove();
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
      return {
        activeCounts,
        created: contexts.size,
        rendererCount: rendererCanvases.size,
        activeRenderers: [...rendererCanvases].filter(
          (canvas) => !contexts.get(canvas)?.isContextLost(),
        ).length,
      };
    }, `/@fs${process.cwd()}/src/deps/services/graphicsService.js`);
    assert.ok(result.created >= 15);
    assert.equal(result.rendererCount, 15);
    assert.equal(result.activeRenderers, 0);
    assert.ok(
      result.activeCounts.every((count) => count <= 1),
      "Only the shared graphics capability-check context may remain",
    );
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: 15 overlapping renderer initializations; zero active renderer contexts after cleanup`,
    );
  } finally {
    await browser.close();
  }
}
