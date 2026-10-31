// Layout text is plain: bold, italic and underline from a browser's
// formatting controls (the iPad keyboard's B/I/U buttons send a format input)
// must change nothing and keep all of the text.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const INPUT_TYPE_BY_FORMAT = {
  bold: "formatBold",
  italic: "formatItalic",
  underline: "formatUnderline",
};

const temporaryDirectory = await mkdtemp(join(tmpdir(), "rvn-layout-text-"));
try {
  const bundlePath = join(temporaryDirectory, "editor.js");
  execFileSync("bun", [
    "build",
    "src/primitives/lexicalLayoutTextEditor.js",
    "--target",
    "browser",
    "--outfile",
    bundlePath,
  ]);
  const assets = new Map([["/editor.js", await readFile(bundlePath, "utf8")]]);
  // The editor sits inside two shadow roots, as in the app's dialog.
  const html = `<!doctype html>
<body style="margin:40px"><div id="host"></div>
<script type="module">
import {LexicalLayoutTextEditorElement} from '/editor.js';
customElements.define('rvn-lexical-layout-text-editor', LexicalLayoutTextEditorElement);
const wrapper = document.createElement('div');
document.querySelector('#host').attachShadow({mode:'open'}).append(wrapper);
window.owner = document.createElement('rvn-lexical-layout-text-editor');
window.owner.mentionTargets = [{id:'playerName', label:'Player Name'}];
wrapper.attachShadow({mode:'open'}).append(window.owner);
</script>`;

  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of ["last-word", "text-and-variable"]) {
        for (const format of ["bold", "italic", "underline"]) {
          const label = `${name}: ${format} input on ${scenario}`;
          const page = await browser.newPage({
            viewport: { width: 900, height: 500 },
          });
          page.setDefaultTimeout(5000);
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.route("https://fixture.test/**", (route) => {
            const path = new URL(route.request().url()).pathname;
            return route.fulfill({
              contentType: path.endsWith(".js")
                ? "text/javascript"
                : "text/html",
              body: assets.get(path) ?? html,
            });
          });
          await page.goto("https://fixture.test/");
          await page.waitForFunction(() => window.owner?.editor);
          const content =
            scenario === "last-word"
              ? [{ text: "MY VISUAL NOVEL" }]
              : [
                  { text: "Hello " },
                  { reference: { resourceId: "playerName" } },
                  { text: " there" },
                ];
          await page.evaluate((content) => {
            window.owner.loadContent(content);
          }, content);
          const box = await page
            .locator("rvn-lexical-layout-text-editor #editor")
            .boundingBox();
          await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
          await page.keyboard.press("End");
          if (scenario === "last-word") {
            await page.keyboard.down("Shift");
            for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
            await page.keyboard.up("Shift");
          } else {
            await page.keyboard.press("Shift+Home");
          }
          // Lexical takes the browser's text changes into its state only
          // when the last key was more than 100 ms earlier, as with a tap.
          await page.waitForTimeout(150);
          // WebKit's execCommand sends the same cancelable format input as
          // the iPad's B/I/U buttons and applies it to the page unless it is
          // cancelled. Chromium sends no input for execCommand, so the test
          // sends the input itself there.
          const prevented = await page.evaluate(
            ({ format, inputType, isWebKit }) => {
              if (isWebKit) {
                document.execCommand(format);
                return undefined;
              }
              const event = new InputEvent("beforeinput", {
                inputType,
                bubbles: true,
                cancelable: true,
                composed: true,
              });
              window.owner.querySelector("#editor").dispatchEvent(event);
              return event.defaultPrevented;
            },
            {
              format,
              inputType: INPUT_TYPE_BY_FORMAT[format],
              isWebKit: name === "webkit",
            },
          );
          if (name === "chromium") assert.equal(prevented, true, label);
          await page.waitForTimeout(100);
          const result = await page.evaluate(() => ({
            content: window.owner.getContent(),
            formatted: !!window.owner.querySelector(
              "#editor :is(b, strong, i, em, u)",
            ),
          }));
          assert.deepEqual(result, { content, formatted: false }, label);
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
  await rm(temporaryDirectory, { recursive: true, force: true });
}
