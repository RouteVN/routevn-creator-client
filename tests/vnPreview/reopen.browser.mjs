// Run against the existing watch server. Failure injection and project data
// live only in an isolated browser profile; no user projects are accessed.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const profile = await mkdtemp(join(tmpdir(), "routevn-preview-reopen-"));
  const browser = await engine.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    const warnings = [];
    page.on("console", (message) => {
      if (
        message.type() === "warning" &&
        message.text().includes("not found in the Cache")
      ) {
        warnings.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
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
    await page.locator("rvn-project").evaluate((node) => {
      const { appService } = node.deps;
      const showAlert = appService.showAlert;
      window.reopenAlerts = [];
      appService.showAlert = (options) => {
        window.reopenAlerts.push(options.message);
        return showAlert(options);
      };
      appService.navigate("/project/scene-editor", {
        ...appService.getPayload(),
        s: "LL8EUke6dL2V",
      });
    });
    const editor = page.locator("rvn-scene-editor-lexical");
    const preview = page.locator("#vnPreview");
    const ready = page.locator('#previewSurface[data-preview-ready="true"]');
    await page.locator("#scenePageLoading").waitFor({ state: "detached" });
    await page.locator('#sectionEditor0 [contenteditable="true"]').waitFor();
    await page.locator("#previewButton").click();
    await ready.waitFor();
    for (let i = 0; i < 3; i++) {
      await page.locator("#closePreviewButton").click();
      await preview.waitFor({ state: "detached" });
      await page.locator("#previewButton").click();
      await ready.waitFor();
    }

    // Pause an editor-restoration file read, then reopen fullscreen before it returns.
    await editor.evaluate((node) => {
      const { projectService } = node.deps;
      const read = projectService.getFileContent;
      window.reopenCheck = {};
      projectService.getFileContent = async (...args) => {
        projectService.getFileContent = read;
        window.reopenCheck.restorationSignal = args[1].signal;
        const content = await read(...args);
        await new Promise((resolve) => {
          window.reopenCheck.releaseRead = resolve;
        });
        return content;
      };
    });
    await page.locator("#closePreviewButton").click();
    await preview.waitFor({ state: "detached" });
    await page.waitForFunction(() => Boolean(window.reopenCheck.releaseRead));
    // An ordinary editor render joins the restoration's pending asset load.
    await editor.evaluate((node) =>
      node.deps.subject.dispatch("sceneEditor.renderCanvas", { flush: true }),
    );
    await page.waitForTimeout(100);
    await page.locator("#previewButton").click();
    await ready.waitFor();
    const canvasHostBefore = await editor.evaluate(
      (node) => node.deps.graphicsService.getCanvas()?.getRootNode()?.host?.id,
    );
    assert.equal(canvasHostBefore, "vnPreview");
    assert.equal(
      await page.evaluate(() => window.reopenCheck.restorationSignal.aborted),
      true,
    );
    await page.evaluate(() => window.reopenCheck.releaseRead());
    await page.waitForTimeout(1200); // Include late rendering and the deferred startup callback.
    assert.deepEqual(
      await page.evaluate(() => window.reopenAlerts),
      [],
      "Cancelled editor work must not show an asset warning",
    );
    const canvasHostAfter = await editor.evaluate(
      (node) => node.deps.graphicsService.getCanvas()?.getRootNode()?.host?.id,
    );
    await mkdir(".artifacts/preview-reopen", { recursive: true });
    await page.screenshot({
      path: `.artifacts/preview-reopen/${name}-reopened.png`,
    });
    assert.equal(
      canvasHostAfter,
      canvasHostBefore,
      "Abandoned editor restoration must not take fullscreen's canvas",
    );
    // Hold a completed editor asset load until fullscreen replaces its renderer/cache.
    await editor.evaluate((node) => {
      const { graphicsService, projectService } = node.deps;
      const loadAssets = graphicsService.loadAssets;
      const read = projectService.getFileContent;
      window.repaintCheck = {};
      projectService.getFileContent = (...args) => {
        projectService.getFileContent = read;
        window.repaintCheck.restorationSignal = args[1].signal;
        return read(...args);
      };
      graphicsService.loadAssets = async (...args) => {
        graphicsService.loadAssets = loadAssets;
        await loadAssets(...args);
        await new Promise((resolve) => {
          window.repaintCheck.releaseAssets = resolve;
        });
      };
    });
    await page.locator("#closePreviewButton").click();
    await preview.waitFor({ state: "detached" });
    await page.waitForFunction(() =>
      Boolean(window.repaintCheck.releaseAssets),
    );
    await editor.evaluate((node) => {
      const { projectService } = node.deps;
      const read = projectService.getFileContent;
      projectService.getFileContent = async (...args) => {
        projectService.getFileContent = read;
        const content = await read(...args);
        await new Promise((resolve) => {
          window.repaintCheck.releasePreviewRead = resolve;
        });
        return content;
      };
    });
    await page.locator("#previewButton").click();
    await page.waitForFunction(() =>
      Boolean(window.repaintCheck.releasePreviewRead),
    );
    await page.evaluate(() => window.repaintCheck.releaseAssets());
    await page.waitForTimeout(200); // Let the abandoned asset-load continuation settle.
    assert.equal(
      await editor.evaluate(
        (node) =>
          node.deps.graphicsService.getCanvas()?.getRootNode()?.host?.id,
      ),
      "vnPreview",
    );
    await page.evaluate(() => window.repaintCheck.releasePreviewRead());
    await ready.waitFor();
    assert.deepEqual(
      warnings,
      [],
      "Reopening must not use missing cached assets",
    );
    assert.deepEqual(errors, []);
    console.log(
      `${name}: immediate reopen and late restoration isolation passed`,
    );
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true });
  }
}
