// Native keyboard/clipboard regressions mapped to docs/scene-text-editor-spec.md.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const scenarios = [
  ...["😀", "👨‍👩‍👧‍👦", "👍🏽", "🇸🇬"].map((character) => ({
    name: `TXT-004 emoji Backspace ${character}`,
    lines: [`A${character}B`],
    offset: 1 + character.length,
    action: "backspace",
    expected: ["AXB"],
    caret: 2,
  })),
  ...[false, true].flatMap((backward) =>
    [
      {
        name: `TXT-002 replacement backward=${backward}`,
        action: "replace",
        expected: ["alXta"],
        caret: 3,
      },
      {
        name: `TXT-002 single-line paste backward=${backward}`,
        action: "paste",
        clipboard: "one",
        expected: ["aloneXta"],
        caret: 6,
      },
      {
        name: `TXT-002 cut backward=${backward}`,
        action: "cut",
        expected: ["alXta"],
        caret: 3,
      },
      {
        name: `TXT-005 multiline paste backward=${backward}`,
        action: "paste",
        clipboard: "one\ntwo",
        expected: ["alone", "twoXta"],
        caret: 4,
      },
      {
        name: `TXT-002 soft break replacement backward=${backward}`,
        action: "soft-break",
        expected: ["al\nXta"],
        caret: 4,
      },
    ].map((scenario) => ({
      ...scenario,
      lines: ["alpha", "beta"],
      offset: 2,
      select: 6,
      backward,
    })),
  ),
  ...["one\ntwo", "one\n", "\none", "one\n\ntwo"].map((clipboard) => {
    const parts = clipboard.split("\n");
    return {
      name: `TXT-006 paste caret ${JSON.stringify(clipboard)}`,
      lines: ["alphabeta"],
      offset: 5,
      clipboard,
      action: "paste",
      expected: [
        `alpha${parts[0]}`,
        ...parts.slice(1, -1),
        `${parts.at(-1)}Xbeta`,
      ],
      caret: parts.at(-1).length + 1,
    };
  }),
  {
    name: "TXT-002 selection across three scene lines",
    lines: ["alpha", "middle", "beta"],
    offset: 2,
    select: 13,
    action: "replace",
    expected: ["alXta"],
    caret: 3,
  },
  {
    name: "TXT-007 Backspace then Left before recovery",
    lines: ["abcd"],
    offset: 3,
    action: "arrow-race",
    expected: ["aXbd"],
    caret: 2,
  },
  {
    name: "TXT-007 Backspace then selected range before recovery",
    lines: ["abcd"],
    offset: 3,
    action: "selection-race",
    expected: ["aXd"],
    caret: 2,
  },
  {
    name: "TXT-007 Backspace then pointer before recovery",
    lines: ["abcd"],
    offset: 3,
    action: "pointer-race",
    expected: ["Xabd"],
    caret: 1,
  },
];
const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of scenarios) {
        const { page, errors } = await fixture.newPage(browser);
        try {
          if (scenario.clipboard) {
            await page.locator("#clipboard").fill(scenario.clipboard);
            await page.locator("#clipboard").selectText();
            await page.keyboard.press("ControlOrMeta+C");
          }
          await page.evaluate(() => {
            window.owner.loadLines([
              {
                id: "line-1",
                actions: { dialogue: { content: [{ text: "" }] } },
              },
            ]);
            window.owner.enterTextMode({ lineId: "line-1", cursorPosition: 0 });
          });
          await page.waitForTimeout(50);
          // Build the document through actual typing and Enter, as a user does.
          for (let i = 0; i < scenario.lines.length; i++) {
            if (i) {
              await page.keyboard.press("Enter");
              await page.waitForTimeout(50);
            }
            await page.keyboard.type(scenario.lines[i]);
          }
          await page.waitForTimeout(50);
          const selectionEnd = scenario.backward ? scenario.select : 0;
          const moveLeft =
            scenario.lines.join("\n").length - scenario.offset - selectionEnd;
          for (let i = 0; i < moveLeft; i++)
            await page.keyboard.press("ArrowLeft");
          for (let i = 0; i < (scenario.select ?? 0); i++) {
            await page.keyboard.press(
              scenario.backward ? "Shift+ArrowLeft" : "Shift+ArrowRight",
            );
          }
          await page.waitForTimeout(50);
          const label = `${engineName}: ${scenario.name}`;
          if (scenario.select) {
            const selection = await page.evaluate(() =>
              window.owner.getNativeLineRangeSelectionContext(),
            );
            assert.equal(selection?.startOffset, 2, label);
            assert.equal(selection?.endOffset, 2, label);
            assert.equal(selection?.isMultiLine, true, label);
          }
          const race = scenario.action.endsWith("race");
          if (race) {
            await page.clock.install();
            await page.clock.pauseAt(new Date(Date.now() + 1000));
          }
          switch (scenario.action) {
            case "paste":
              await page.keyboard.press("ControlOrMeta+V");
              break;
            case "cut":
              await page.keyboard.press("ControlOrMeta+X");
              break;
            case "soft-break":
              await page.keyboard.press("Shift+Enter");
              break;
            case "backspace":
              await page.keyboard.press("Backspace");
              break;
            case "arrow-race":
            case "selection-race":
              await page.keyboard.press("Backspace");
              await page.keyboard.press(
                scenario.action === "selection-race"
                  ? "Shift+ArrowLeft"
                  : "ArrowLeft",
              );
              break;
            case "pointer-race": {
              await page.keyboard.press("Backspace");
              const point = await page.evaluate(() => {
                const line = window.owner.refs.editor.querySelector("p");
                const range = document.createRange();
                range.setStart(line.firstChild.firstChild, 0);
                range.setEnd(line.firstChild.firstChild, 1);
                const rect = range.getBoundingClientRect();
                return { x: rect.left + 1, y: rect.top + rect.height / 2 };
              });
              await page.mouse.click(point.x, point.y);
              break;
            }
          }
          if (race) {
            await page.clock.runFor(32);
            await page.clock.resume();
          }
          await page.waitForTimeout(50);
          await page.keyboard.type("X");
          await page.waitForTimeout(50);
          const result = await page.evaluate(() => ({
            lines: window.owner
              .getLinesSnapshot()
              .map((line) =>
                line.actions.dialogue.content.map((item) => item.text).join(""),
              ),
            caret: window.owner.getNativeLineSelectionContext(),
            pastes: window.pastedText,
          }));
          assert.deepEqual(result.lines, scenario.expected, label);
          assert.equal(result.caret?.start, scenario.caret, label);
          assert.equal(result.caret?.end, scenario.caret, label);
          for (const text of result.lines)
            assert.ok(text.isWellFormed(), label);
          if (scenario.clipboard)
            assert.deepEqual(result.pastes, [scenario.clipboard], label);
          if (scenario.action === "cut") {
            await page.locator("#clipboard").fill("");
            await page.keyboard.press("ControlOrMeta+V");
            const copied = await page.locator("#clipboard").inputValue();
            assert.equal(
              copied.replace(/\n+/g, "\n"),
              "pha\nbe",
              `${label}: clipboard contents`,
            );
          }
          const reloaded = await page.evaluate(() => {
            const saved = window.owner.getLinesSnapshot();
            window.owner.loadLines(saved);
            return window.owner.getLinesSnapshot();
          });
          assert.deepEqual(
            reloaded.map((line) =>
              line.actions.dialogue.content.map((item) => item.text).join(""),
            ),
            scenario.expected,
            `${label}: reload`,
          );
          assert.deepEqual(errors, [], label);
          console.log(`${label}: passed`);
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
