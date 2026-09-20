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
    await page.locator("rvn-project").evaluate((element) => {
      const { projectService, appService } = element.deps;
      const repo = projectService.getRepositoryState();
      const layout = Object.values(repo.layouts.items).find(
        (item) => item.type === "layout" && item.layoutType === "dialogue-adv",
      );
      if (!layout) throw new Error("Missing fixture layout");
      const fontIds = new Set(
        Object.values(repo.fonts.items).map((item) => item.fileId),
      );
      const read = projectService.getFileContent;
      projectService.getFileContent = (id, options) => {
        if (fontIds.has(id))
          return Promise.reject(
            Object.assign(new Error("Changed font"), {
              fileId: id,
              code: "font_integrity_mismatch",
            }),
          );
        return read(id, options);
      };
      window.layoutWarnings = [];
      const alert = appService.showAlert;
      appService.showAlert = (options) => {
        window.layoutWarnings.push(options.message);
        return alert(options);
      };
      appService.navigate("/project/layout-editor", {
        ...appService.getPayload(),
        layoutId: layout.id,
      });
    });
    const canvas = page.locator("rvn-layout-editor-canvas");
    await canvas.waitFor({ state: "attached" });
    const dialog = page.locator("rtgl-global-ui #dialog[open]");
    await dialog.waitFor({ state: "visible" });
    assert.ok((await dialog.innerText()).includes("Fonts:"));
    await page.locator("rtgl-global-ui #confirmButton").click();
    await canvas.locator("canvas").waitFor({ state: "visible" });
    const counts = await canvas.evaluate(async (element, handlersPath) => {
      const { prefetchAssets } = await import(handlersPath);
      const before = window.layoutWarnings.length;
      for (let i = 0; i < 3; i++) await prefetchAssets(element.deps);
      return {
        before,
        after: window.layoutWarnings.length,
        ready: element.deps.store.selectIsGraphicsReady(),
        elements: element.deps.store.selectCanvasRenderState().elements.length,
      };
    }, `/@fs${process.cwd()}/src/components/layoutEditorCanvas/layoutEditorCanvas.handlers.js`);
    assert.equal(counts.after, counts.before);
    assert.equal(counts.ready, true);
    assert.ok(counts.elements > 0, "Unaffected layout content must render");
    await mkdir(".artifacts/layout-integrity", { recursive: true });
    await page.screenshot({
      path: `.artifacts/layout-integrity/${engineName}.png`,
    });
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: damaged layout fonts warn once while unaffected canvas content renders`,
    );
  } finally {
    await browser.close();
  }
}
