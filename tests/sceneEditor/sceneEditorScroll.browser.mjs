import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { renderViewYaml } from "../support/renderView.js";
import { EN_I18N } from "../support/i18n.js";
import {
  createInitialState,
  selectViewData,
  setMobileKeyboardState,
  setAppWindowMetrics,
  setRepositoryState,
  setSceneId,
  setUiConfig,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import { selectViewData as selectToolbarViewData } from "../../src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.store.js";

// Run against watch:ios. Render the shipping page and toolbar templates with
// real stores/UI elements and Lexical paragraphs, without opening user data.
const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const source = `/@fs${process.cwd()}`;
const scenarios = [
  { name: "keyboard hidden", layoutHeight: 844, visualHeight: 844 },
  {
    name: "iOS / Android overlay keyboard",
    layoutHeight: 844,
    visualHeight: 464,
    keyboardInset: 380,
    bottom: 380,
    isVisible: true,
  },
  {
    name: "panned viewport",
    layoutHeight: 844,
    visualHeight: 464,
    visualOffsetTop: 180,
    keyboardInset: 380,
    bottom: 200,
    isVisible: true,
  },
  {
    name: "resized viewport",
    layoutHeight: 464,
    visualHeight: 464,
    keyboardInset: 380,
    isVisible: true,
  },
];
scenarios.push(
  ...scenarios.map((scenario) => ({
    ...scenario,
    name: `landscape: ${scenario.name}`,
    width: 1133,
    windowHeight: 844,
  })),
);

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const metrics of scenarios) {
      const state = createInitialState();
      setUiConfig({ state }, { uiConfig: { id: "touch" } });
      if (metrics.windowHeight) {
        setAppWindowMetrics(
          { state },
          { width: metrics.width, height: metrics.windowHeight },
        );
      }
      setMobileKeyboardState({ state }, metrics);
      setSceneId({ state }, { sceneId: "scene-1" });
      const sections = Array.from({ length: 2 }, (_, section) => {
        const lines = Array.from({ length: 12 }, (_, line) => ({
          id: `section-${section}-line-${line}`,
          actions: {
            dialogue: { content: [{ text: `Example line ${line}` }] },
          },
        }));
        return {
          id: `section-${section}`,
          name: `Section ${section + 1}`,
          lines: {
            items: Object.fromEntries(lines.map((line) => [line.id, line])),
            tree: lines.map(({ id }) => ({ id })),
          },
        };
      });
      setRepositoryState(
        { state },
        {
          repository: {
            scenes: {
              items: {
                "scene-1": {
                  id: "scene-1",
                  type: "scene",
                  name: "Scene 1",
                  sections: {
                    items: Object.fromEntries(sections.map((s) => [s.id, s])),
                    tree: sections.map(({ id }) => ({ id })),
                  },
                },
              },
              tree: [{ id: "scene-1" }],
            },
          },
        },
      );
      const viewData = selectViewData({ state, i18n: EN_I18N });
      const markup = renderViewYaml(
        "src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        viewData,
      );
      const toolbar = renderViewYaml(
        "src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.view.yaml",
        selectToolbarViewData({
          state: state.mobileKeyboardState,
          i18n: EN_I18N,
        }),
      );
      const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/public/theme.css">
<style>body{margin:0;--rvn-mobile-overlay-top-inset:47px}rvn-scene-editor-preview-canvas{aspect-ratio:16/9}</style>
<script src="/public/@rettangoli/ui@1.22.2/dist/rettangoli-iife-ui.min.js"></script>
${markup}<script type="module">
import {LexicalSceneDocumentEditorElement} from '${source}/src/primitives/lexicalSceneDocumentEditor.js';
customElements.define('rvn-lexical-scene-document-editor',LexicalSceneDocumentEditorElement);
document.querySelector('rvn-mobile-keyboard-toolbar').innerHTML=${JSON.stringify(toolbar)};
const items=${JSON.stringify(viewData.sectionEditorItems)};
window.owners=Array.from(document.querySelectorAll('rvn-scene-document-editor-lexical'),(host,index)=>{
  const owner=document.createElement('rvn-lexical-scene-document-editor');
  host.attachShadow({mode:'open'}).append(owner);
  owner.lines=items[index].documentEditorLines;
  return owner;
});
</script>`;
      const page = await browser.newPage({
        viewport: { width: metrics.width ?? 390, height: metrics.layoutHeight },
        isMobile: true,
        hasTouch: true,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/scene-scroll-check", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      );
      await page.goto(`${origin}/scene-scroll-check`);
      await page.waitForFunction(() =>
        window.owners?.every(
          (owner) => owner.refs?.editor.querySelectorAll("p").length === 12,
        ),
      );
      const result = await page.evaluate(() => {
        const scroll = document.querySelector("#sceneEditorSectionsScroll");
        scroll.scrollTop = scroll.scrollHeight;
        const rect = (element) => element.getBoundingClientRect().toJSON();
        return {
          scroll: rect(scroll),
          lastLine: rect(
            window.owners.at(-1).refs.editor.querySelector("p:last-child"),
          ),
          lastHeader: rect(document.querySelector("#sectionHeader1")),
          toolbar: rect(
            document.querySelector(
              "rvn-mobile-keyboard-toolbar rtgl-view[pos='fix']",
            ),
          ),
          canvas: rect(document.querySelector("#previewCanvasHost")),
          editor: rect(document.querySelector("#sceneEditorLeftEditor")),
          preview: rect(
            document.querySelector("#mobileSceneEditorPreviewPanel"),
          ),
          rootScroll: scrollY,
          maxScroll: scroll.scrollTop,
        };
      });
      const diagnostic = JSON.stringify({
        engineName,
        name: metrics.name,
        result,
      });
      assert.ok(result.maxScroll > 0, diagnostic);
      assert.ok(result.lastLine.top >= result.scroll.top + 40, diagnostic);
      assert.ok(result.lastLine.bottom <= result.toolbar.top, diagnostic);
      assert.ok(result.lastHeader.bottom > result.scroll.top, diagnostic);
      assert.ok(result.lastHeader.top >= result.scroll.top - 1, diagnostic);
      assert.equal(result.canvas.top, 47 + (metrics.visualOffsetTop ?? 0));
      assert.equal(result.rootScroll, 0);
      if (metrics.windowHeight) {
        assert.ok(
          Math.abs(result.editor.width / metrics.width - 0.6) < 0.001,
          diagnostic,
        );
        assert.ok(
          Math.abs(result.preview.width / metrics.width - 0.4) < 0.001,
          diagnostic,
        );
        assert.ok(result.canvas.bottom <= result.toolbar.top, diagnostic);
        assert.equal(result.editor.top, result.preview.top);
        assert.ok(result.scroll.height > 250, diagnostic);
      }
      assert.deepEqual(errors, []);
      console.log(
        `${engineName}: ${metrics.name}: final line and section header remain visible at maximum scroll`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
