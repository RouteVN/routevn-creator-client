// Run with Node. UI_BUNDLE may point at an upstream checkout for validation.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import yaml from "js-yaml";
import { chromium, webkit } from "playwright";

const registrations = [];
for (const name of ["squareImageCropper", "squareImageCropDialog"]) {
  const base = `src/components/${name}/${name}`;
  const view = yaml.load(await readFile(`${base}.view.yaml`, "utf8"));
  const schema = yaml.load(await readFile(`${base}.schema.yaml`, "utf8"));
  registrations.push(`
    import * as ${name}Store from './${base}.store.js';
    import * as ${name}Handlers from './${base}.handlers.js';
    import * as ${name}Methods from './${base}.methods.js';
    {const view=${JSON.stringify(view)}; view.template=parse(view.template);
    customElements.define('${schema.componentName}',createComponent({view,schema:${JSON.stringify(schema)},store:${name}Store,handlers:${name}Handlers,methods:${name}Methods},{}));}
  `);
}
const bundle = await build({
  stdin: {
    contents: `import {createComponent} from '@rettangoli/fe'; import {parse} from 'jempl'; ${registrations.join("\n")}`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  write: false,
  logLevel: "silent",
});
const theme = await readFile("static/public/theme.css", "utf8");
const ui =
  process.env.UI_BUNDLE ??
  "static/public/@rettangoli/ui@1.22.5/dist/rettangoli-iife-ui.min.js";
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1133, height: 744 },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${theme}</style><body class="dark"></body>`,
    );
    await page.addScriptTag({ path: ui });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 640;
      const ctx = canvas.getContext("2d");
      for (let x = 0; x < 960; x++) {
        ctx.fillStyle = `rgb(${Math.round((x / 960) * 255)}, 80, 128)`;
        ctx.fillRect(x, 0, 1, 640);
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      const dialog = document.createElement("rvn-square-image-crop-dialog");
      dialog.outputSize = 256;
      dialog.file = new File([blob], "image.png", { type: "image/png" });
      dialog.setAttribute("open", "");
      document.body.append(dialog);
    });
    await page.waitForFunction(() =>
      document
        .querySelector("rvn-square-image-crop-dialog")
        .deps.store.selectIsCropReady(),
    );
    await page.locator("rtgl-dialog").evaluate(async (el) =>
      Promise.all(
        el.shadowRoot
          .querySelector("slot")
          .getAnimations()
          .map((animation) => animation.finished),
      ),
    );
    const cropper = page.locator("rvn-square-image-cropper");
    const viewport = page.locator("#cropViewport");
    const slider = page.locator("#zoomSlider");
    await slider.fill("2");
    await slider.dispatchEvent("input");
    const selection = await cropper.evaluate((el) =>
      el.deps.store.selectCropSelection(),
    );
    for (const size of [
      { width: 1133, height: 744 },
      { width: 744, height: 1133 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(size);
      const box = await viewport.boundingBox();
      const content = await page
        .locator("rvn-square-image-crop-dialog rtgl-view[slot='content']")
        .boundingBox();
      assert.ok(
        Math.abs(box.width - box.height) < 1,
        `${name}: square at ${size.width}`,
      );
      assert.ok(
        box.width <= 400 &&
          box.width <= content.width + 1 &&
          box.x >= content.x - 1 &&
          box.x + box.width <= content.x + content.width + 1,
        `${name}: crop fits dialog at ${size.width}: ${JSON.stringify({ box, content })}`,
      );
      assert.deepEqual(
        await cropper.evaluate((el) => el.deps.store.selectCropSelection()),
        selection,
        "Resize preserves crop selection",
      );
      // Pointer distances are converted from rendered pixels to crop coordinates.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + box.width / 10,
        box.y + box.height / 2,
        { steps: 3 },
      );
      await page.mouse.up();
      const moved = await cropper.evaluate((el) =>
        el.deps.store.selectCropSelection(),
      );
      assert.ok(
        Math.abs(selection.sourceX - moved.sourceX - 32) < 1,
        `${name}: scaled drag`,
      );
      // Restore the original centered selection through the public zoom controls.
      await slider.fill("1");
      await slider.dispatchEvent("input");
      await cropper.evaluate((el) => {
        el.deps.store.setImage({
          imageUrl: el.deps.store.selectImageUrl(),
          imageWidth: 960,
          imageHeight: 640,
        });
        el.render();
      });
      await slider.fill("2");
      await slider.dispatchEvent("input");
    }
    const output = await cropper.evaluate(async (el) => {
      const bitmap = await createImageBitmap(await el.getCroppedFile());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        left: ctx.getImageData(0, 0, 1, 1).data[0],
        right: ctx.getImageData(bitmap.width - 1, 0, 1, 1).data[0],
      };
    });
    assert.equal(output.width, 256);
    assert.equal(output.height, 256);
    assert.ok(Math.abs(output.left - (selection.sourceX / 960) * 255) < 3);
    assert.ok(
      Math.abs(
        output.right - ((selection.sourceX + selection.sourceSize) / 960) * 255,
      ) < 3,
    );
    assert.deepEqual(errors, []);
    console.log(
      `${name}: responsive dialog, proportional drag, stable selection, exported pixels passed`,
    );
  } finally {
    await browser.close();
  }
}
