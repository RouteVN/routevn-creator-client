// Backspace at the start of a section's first line has nothing before it to
// delete or merge into, so the line, its text and its actions stay. A
// selection that starts there loses only its text.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const bold = { fontWeight: "bold" };
const chip = { reference: { resourceId: "playerName" } };
const SCENARIOS = [
  {
    name: "a caret before text",
    first: [{ text: "Hello world" }],
    expected: "Hello world",
    typed: "XHello world",
  },
  {
    name: "a caret before a leading space",
    first: [{ text: " Hello" }],
    expected: " Hello",
  },
  {
    name: "a caret in a line that is only a space",
    first: [{ text: " " }],
    expected: " ",
  },
  {
    name: "a caret before a space and bold text",
    first: [{ text: " " }, { text: "Hi", textStyle: bold }],
    expected: " Hi",
  },
  {
    name: "a caret before a variable",
    first: [chip, { text: " hi" }],
    presses: 2,
    expected: "{playerName} hi",
    typed: "X{playerName} hi",
  },
  {
    name: "a caret before a space and a variable",
    first: [{ text: " " }, chip],
    expected: " {playerName}",
    typed: "X {playerName}",
  },
  {
    name: "a caret before a soft break",
    first: [{ text: "\nHello" }],
    expected: "\nHello",
  },
  {
    name: "Backspace after deleting all the text",
    first: [{ text: "Hello" }],
    cursorPosition: 5,
    presses: 6,
    expected: "",
    typed: "X",
  },
  {
    name: "deleting the selected text, then Backspace",
    first: [{ text: "Hello" }],
    cursorPosition: 5,
    select: async (page) => {
      await page.keyboard.down("Shift");
      for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
      await page.keyboard.up("Shift");
    },
    presses: 2,
    expected: "",
  },
  {
    name: "deleting a selection into the second line",
    first: [{ text: "Hello" }],
    select: async (page) => {
      await page.keyboard.down("Shift");
      await page.keyboard.press("ArrowDown");
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
      await page.keyboard.up("Shift");
    },
    expected: "",
    removesSecondLine: true,
  },
];

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      // A key press as from a hardware keyboard, and the delete input a
      // software keyboard sends.
      for (const source of ["key", "input"]) {
        for (const scenario of SCENARIOS) {
          const label = `${name}: ${source}, ${scenario.name}`;
          const { page, errors } = await fixture.newPage(browser);
          await page.evaluate(
            ({ scenario, source }) => {
              if (source === "input") {
                document.documentElement.dataset.rvnInputMode = "touch";
              }
              window.owner.mentionTargets = [
                { id: "playerName", label: "Player Name" },
              ];
              window.owner.lines = [
                {
                  id: "line-1",
                  actions: {
                    background: { resourceId: "background-1" },
                    dialogue: { content: scenario.first },
                  },
                },
                {
                  id: "line-2",
                  actions: { dialogue: { content: [{ text: "Second" }] } },
                },
                {
                  id: "line-3",
                  actions: { dialogue: { content: [{ text: "Third" }] } },
                },
              ];
              window.owner.enterTextMode({
                lineId: "line-1",
                cursorPosition: scenario.cursorPosition ?? 0,
              });
            },
            { scenario: { ...scenario, select: undefined }, source },
          );
          await page.waitForTimeout(50);
          await scenario.select?.(page);
          for (let i = 0; i < (scenario.presses ?? 1); i++) {
            if (source === "key") {
              await page.keyboard.press("Backspace");
            } else {
              await page.evaluate(() => {
                window.owner.refs.editor.dispatchEvent(
                  new InputEvent("beforeinput", {
                    inputType: "deleteContentBackward",
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                  }),
                );
              });
            }
            await page.waitForTimeout(32);
          }
          const snapshot = () =>
            page.evaluate(() =>
              window.owner.getLinesSnapshot().map((line) => ({
                id: line.id,
                text: line.actions.dialogue.content
                  .map((item) => item.text ?? `{${item.reference.resourceId}}`)
                  .join(""),
                background: line.actions.background?.resourceId,
              })),
            );
          const expectedLines = (firstText) => [
            { id: "line-1", text: firstText, background: "background-1" },
            ...(scenario.removesSecondLine
              ? []
              : [{ id: "line-2", text: "Second", background: undefined }]),
            { id: "line-3", text: "Third", background: undefined },
          ];
          assert.deepEqual(
            await snapshot(),
            expectedLines(scenario.expected),
            label,
          );
          assert.deepEqual(
            await page.evaluate(() =>
              window.owner.getNativeLineSelectionContext(),
            ),
            { lineId: "line-1", start: 0, end: 0 },
            `${label}: caret`,
          );
          if (scenario.typed) {
            await page.keyboard.type("X");
            await page.waitForTimeout(32);
            assert.deepEqual(
              await snapshot(),
              expectedLines(scenario.typed),
              `${label}: typing`,
            );
          }
          assert.deepEqual(errors, [], label);
          console.log(`${label}: passed`);
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
