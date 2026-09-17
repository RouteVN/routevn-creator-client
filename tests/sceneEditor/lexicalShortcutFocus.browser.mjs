// TXT-007/011, TXT-B011: delayed focus must yield to subsequent navigation.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const scenarios = [
  ...["Enter", "i", "Shift+I", "Shift+A"].flatMap((entry) =>
    ["j", "ArrowDown"].map((movement) => ({
      name: `${entry}, Escape, ${movement} cannot jump back to the first line`,
      startLine: "line-1",
      keys: [entry, "Escape", movement],
      mode: "block",
      target: "line-2",
      offset: 6,
    })),
  ),
  ...["o", "Shift+O"].flatMap((entry) => [
    {
      name: `${entry}, Escape preserves block mode`,
      keys: [entry, 16, "Escape"],
      mode: "block",
      target: "created",
      offset: 0,
    },
    ...["j", "ArrowDown"].map((movement) => ({
      name: `${entry}, Escape, ${movement} preserves the later block selection`,
      keys: [entry, 16, "Escape", movement],
      mode: "block",
      target: entry === "o" ? "line-5" : "line-4",
      offset: 6,
    })),
    {
      name: `${entry}, navigation before the first focus frame`,
      keys: [entry, "ArrowDown"],
      mode: "block",
      target: entry === "o" ? "line-5" : "line-4",
      offset: 6,
    },
    ...["ArrowUp", "ArrowDown"].map((movement) => ({
      name: `${entry}, ${movement} preserves the moved native caret`,
      keys: [entry, 16, movement],
      mode: "text-editor",
      target:
        movement === "ArrowUp"
          ? entry === "o"
            ? "line-4"
            : "line-3"
          : entry === "o"
            ? "line-5"
            : "line-4",
      offset: 0,
    })),
    {
      name: `${entry}, typing before the second focus frame`,
      keys: [entry, 16, "X"],
      mode: "text-editor",
      target: "created",
      offset: 1,
      text: "X",
    },
    {
      name: `${entry} without intervening input focuses its new line`,
      keys: [entry],
      mode: "text-editor",
      target: "created",
      offset: 0,
    },
  ]),
];

const fixture = await createSceneEditorBrowserFixture({
  entryPoint: "tests/support/sceneEditorShortcuts.entry.js",
});
const failures = [];
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of scenarios) {
        const { page, errors } = await fixture.newPage(browser);
        const label = `${engineName}: ${scenario.name}`;
        try {
          await page.evaluate((startLine) => {
            window.shortcutPage = window.fixtureModule.mountShortcutPage(
              window.owner,
              startLine,
            );
          }, scenario.startLine ?? "line-4");
          await page.evaluate(() => new Promise(requestAnimationFrame));
          await page.clock.install();
          await page.clock.pauseAt(new Date(Date.now() + 1000));
          for (const key of scenario.keys) {
            if (typeof key === "number") await page.clock.runFor(key);
            else await page.keyboard.press(key);
          }
          await page.clock.runFor(96);
          const result = await page.evaluate(() => ({
            selected: window.owner.selectedLineId,
            pageSelected: window.shortcutPage.selectedLineId,
            mode: window.owner.state.mode,
            caret: window.owner.getNativeLineSelectionContext(),
            lines: window.owner.getLinesSnapshot(),
          }));
          const created = result.lines.find(
            (line) => !line.id.startsWith("line-"),
          );
          const target =
            scenario.target === "created" ? created.id : scenario.target;
          assert.deepEqual(
            result.lines
              .filter((line) => line !== created)
              .map((line) => ({
                id: line.id,
                text: line.actions.dialogue.content
                  .map((item) => item.text)
                  .join(""),
              })),
            Array.from({ length: 6 }, (_, index) => ({
              id: `line-${index + 1}`,
              text: `Line ${index + 1}`,
            })),
            `${label}: original lines`,
          );
          if (created) {
            assert.equal(
              created.actions.dialogue.content
                .map((item) => item.text)
                .join(""),
              scenario.text ?? "",
              `${label}: created text`,
            );
          }
          assert.equal(result.mode, scenario.mode, `${label}: mode`);
          assert.equal(result.selected, target, `${label}: selected line`);
          assert.equal(result.pageSelected, target, `${label}: page selection`);
          if (scenario.mode === "text-editor") {
            assert.deepEqual(
              result.caret,
              {
                lineId: target,
                start: scenario.offset,
                end: scenario.offset,
              },
              `${label}: caret`,
            );
          } else {
            await page.keyboard.press("Enter");
            await page.clock.runFor(48);
          }

          // A selection assertion alone is insufficient: the next real input
          // must edit the intended line and leave every other line untouched.
          await page.keyboard.type("Y");
          await page.clock.runFor(96);
          const after = await page.evaluate(() => ({
            lines: window.owner.getLinesSnapshot(),
            caret: window.owner.getNativeLineSelectionContext(),
            draftLines: window.shortcutPage.draftSection.lines,
          }));
          const expected = result.lines.map((line) => {
            if (line.id !== target) return line;
            const text = line.actions.dialogue.content
              .map((item) => item.text)
              .join("");
            const content = [
              {
                text:
                  text.slice(0, scenario.offset) +
                  "Y" +
                  text.slice(scenario.offset),
              },
            ];
            return {
              ...line,
              actions: {
                ...line.actions,
                dialogue: { ...line.actions.dialogue, content },
              },
            };
          });
          assert.deepEqual(
            after.lines,
            expected,
            `${label}: subsequent typing`,
          );
          assert.deepEqual(after.draftLines, expected, `${label}: page draft`);
          assert.deepEqual(
            after.caret,
            {
              lineId: target,
              start: scenario.offset + 1,
              end: scenario.offset + 1,
            },
            `${label}: subsequent caret`,
          );
          if (created) {
            const createdIndex = result.lines.indexOf(created);
            assert.equal(
              createdIndex,
              scenario.keys[0] === "o" ? 4 : 3,
              `${label}: insertion position`,
            );
          }
          assert.deepEqual(errors, [], label);
          console.log(`${label}: passed`);
        } catch (error) {
          failures.push(error);
          console.error(error.message);
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await fixture.close();
}
assert.equal(
  failures.length,
  0,
  `${failures.length} shortcut focus cases failed`,
);
