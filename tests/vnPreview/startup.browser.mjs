// Run against the existing watch server. Each browser uses isolated web storage;
// failures are injected in memory, without changing saved project files.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";

for (const [engineName, engine] of Object.entries({ chromium })) {
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
    await page.locator("rvn-project").evaluate((project) => {
      const { appService } = project.deps;
      appService.navigate("/project/scene-editor", {
        ...appService.getPayload(),
        s: "LL8EUke6dL2V",
      });
    });
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible" });
    await page
      .locator('#sectionEditor0 [contenteditable="true"]')
      .waitFor({ state: "visible" });
    await page.locator("#scenePageLoading").waitFor({ state: "detached" });
    const editor = page.locator("rvn-scene-editor-lexical");
    await editor.evaluate((element) => {
      const { projectService } = element.deps;
      const original = projectService.getFileContent;
      window.restorePreviewRead = () => {
        projectService.getFileContent = original;
      };
      projectService.getFileContent = async (...args) => {
        if (!window.releasePreviewRead) {
          await new Promise((resolve) => {
            window.releasePreviewRead = resolve;
          });
        }
        return original(...args);
      };
    });
    await page.locator("#previewButton").click();
    const loading = page.locator("#previewLoading");
    await loading.filter({ hasText: "Loading preview..." }).waitFor();
    assert.equal((await loading.innerText()).trim(), "Loading preview...");
    await page.waitForTimeout(1200);
    assert.equal((await loading.innerText()).trim(), "Loading preview...");
    await page
      .locator("#previewLoading")
      .filter({ hasText: "Checking assets: 0 /" })
      .waitFor();
    const status = await page.locator("#previewLoading").innerText();
    assert.match(status, /Fonts:|Images:/);
    await mkdir(".artifacts/preview-startup", { recursive: true });
    await page.screenshot({ path: ".artifacts/preview-startup/loading.png" });
    await page.evaluate(() => window.restorePreviewRead());
    await page.locator("#closePreviewButton").click();
    await page.locator("#vnPreview").waitFor({ state: "detached" });
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible" });
    await page.evaluate(() => window.releasePreviewRead());
    // The late result must not restart the old fullscreen runtime.
    await page.waitForTimeout(250);
    assert.equal(
      await editor.evaluate(
        (element) =>
          element.deps.graphicsService.getCanvas()?.getRootNode()?.host?.id,
      ),
      "previewCanvasHost",
    );

    await editor.evaluate((element) => {
      const { projectService, appService } = element.deps;
      const original = projectService.ensureRepository;
      const showAlert = appService.showAlert;
      window.previewTimeoutAlerts = [];
      appService.showAlert = (...args) => {
        window.previewTimeoutAlerts.push(args[0]);
        return showAlert(...args);
      };
      window.restorePreviewRepository = () => {
        projectService.ensureRepository = original;
      };
      projectService.ensureRepository = () => new Promise(() => {});
    });
    await page.locator("#previewButton").click();
    await loading.filter({ hasText: "Loading preview..." }).waitFor();
    assert.equal((await loading.innerText()).trim(), "Loading preview...");
    await page
      .locator("#previewLoading")
      .filter({ hasText: "Opening project..." })
      .waitFor();
    // Restore the adapter immediately; the already pending call remains stalled.
    await page.evaluate(() => window.restorePreviewRepository());
    await page
      .locator("#previewError")
      .waitFor({ state: "visible", timeout: 40000 });
    assert.match(
      await page.locator("#previewErrorMessage").innerText(),
      /repository timed out after 30 seconds/,
    );
    assert.equal(await loading.count(), 0);
    assert.deepEqual(
      await page.evaluate(() => window.previewTimeoutAlerts),
      [],
    );
    await page.locator("#closeFailedPreviewButton").click();
    await page.locator("#vnPreview").waitFor({ state: "detached" });
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: five-second delayed details, reset on reopening, cancellation, and 30-second startup deadline passed`,
    );
  } finally {
    await browser.close();
  }
}
