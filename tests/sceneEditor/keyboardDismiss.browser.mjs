// Run against watch:ios. The actual Lexical primitive receives real outside
// mouse/touch input; storage and device project data are not involved.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const source = `/@fs${process.cwd()}`;
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/public/theme.css">
<style>body{margin:0}#outside{height:250px;background:#ddd}#owner{display:block;width:60%}</style>
<script src="/public/@rettangoli/ui@1.22.1/dist/rettangoli-iife-ui.min.js"></script>
<rvn-lexical-scene-document-editor id="owner"></rvn-lexical-scene-document-editor>
<div id="outside">Outside the editor</div><input id="other" aria-label="Other input">
<script type="module">
import {LexicalSceneDocumentEditorElement} from '${source}/src/primitives/lexicalSceneDocumentEditor.js';
customElements.define('rvn-lexical-scene-document-editor',LexicalSceneDocumentEditorElement);
window.owner=document.querySelector('#owner');
window.owner.lines=[{id:'line-1',actions:{dialogue:{content:[{text:'Example dialogue'}]}}}];
// Model dismissal explicitly: mobile WebKit does not blur on every inert-div tap.
document.querySelector('#outside').addEventListener('click',()=>window.owner.refs.editor.blur());
</script>`;

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const touch of [true, false]) {
      const page = await browser.newPage({
        viewport: { width: 1133, height: 744 },
        hasTouch: touch,
        isMobile: touch,
      });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/keyboard-dismiss-check", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      );
      await page.goto(origin + "/keyboard-dismiss-check");
      await page.waitForFunction(() =>
        window.owner?.lineKeyById?.has("line-1"),
      );
      await page.evaluate(() =>
        window.owner.focusLine({ lineId: "line-1", cursorPosition: 3 }),
      );
      await page.waitForTimeout(400);
      const outside = page.locator("#outside");
      if (touch) await outside.tap();
      else await outside.click();
      await page.waitForTimeout(400);
      const result = await page.evaluate(() => ({
        focused: window.owner.isEditorActiveElement(),
        mode: window.owner.state.mode,
        active: document.activeElement.tagName,
      }));
      assert.equal(
        result.focused,
        false,
        JSON.stringify({ engineName, touch, result }),
      );
      await page.locator("#owner [contenteditable=true]").click();
      assert.equal(
        await page.evaluate(() => window.owner.isEditorActiveElement()),
        true,
      );
      // Moving to another input must win even during caret recovery.
      await page.evaluate(() => {
        window.owner.focusLine({ lineId: "line-1", cursorPosition: 3 });
        document.querySelector("#other").focus();
      });
      await page.waitForTimeout(400);
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "other",
      );
      // Native keyboard dismissal has no DOM pointer event. An old focus
      // target must not reactivate the editor after its recovery window ends.
      await page.evaluate(() =>
        window.owner.focusLine({ lineId: "line-1", cursorPosition: 3 }),
      );
      await page.waitForTimeout(900);
      await page.evaluate(() => window.owner.refs.editor.blur());
      await page.waitForTimeout(400);
      assert.equal(
        await page.evaluate(() => window.owner.isEditorActiveElement()),
        false,
      );
      assert.deepEqual(errors, []);
      console.log(
        `${engineName}: ${touch ? "touch" : "mouse"} outside dismissal and re-entry passed`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
