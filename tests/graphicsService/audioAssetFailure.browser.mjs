// Run against the existing watch server; no project data is created or changed.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route(`${origin}/audio-failure-test`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<div id="canvas"></div>',
    }),
  );
  await page.goto(`${origin}/audio-failure-test`);
  const result = await page.evaluate(async (modulePath) => {
    const { createGraphicsService } = await import(modulePath);
    const service = await createGraphicsService({});
    const source = document.createElement("canvas");
    source.width = source.height = 16;
    const context = source.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 16, 16);
    const image = await (await fetch(source.toDataURL())).arrayBuffer();
    try {
      await service.init({
        canvas: document.querySelector("#canvas"),
        width: 16,
        height: 16,
      });
      let failure;
      try {
        await service.loadAssets({
          "sound-one": { buffer: new ArrayBuffer(8), type: "audio/mpeg" },
          "image-one": { buffer: image, type: "image/png" },
        });
      } catch (error) {
        failure = { fileId: error.fileId, cause: error.cause?.name };
      }
      service.render({
        elements: [
          {
            id: "background",
            type: "sprite",
            src: "image-one",
            x: 0,
            y: 0,
            width: 16,
            height: 16,
          },
        ],
        audio: [],
        animations: [],
      });
      const rendered = new Image();
      rendered.src = await service.extractBase64();
      await rendered.decode();
      context.clearRect(0, 0, 16, 16);
      context.drawImage(rendered, 0, 0);
      return {
        failure,
        imageLoaded: service.hasLoadedAsset("image-one"),
        soundLoaded: service.hasLoadedAsset("sound-one"),
        pixel: [...context.getImageData(8, 8, 1, 1).data],
      };
    } finally {
      await service.destroy();
    }
  }, `/@fs${process.cwd()}/src/deps/services/graphicsService.js`);
  assert.equal(result.failure?.fileId, "sound-one");
  assert.ok(result.failure.cause);
  assert.equal(result.imageLoaded, true);
  assert.equal(result.soundLoaded, false);
  assert.deepEqual(result.pixel, [255, 0, 0, 255]);
  console.log(
    "Mixed audio failure: real decoder rejected, valid image loaded and painted.",
  );
} finally {
  await browser.close();
}
