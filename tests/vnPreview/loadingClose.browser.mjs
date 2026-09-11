// Run against watch:ios. Render the production view/store with published UI
// styles, and exercise a real touch hit while the loader fills the viewport.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, webkit } from "playwright";
import yaml from "js-yaml";
import { h } from "snabbdom/build/h.js";
import toHTML from "snabbdom-to-html";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import parse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/vnPreview/vnPreview.store.js";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const source = `/@fs${process.cwd()}`;
const view = yaml.load(
  readFileSync("src/components/vnPreview/vnPreview.view.yaml", "utf8"),
);
const uiVersion = JSON.parse(readFileSync("package.json", "utf8")).dependencies[
  "@rettangoli/ui"
];

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const phase of ["initialization", "assets"]) {
      for (const viewport of [
        { width: 375, height: 667 },
        { width: 667, height: 375 },
      ]) {
        const page = await browser.newPage({
          viewport,
          hasTouch: true,
          isMobile: true,
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const state = {
          ...createInitialState(),
          isTouchMode: true,
          isPreviewReady: phase === "assets",
          isAssetLoading: phase === "assets",
          projectResolution: viewport,
          viewportSize: viewport,
        };
        const content = toHTML(
          parseView({
            h,
            template: parse(view.template),
            viewData: selectViewData({ state, props: {} }),
          }),
        );
        await page.route("**/preview-loading-check", (route) =>
          route.fulfill({
            contentType: "text/html",
            body: `<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/public/theme.css">
<script src="/public/rtgl-icons.js"></script>
<script src="/public/@rettangoli/ui@${uiVersion}/dist/rettangoli-iife-ui.min.js"></script>
<body class="dark" style="margin:0">${content}
<script type="module">
import { handleClosePreview } from '${source}/src/components/vnPreview/vnPreview.handlers.js';
document.querySelector('#closePreviewButton').addEventListener('click', event => {
  handleClosePreview({ dispatchEvent: event => {
    if (event.type === 'close') document.querySelector('#previewSurface').remove();
  } }, { _event: event });
});
await customElements.whenDefined('rtgl-button');
window.fixtureReady = true;
</script>`,
          }),
        );
        await page.goto(`${origin}/preview-loading-check`);
        await page.waitForFunction(() => window.fixtureReady);
        const loader = await page.locator("#previewLoading").boundingBox();
        assert.ok(Math.abs(loader.width - viewport.width) < 1);
        assert.ok(Math.abs(loader.height - viewport.height) < 1);
        // No forced click: Playwright must hit the visible button itself.
        await page.locator("#closePreviewButton").tap({ timeout: 3000 });
        await page.locator("#previewSurface").waitFor({ state: "detached" });
        assert.deepEqual(errors, []);
        console.log(
          `${name} ${phase} ${viewport.width}x${viewport.height}: loading preview can be closed`,
        );
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
