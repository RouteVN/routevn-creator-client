// TXT-B021/TXT-B022: replay software-keyboard (IME) input through Chromium's
// own IME path, so the browser keeps a real composition, fires its events and
// applies its default edits. Input.imeSetComposition with a replacement range
// models Android's setComposingRegion + setComposingText, Input.insertText
// models commitText, and raw key events model a keyboard's key presses.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

const USER_AGENTS = {
  // Android System WebView also matches Lexical's Safari check.
  "Android WebView":
    "Mozilla/5.0 (Linux; Android 16; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
  "desktop Chromium": undefined,
};

const PROCESS_KEY = { windowsVirtualKeyCode: 229, key: "Unidentified" };
const BACKSPACE_KEY = {
  windowsVirtualKeyCode: 8,
  key: "Backspace",
  code: "Backspace",
};

const pause = (page) => page.waitForTimeout(25);

async function openEditor(
  browser,
  userAgent,
  { lines, lineIndex, cursorPosition = -1, inputMode = "touch" },
) {
  const { page, errors } = await fixture.newPage({
    newPage: () => browser.newPage({ userAgent, hasTouch: true }),
  });
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(
    ({ lines, lineIndex, cursorPosition, inputMode }) => {
      document.documentElement.dataset.rvnInputMode = inputMode;
      const owner = window.owner;
      owner.lines = lines.map((text, index) => ({
        id: `line-${index + 1}`,
        actions: { dialogue: { content: [{ text }] } },
      }));
      window.changedLines = [];
      owner.addEventListener("scene-lines-changed", (event) => {
        window.changedLines = event.detail.lines;
        // Like the page, hand the reported lines straight back.
        owner.lines = event.detail.lines;
      });
      window.compositionStarts = [];
      owner.refs.editor.addEventListener("compositionstart", (event) => {
        window.compositionStarts.push(event.data);
      });
      owner.enterTextMode({ lineId: `line-${lineIndex + 1}`, cursorPosition });
    },
    { lines, lineIndex, cursorPosition, inputMode },
  );
  await page.waitForTimeout(80);

  const pressKey = async (key) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  };
  return {
    page,
    errors,
    // A keyboard that composes sends a process key, then its composing text.
    // `region` replaces existing text, like setComposingRegion.
    async compose(text, region = {}) {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        ...PROCESS_KEY,
      });
      await cdp.send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
        ...region,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        ...PROCESS_KEY,
      });
      await pause(page);
    },
    // Commits the composition, or inserts text when nothing is composing.
    async commitText(text) {
      await cdp.send("Input.insertText", { text });
      await pause(page);
    },
    async backspace() {
      await pressKey(BACKSPACE_KEY);
      await pause(page);
    },
    // Chromium's IME offsets count two characters between paragraphs.
    lineOffset(index) {
      return page.evaluate(
        (index) =>
          [...window.owner.refs.editor.children]
            .slice(0, index)
            .reduce((offset, line) => offset + line.textContent.length + 2, 0),
        index,
      );
    },
    domCaretOffset() {
      return page.evaluate(
        () =>
          window.owner.refs.editor.getRootNode().getSelection().anchorOffset,
      );
    },
    lastCompositionStart() {
      return page.evaluate(() => window.compositionStarts.at(-1));
    },
    read() {
      return page.evaluate(() => {
        const textOf = (line) =>
          line.actions.dialogue.content.map((item) => item.text).join("");
        const lines = window.owner.getLinesSnapshot();
        const caret = window.owner.getNativeLineSelectionContext();
        return {
          dom: [...window.owner.refs.editor.children].map((line) =>
            line.textContent.replaceAll("\u200b", ""),
          ),
          lines: lines.map(textOf),
          changed: window.changedLines.map(textOf),
          isComposing: window.owner.isComposing,
          caret: {
            line: lines.findIndex((line) => line.id === caret?.lineId),
            start: caret?.start,
            end: caret?.end,
          },
        };
      });
    },
  };
}

async function assertComposedLines(editor, expected, label) {
  const { lines } = await editor.read();
  assert.deepEqual(lines, expected, `${label}: while composing`);
}

// The DOM, the editor's lines and the last reported change agree, nothing is
// composing, and the next keyboard character lands at the expected caret.
async function assertCommitted(editor, expected, caret, label) {
  const { dom, lines, changed, isComposing } = await editor.read();
  assert.deepEqual(
    { dom, lines, changed, isComposing },
    { dom: expected, lines: expected, changed: expected, isComposing: false },
    label,
  );
  await editor.commitText("!");
  const typed = expected.map((text, index) =>
    index === caret.line
      ? `${text.slice(0, caret.offset)}!${text.slice(caret.offset)}`
      : text,
  );
  const after = await editor.read();
  assert.deepEqual(
    {
      dom: after.dom,
      lines: after.lines,
      changed: after.changed,
      caret: after.caret,
    },
    {
      dom: typed,
      lines: typed,
      changed: typed,
      caret: {
        line: caret.line,
        start: caret.offset + 1,
        end: caret.offset + 1,
      },
    },
    `${label}: next character`,
  );
  assert.deepEqual(editor.errors, [], `${label}: page errors`);
}

