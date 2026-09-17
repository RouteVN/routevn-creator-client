// Run with watch:ios: node tests/ios/scenePreview.browser.mjs
// Uses isolated web storage with the real iOS audio adapter and mobile UI.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { chromium } from "playwright";
import { createSteps } from "../../node_modules/@rettangoli/vt/src/createSteps.js";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const base = "/@fs" + fileURLToPath(new URL("../../src/", import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.RTGL_VT_RESET_APP_STATE = true;
  });
  await page.route("**/src/setup.ios.js", async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace("setup.ios.js", "setup.web.js"),
    });
    const graphicsSource = await (
      await page.request.get(origin + base + "deps/services/graphicsService.js")
    ).text();
    const graphicsURL = graphicsSource.match(
      /from\s+["']([^"']*\/route-graphics\.js[^"']*)["']/,
    )[1];
    const body = (await response.text()).replace(
      "const graphicsService = await createGraphicsService({ subject });",
      `
const { configureAudioRuntime } = await import(${JSON.stringify(graphicsURL)});
const { createMobileAudioRuntime } = await import(${JSON.stringify(base + "deps/clients/mobileAudioRuntime.js")});
const { createIOSGraphicsAudioOutput } = await import(${JSON.stringify(base + "deps/clients/ios/graphicsAudioOutput.js")});
const audioOutput = createIOSGraphicsAudioOutput({runtime: createMobileAudioRuntime()});
configureAudioRuntime(audioOutput.graphicsRuntime);
const resume = audioOutput.resume;
audioOutput.resume = () => {
  void resume();
  // iOS can leave the media-play promise pending. Rendering must still start.
  return new Promise(() => {});
};
const graphicsService = await createGraphicsService({subject, audioOutput});
const init = graphicsService.init;
graphicsService.init = async (...args) => {
  await new Promise(resolve => setTimeout(resolve, 600));
  return init(...args);
};`,
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/projects?*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch({ url: origin + "/ios/index.html" });
    await route.fulfill({ response });
  });
  await page.goto(origin + "/projects?vt-input-mode=touch");
  const spec = yaml.loadAll(
    await readFile(
      new URL(
        "../../vt/specs/project/scenes-mobile-preview.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  )[0];
  const runner = createSteps(page, {});
  let loadingChecks = 0;
  for (const step of spec.steps) {
    if (step.action === "screenshot") continue;
    if (step.selector === "#vnPreview [data-preview-ready='true']") {
      await page.locator("#vnPreview #previewLoading").waitFor({
        state: "visible",
        timeout: 5000,
      });
      loadingChecks++;
    }
    await runner.executeStep(step);
  }
  assert.equal(loadingChecks, 2);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: scene-map and editor full-screen previews show startup loading, render, rotate and exit while iOS playback remains pending.",
  );
} finally {
  await browser.close();
}
