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
      const moduleSource = await (await fetch(modulePath)).text();
      const graphicsModule = moduleSource.match(
        /from ["']([^"']*route-graphics[^"']*)["']/,
      )[1];
      const { Application } = await import(graphicsModule);
      const service = await createGraphicsService({
        subject: { dispatch() {} },
      });
      const host = document.createElement("div");
      document.body.append(host);
      const activeCounts = [];
      const cancellations = [];
      try {
        for (const rejectLate of [false, true]) {
          let release;
          let started;
          let abandonedApp;
          let settled = false;
          let destroyCount = 0;
          let earlyDestroyCount = 0;
          let abandonedCanvas;
          const gate = new Promise((resolve) => {
            release = resolve;
          });
          const entered = new Promise((resolve) => {
            started = resolve;
          });
          const originalInit = Application.prototype.init;
          const originalDestroy = Application.prototype.destroy;
          Application.prototype.init = async function (...args) {
            if (abandonedApp) return originalInit.apply(this, args);
            abandonedApp = this;
            started();
            // Hold the real Pixi Application before it has a renderer. Calling
            // destroy here clears its stage and breaks the subsequent init.
            await gate;
            try {
              await originalInit.apply(this, args);
              abandonedCanvas = this.canvas;
              if (rejectLate) throw new Error("Late initialization failure");
            } finally {
              settled = true;
            }
          };
          Application.prototype.destroy = function (...args) {
            if (this === abandonedApp) {
              destroyCount += 1;
              if (!settled) earlyDestroyCount += 1;
            }
            return originalDestroy.apply(this, args);
          };
          try {
            const controller = new AbortController();
            const opening = service
              .init({
                canvas: host,
                width: 64,
                height: 64,
                signal: controller.signal,
              })
              .catch((error) => error.name);
            await entered;
            controller.abort();
            const errorName = await opening;
            const destroysBeforeSettled = destroyCount;
            await service.destroy();
            await service.init({ canvas: host, width: 64, height: 64 });
            const replacement = service.getCanvas();
            release();
            // Wait for the actual late Application and RouteGraphics cleanup.
            for (let i = 0; i < 100 && (destroyCount === 0 || !settled); i++) {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            cancellations.push({
              rejectLate,
              errorName,
              destroysBeforeSettled,
              earlyDestroyCount,
              destroyCount,
              settled,
              lateContextReleased:
                contexts.get(abandonedCanvas)?.isContextLost() === true,
              replacementAttached: host.firstChild === replacement,
              replacementActive:
                contexts.get(replacement)?.isContextLost() === false,
            });
          } finally {
            release();
            Application.prototype.init = originalInit;
            Application.prototype.destroy = originalDestroy;
            await service.destroy();
          }
        }
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
        cancellations,
        created: contexts.size,
        rendererCount: rendererCanvases.size,
        activeRenderers: [...rendererCanvases].filter(
          (canvas) => !contexts.get(canvas)?.isContextLost(),
        ).length,
      };
    }, `/@fs${process.cwd()}/src/deps/services/graphicsService.js`);
    for (const cancellation of result.cancellations) {
      assert.deepEqual(cancellation, {
        rejectLate: cancellation.rejectLate,
        errorName: "AbortError",
        destroysBeforeSettled: 0,
        earlyDestroyCount: 0,
        destroyCount: 1,
        settled: true,
        lateContextReleased: true,
        replacementAttached: true,
        replacementActive: true,
      });
    }
    assert.ok(result.created >= 15);
    assert.equal(result.rendererCount, 15);
    assert.equal(result.activeRenderers, 0);
    assert.ok(
      result.activeCounts.every((count) => count <= 1),
      "Only the shared graphics capability-check context may remain",
    );
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: cancelled real Pixi initialization resolves/rejects safely; 15 overlapping renderer initializations; zero active renderer contexts after cleanup`,
    );
  } finally {
    await browser.close();
  }
}
