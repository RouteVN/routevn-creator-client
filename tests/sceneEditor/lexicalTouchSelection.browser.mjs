// Touch text selection must retain the browser's context-menu behavior.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const gesture of ["right-click", "touch-contextmenu"]) {
        const { page, errors } = await fixture.newPage(browser);
        await page.evaluate(() => {
          document.documentElement.dataset.rvnInputMode = "touch";
          window.owner.textStyles = [{ id: "style-1", name: "Style One" }];
          window.owner.lines = [
            {
              id: "line-1",
              actions: {
                dialogue: {
                  content: [
                    { text: "Before " },
                    {
                      text: "Styledword",
                      textStyleId: "style-1",
                      furigana: { text: "reading" },
                    },
                    { text: " after" },
                  ],
                },
              },
            },
          ];
          window.owner.enterTextMode({ lineId: "line-1", cursorPosition: 7 });
          window.owner.refs.editor.addEventListener("contextmenu", (event) => {
            window.contextWasPrevented = event.defaultPrevented;
          });
        });
        await page.waitForTimeout(50);
        // Real keyboard selection provides a range that the native menu must
        // leave intact; the following native typing checks its endpoints.
        await page.keyboard.down("Shift");
        for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");
        const before = await page.evaluate(() =>
          window.owner.getNativeLineSelectionContext(),
        );
        assert.deepEqual(before, { lineId: "line-1", start: 7, end: 17 });
        if (gesture === "right-click") {
          await page
            .getByText("Styledword", { exact: true })
            .click({ button: "right" });
        } else {
          // Browser automation cannot perform an iOS long-press; replay its
          // touch contextmenu event and assert that the app does not cancel it.
          await page
            .getByText("Styledword", { exact: true })
            .dispatchEvent("contextmenu", {
              pointerType: "touch",
              bubbles: true,
              composed: true,
              cancelable: true,
            });
        }
        const after = await page.evaluate(() => ({
          prevented: window.contextWasPrevented,
          open: window.owner.refs.selectionMenu.open,
          selection: window.owner.getNativeLineSelectionContext(),
        }));
        const label = `${engineName}: touch ${gesture}`;
        assert.equal(after.prevented, false, label);
        assert.equal(after.open, false, label);
        assert.deepEqual(after.selection, before, label);
        await page.keyboard.type("X");
        const result = await page.evaluate(() => ({
          text: window.owner
            .getLinesSnapshot()[0]
            .actions.dialogue.content.map((item) => item.text)
            .join(""),
          caret: window.owner.getNativeLineSelectionContext(),
        }));
        assert.equal(result.text, "Before X after", label);
        assert.deepEqual(
          result.caret,
          { lineId: "line-1", start: 8, end: 8 },
          label,
        );
        assert.deepEqual(errors, [], label);
        console.log(`${label}: passed`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await fixture.close();
}
