// Replay the modifier sequence captured from the physical iPhone keyboard,
// then use native typing to verify the resulting content and insertion point.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of [
        {
          mode: "touch",
          input: "rapid",
          text: ["alpha", "", "", "", "XY"],
          offset: 2,
        },
        {
          mode: "touch",
          input: "Shift+Enter",
          text: ["alpha", "XY"],
          offset: 2,
        },
        {
          mode: "touch",
          input: "insertLineBreak",
          text: ["alpha", "XY"],
          offset: 2,
        },
        {
          mode: "pointer",
          input: "Shift+Enter",
          text: ["alpha\nXY"],
          offset: 8,
        },
      ]) {
        const { page, errors } = await fixture.newPage(browser);
        await page.evaluate((mode) => {
          document.documentElement.dataset.rvnInputMode = mode;
          window.owner.lines = [
            {
              id: "line-1",
              actions: { dialogue: { content: [{ text: "alpha" }] } },
            },
          ];
          window.owner.enterTextMode({ lineId: "line-1", cursorPosition: 5 });
        }, scenario.mode);
        await page.waitForTimeout(50);
        if (scenario.input === "insertLineBreak") {
          // TXT-B013: typing before the split's recovery frame must not be
          // rewound when that frame runs.
          await page.clock.install();
          await page.clock.pauseAt(new Date(Date.now() + 1000));
        }
        if (scenario.input === "Shift+Enter") {
          await page.keyboard.press("Shift+Enter");
        } else if (scenario.input === "insertLineBreak") {
          await page.evaluate(() => {
            window.owner.refs.editor.dispatchEvent(
              new InputEvent("beforeinput", {
                inputType: "insertLineBreak",
                bubbles: true,
                composed: true,
                cancelable: true,
              }),
            );
          });
        } else {
          // iPhone 13 Pro / iOS 16.3.1: four native Return activations at 70ms.
          // The third keydown was shifted without any preceding Shift keydown.
          for (const [downShift, upShift] of [
            [false, false],
            [false, true],
            [true, false],
            [false, false],
          ]) {
            await page.evaluate(
              ([down, up]) => {
                for (const [type, shiftKey] of [
                  ["keydown", down],
                  ["keyup", up],
                ]) {
                  window.owner.refs.editor.dispatchEvent(
                    new KeyboardEvent(type, {
                      key: "Enter",
                      code: "Enter",
                      keyCode: 13,
                      shiftKey,
                      bubbles: true,
                      composed: true,
                      cancelable: true,
                    }),
                  );
                }
              },
              [downShift, upShift],
            );
            await page.waitForTimeout(70);
          }
        }
        await page.keyboard.type("X");
        if (scenario.input === "insertLineBreak") {
          await page.clock.runFor(32);
        } else {
          await page.waitForTimeout(32);
        }
        await page.keyboard.type("Y");
        if (scenario.input === "insertLineBreak") await page.clock.resume();
        const result = await page.evaluate(() => {
          const lines = window.owner.getLinesSnapshot();
          return {
            text: lines.map((line) =>
              line.actions.dialogue.content.map((item) => item.text).join(""),
            ),
            lastId: lines.at(-1).id,
            caret: window.owner.getNativeLineSelectionContext(),
          };
        });
        const label = `${engineName}: ${scenario.mode} ${scenario.input}`;
        assert.deepEqual(result.text, scenario.text, label);
        const offset = scenario.offset;
        assert.deepEqual(
          result.caret,
          { lineId: result.lastId, start: offset, end: offset },
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
