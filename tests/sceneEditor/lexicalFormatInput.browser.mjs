// Bold, italic and underline from a browser's formatting controls (the iPad
// keyboard's B/I/U buttons send a format input) and from the shortcut must
// format only the selected text and keep the rest of the line.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const STYLE_BY_FORMAT = {
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
  underline: { textDecoration: "underline" },
};
const INPUT_TYPE_BY_FORMAT = {
  bold: "formatBold",
  italic: "formatItalic",
  underline: "formatUnderline",
};

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const openEditor = async (texts, cursorPosition) => {
        const { page, errors } = await fixture.newPage(browser);
        await page.evaluate(
          ({ texts, cursorPosition }) => {
            document.documentElement.dataset.rvnInputMode = "touch";
            window.owner.lines = texts.map((text, index) => ({
              id: `line-${index + 1}`,
              actions: { dialogue: { content: [{ text }] } },
            }));
            window.owner.enterTextMode({ lineId: "line-1", cursorPosition });
          },
          { texts, cursorPosition },
        );
        await page.waitForTimeout(50);
        return { page, errors };
      };
      const selectWithShift = async (page, key, count) => {
        await page.keyboard.down("Shift");
        for (let i = 0; i < count; i++) await page.keyboard.press(key);
        await page.keyboard.up("Shift");
      };
      const readContent = (page) =>
        page.evaluate(() =>
          window.owner
            .getLinesSnapshot()
            .map((line) => line.actions.dialogue.content),
        );
      // WebKit's execCommand sends the same cancelable format input as the
      // iPad's B/I/U buttons and applies it to the page unless it is
      // cancelled. Chromium sends no input for execCommand, so the test sends
      // the input itself there.
      const sendFormatInput = (page, format) =>
        page.evaluate(
          ({ format, inputType, isWebKit }) => {
            if (isWebKit) {
              document.execCommand(format);
              return true;
            }
            const event = new InputEvent("beforeinput", {
              inputType,
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            window.owner.refs.editor.dispatchEvent(event);
            return event.defaultPrevented;
          },
          {
            format,
            inputType: INPUT_TYPE_BY_FORMAT[format],
            isWebKit: name === "webkit",
          },
        );

      for (const source of ["input", "shortcut"]) {
        for (const format of ["bold", "italic", "underline"]) {
          if (source === "shortcut" && format === "underline") continue;
          const label = `${name}: ${format} ${source} on the last word`;
          const { page, errors } = await openEditor(["MY VISUAL NOVEL"], 15);
          await selectWithShift(page, "ArrowLeft", 5);
          // Lexical takes the browser's text changes into its state only
          // when the last key was more than 100 ms earlier, as with a tap.
          await page.waitForTimeout(150);
          if (source === "input") {
            assert.equal(await sendFormatInput(page, format), true, label);
          } else {
            await page.keyboard.press(
              `ControlOrMeta+${format === "bold" ? "b" : "i"}`,
            );
          }
          await page.waitForTimeout(100);
          assert.deepEqual(
            await readContent(page),
            [
              [
                { text: "MY VISUAL " },
                { text: "NOVEL", textStyle: STYLE_BY_FORMAT[format] },
              ],
            ],
            label,
          );
          assert.deepEqual(errors, [], label);
          console.log(`${label}: passed`);
          await page.close();
        }
      }

      {
        const label = `${name}: bold input across two lines`;
        const { page, errors } = await openEditor(
          ["alpha beta", "gamma delta"],
          6,
        );
        // "beta", the line break and "gamma".
        await selectWithShift(page, "ArrowRight", 10);
        await page.waitForTimeout(150);
        assert.equal(await sendFormatInput(page, "bold"), true, label);
        await page.waitForTimeout(100);
        assert.deepEqual(
          await readContent(page),
          [
            [
              { text: "alpha " },
              { text: "beta", textStyle: { fontWeight: "bold" } },
            ],
            [
              { text: "gamma", textStyle: { fontWeight: "bold" } },
              { text: " delta" },
            ],
          ],
          label,
        );
        assert.deepEqual(errors, [], label);
        console.log(`${label}: passed`);
        await page.close();
      }

      {
        const label = `${name}: bold input twice`;
        const { page, errors } = await openEditor(["MY VISUAL NOVEL"], 15);
        await selectWithShift(page, "ArrowLeft", 5);
        await page.waitForTimeout(150);
        await sendFormatInput(page, "bold");
        await page.waitForTimeout(150);
        await sendFormatInput(page, "bold");
        await page.waitForTimeout(100);
        assert.deepEqual(
          await readContent(page),
          [[{ text: "MY VISUAL NOVEL" }]],
          label,
        );
        assert.deepEqual(errors, [], label);
        console.log(`${label}: passed`);
        await page.close();
      }

      if (name === "chromium") {
        // Chromium's selection reaches Lexical, so the shortcut keeps its
        // direction: Shift+ArrowLeft goes on extending a backward selection.
        const label = `${name}: bold shortcut keeps a backward selection`;
        const { page, errors } = await openEditor(["MY VISUAL NOVEL"], 15);
        await selectWithShift(page, "ArrowLeft", 5);
        await page.keyboard.press("ControlOrMeta+b");
        await selectWithShift(page, "ArrowLeft", 1);
        assert.deepEqual(
          await page.evaluate(() =>
            window.owner.getNativeLineSelectionContext(),
          ),
          { lineId: "line-1", start: 9, end: 15 },
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
