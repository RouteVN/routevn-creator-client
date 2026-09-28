// TXT-B018: replay iPadOS 17.5 software-keyboard timestamps and event order.
// Keyboard events reported timeStamp=0; a cancellable beforeinput with a
// positive timestamp followed after the printable-key fallback had committed.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createSceneEditorBrowserFixture } from "../support/sceneEditorBrowser.js";

async function keyboardEvent(page, type, key) {
  await page.evaluate(
    ({ type, key }) => {
      const keyCode = key.toUpperCase().charCodeAt(0);
      const event = new KeyboardEvent(type, {
        key,
        code: key === " " ? "Space" : `Key${key.toUpperCase()}`,
        keyCode,
        which: keyCode,
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      Object.defineProperty(event, "timeStamp", { value: 0 });
      window.owner.refs.editor.dispatchEvent(event);
    },
    { type, key },
  );
}

async function beforeInput(page, data) {
  return page.evaluate((data) => {
    const root = window.owner.refs.editor;
    const text = root.querySelector("p span").firstChild;
    const target = new StaticRange({
      startContainer: text,
      startOffset: text.length,
      endContainer: text,
      endOffset: text.length,
    });
    const event = new InputEvent("beforeinput", {
      inputType: "insertText",
      data,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    Object.defineProperty(event, "timeStamp", { value: performance.now() });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [target],
    });
    root.dispatchEvent(event);
    return event.defaultPrevented;
  }, data);
}

async function assertContentAndCaret(page, text, label) {
  const actual = await page.evaluate(() => ({
    text: window.owner
      .getLinesSnapshot()[0]
      .actions.dialogue.content.map((item) => item.text)
      .join(""),
    caret: window.owner.getNativeLineSelectionContext(),
  }));
  assert.deepEqual(
    actual,
    {
      text,
      caret: { lineId: "line-1", start: text.length, end: text.length },
    },
    label,
  );
}

const fixture = await createSceneEditorBrowserFixture();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const { page, errors } = await fixture.newPage(browser);
      await page.evaluate(() => {
        document.documentElement.dataset.rvnInputMode = "touch";
        window.owner.lines = [
          {
            id: "line-1",
            actions: { dialogue: { content: [{ text: "" }] } },
          },
        ];
        window.owner.enterTextMode({ lineId: "line-1", cursorPosition: 0 });
      });
      await page.waitForTimeout(50);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));

      let expected = "";
      for (const [index, key] of [..."hello hi yay"].entries()) {
        await keyboardEvent(page, "keydown", key);
        // Advance the real registered fallback timer before delivering the
        // matching beforeinput, as observed in the native iPad trace.
        await page.clock.runFor(30);
        expected += key;
        await assertContentAndCaret(
          page,
          expected,
          `${name}: fallback ${index}`,
        );
        assert.equal(await beforeInput(page, key), true);
        await keyboardEvent(page, "keyup", key);
        await assertContentAndCaret(
          page,
          expected,
          `${name}: delayed input ${index} must not duplicate ${JSON.stringify(key)}`,
        );
      }

      // A missing beforeinput must not reserve that letter forever. After the
      // duplicate window expires, a same-letter input without keydown is new.
      await keyboardEvent(page, "keydown", "y");
      await page.clock.runFor(30);
      await keyboardEvent(page, "keyup", "y");
      expected += "y";
      await assertContentAndCaret(
        page,
        expected,
        `${name}: standalone fallback`,
      );
      await page.clock.runFor(300);
      assert.equal(await beforeInput(page, "y"), true);
      expected += "y";
      await assertContentAndCaret(
        page,
        expected,
        `${name}: later same-letter input`,
      );
      await page.clock.resume();

      await page.keyboard.type(" X");
      expected += " X";
      await assertContentAndCaret(
        page,
        expected,
        `${name}: subsequent native typing`,
      );
      const reloaded = await page.evaluate(() => {
        const saved = window.owner.getLinesSnapshot();
        window.owner.loadLines(saved);
        return window.owner
          .getLinesSnapshot()[0]
          .actions.dialogue.content.map((item) => item.text)
          .join("");
      });
      assert.equal(
        reloaded,
        expected,
        `${name}: serialized text survives reload`,
      );
      assert.deepEqual(errors, []);
      console.log(`${name}: iPad delayed typing and repeated letters passed`);
      await page.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await fixture.close();
}
