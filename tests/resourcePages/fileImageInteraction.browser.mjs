// Real hit testing is required: dispatchEvent bypasses pointer-events CSS.
// Run with node tests/resourcePages/fileImageInteraction.browser.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import yaml from "js-yaml";
import { chromium, webkit } from "playwright";
import jemplParse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";

const base = "src/components/fileImage/fileImage";
const view = yaml.load(await readFile(`${base}.view.yaml`, "utf8"));
const schema = yaml.load(await readFile(`${base}.schema.yaml`, "utf8"));
view.template = jemplParse(view.template);
const bundle = await build({
  stdin: {
    contents: `
      import { createComponent } from '@rettangoli/fe';
      import * as store from './${base}.store.js';
      import * as handlers from './${base}.handlers.js';
      const projectService = {
        getFileContent: async (id) => ({
          url: 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">' +
            '<rect width="128" height="128" fill="' + (id === 'image-one' ? 'blue' : 'green') + '"/></svg>'
          )
        })
      };
      customElements.define('rvn-file-image', createComponent({
        view: ${JSON.stringify(view)}, schema: ${JSON.stringify(schema)}, store, handlers
      }, { projectService }));
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  write: false,
  logLevel: "silent",
});
const theme = await readFile("static/public/theme.css", "utf8");
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<style>${theme}</style><body class="dark"></body>`);
    await page.addScriptTag({
      path: "node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js",
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => {
      // These hosts model the image replacement and project-icon edit controls.
      for (const id of ["editDialogImage", "editDialogIcon"]) {
        const container = document.createElement("div");
        container.style.cssText = "width:128px;height:128px;margin:16px";
        const image = document.createElement("rvn-file-image");
        image.id = id;
        image.fileId = "image-one";
        image.setAttribute("w", "128");
        image.setAttribute("h", "128");
        image.dataset.clicks = "0";
        image.addEventListener("click", () => {
          image.dataset.clicks = String(Number(image.dataset.clicks) + 1);
        });
        container.append(image);
        document.body.append(container);
      }
    });
    for (const id of ["editDialogImage", "editDialogIcon"]) {
      const host = page.locator(`#${id}`);
      assert.equal(
        await host.evaluate((el) => getComputedStyle(el).display),
        "contents",
      );
      for (const [index, fileId] of ["image-one", "image-two"].entries()) {
        await host.evaluate((el, nextId) => {
          el.fileId = nextId;
        }, fileId);
        await page.waitForFunction(
          ({ id, fileId }) =>
            document.getElementById(id).deps.store.selectLoadedFileId() ===
            fileId,
          { id, fileId },
        );
        await host.locator("img").evaluate((image) => image.decode());
        const box = await host.locator("img").boundingBox();
        assert.ok(box?.width > 0 && box.height > 0, `${name}: visible ${id}`);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.click(x, y);
        await page.touchscreen.tap(x, y);
        assert.equal(
          await host.getAttribute("data-clicks"),
          String((index + 1) * 2),
          `${name}: ${id} receives mouse and touch activation after image load/replacement`,
        );
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      `${name}: image and icon controls remain clickable and tappable`,
    );
  } finally {
    await browser.close();
  }
}
