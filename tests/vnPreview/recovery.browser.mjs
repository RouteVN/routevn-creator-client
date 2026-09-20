// Run against the existing watch server. Failure injection and project data
// live only in an isolated browser profile; no user projects are accessed.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const profile = await mkdtemp(join(tmpdir(), "routevn-scene-recovery-"));
  const browser = await engine.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
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
      const { appService, projectService, graphicsService } = node.deps;
      const init = graphicsService.init;
      let failures = 0;
      let message;
      let timeout = false;
      let pauseNextInitialization = false;
      graphicsService.init = async (options) => {
        await init(options);
        if (pauseNextInitialization) {
          pauseNextInitialization = false;
          await new Promise((resolve) => {
            window.previewRecovery.releaseInitialization = resolve;
          });
        }
        if (failures > 0) {
          failures -= 1;
          const error = new Error(message);
          if (timeout) {
            error.name = "TimeoutError";
            error.timeoutMs = 30000;
          }
          throw error;
        }
      };
      window.previewRecovery = {
        revision: projectService.getRepositoryRevision(),
        currentRevision: () => projectService.getRepositoryRevision(),
        fail(count, text, isTimeout = false) {
          failures = count;
          message = text;
          timeout = isTimeout;
        },
        pauseNextInitialization() {
          pauseNextInitialization = true;
        },
        openEditor: () =>
          appService.navigate("/project/scene-editor", {
            ...appService.getPayload(),
            s: "LL8EUke6dL2V",
          }),
      };
      appService.navigate("/project/scenes", appService.getPayload());
    });
    const map = page.locator("rvn-scenes");
    const preview = page.locator("#vnPreview");
    const failed = page.locator("#previewError");
    await map.waitFor({ state: "attached" });
    await map.evaluate((node) => {
      node.deps.store.setSelectedItemId({ itemId: "LL8EUke6dL2V" });
      node.deps.render();
    });
    await page.evaluate(() =>
      window.previewRecovery.fail(
        1,
        "Initialize graphics timed out after 30 seconds.",
        true,
      ),
    );
    await page.locator("#detailPreviewButton").click();
    await failed.waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewLoading").count(), 0);
    assert.equal(await failed.locator("rtgl-button").count(), 1);
    assert.equal(
      await page.locator("#previewErrorMessage").innerText(),
      "Initialize graphics timed out after 30 seconds.",
    );
    await mkdir(".artifacts/preview-recovery", { recursive: true });
    await page.screenshot({
      path: `.artifacts/preview-recovery/${name}-map-error.png`,
    });
    await page.locator("#closeFailedPreviewButton").click();
    await preview.waitFor({ state: "detached" });
    assert.equal(await map.count(), 1);
    await page.locator("#detailPreviewButton").click();
    await page.locator('#previewSurface[data-preview-ready="true"]').waitFor();
    await page.locator("#closePreviewButton").click();
    await preview.waitFor({ state: "detached" });

    await page.evaluate(() => window.previewRecovery.openEditor());
    const editor = page.locator("rvn-scene-editor-lexical");
    await page.locator('#sectionEditor0 [contenteditable="true"]').waitFor();
    await page.locator("#scenePageLoading").waitFor({ state: "detached" });
    await page.evaluate(() =>
      window.previewRecovery.fail(1, "Renderer startup failed <not-markup>"),
    );
    await page.locator("#previewButton").click();
    await failed.waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#previewErrorMessage").innerText(),
      "Renderer startup failed <not-markup>",
    );
    assert.equal(await failed.locator("not-markup").count(), 0);
    await page.screenshot({
      path: `.artifacts/preview-recovery/${name}-editor-error.png`,
    });
    await page.evaluate(() => window.previewRecovery.pauseNextInitialization());
    await page.locator("#closeFailedPreviewButton").click();
    await preview.waitFor({ state: "detached" });
    await page.waitForFunction(() =>
      Boolean(window.previewRecovery.releaseInitialization),
    );
    assert.equal(await page.locator("#scenePageLoading").count(), 0);
    assert.equal(
      await page.locator("#sceneEditorContent").evaluate((node) => node.inert),
      false,
    );
    await page
      .locator('#sectionEditor0 [contenteditable="true"]')
      .waitFor({ state: "visible" });
    await page.screenshot({
      path: `.artifacts/preview-recovery/${name}-return-pending.png`,
    });
    await page.evaluate(() => window.previewRecovery.releaseInitialization());
    assert.equal(
      await editor.evaluate((node) =>
        node.deps.store.selectSceneInitializationStatus(),
      ),
      "ready",
    );
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible" });

    // A second renderer failure during return must use the editor recovery screen.
    await page.evaluate(() =>
      window.previewRecovery.fail(2, "Renderer could not start"),
    );
    await page.locator("#previewButton").click();
    await failed.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await preview.waitFor({ state: "detached" });
    await page.locator("#scenePageError").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#sceneErrorMessage").innerText(),
      "Renderer could not start",
    );
    await page.locator("#recoveryBackButton").click();
    await map.waitFor({ state: "attached" });
    await editor.waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() => window.previewRecovery.currentRevision()),
      await page.evaluate(() => window.previewRecovery.revision),
    );
    assert.deepEqual(errors, []);
    console.log(
      `${name}: preview failure from map/editor, closing, reopening, and editor restoration failure passed`,
    );
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true });
  }
}
