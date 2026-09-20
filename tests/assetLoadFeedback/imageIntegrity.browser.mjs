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
    const editor = page.locator("rvn-scene-editor-lexical");
    const fixture = await editor.evaluate(async (element) => {
      const { store, projectService } = element.deps;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 8;
      const context = canvas.getContext("2d");
      const save = async () =>
        projectService.storeFile({
          file: new File(
            [await (await fetch(canvas.toDataURL())).blob()],
            "image.png",
            { type: "image/png" },
          ),
        });
      context.fillStyle = "black";
      context.fillRect(0, 0, 8, 8);
      const original = await save();
      context.fillStyle = "white";
      context.fillRect(0, 0, 8, 8);
      const changed = await save();
      const content = await projectService.getFileContent(changed.fileId);
      const decoded = new Image();
      decoded.src = content.url;
      await decoded.decode();
      content.revoke?.();
      const created = await projectService.createImage({
        imageId: "modified-background",
        fileRecords: [
          { ...changed.fileRecord, sha256: original.fileRecord.sha256 },
        ],
        data: {
          type: "image",
          name: "Image One",
          fileId: changed.fileId,
          width: 8,
          height: 8,
        },
      });
      if (created.valid === false) throw new Error(JSON.stringify(created));
      const updated = await projectService.updateLineAction({
        lineId: store.selectSelectedLineId(),
        actionType: "background",
        action: {
          resourceId: "modified-background",
          x: 0,
          y: 0,
          width: 1280,
          height: 720,
        },
      });
      if (updated.valid === false) throw new Error(JSON.stringify(updated));
      return { fileId: changed.fileId };
    });
    const dialog = page.locator("rtgl-global-ui #dialog[open]");
    await dialog.waitFor({ state: "visible" });
    assert.ok((await dialog.innerText()).includes("Images: Image One"));
    assert.equal(
      await editor.evaluate(
        (element, fileId) =>
          element.deps.graphicsService.hasLoadedAsset(fileId),
        fixture.fileId,
      ),
      false,
    );
    await page.locator("rtgl-global-ui #confirmButton").click();
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible" });
    await page
      .locator('#sectionEditor0 [contenteditable="true"]')
      .first()
      .click();
    await page.locator("#previewButton").click();
    await dialog.waitFor({ state: "visible" });
    assert.ok((await dialog.innerText()).includes("Images: Image One"));
    assert.equal(
      await editor.evaluate(
        (element, fileId) =>
          element.deps.graphicsService.hasLoadedAsset(fileId),
        fixture.fileId,
      ),
      false,
    );
    await page.locator("rtgl-global-ui #confirmButton").click();
    await mkdir(".artifacts/asset-load-feedback", { recursive: true });
    await page.screenshot({
      path: `.artifacts/asset-load-feedback/${engineName}-modified-background.png`,
    });
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: decodable image with a mismatched hash is omitted and warned about in editor and fullscreen preview`,
    );
  } finally {
    await browser.close();
  }
}
