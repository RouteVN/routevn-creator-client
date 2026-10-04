// Undo and redo load lines into the editor with replaceLines, which must
// show them while the editor is focused, where setting `lines` keeps the
// editor's own text.
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
        window.changes = [];
        window.owner.addEventListener("scene-lines-changed", (event) =>
          window.changes.push(event.detail.reason),
        );
        window.lineWith = (text) => [
          {
            id: "line-1",
            actions: { dialogue: { content: [{ text: "Hello world" }] } },
          },
          { id: "line-2", actions: { dialogue: { content: [{ text }] } } },
        ];
        window.owner.lines = window.lineWith("Second");
        window.owner.enterTextMode({ lineId: "line-2", cursorPosition: 6 });
      });
      await page.waitForTimeout(50);
      await page.keyboard.type(" line");
      await page.waitForTimeout(50);
      const snapshot = () =>
        page.evaluate(() => ({
          text: window.owner
            .getLinesSnapshot()
            .map((line) =>
              line.actions.dialogue.content.map((item) => item.text).join(""),
            ),
          caret: window.owner.getNativeLineSelectionContext(),
          mode: window.owner.state.mode,
        }));
      assert.deepEqual((await snapshot()).text, ["Hello world", "Second line"]);

      // Setting the same lines while focused keeps the typed text.
      await page.evaluate(() => {
        window.owner.lines = window.lineWith("Second");
        window.changes.length = 0;
      });
      assert.deepEqual((await snapshot()).text, ["Hello world", "Second line"]);

      await page.evaluate(() =>
        window.owner.replaceLines(window.lineWith("Second"), {
          lineId: "line-2",
          cursorPosition: 6,
        }),
      );
      await page.waitForTimeout(50);
      assert.deepEqual(
        await snapshot(),
        {
          text: ["Hello world", "Second"],
          caret: { lineId: "line-2", start: 6, end: 6 },
          mode: "text-editor",
        },
        `${name}: replaceLines shows the lines while focused`,
      );
      assert.deepEqual(
        await page.evaluate(() => window.changes),
        [],
        `${name}: replaceLines reports no change`,
      );

      // Typing continues from the restored caret, and a key typed before
      // the next frame is reported. The paused clock holds the frame back.
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.evaluate(() => {
        window.owner.replaceLines(window.lineWith("Second"), {
          lineId: "line-2",
          cursorPosition: 6,
        });
      });
      await page.keyboard.type("!");
      await page.clock.runFor(50);
      assert.deepEqual((await snapshot()).text, ["Hello world", "Second!"]);
      assert.deepEqual(
        await page.evaluate(() => window.changes),
        ["text"],
        `${name}: a key right after replaceLines is reported`,
      );

      // In block mode it selects the line and stays in block mode.
      await page.keyboard.press("Escape");
      await page.evaluate(() =>
        window.owner.replaceLines(window.lineWith("Other"), {
          lineId: "line-1",
        }),
      );
      await page.clock.runFor(50);
      const blockState = await page.evaluate(() => ({
        text: window.owner
          .getLinesSnapshot()
          .map((line) => line.actions.dialogue.content[0].text),
        selected: window.owner.state.selectedLineId,
        mode: window.owner.state.mode,
      }));
      assert.deepEqual(
        blockState,
        { text: ["Hello world", "Other"], selected: "line-1", mode: "block" },
        `${name}: replaceLines in block mode`,
      );
      assert.deepEqual(errors, []);
      console.log(`${name}: replaceLines passed`);
      await page.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await fixture.close();
}