// Gives the keyboard's view of an empty line: SwiftKey commits each letter,
// then re-composes the word at the space from the caret it saw beforehand.
async function typeWithSwiftKey(editor, lineIndex, word) {
  const wordStart =
    (await editor.lineOffset(lineIndex)) + (await editor.domCaretOffset());
  for (const letter of word) {
    await editor.commitText(letter);
  }
  await editor.compose(word, {
    replacementStart: wordStart,
    replacementEnd: wordStart + word.length,
  });
  await editor.commitText(word);
  await editor.commitText(" ");
}

const SCENARIOS = [
  {
    name: "Backspace keys while the keyboard shortens its composing word",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      const start = (await editor.lineOffset(1)) + "beta ".length;
      await editor.compose("gamma", {
        replacementStart: start,
        replacementEnd: start + "gamma".length,
      });
      assert.equal(await editor.lastCompositionStart(), "gamma");
      for (const word of ["gamm", "gam", "ga"]) {
        await editor.backspace();
        await assertComposedLines(
          editor,
          ["alpha", `beta ${word}`],
          `Backspace to ${word}`,
        );
        await editor.compose(word);
        await assertComposedLines(
          editor,
          ["alpha", `beta ${word}`],
          `composing ${word}`,
        );
      }
      await editor.commitText("ga");
      return { lines: ["alpha", "beta ga"], caret: { line: 1, offset: 7 } };
    },
  },
  {
    name: "Backspace key while the whole line is the composing region",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      const start = await editor.lineOffset(1);
      await editor.compose("beta gamma", {
        replacementStart: start,
        replacementEnd: start + "beta gamma".length,
      });
      assert.equal(await editor.lastCompositionStart(), "beta gamma");
      await editor.backspace();
      await assertComposedLines(editor, ["alpha", "beta gamm"], "Backspace");
      await editor.compose("beta gamm");
      await editor.compose("beta gam");
      await assertComposedLines(editor, ["alpha", "beta gam"], "shortened");
      await editor.commitText("beta gam");
      return { lines: ["alpha", "beta gam"], caret: { line: 1, offset: 8 } };
    },
  },
  {
    name: "deleteContentBackward beforeinput without a key while composing",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      for (const text of ["w", "wo", "wor", "word"]) {
        await editor.compose(text);
      }
      // Stands in for deleteSurroundingText from a composing keyboard.
      await editor.page.evaluate(() => {
        window.owner.refs.editor.dispatchEvent(
          new InputEvent("beforeinput", {
            inputType: "deleteContentBackward",
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      });
      await pause(editor.page);
      await editor.compose("wor");
      await assertComposedLines(editor, ["alpha", "beta gamma wor"], "wor");
      await editor.commitText("wor");
      return {
        lines: ["alpha", "beta gamma wor"],
        caret: { line: 1, offset: 14 },
      };
    },
  },
  {
    name: "Backspace key while composing, then the keyboard commits",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      for (const text of ["w", "wo", "wor"]) {
        await editor.compose(text);
      }
      await editor.backspace();
      await assertComposedLines(editor, ["alpha", "beta gamma wo"], "deleted");
      await editor.commitText("wo");
      assert.equal((await editor.read()).isComposing, false);
      await editor.backspace();
      return {
        lines: ["alpha", "beta gamma w"],
        caret: { line: 1, offset: 12 },
      };
    },
  },
  {
    name: "Backspace keys delete the whole composing word, then keep deleting",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      await editor.compose("w");
      await editor.backspace();
      await assertComposedLines(editor, ["alpha", "beta gamma "], "emptied");
      await editor.backspace();
      return { lines: ["alpha", "beta gamma"], caret: { line: 1, offset: 10 } };
    },
  },
  {
    name: "Backspace keys empty a composed line, then join it to the previous",
    lines: ["alpha", "", "gamma"],
    lineIndex: 1,
    cursorPosition: 0,
    async run(editor) {
      await editor.compose("x");
      await editor.backspace();
      await assertComposedLines(editor, ["alpha", "", "gamma"], "emptied");
      await editor.backspace();
      return { lines: ["alpha", "gamma"], caret: { line: 0, offset: 5 } };
    },
  },
  {
    name: "composing text replaced underneath, then the keyboard commits a space",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      for (const text of ["w", "wo", "wor"]) {
        await editor.compose(text);
      }
      // A new line order reloads the editor and drops the composition
      // without a compositionend.
      await editor.page.evaluate(() => {
        window.owner.lines = [
          ...window.owner.lines,
          { id: "line-3", actions: { dialogue: { content: [{ text: "" }] } } },
        ];
      });
      await editor.page.waitForTimeout(80);
      await editor.commitText(" ");
      return {
        lines: ["alpha", "beta gamma wor ", ""],
        caret: { line: 1, offset: 15 },
      };
    },
  },
  {
    name: "composing text replaced underneath, then a Backspace key",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      for (const text of ["w", "wo", "wor"]) {
        await editor.compose(text);
      }
      await editor.page.evaluate(() => {
        window.owner.lines = [
          ...window.owner.lines,
          { id: "line-3", actions: { dialogue: { content: [{ text: "" }] } } },
        ];
      });
      await editor.page.waitForTimeout(80);
      await editor.backspace();
      return {
        lines: ["alpha", "beta gamma wo", ""],
        caret: { line: 1, offset: 13 },
      };
    },
  },
  {
    name: "Backspace key at the start of a composing word joins the lines once",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    cursorPosition: 0,
    async run(editor) {
      const start = await editor.lineOffset(1);
      await editor.compose("beta", {
        replacementStart: start,
        replacementEnd: start + "beta".length,
        selectionStart: 0,
        selectionEnd: 0,
      });
      assert.equal(await editor.lastCompositionStart(), "beta");
      // The join rebuilds the line and with it the composing text, so the
      // keyboard continues without a composition.
      await editor.backspace();
      return { lines: ["alphabeta gamma"], caret: { line: 0, offset: 5 } };
    },
  },
  {
    name: "SwiftKey re-composes a word typed into a tapped empty line",
    lines: ["alpha", "", "gamma"],
    lineIndex: 0,
    async run(editor) {
      const box = await editor.page.evaluate(() => {
        const rect =
          window.owner.refs.editor.children[1].getBoundingClientRect();
        return { x: rect.left + 60, y: rect.top + rect.height / 2 };
      });
      await editor.page.touchscreen.tap(box.x, box.y);
      await editor.page.waitForTimeout(80);
      await typeWithSwiftKey(editor, 1, "Привет");
      assert.equal(await editor.lastCompositionStart(), "Привет");
      return {
        lines: ["alpha", "Привет ", "gamma"],
        caret: { line: 1, offset: 7 },
      };
    },
  },
  {
    name: "SwiftKey re-composes a word typed into an empty line tapped in block mode",
    lines: ["alpha", "", "gamma"],
    lineIndex: 0,
    async run(editor) {
      await editor.page.evaluate(() => window.owner.blurEditor());
      await editor.page.waitForTimeout(80);
      const box = await editor.page.evaluate(() => {
        const rect =
          window.owner.refs.editor.children[1].getBoundingClientRect();
        return { x: rect.left + 60, y: rect.top + rect.height / 2 };
      });
      await editor.page.touchscreen.tap(box.x, box.y);
      await editor.page.waitForTimeout(80);
      await typeWithSwiftKey(editor, 1, "Привет");
      return {
        lines: ["alpha", "Привет ", "gamma"],
        caret: { line: 1, offset: 7 },
      };
    },
  },
  {
    name: "SwiftKey re-composes a word typed into a focused empty line",
    lines: ["alpha", "", "gamma"],
    lineIndex: 1,
    cursorPosition: 0,
    async run(editor) {
      await typeWithSwiftKey(editor, 1, "Привет");
      return {
        lines: ["alpha", "Привет ", "gamma"],
        caret: { line: 1, offset: 7 },
      };
    },
  },
  {
    name: "SwiftKey re-composes a word typed into a line made with Enter",
    lines: ["alpha", "gamma"],
    lineIndex: 0,
    async run(editor) {
      await editor.page.keyboard.press("Enter");
      await editor.page.waitForTimeout(80);
      await typeWithSwiftKey(editor, 1, "Привет");
      return {
        lines: ["alpha", "Привет ", "gamma"],
        caret: { line: 1, offset: 7 },
      };
    },
  },
  {
    name: "SwiftKey re-composes a word typed into a line emptied by Backspace",
    lines: ["alpha", "x", "gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.backspace();
      await editor.page.waitForTimeout(80);
      await typeWithSwiftKey(editor, 1, "Привет");
      return {
        lines: ["alpha", "Привет ", "gamma"],
        caret: { line: 1, offset: 7 },
      };
    },
  },
  {
    name: "composing keyboard: compose, commit, then a space",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      for (const text of ["w", "wo", "wor", "word"]) {
        await editor.compose(text);
      }
      await editor.commitText("word");
      await editor.commitText(" ");
      return {
        lines: ["alpha", "beta gamma word "],
        caret: { line: 1, offset: 16 },
      };
    },
  },
  {
    name: "keyboard re-composes an existing word and commits",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      const start = (await editor.lineOffset(1)) + "beta ".length;
      await editor.compose("Gamma", {
        replacementStart: start,
        replacementEnd: start + "gamma".length,
      });
      assert.equal(await editor.lastCompositionStart(), "gamma");
      await editor.commitText("Gamma");
      return { lines: ["alpha", "beta Gamma"], caret: { line: 1, offset: 10 } };
    },
  },
  {
    name: "LatinIME-style keyboard shortens its word on Backspace (keyCode 229)",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      for (const text of ["w", "wo", "wor", "word", "wor", "wo"]) {
        await editor.compose(text);
      }
      await assertComposedLines(editor, ["alpha", "beta gamma wo"], "wo");
      await editor.commitText("wo");
      await editor.commitText(" ");
      return {
        lines: ["alpha", "beta gamma wo "],
        caret: { line: 1, offset: 14 },
      };
    },
  },
  {
    name: "desktop IME edits its composition with Backspace (keyCode 229)",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    inputMode: "pointer",
    async run(editor) {
      for (const text of ["に", "にほ", "にほん", "にほ", "にほん"]) {
        await editor.compose(text);
      }
      await assertComposedLines(
        editor,
        ["alpha", "beta gammaにほん"],
        "にほん",
      );
      await editor.commitText("日本");
      return {
        lines: ["alpha", "beta gamma日本"],
        caret: { line: 1, offset: 12 },
      };
    },
  },
  {
    name: "Enter after a committed composition starts a new line",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      await editor.commitText(" ");
      for (const text of ["w", "wo", "wor", "word"]) {
        await editor.compose(text);
      }
      await editor.commitText("word");
      await editor.page.keyboard.press("Enter");
      await editor.page.waitForTimeout(80);
      return {
        lines: ["alpha", "beta gamma word", ""],
        caret: { line: 2, offset: 0 },
      };
    },
  },
  {
    name: "keyboard without composition: letters, then Backspace keys",
    lines: ["alpha", "beta gamma"],
    lineIndex: 1,
    async run(editor) {
      for (const letter of " xyz") {
        await editor.commitText(letter);
      }
      await editor.backspace();
      await editor.backspace();
      return {
        lines: ["alpha", "beta gamma x"],
        caret: { line: 1, offset: 12 },
      };
    },
  },
];

