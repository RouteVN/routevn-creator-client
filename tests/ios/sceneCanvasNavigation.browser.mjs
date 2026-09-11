// Run against watch:ios. Uses isolated browser storage, the actual canvas
// renderer/engine and scene editor, with mobile and desktop input.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
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
      await route.fulfill({ response });
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
      .locator("#sceneEditorSectionsScroll")
      .waitFor({ state: "visible", timeout: 10000 });
    await page
      .locator("#previewCanvasHost canvas")
      .waitFor({ state: "visible", timeout: 10000 });
    await page.evaluate(() => {
      const find = (root) => {
        const page = root.querySelector("rvn-scene-editor-lexical");
        if (page) return page;
        for (const element of root.querySelectorAll("*")) {
          const found = element.shadowRoot && find(element.shadowRoot);
          if (found) return found;
        }
      };
      const editor = find(document);
      window.canvasNavigationEditor = editor;
      window.canvasNavigationRuntime = [];
      window.canvasNavigationSubscription = editor.deps.subject
        .pipe()
        .subscribe(({ action, payload }) => {
          if (action === "sceneEditor.runtimeCurrentLineChanged")
            window.canvasNavigationRuntime.push(payload);
        });
    });
    await page.waitForTimeout(500);
    for (const input of ["touch", "mouse"]) {
      const before = await page.evaluate(() =>
        window.canvasNavigationEditor.store.selectSelectedLineId(),
      );
      let after = before;
      for (let attempt = 0; attempt < 4 && after === before; attempt++) {
        const rect = await page
          .locator("#previewCanvasHost canvas")
          .boundingBox();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height * 0.8;
        if (input === "touch") await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await page.waitForTimeout(400);
        const result = await page.evaluate(() => {
          const editor = window.canvasNavigationEditor;
          const selected = editor.store.selectSelectedLineId();
          const activeSection = editor.store
            .selectViewData()
            .sectionEditorItems.find((section) => section.selectionActive);
          return {
            selected,
            renderedSelection: activeSection?.selectedLineId,
            runtime: window.canvasNavigationRuntime.at(-1)?.lineId,
          };
        });
        if (result.runtime)
          assert.equal(result.selected, result.runtime, JSON.stringify(result));
        assert.equal(result.renderedSelection, result.selected);
        after = result.selected;
      }
      assert.notEqual(after, before, `${input} must advance the selected line`);
      console.log(
        `${engineName}: ${input} canvas activation advanced preview and selection together`,
      );
    }
    await page.evaluate(() =>
      window.canvasNavigationSubscription.unsubscribe(),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
