// Run with node tests/sceneEditor/lexicalMultilineEditing.browser.mjs.
// Exercise native keyboard input in the production primitive, including two
// inputs before a render frame. No running app or user project data is needed.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const fixture = await createSceneEditorBrowserFixture();
try {
  const scenarios = [
    ...["alpha\nbeta", "alpha\n\nbeta"].flatMap((text) => {
      const offset = text.indexOf("beta");
      return [
        {
          name: `replace first character after ${offset - 5} soft breaks`,
          text,
          offset,
          key: "Shift+ArrowRight",
          expected: `${text.slice(0, offset)}XYZeta`,
          caret: offset + 3,
        },
        {
          name: `delete forward after ${offset - 5} soft breaks`,
          text,
          offset,
          key: "Delete",
          expected: `${text.slice(0, offset)}XYZeta`,
          caret: offset + 3,
        },
      ];
    }),
    {
      name: "delete the soft break forward",
      text: "alpha\nbeta",
      offset: 5,
      key: "Delete",
      expected: "alphaXYZbeta",
      caret: 8,
    },
    ...[5, 6, 7, 10].map((offset) => {
      const text = "alpha\nbeta";
      return {
        name: `type before Backspace recovery at offset ${offset}`,
        text,
        offset,
        key: "Backspace",
        sameFrame: true,
        expected: `${text.slice(0, offset - 1)}XYZ${text.slice(offset)}`,
        caret: offset + 2,
      };
    }),
    {
      name: "soft break before Backspace recovery",
      text: "alpha\nbeta",
      offset: 7,
      key: "Backspace",
      sameFrame: true,
      softBreak: true,
      expected: "alpha\n\nXYZeta",
      caret: 10,
    },
    {
      name: "normal-paced Backspace recovery",
      text: "alpha\nbeta",
      offset: 7,
      key: "Backspace",
      expected: "alpha\nXYZeta",
      caret: 9,
    },
  ];

  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of scenarios) {
        const { page, errors } = await fixture.newPage(browser);
        await page.evaluate(({ text, offset }) => {
          window.owner.lines = [
            { id: "line-1", actions: { dialogue: { content: [{ text }] } } },
            {
              id: "line-2",
              actions: { dialogue: { content: [{ text: "Next line" }] } },
            },
          ];
          window.owner.enterTextMode({
            lineId: "line-1",
            cursorPosition: offset,
          });
        }, scenario);
        await page.waitForTimeout(50);
        if (scenario.sameFrame) {
          await page.clock.install();
          await page.clock.pauseAt(new Date(Date.now() + 1000));
        }
        await page.keyboard.press(scenario.key);
        if (!scenario.sameFrame) await page.waitForTimeout(50);
        if (scenario.softBreak) await page.keyboard.press("Shift+Enter");
        await page.keyboard.type("X");
        if (scenario.sameFrame) await page.clock.runFor(32);
        await page.keyboard.type("YZ");
        if (scenario.sameFrame) await page.clock.resume();
        await page.waitForTimeout(50);
        const result = await page.evaluate(() => ({
          text: window.owner
            .getLinesSnapshot()
            .map((line) =>
              line.actions.dialogue.content.map((item) => item.text).join(""),
            ),
          caret: window.owner.getNativeLineSelectionContext(),
        }));
        const label = `${engineName}: ${scenario.name}`;
        assert.deepEqual(result.text, [scenario.expected, "Next line"], label);
        assert.deepEqual(
          result.caret,
          { lineId: "line-1", start: scenario.caret, end: scenario.caret },
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