const fixture = await createSceneEditorBrowserFixture();
try {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [agentName, userAgent] of Object.entries(USER_AGENTS)) {
      for (const scenario of SCENARIOS) {
        const editor = await openEditor(browser, userAgent, scenario);
        const label = `${agentName}: ${scenario.name}`;
        const { lines, caret } = await scenario.run(editor);
        await assertCommitted(editor, lines, caret, label);
        console.log(`${label} passed`);
        await editor.page.close();
      }
    }
  } finally {
    await browser.close();
  }

  // iOS uses WebKit in touch mode: a tapped empty line still takes typing.
  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    const { page, errors } = await fixture.newPage({
      newPage: () => webkitBrowser.newPage({ hasTouch: true }),
    });
    await page.evaluate(() => {
      document.documentElement.dataset.rvnInputMode = "touch";
      window.owner.lines = ["alpha", "", "gamma"].map((text, index) => ({
        id: `line-${index + 1}`,
        actions: { dialogue: { content: [{ text }] } },
      }));
      window.owner.enterTextMode({ lineId: "line-1", cursorPosition: -1 });
    });
    await page.waitForTimeout(80);
    const box = await page.evaluate(() => {
      const rect = window.owner.refs.editor.children[1].getBoundingClientRect();
      return { x: rect.left + 60, y: rect.top + rect.height / 2 };
    });
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(80);
    await page.keyboard.type("ab");
    assert.deepEqual(
      await page.evaluate(() => ({
        lines: window.owner
          .getLinesSnapshot()
          .map((line) =>
            line.actions.dialogue.content.map((item) => item.text).join(""),
          ),
        caret: window.owner.getNativeLineSelectionContext(),
      })),
      {
        lines: ["alpha", "ab", "gamma"],
        caret: { lineId: "line-2", start: 2, end: 2 },
      },
      "webkit: typing into a tapped empty line",
    );
    assert.deepEqual(errors, []);
    console.log("webkit: typing into a tapped empty line passed");
    await page.close();
  } finally {
    await webkitBrowser.close();
  }
} finally {
  await fixture.close();
}
