// Run against watch:ios. Uses isolated browser storage, the actual canvas
// renderer/engine and scene editor, with mobile and desktop input.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import {
  openTouchProjectsPage,
  createProjectFromMenu,
} from "../support/mobileBrowserApp.mjs";

const runScenario = async (engineName, engine, viewport) => {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openTouchProjectsPage(page);
    await createProjectFromMenu(page);
    await page.locator("#projectItem0").click();
    await page.locator("#mobileTabItem1").click();
    await page.locator("rvn-mobile-sidebar [data-item-id='scene-map']").click();
    await page.locator("rvn-scenes").evaluate((scenes) => {
      window.sceneOpeningFocusEvents = [];
      document.addEventListener("focusin", (event) => {
        const target = event.composedPath()[0];
        if (target.isContentEditable) {
          window.sceneOpeningFocusEvents.push(target.id);
        }
      });
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
    assert.deepEqual(
      await page.evaluate(() => window.sceneOpeningFocusEvents),
      [],
      "Opening a touch scene editor must never focus an editable field",
    );
    assert.equal(
      await page
        .locator("rvn-lexical-scene-document-editor")
        .evaluateAll((editors) =>
          editors.some((editor) => editor.isEditorActiveElement()),
        ),
      false,
    );
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
    const line = page
      .locator("rvn-lexical-scene-document-editor .editor-paragraph")
      .first();
    await line.tap();
    await page.waitForFunction(() => window.sceneOpeningFocusEvents.length > 0);
    const editor = page.locator("rvn-lexical-scene-document-editor").first();
    assert.equal(
      await editor.evaluate((element) => element.isEditorActiveElement()),
      true,
      "Tapping dialogue must still focus the editor",
    );
    await page.keyboard.insertText("Tablet editing check");
    await page.waitForFunction(() =>
      window.canvasNavigationEditor.store
        .selectViewData()
        .sectionEditorItems.some((section) =>
          JSON.stringify(section.lines).includes("Tablet editing check"),
        ),
    );
    console.log(
      `${engineName} ${viewport.width}x${viewport.height}: opening stays unfocused; tapping and typing work`,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
};

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 1366 },
    { width: 1366, height: 1024 },
  ]) {
    await runScenario(engineName, engine, viewport);
  }
}
