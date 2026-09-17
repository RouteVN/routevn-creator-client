import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of [
        "loaded",
        "new-line",
        "delete-last-character",
        "consecutive-empty",
        "nonempty",
      ]) {
        const { page, errors } = await fixture.newPage(browser);
        await page.evaluate((scenario) => {
          document.documentElement.dataset.rvnInputMode = "touch";
          const text =
            scenario === "new-line"
              ? ["alpha"]
              : scenario === "consecutive-empty"
                ? ["alpha", "", ""]
                : [
                    "alpha",
                    scenario === "delete-last-character"
                      ? "x"
                      : scenario === "nonempty"
                        ? "beta"
                        : "",
                  ];
          window.owner.lines = text.map((text, index) => ({
            id: `line-${index + 1}`,
            actions: { dialogue: { content: [{ text }] } },
          }));
          window.owner.enterTextMode({
            lineId: `line-${text.length}`,
            cursorPosition:
              scenario === "new-line"
                ? 5
                : scenario === "delete-last-character"
                  ? 1
                  : 0,
          });
        }, scenario);
        await page.waitForTimeout(50);
        if (scenario === "new-line") await page.keyboard.press("Enter");
        if (scenario === "delete-last-character")
          await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        if (scenario === "consecutive-empty")
          await page.keyboard.press("Backspace");
        const expected = scenario === "nonempty" ? "alphabeta" : "alpha";
        const snapshot = () =>
          page.evaluate(() => ({
            text: window.owner
              .getLinesSnapshot()
              .map((line) =>
                line.actions.dialogue.content.map((item) => item.text).join(""),
              ),
            caret: window.owner.getNativeLineSelectionContext(),
          }));
        assert.deepEqual(
          await snapshot(),
          { text: [expected], caret: { lineId: "line-1", start: 5, end: 5 } },
          `${name}: ${scenario} merges on one Backspace`,
        );
        await page.keyboard.type("X");
        await page.waitForTimeout(32);
        await page.keyboard.type("Y");
        assert.deepEqual(await snapshot(), {
          text: [scenario === "nonempty" ? "alphaXYbeta" : "alphaXY"],
          caret: { lineId: "line-1", start: 7, end: 7 },
        });
        assert.deepEqual(errors, []);
        console.log(`${name}: ${scenario} Backspace passed`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await fixture.close();
}
