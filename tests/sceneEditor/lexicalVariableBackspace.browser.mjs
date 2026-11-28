// In touch editing, a software keyboard's delete input removes the variable
// before the caret at once. On Android, Chromium closes the keyboard when a
// delete leaves the caret after a variable, and the tap that opens it again
// would drop a selected variable, so a select-then-delete Backspace never
// removed it. Chromium also clears the page selection before that input, so
// the editor uses the caret from the keyboard's key (keyCode 229).
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const chip = { reference: { resourceId: "playerName" } };
const SCENARIOS = [
  {
    name: "a caret after a variable at the line end",
    content: [{ text: "Hello " }, chip],
    deletes: ["Hello "],
    caret: 6,
    typed: "Hello X",
  },
  {
    name: "a caret after the space that follows a variable",
    content: [{ text: "Hello " }, chip, { text: " " }],
    deletes: ["Hello {playerName}", "Hello "],
    caret: 6,
    typed: "Hello X",
  },
  {
    name: "a caret after a variable before more text",
    content: [{ text: "Hello " }, chip, { text: ", welcome" }],
    cursorPosition: 17,
    deletes: ["Hello , welcome"],
    caret: 6,
    typed: "Hello X, welcome",
  },
  {
    name: "a caret before a variable",
    content: [{ text: "Hello " }, chip],
    cursorPosition: 6,
    deletes: ["Hello{playerName}"],
    caret: 5,
    typed: "HelloX{playerName}",
  },
  {
    name: "the keyboard's key, with no page selection at the input",
    content: [{ text: "Hello " }, chip, { text: ", welcome" }],
    cursorPosition: 17,
    imeKey: true,
    deletes: ["Hello , welcome"],
    caret: 6,
    typed: "Hello X, welcome",
  },
  {
    name: "a tapped variable",
    content: [{ text: "Hello " }, chip, { text: ", welcome" }],
    tapChip: true,
    imeKey: true,
    deletes: ["Hello , welcome"],
    caret: 6,
    typed: "Hello X, welcome",
  },
  {
    name: "a tapped variable, without the keyboard's key",
    content: [{ text: "Hello " }, chip, { text: ", welcome" }],
    tapChip: true,
    deletes: ["Hello , welcome"],
    caret: 6,
    typed: "Hello X, welcome",
  },
  {
    name: "a selection across a variable",
    content: [{ text: "Hello " }, chip, { text: ", welcome" }],
    select: { startText: "Hello ", start: 3, endText: ", welcome", end: 1 },
    deletes: ["Hel welcome"],
    caret: 3,
    typed: "HelX welcome",
  },
  {
    name: "the Backspace key, as from a hardware keyboard",
    content: [{ text: "Hello " }, chip, { text: ", welcome" }],
    cursorPosition: 17,
    source: "key",
    deletes: ["Hello , welcome"],
    caret: 6,
    typed: "Hello X, welcome",
  },
  // With a mouse, the first delete selects the variable and the next removes
  // it.
  {
    name: "a delete input with a mouse",
    inputMode: "pointer",
    content: [{ text: "Hello " }, chip, { text: ", welcome" }],
    cursorPosition: 17,
    deletes: ["Hello {playerName}, welcome", "Hello , welcome"],
    caret: 6,
    typed: "Hello X, welcome",
  },
];

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of SCENARIOS) {
        const label = `${name}: ${scenario.name}`;
        const { page, errors } = await fixture.newPage(browser);
        await page.evaluate((scenario) => {
          document.documentElement.dataset.rvnInputMode =
            scenario.inputMode ?? "touch";
          window.owner.mentionTargets = [
            { id: "playerName", label: "Player Name" },
          ];
          window.owner.lines = [
            {
              id: "line-1",
              actions: { dialogue: { content: scenario.content } },
            },
          ];
          window.owner.enterTextMode({
            lineId: "line-1",
            cursorPosition: scenario.cursorPosition ?? -1,
          });
        }, scenario);
        await page.waitForTimeout(50);
        if (scenario.tapChip) {
          const point = await page.evaluate(() => {
            const rect = window.owner.refs.editor
              .querySelector("[data-rvn-reference-key]")
              .getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            };
          });
          await page.mouse.click(point.x, point.y);
          await page.waitForTimeout(50);
        }
        if (scenario.select) {
          await page.evaluate(({ startText, start, endText, end }) => {
            const editor = window.owner.refs.editor;
            const findText = (data) => {
              const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT,
              );
              for (
                let node = walker.nextNode();
                node;
                node = walker.nextNode()
              ) {
                if (node.data === data) return node;
              }
              throw new Error(`No text node ${data}`);
            };
            getSelection().setBaseAndExtent(
              findText(startText),
              start,
              findText(endText),
              end,
            );
          }, scenario.select);
          await page.waitForTimeout(50);
        }
        const text = () =>
          page.evaluate(() =>
            window.owner
              .getLinesSnapshot()[0]
              .actions.dialogue.content.map(
                (item) => item.text ?? `{${item.reference.resourceId}}`,
              )
              .join(""),
          );
        for (const [index, expected] of scenario.deletes.entries()) {
          if (scenario.source === "key") {
            await page.keyboard.press("Backspace");
            await page.waitForTimeout(32);
            assert.equal(
              await text(),
              expected,
              `${label}: delete ${index + 1}`,
            );
            continue;
          }
          await page.evaluate((imeKey) => {
            const editor = window.owner.refs.editor;
            if (imeKey) {
              const keydown = new KeyboardEvent("keydown", {
                key: "Unidentified",
                bubbles: true,
                cancelable: true,
                composed: true,
              });
              Object.defineProperty(keydown, "keyCode", { value: 229 });
              editor.dispatchEvent(keydown);
              // Chromium on Android clears the selection before the input.
              getSelection().removeAllRanges();
            }
            editor.dispatchEvent(
              new InputEvent("beforeinput", {
                inputType: "deleteContentBackward",
                bubbles: true,
                cancelable: true,
                composed: true,
              }),
            );
          }, scenario.imeKey ?? false);
          await page.waitForTimeout(32);
          assert.equal(await text(), expected, `${label}: delete ${index + 1}`);
        }
        await page.waitForTimeout(50);
        const caret = scenario.caret;
        assert.deepEqual(
          await page.evaluate(() =>
            window.owner.getNativeLineSelectionContext(),
          ),
          { lineId: "line-1", start: caret, end: caret },
          `${label}: caret`,
        );
        await page.keyboard.type("X");
        await page.waitForTimeout(32);
        assert.equal(await text(), scenario.typed, `${label}: typing`);
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
