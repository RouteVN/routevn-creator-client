import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const { page, errors } = await fixture.newPage({
        newPage: () => browser.newPage({ hasTouch: true }),
      });
      await page.evaluate(() => {
        document.documentElement.dataset.rvnInputMode = "touch";
        window.owner.lines = ["alpha beta gamma", "second sample line"].map(
          (text, index) => ({
            id: `line-${index + 1}`,
            actions: { dialogue: { content: [{ text }] } },
          }),
        );
        window.owner.enterTextMode({ lineId: "line-1", cursorPosition: 5 });
      });
      await page.waitForTimeout(50);
      // A native tap owns the new caret. A transient WebKit blur delivered
      // afterward must not resurrect the previous programmatic focus target.
      const point = await page.evaluate(() => {
        const paragraph = window.owner.refs.editor.children[1];
        const text = paragraph.querySelector("span").firstChild;
        const range = document.createRange();
        range.setStart(text, 4);
        range.setEnd(text, 5);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + 1, y: rect.top + rect.height / 2 };
      });
      await page.touchscreen.tap(point.x, point.y);
      const tapped = await page.evaluate(() =>
        window.owner.getNativeLineSelectionContext(),
      );
      assert.equal(tapped.lineId, "line-2");
      await page.evaluate(() => {
        window.owner.refs.editor.dispatchEvent(new FocusEvent("blur"));
      });
      await page.waitForTimeout(50);
      assert.deepEqual(
        await page.evaluate(() => window.owner.getNativeLineSelectionContext()),
        tapped,
        `${engineName}: recovery must preserve the tapped caret`,
      );
      await page.keyboard.type("X");
      const result = await page.evaluate(() => ({
        text: window.owner
          .getLinesSnapshot()
          .map((line) =>
            line.actions.dialogue.content.map((item) => item.text).join(""),
          ),
        caret: window.owner.getNativeLineSelectionContext(),
      }));
      assert.deepEqual(result.text, [
        "alpha beta gamma",
        "second sample line".slice(0, tapped.start) +
          "X" +
          "second sample line".slice(tapped.start),
      ]);
      assert.deepEqual(result.caret, {
        lineId: "line-2",
        start: tapped.start + 1,
        end: tapped.start + 1,
      });
      assert.deepEqual(errors, []);
      console.log(`${engineName}: touch caret recovery passed`);
      await page.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await fixture.close();
}
