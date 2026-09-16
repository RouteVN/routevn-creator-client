// Run with node tests/sceneEditor/richTextContextMenu.browser.mjs.
// Bundle only the editor into a temporary fixture; no dev server or project data.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "rvn-rich-text-"));
try {
  const bundlePath = join(temporaryDirectory, "editor.js");
  execFileSync("bun", [
    "build",
    "src/primitives/lexicalSceneDocumentEditor.js",
    "--target",
    "browser",
    "--outfile",
    bundlePath,
  ]);
  const assets = new Map([
    ["/editor.js", await readFile(bundlePath, "utf8")],
    [
      "/ui.js",
      await readFile(
        "node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js",
        "utf8",
      ),
    ],
    ["/theme.css", await readFile("static/public/theme.css", "utf8")],
  ]);
  const html = `<!doctype html>
<link rel="stylesheet" href="/theme.css"><script src="/ui.js"></script>
<body style="margin:40px"><div id="host"></div>
<script type="module">
import {LexicalSceneDocumentEditorElement} from '/editor.js';
customElements.define('rvn-lexical-scene-document-editor', LexicalSceneDocumentEditorElement);
const shadow = document.querySelector('#host').attachShadow({mode:'open'});
const wrapper = document.createElement('div');
shadow.append(wrapper);
const innerShadow = wrapper.attachShadow({mode:'open'});
window.owner = document.createElement('rvn-lexical-scene-document-editor');
innerShadow.append(window.owner);
window.owner.textStyles = [{id:'style-1', name:'Style One'}, {id:'style-2', name:'Style Two'}];
window.owner.addEventListener('furigana-dialog-request', event => {
  window.furiganaRequest = event.detail;
});
</script>`;

  for (const [engineName, engine] of Object.entries({ webkit, chromium })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const formatting of ["plain", "style", "furigana", "both"]) {
        for (const selectRange of [false, true]) {
          // Plain text needs an explicit range to open the rich-text menu.
          if (formatting === "plain" && !selectRange) continue;
          const page = await browser.newPage({
            viewport: { width: 1000, height: 700 },
          });
          page.setDefaultTimeout(5000);
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.route("http://fixture.test/**", (route) => {
            const path = new URL(route.request().url()).pathname;
            let contentType = "text/html";
            if (path.endsWith(".js")) contentType = "text/javascript";
            if (path.endsWith(".css")) contentType = "text/css";
            return route.fulfill({
              contentType,
              body: assets.get(path) ?? html,
            });
          });
          await page.goto("http://fixture.test/");
          await page.waitForFunction(() => window.owner?.editor);
          const hasStyle = formatting === "style" || formatting === "both";
          const hasFurigana =
            formatting === "furigana" || formatting === "both";
          const segment = { text: "Styledword" };
          if (hasStyle) segment.textStyleId = "style-1";
          if (hasFurigana) {
            segment.furigana = { text: "reading", textStyleId: "style-1" };
          }
          const content = [
            { text: "Before " },
            segment,
            { text: " after", textStyleId: "style-3" },
          ];
          await page.evaluate((content) => {
            window.owner.lines = [
              { id: "line-1", actions: { dialogue: { content } } },
            ];
            window.owner.enterTextMode({ lineId: "line-1", cursorPosition: 1 });
          }, content);
          await page.waitForTimeout(100);

          const openMenu = async () => {
            const points = await page.evaluate(() => {
              const walker = document.createTreeWalker(
                window.owner.refs.editor,
                NodeFilter.SHOW_TEXT,
              );
              while (walker.nextNode()) {
                const node = walker.currentNode;
                const start = node.textContent.indexOf("Styledword");
                if (start < 0) continue;
                const range = document.createRange();
                range.setStart(node, start);
                range.setEnd(node, start + "Styledword".length);
                const rect = range.getBoundingClientRect();
                return {
                  left: rect.left,
                  right: rect.right,
                  y: rect.top + rect.height / 2,
                };
              }
            });
            if (selectRange) {
              await page.mouse.move(points.left + 1, points.y);
              await page.mouse.down();
              await page.mouse.move(points.right - 1, points.y, { steps: 8 });
              await page.mouse.up();
            }
            await page.mouse.click((points.left + points.right) / 2, points.y, {
              button: "right",
            });
          };
          const readContent = () =>
            page.evaluate(() => window.owner.lines[0].actions.dialogue.content);
          const clickMenu = (label) =>
            page.getByText(label, { exact: true }).click();

          await openMenu();
          const expectedLabels = [
            hasStyle ? "Edit text style" : "Add text style",
            hasFurigana ? "Edit furigana" : "Add furigana",
          ];
          if (hasStyle) expectedLabels.push("Remove text style");
          if (hasFurigana) expectedLabels.push("Remove furigana");
          assert.deepEqual(
            await page.evaluate(() =>
              window.owner.refs.selectionMenu.items.map((item) => item.label),
            ),
            expectedLabels,
          );
          assert.deepEqual(
            await page.evaluate(() => window.owner.pendingSelectionSnapshot),
            { lineId: "line-1", start: 7, end: 17 },
          );
          for (const label of expectedLabels) {
            await page
              .getByText(label, { exact: true })
              .waitFor({ state: "visible" });
          }

          if (hasStyle) {
            await clickMenu("Edit text style");
            await clickMenu("Style Two");
            segment.textStyleId = "style-2";
            assert.deepEqual(await readContent(), content);
            await openMenu();
          }
          if (hasFurigana) {
            await clickMenu("Edit furigana");
            assert.deepEqual(
              await page.evaluate(() => window.furiganaRequest.furigana),
              segment.furigana,
            );
            // Complete the dialog through the same primitive method as the page.
            segment.furigana = { text: "updated", textStyleId: "style-2" };
            await page.evaluate(
              (furigana) => window.owner.applyFuriganaToSelection(furigana),
              segment.furigana,
            );
            assert.deepEqual(await readContent(), content);
            await openMenu();
            await clickMenu("Remove furigana");
            delete segment.furigana;
            if (hasStyle) await openMenu();
          }
          if (hasStyle) {
            await clickMenu("Remove text style");
            delete segment.textStyleId;
          }
          assert.deepEqual(await readContent(), [
            { text: "Before Styledword" },
            content[2],
          ]);
          assert.deepEqual(errors, []);
          console.log(
            `${engineName}: ${formatting}, ${selectRange ? "selected range" : "direct right-click"} passed`,
          );
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
