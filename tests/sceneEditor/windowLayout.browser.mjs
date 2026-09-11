// Run against watch:ios. Real editor/canvas, isolated project storage and
// native window events, without opening or changing projects on a device.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 744, height: 1133 },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.setDefaultTimeout(30000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.RTGL_VT_RESET_APP_STATE = true;
    });
    await page.route("**/src/setup.ios.js", async (route) => {
      const response = await route.fetch({
        url: route.request().url().replace("setup.ios.js", "setup.web.js"),
      });
      await route.fulfill({
        response,
        body: `${await response.text()}
import { createWindowMetricsClient } from './deps/clients/windowMetrics.js';
const metricsClient = createWindowMetricsClient({
  loadMetrics: async () => ({ width: 744, height: 1133 }),
});
deps.pages.windowMetricsClient = metricsClient;
deps.components.windowMetricsClient = metricsClient;
`,
      });
    });
    await page.route("**/projects?*", async (route) => {
      if (route.request().resourceType() !== "document")
        return route.continue();
      const response = await route.fetch({ url: origin + "/ios/index.html" });
      await route.fulfill({ response });
    });
    await page.goto(origin + "/projects?vt-input-mode=touch");
    await page.locator("#mobileCreateMenuButton").click();
    await page
      .locator("#mobileActionMenu [role='menuitem']")
      .filter({ hasText: "Create Project" })
      .click();
    await page
      .locator("#createProjectForm rtgl-input[data-field-name='name'] input")
      .fill("Project One");
    await page
      .locator("#createProjectForm rtgl-button[data-action-id='submit']")
      .click();
    await page.locator("#projectItem0").click();
    await page.locator("#mobileTabItem1").click();
    await page.locator("rvn-mobile-sidebar [data-item-id='scene-map']").click();
    await page.locator("rvn-scenes").evaluate((scenes) => {
      const { appService } = scenes.deps;
      appService.navigate("/project/scene-editor", {
        ...appService.getPayload(),
        s: "LL8EUke6dL2V",
      });
    });
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible" });
    await page
      .locator("#sectionEditor0 [contenteditable=true]")
      .waitFor({ state: "visible" });
    await page.locator("#previewCanvasHost canvas").evaluate((canvas) => {
      window.layoutCanvasElement = canvas;
    });
    await page.locator("rvn-scene-editor-lexical").evaluate((editor) => {
      window.layoutEditor = editor;
      window.layoutCanvas =
        editor.shadowRoot.querySelector("#previewCanvasHost");
      window.layoutSection = editor.shadowRoot.querySelector("#sectionEditor0");
      window.layoutSystemActions =
        editor.shadowRoot.querySelector("#systemActions");
    });
    const editable = page.locator("#sectionEditor0 [contenteditable=true]");
    await editable.click();
    await page.keyboard.press("Home");
    await page.keyboard.type("Layout check ");
    const originalText = await editable.innerText();
    const originalDocument = await page
      .locator("rvn-lexical-scene-document-editor")
      .first()
      .evaluate((owner) => {
        window.layoutLexical = owner.editor;
        return owner.editor.getEditorState().toJSON();
      });

    for (const viewport of [
      { width: 1133, height: 744, sideBySide: true },
      { width: 600, height: 744, sideBySide: false },
      { width: 744, height: 1133, sideBySide: false },
      { width: 844, height: 390, sideBySide: true },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.evaluate(
        ({ width, height }) =>
          window.dispatchEvent(
            new CustomEvent("routevn:window-metrics", {
              detail: { width, height },
            }),
          ),
        viewport,
      );
      await page.waitForFunction(
        (expected) =>
          window.layoutEditor.store.selectViewData().mobileSideBySide ===
          expected,
        viewport.sideBySide,
      );
      const workspace = await page
        .locator("#mobileSceneEditorWorkspace")
        .boundingBox();
      const lines = await page.locator("#sceneEditorLeftEditor").boundingBox();
      const preview = await page
        .locator("#mobileSceneEditorPreviewPanel")
        .boundingBox();
      if (viewport.sideBySide) {
        assert.ok(Math.abs(lines.width / workspace.width - 0.6) < 0.001);
        assert.ok(Math.abs(preview.width / workspace.width - 0.4) < 0.001);
        assert.equal(lines.y, preview.y);
      } else {
        assert.ok(lines.y >= preview.y + preview.height - 1);
      }
      const stateTitle = page.locator("#mobilePresentationStateTitle");
      const stateActions = page.locator(
        "#mobilePresentationState #systemActions",
      );
      if (viewport.sideBySide) {
        await stateTitle.waitFor({ state: "visible" });
        const titleBox = await stateTitle.boundingBox();
        const canvasBox = await page
          .locator("#previewCanvasHost canvas")
          .boundingBox();
        assert.ok(titleBox.x >= preview.x);
        assert.ok(titleBox.y >= canvasBox.y + canvasBox.height);
        const stateScroll = page.locator("#mobilePresentationStateScroll");
        const scroll = await stateScroll.evaluate((panel) => {
          panel.scrollTop = panel.scrollHeight;
          return {
            top: panel.scrollTop,
            height: panel.clientHeight,
            contentHeight: panel.scrollHeight,
          };
        });
        assert.ok(scroll.height > 0);
        if (scroll.contentHeight > scroll.height) assert.ok(scroll.top > 0);
        assert.deepEqual(
          await page.locator("#previewCanvasHost canvas").boundingBox(),
          canvasBox,
        );
        assert.deepEqual(await stateTitle.boundingBox(), titleBox);
        assert.equal(
          await page
            .locator("#mobileSceneEditorPreviewPanel")
            .evaluate((panel) => panel.scrollTop),
          0,
        );
        await stateScroll.evaluate((panel) => {
          panel.scrollTop = 0;
        });
        await stateActions.locator("#addActionButton").click();
      } else {
        assert.equal(await stateTitle.count(), 0);
        assert.equal(await stateActions.locator("#addActionButton").count(), 0);
        await page
          .locator("#mobileKeyboardToolbar [data-action-id='actions']")
          .click();
      }
      await page
        .locator("#commandLineActions [data-action-id]")
        .first()
        .waitFor({ state: "visible" });
      if (viewport.sideBySide) {
        const dialog = await page
          .locator("#actionsDialog .commandPanel")
          .boundingBox();
        assert.ok(dialog.x + dialog.width <= preview.x + 1);
      }
      await page.keyboard.press("Escape");
      await page.locator("#commandLineActions").waitFor({ state: "detached" });
      await page.locator("#mobilePresentationStateScroll").evaluate((panel) => {
        panel.scrollTop = 0;
      });
      assert.equal(await editable.innerText(), originalText);
      assert.deepEqual(
        await page
          .locator("rvn-lexical-scene-document-editor")
          .first()
          .evaluate((owner) => {
            if (owner.editor !== window.layoutLexical)
              throw new Error("Lexical instance replaced");
            return owner.editor.getEditorState().toJSON();
          }),
        originalDocument,
      );
      assert.equal(
        await page.evaluate(() => {
          const root = window.layoutEditor.shadowRoot;
          return (
            root.querySelector("#previewCanvasHost") === window.layoutCanvas &&
            root.querySelector("#sectionEditor0") === window.layoutSection &&
            root.querySelector("#systemActions") === window.layoutSystemActions
          );
        }),
        true,
      );
      assert.equal(
        await page
          .locator("#previewCanvasHost canvas")
          .evaluate((canvas) => canvas === window.layoutCanvasElement),
        true,
      );
      await page.waitForFunction(
        () =>
          window.layoutEditor.store.selectMobileKeyboardState().isVisible ===
          false,
      );
      if (viewport.sideBySide) {
        const canvas = page.locator("#previewCanvasHost canvas");
        const beforeKeyboard = await canvas.boundingBox();
        await page
          .locator("#mobileKeyboardToolbar")
          .evaluate((toolbar, height) => {
            window.layoutKeyboardState = toolbar.store.selectKeyboardState();
            const keyboard = {
              isVisible: true,
              layoutHeight: height,
              visualHeight: height - 180,
              bottom: 180,
              keyboardInset: 180,
              visualOffsetTop: 0,
              pageTop: 0,
            };
            toolbar.store.setKeyboardState(keyboard);
            toolbar.render();
            toolbar.dispatchEvent(
              new CustomEvent("keyboard-state-change", { detail: keyboard }),
            );
          }, viewport.height);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const withKeyboard = await canvas.boundingBox();
        assert.equal(withKeyboard.width, beforeKeyboard.width);
        assert.equal(withKeyboard.height, beforeKeyboard.height);
        await page.locator("#mobileKeyboardToolbar").evaluate((toolbar) => {
          toolbar.store.setKeyboardState(window.layoutKeyboardState);
          toolbar.render();
          toolbar.dispatchEvent(
            new CustomEvent("keyboard-state-change", {
              detail: window.layoutKeyboardState,
            }),
          );
        });
      }
      console.log(
        `${engineName}: ${viewport.width} × ${viewport.height}: layout and editor/canvas preservation passed`,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
