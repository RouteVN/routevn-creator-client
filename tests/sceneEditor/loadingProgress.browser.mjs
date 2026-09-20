// Run against the existing watch server. Each browser uses isolated web storage;
// failures are injected in memory, without changing saved project files.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  if (
    process.env.LOADING_TEST_BROWSER &&
    process.env.LOADING_TEST_BROWSER !== engineName
  )
    continue;
  // WebKit needs persistent storage for the template Blob files. Use a fresh
  // temporary profile and remove it after the test.
  const profile = await mkdtemp(join(tmpdir(), "routevn-scene-loading-"));
  const browser = await engine.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await browser.newPage();
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
    await page.locator("rvn-project").evaluate((project) => {
      const { appService, projectService, graphicsService } = project.deps;
      const init = graphicsService.init;
      const read = projectService.getFileContent;
      const load = graphicsService.loadAssets;
      graphicsService.init = async (...args) => {
        if (!window.releaseGraphics)
          await new Promise((resolve) => {
            window.releaseGraphics = resolve;
          });
        return init(...args);
      };
      projectService.getFileContent = async (...args) => {
        if (!window.releaseRead)
          await new Promise((resolve) => {
            window.releaseRead = resolve;
          });
        return read(...args);
      };
      graphicsService.loadAssets = async (assets, options) => {
        if (options?.onProgress && !window.releaseDecode) {
          options.onProgress({
            completed: 0,
            total: Object.keys(assets).length,
            fileId: Object.keys(assets)[0],
          });
          await new Promise((resolve) => {
            window.releaseDecode = resolve;
          });
        }
        return load(assets, options);
      };
      appService.navigate("/project/scene-editor", {
        ...appService.getPayload(),
        s: "LL8EUke6dL2V",
      });
    });
    const loading = page.locator("#scenePageLoading");
    await loading.filter({ hasText: "Loading scene..." }).waitFor();
    assert.equal((await loading.innerText()).trim(), "Loading scene...");
    await page.waitForTimeout(1200);
    assert.equal((await loading.innerText()).trim(), "Loading scene...");
    await loading.filter({ hasText: "Initializing graphics..." }).waitFor();
    await page.evaluate(() => window.releaseGraphics());
    await loading.filter({ hasText: "Checking assets: 0 /" }).waitFor();
    assert.match(await loading.innerText(), /Images:|Fonts:/);
    await mkdir(".artifacts/scene-loading", { recursive: true });
    await page.screenshot({
      path: `.artifacts/scene-loading/${engineName}-reading.png`,
    });
    await page.evaluate(() => window.releaseRead());
    try {
      await loading.filter({ hasText: "Loading assets: 0 /" }).waitFor();
    } catch (error) {
      console.error(
        "Loading state:",
        await loading.innerText().catch(() => "overlay closed"),
      );
      console.error(
        "Decode gate:",
        await page.evaluate(() => Boolean(window.releaseDecode)),
      );
      await page.screenshot({
        path: `.artifacts/scene-loading/${engineName}-failed.png`,
      });
      throw error;
    }
    assert.match(await loading.innerText(), /Images:|Fonts:/);
    await page.screenshot({
      path: `.artifacts/scene-loading/${engineName}-decoding.png`,
    });
    await page.evaluate(() => window.releaseDecode());
    await loading.waitFor({ state: "detached" });
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible" });
    await page
      .locator('#sectionEditor0 [contenteditable="true"]')
      .waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: scene editor keeps its initial loading text, reveals details after five seconds, and opens normally`,
    );
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true });
  }
}
