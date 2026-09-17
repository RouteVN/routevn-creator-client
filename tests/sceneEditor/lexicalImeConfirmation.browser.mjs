import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const { page, errors } = await fixture.newPage(browser);
      await page.evaluate(() => {
        window.owner.lines = [
          {
            id: "line-1",
            actions: { dialogue: { content: [{ text: "ab" }] } },
          },
        ];
        window.owner.enterTextMode({ lineId: "line-1", cursorPosition: 1 });
      });
      await page.waitForTimeout(50);
      await page.evaluate(() => {
        const owner = window.owner;
        const text = owner.refs.editor.querySelector("p span").firstChild;
        const target = new StaticRange({
          startContainer: text,
          startOffset: 1,
          endContainer: text,
          endOffset: 1,
        });
        const commit = new InputEvent("beforeinput", {
          inputType: "insertFromComposition",
          data: "你",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        });
        // Chromium does not retain WebKit's insertFromComposition enum value.
        Object.defineProperty(commit, "inputType", {
          value: "insertFromComposition",
        });
        Object.defineProperty(commit, "getTargetRanges", {
          value: () => [target],
        });
        owner.refs.editor.dispatchEvent(commit);
        // WebKit may deliver the confirming key after compositionend. The
        // process-key marker remains even though isComposing is now false.
        owner.refs.editor.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: " ",
            code: "Space",
            keyCode: 229,
            which: 229,
            isComposing: false,
            bubbles: true,
            composed: true,
            cancelable: true,
          }),
        );
        owner.refs.editor.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: " ",
            code: "Space",
            keyCode: 32,
            bubbles: true,
            composed: true,
          }),
        );
      });
      await page.waitForTimeout(50);
      const snapshot = () =>
        page.evaluate(() => ({
          text: window.owner
            .getLinesSnapshot()[0]
            .actions.dialogue.content.map((item) => item.text)
            .join(""),
          caret: window.owner.getNativeLineSelectionContext(),
        }));
      assert.deepEqual(
        await snapshot(),
        { text: "a你b", caret: { lineId: "line-1", start: 2, end: 2 } },
        `${name}: candidate confirmation must not insert Space`,
      );
      await page.keyboard.press("Space");
      await page.keyboard.type("X");
      assert.deepEqual(
        await snapshot(),
        { text: "a你 Xb", caret: { lineId: "line-1", start: 4, end: 4 } },
        `${name}: a later ordinary Space still inserts once`,
      );
      assert.deepEqual(errors, []);
      console.log(`${name}: IME confirmation Space passed`);
      await page.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await fixture.close();
}
