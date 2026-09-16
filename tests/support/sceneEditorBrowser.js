import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bundle the shipping primitive into an isolated fixture, without an app build
// or access to user projects. Keep the nested shadow roots used by the app.
export async function createSceneEditorBrowserFixture() {
  const directory = await mkdtemp(join(tmpdir(), "rvn-scene-editor-"));
  try {
    const bundle = join(directory, "editor.js");
    execFileSync("bun", [
      "build",
      "src/primitives/lexicalSceneDocumentEditor.js",
      "--target",
      "browser",
      "--outfile",
      bundle,
    ]);
    const assets = new Map([
      ["/editor.js", await readFile(bundle, "utf8")],
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
<body style="margin:40px"><textarea id="clipboard" aria-label="Clipboard test source"></textarea><div id="host"></div>
<script type="module">
import {LexicalSceneDocumentEditorElement} from '/editor.js';
customElements.define('rvn-lexical-scene-document-editor', LexicalSceneDocumentEditorElement);
const wrapper = document.createElement('div');
document.querySelector('#host').attachShadow({mode:'open'}).append(wrapper);
window.owner = document.createElement('rvn-lexical-scene-document-editor');
wrapper.attachShadow({mode:'open'}).append(window.owner);
window.owner.editor._onError = error => { throw error; };
window.pastedText = [];
window.owner.refs.editor.addEventListener('paste', event => window.pastedText.push(event.clipboardData.getData('text/plain')), true);
</script>`;
    return {
      async newPage(browser) {
        const page = await browser.newPage();
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("https://fixture.test/**", (route) => {
          const path = new URL(route.request().url()).pathname;
          return route.fulfill({
            contentType: path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".css")
                ? "text/css"
                : "text/html",
            body: assets.get(path) ?? html,
          });
        });
        await page.goto("https://fixture.test/");
        await page.waitForFunction(() => window.owner?.editor);
        return { page, errors };
      },
      async close() {
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
