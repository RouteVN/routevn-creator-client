// Native keyboard/clipboard regressions mapped to docs/scene-text-editor-spec.md.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const scenarios = [
  ...[
    ["insertText", "Y", ["alpha", "betYXa"], 5],
    ["insertReplacementText", "Y", ["alpha", "betYXa"], 5],
    ["insertFromComposition", "Y", ["alpha", "betYXa"], 5],
    ["insertLineBreak", undefined, ["alpha", "bet\nXa"], 5],
    ["insertParagraph", undefined, ["alpha", "bet", "Xa"], 1],
    ["insertFromPaste", "Y", ["alpha", "betYXa"], 5],
    ["insertFromPaste", "one\ntwo", ["alpha", "betone", "twoXa"], 4],
    ["insertFromPasteAsQuotation", "Y", ["alpha", "betYXa"], 5],
    ["deleteContentBackward", undefined, ["alpha", "beXa"], 3],
    ["deleteContentForward", undefined, ["alpha", "betX"], 4],
    ["deleteByCut", undefined, ["alpha", "betXa"], 4],
  ].map(([inputType, data, expected, caret]) => ({
    name: `TXT-B009 collapsed target ${inputType} ${JSON.stringify(data)}`,
    lines: ["alpha", "beta"],
    offset: 2,
    select: true,
    action: "target-input",
    inputType,
    data,
    expected,
    caret,
  })),
  ...[
    [1, 0, ["alpha", "Xeta"], 1],
    [1, 4, ["alpha", "betaX"], 5],
    [0, 5, ["alphaXbeta"], 6],
  ].map(([targetLine, targetOffset, expected, caret]) => ({
    name: `TXT-B009 collapsed forward delete at line ${targetLine} offset ${targetOffset}`,
    lines: ["alpha", "beta"],
    offset: 2,
    select: true,
    action: "target-input",
    inputType: "deleteContentForward",
    targetLine,
    targetOffset,
    expected,
    caret,
  })),
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
      select: true,
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
    select: true,
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
          const authoredLines = await page.evaluate(() =>
            window.owner
              .getLinesSnapshot()
              .map((line) =>
                line.actions.dialogue.content.map((item) => item.text).join(""),
              ),
          );
          assert.deepEqual(
            authoredLines,
            scenario.lines,
            `${engineName}: ${scenario.name}: setup text`,
          );
          // Establish the input range directly: platform-specific Shift+Arrow
          // selection after copying from a textarea is not part of this test.
          const anchorLineId = await page.evaluate(({ backward, offset }) => {
            const lines = window.owner.getLinesSnapshot();
            const lineId = lines[backward ? lines.length - 1 : 0].id;
            window.owner.focusLine({ lineId, cursorPosition: offset });
            return lineId;
          }, scenario);
          await page.waitForFunction(
            ({ lineId, offset }) => {
              const caret = window.owner.getNativeLineSelectionContext();
              return (
                caret?.lineId === lineId &&
                caret.start === offset &&
                caret.end === offset
              );
            },
            { lineId: anchorLineId, offset: scenario.offset },
          );
          // Let focusLine's scheduled caret restore finish before selecting.
          await page.evaluate(() => new Promise(requestAnimationFrame));
          if (scenario.select) {
            await page.evaluate(({ backward }) => {
              const lines = window.owner.refs.editor.querySelectorAll("p");
              const start = lines[0].firstChild.firstChild;
              const end = lines[lines.length - 1].firstChild.firstChild;
              window
                .getSelection()
                .setBaseAndExtent(
                  backward ? end : start,
                  2,
                  backward ? start : end,
                  2,
                );
            }, scenario);
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
            case "target-input": {
              // The live selection is native; supply a conflicting input
              // target to reproduce the browser/IME disagreement explicitly.
              const handled = await page.evaluate(
                ({ inputType, data, targetLine = 1, targetOffset = 3 }) => {
                  const text =
                    window.owner.refs.editor.querySelectorAll("p")[targetLine]
                      .firstChild.firstChild;
                  const target = new StaticRange({
                    startContainer: text,
                    startOffset: targetOffset,
                    endContainer: text,
                    endOffset: targetOffset,
                  });
                  const event = new InputEvent("beforeinput", {
                    inputType,
                    data,
                    bubbles: true,
                    cancelable: true,
                  });
                  // Chromium normalizes WebKit-specific input types to "".
                  Object.defineProperty(event, "inputType", {
                    value: inputType,
                  });
                  Object.defineProperty(event, "getTargetRanges", {
                    value: () => [target],
                  });
                  window.owner.refs.editor.dispatchEvent(event);
                  return event.defaultPrevented;
                },
                scenario,
              );
              assert.equal(handled, true, `${label}: handled input target`);
              break;
            }
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
