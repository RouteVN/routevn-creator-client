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
    await editor.evaluate(async (element) => {
      const { store, projectService } = element.deps;
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      canvas.getContext("2d").fillRect(0, 0, 8, 8);
      const imageUrl = canvas.toDataURL("image/png");
      const bytes = new Uint8Array(await (await fetch(imageUrl)).arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const originalRead = projectService.getFileContent;
      projectService.getFileContent = (fileId) =>
        fileId === "asset-warning-file"
          ? Promise.resolve({ url: imageUrl, type: "image/png" })
          : originalRead(fileId);
      const imported = await projectService.createImage({
        imageId: "image-one",
        fileRecords: [
          {
            id: "asset-warning-file",
            mimeType: "image/png",
            size: bytes.byteLength,
            sha256,
          },
        ],
        data: {
          type: "image",
          name: "Image One",
          fileId: "asset-warning-file",
          width: 8,
          height: 8,
        },
      });
      if (imported.valid === false) throw new Error(JSON.stringify(imported));
      const updated = await projectService.updateLineAction({
        lineId: store.selectSelectedLineId(),
        actionType: "background",
        action: {
          resourceId: "image-one",
          x: 0,
          y: 0,
          width: 1280,
          height: 720,
        },
      });
      if (updated.valid === false) throw new Error(JSON.stringify(updated));
    });
    await page.waitForFunction(() => {
      const find = (root) => {
        const editor = root.querySelector("rvn-scene-editor-lexical");
        if (editor) return editor;
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) {
            const editor = find(element.shadowRoot);
            if (editor) return editor;
          }
        }
      };
      const deps = find(document)?.deps;
      return (
        deps?.store.selectProjectData().resources.images["image-one"] &&
        deps.graphicsService.hasLoadedAsset("asset-warning-file")
      );
    });
    const selectedAsset = await editor.evaluate(async (element) => {
      const { projectService, appService } = element.deps;
      const image =
        projectService.getRepositoryState().images.items["image-one"];
      const reference = { url: image.fileId };
      const originalRead = projectService.getFileContent;
      const originalAlert = appService.showAlert;
      window.assetWarningMessages = [];
      window.assetReadFailures = 0;
      window.failAssetReads = true;
      appService.showAlert = (options) => {
        window.assetWarningMessages.push(options.message);
        return originalAlert(options);
      };
      projectService.getFileContent = async (fileId) => {
        if (fileId === reference.url && window.failAssetReads) {
          window.assetReadFailures++;
          throw new Error("Simulated missing file");
        }
        return originalRead(fileId);
      };
      return { name: image.name, fileId: reference.url };
    });
    await page.locator("#previewButton").click();
    const dialog = page.locator("rtgl-global-ui #dialog[open]");
    await dialog.waitFor({ state: "visible" });
    assert.ok(
      (await dialog.innerText()).includes(`Images: ${selectedAsset.name}`),
    );
    assert.ok(!(await dialog.innerText()).includes("Simulated missing file"));
    await mkdir(".artifacts/asset-load-feedback", { recursive: true });
    await page.screenshot({
      path: `.artifacts/asset-load-feedback/${engineName}.png`,
    });
    await page.locator("rtgl-global-ui #confirmButton").click();
    // Failed fullscreen startup closes and reloads the editor. Its failure must be
    // visible, and the text editor must remain usable after dismissing it.
    await page.locator("#vnPreview").waitFor({ state: "detached" });
    await dialog.waitFor({ state: "visible" });
    assert.ok(
      (await dialog.innerText()).includes(`Images: ${selectedAsset.name}`),
    );
    await page.locator("rtgl-global-ui #confirmButton").click();
    const retried = await editor.evaluate(async (element, runtimePath) => {
      const warningsBefore = window.assetWarningMessages.length;
      const readsBefore = window.assetReadFailures;
      const { flushSceneEditorCanvasRender } = await import(runtimePath);
      for (let i = 0; i < 3; i++) {
        await flushSceneEditorCanvasRender(element.deps.subject, {
          skipAnimations: true,
        });
      }
      return {
        warningsBefore,
        warningsAfter: window.assetWarningMessages.length,
        readsBefore,
        readsAfter: window.assetReadFailures,
      };
    }, `/@fs${process.cwd()}/src/internal/ui/sceneEditor/runtime.js`);
    assert.equal(retried.warningsAfter, retried.warningsBefore);
    assert.ok(retried.readsAfter > retried.readsBefore);
    assert.equal(await dialog.count(), 0);
    const recovered = await editor.evaluate(async (element, runtimePath) => {
      window.failAssetReads = false;
      const failuresBeforeRecovery = window.assetReadFailures;
      const { flushSceneEditorCanvasRender } = await import(runtimePath);
      await flushSceneEditorCanvasRender(element.deps.subject, {
        skipAnimations: true,
      });
      return {
        loaded:
          element.deps.graphicsService.hasLoadedAsset("asset-warning-file"),
        failuresBeforeRecovery,
        failuresAfterRecovery: window.assetReadFailures,
      };
    }, `/@fs${process.cwd()}/src/internal/ui/sceneEditor/runtime.js`);
    assert.equal(recovered.loaded, true);
    assert.equal(
      recovered.failuresBeforeRecovery,
      recovered.failuresAfterRecovery,
    );
    await page
      .locator('#sectionEditor0 [contenteditable="true"]')
      .first()
      .click();
    // Decode failures come from the real graphics library, whose structured
    // file identity must also resolve to the authoring name.
    await editor.evaluate((element) => {
      const { projectService } = element.deps;
      const originalRead = projectService.getFileContent;
      projectService.getFileContent = async (fileId) =>
        fileId === "asset-warning-file"
          ? { url: "data:image/png;base64,YmFk", type: "image/png" }
          : originalRead(fileId);
    });
    await page.locator("#previewButton").click();
    await dialog.waitFor({ state: "visible" });
    assert.ok(
      (await dialog.innerText()).includes(`Images: ${selectedAsset.name}`),
    );
    await page.locator("rtgl-global-ui #confirmButton").click();
    const warningsBeforeReturn = await page.evaluate(
      () => window.assetWarningMessages.length,
    );
    await page.locator("#vnPreview").waitFor({ state: "detached" });
    await editor.evaluate(async (element, runtimePath) => {
      const { flushSceneEditorCanvasRender } = await import(runtimePath);
      await flushSceneEditorCanvasRender(element.deps.subject, {
        skipAnimations: true,
      });
    }, `/@fs${process.cwd()}/src/internal/ui/sceneEditor/runtime.js`);
    assert.equal(
      await page.evaluate(() => window.assetWarningMessages.length),
      warningsBeforeReturn,
    );
    assert.equal(await dialog.count(), 0);

    // Leave the route and reopen it: the same failed asset should warn again.
    const scenePayload = await editor.evaluate((element) => {
      const { appService } = element.deps;
      const payload = appService.getPayload();
      appService.navigate("/project", payload);
      return payload;
    });
    await editor.waitFor({ state: "detached" });
    await page.locator("rvn-project").evaluate((element, payload) => {
      element.deps.appService.navigate("/project/scene-editor", payload);
    }, scenePayload);
    await dialog.waitFor({ state: "visible" });
    assert.ok(
      (await dialog.innerText()).includes(`Images: ${selectedAsset.name}`),
    );
    assert.equal(
      await page.evaluate(() => window.assetWarningMessages.length),
      warningsBeforeReturn + 1,
    );
    await page.locator("rtgl-global-ui #confirmButton").click();
    await editor.evaluate(async (element, feedbackPath) => {
      const { showAssetLoadFailures } = await import(feedbackPath);
      showAssetLoadFailures(
        element.deps,
        [
          {
            fileId: "font-warning-file",
            error: Object.assign(new Error("checksum mismatch"), {
              fileId: "font-warning-file",
              code: "font_integrity_mismatch",
            }),
          },
          { fileId: "asset-warning-file", error: new Error("missing") },
        ],
        { fonts: { font: { name: "Font One", fileId: "font-warning-file" } } },
      );
    }, `/@fs${process.cwd()}/src/internal/ui/assetLoadFeedback.js`);
    await dialog.waitFor({ state: "visible" });
    const message = dialog.locator(".dialog-message");
    assert.equal(
      await message.textContent(),
      `Could not load these assets:\n• Fonts: Font One\n• Images: ${selectedAsset.name}\n\nCheck their files and replace them with valid copies if needed.`,
    );
    assert.equal(
      await message.evaluate((element) => getComputedStyle(element).whiteSpace),
      "pre-wrap",
    );
    await page.screenshot({
      path: `.artifacts/asset-load-feedback/${engineName}-mixed-assets.png`,
    });
    await page.locator("rtgl-global-ui #confirmButton").click();
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: fullscreen and editor name missing assets; actual image decode failures are named; editor retries and recovers without repeating warnings, including after preview; reopening warns again`,
    );
  } finally {
    await browser.close();
  }
}
