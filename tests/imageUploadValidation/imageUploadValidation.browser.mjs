// Desktop: isolated web storage against watch:android/web. Android: optional
// ANDROID_CDP_URL points to the forwarded debug WebView; only in-memory fixtures
// are used on that device, and its project data is never changed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { EN_I18N } from "../support/i18n.js";

const remote = process.env.ANDROID_CDP_URL;
const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const browser = remote
  ? await chromium.connectOverCDP(remote)
  : await chromium.launch({ headless: true });
try {
  const page = remote
    ? browser.contexts()[0].pages()[0]
    : await browser.newPage();
  if (!remote) {
    await page.route(`${origin}/image-limit-test`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<body></body>",
      }),
    );
    await page.goto(`${origin}/image-limit-test`);
    await page.evaluate(() => {
      for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const getParameter = type.prototype.getParameter;
        type.prototype.getParameter = function (parameter) {
          return parameter === this.MAX_TEXTURE_SIZE
            ? 4096
            : getParameter.call(this, parameter);
        };
      }
    });
  }
  const result = await page.evaluate(
    async ({ root, i18n }) => {
      const { createProjectAssetService } = await import(
        `${root}/src/deps/services/shared/projectAssetService.js`
      );
      const { filterImageUploadFiles } = await import(
        `${root}/src/internal/ui/imageUploadValidation.js`
      );
      const { createGraphicsService } = await import(
        `${root}/src/deps/services/graphicsService.js`
      );
      const { getMaxTextureSize } = await import(
        `${root}/src/deps/clients/web/imageTexture.js`
      );
      const limit = getMaxTextureSize();
      const makeFile = async (name, width, height) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ff0000";
        context.fillRect(0, 0, width, height);
        return new File(
          [await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))],
          name,
          { type: "image/png" },
        );
      };
      const valid = await makeFile("Image One.png", 32, 32);
      const tall = await makeFile("Image Two.png", 1, limit + 1);
      const wide = await makeFile("Image Three.png", limit + 1, 1);
      const edge = await makeFile("Image Four.png", 1, limit);
      const writes = [],
        warnings = [];
      const projectService = createProjectAssetService({
        idGenerator: () => `file-${writes.length}`,
        fileAdapter: {
          continueOnUploadError: false,
          storeFile: async ({ file, idGenerator }) => {
            writes.push(file.name);
            return { fileId: idGenerator() };
          },
        },
      });
      const deps = {
        projectService,
        i18n,
        appService: { showAlert: (alert) => warnings.push(alert) },
      };
      const accepted = await filterImageUploadFiles(deps, [
        tall,
        valid,
        wide,
        edge,
      ]);
      await projectService.uploadFiles(accepted, { skipImageThumbnail: true });
      const mixed = {
        accepted: accepted.map((f) => f.name),
        writes: [...writes],
        warnings: [...warnings],
      };
      warnings.length = 0;
      const allRejected = await filterImageUploadFiles(deps, [tall, wide]);
      const all = {
        accepted: allRejected.length,
        warnings: [...warnings],
        writes: writes.length,
      };
      let bypassError;
      try {
        await projectService.uploadFiles([tall]);
      } catch (error) {
        bypassError = error.code;
      }
      const graphics = await createGraphicsService({
        subject: { dispatch() {} },
      });
      let runtime;
      try {
        await graphics.init({ width: 32, height: 32 });
        const badUrl = URL.createObjectURL(tall),
          goodUrl = URL.createObjectURL(valid);
        let failure;
        try {
          await graphics.loadAssets({
            "large-image": { url: badUrl, type: "image/png" },
            "small-image": { url: goodUrl, type: "image/png" },
          });
        } catch (error) {
          failure = error.errors?.map((e) => ({
            fileId: e.fileId,
            code: e.code,
            limit: e.limit,
          }));
        }
        graphics.render({
          elements: [
            {
              id: "image",
              type: "sprite",
              src: "small-image",
              x: 0,
              y: 0,
              width: 32,
              height: 32,
            },
          ],
          audio: [],
          animations: [],
        });
        const rendered = new Image();
        rendered.src = await graphics.extractBase64();
        await rendered.decode();
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const ctx = c.getContext("2d");
        ctx.drawImage(rendered, 0, 0);
        runtime = {
          failure,
          largeLoaded: graphics.hasLoadedAsset("large-image"),
          smallLoaded: graphics.hasLoadedAsset("small-image"),
          pixel: [...ctx.getImageData(16, 16, 1, 1).data],
        };
        URL.revokeObjectURL(badUrl);
        URL.revokeObjectURL(goodUrl);
      } finally {
        await graphics.destroy();
      }
      return { limit, mixed, all, bypassError, runtime };
    },
    { root: `/@fs${process.cwd()}`, i18n: EN_I18N },
  );
  assert.deepEqual(result.mixed.accepted, ["Image One.png", "Image Four.png"]);
  assert.deepEqual(result.mixed.writes, result.mixed.accepted);
  assert.equal(result.mixed.warnings.length, 1);
  assert.match(result.mixed.warnings[0].message, /Image Two.png/);
  assert.match(result.mixed.warnings[0].message, /Image Three.png/);
  assert.equal(result.all.accepted, 0);
  assert.equal(result.all.warnings.length, 1);
  assert.equal(result.all.writes, 2);
  assert.equal(result.bypassError, "image_texture_too_large");
  assert.deepEqual(result.runtime.failure, [
    {
      fileId: "large-image",
      code: "image_texture_too_large",
      limit: result.limit,
    },
  ]);
  assert.equal(result.runtime.largeLoaded, false);
  assert.equal(result.runtime.smallLoaded, true);
  assert.deepEqual(result.runtime.pixel, [255, 0, 0, 255]);
  if (!remote) {
    await page.route(/\/src\/setup\.(tauri|ios|android)\.js/, async (route) => {
      const response = await route.fetch({
        url: route
          .request()
          .url()
          .replace(/setup\.(tauri|ios|android)\.js/, "setup.web.js"),
      });
      await route.fulfill({ response });
    });
    await page.addInitScript(() => {
      window.RTGL_VT_RESET_APP_STATE = true;
      for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const getParameter = type.prototype.getParameter;
        type.prototype.getParameter = function (parameter) {
          return parameter === this.MAX_TEXTURE_SIZE
            ? 4096
            : getParameter.call(this, parameter);
        };
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/projects");
    await page.locator('[data-testid="create-project-button"]').click();
    await page
      .locator('#createProjectForm rtgl-input[data-field-name="name"] input')
      .fill("Project One");
    await page
      .locator('#createProjectForm rtgl-button[data-action-id="submit"]')
      .click();
    await page.locator("#projectItem0").click();
    await page.locator("rvn-project").evaluate((element) => {
      const { appService } = element.deps;
      appService.navigate("/project/images", appService.getPayload());
    });
    const images = page.locator("rvn-images");
    await images.waitFor({ state: "attached" });
    const upload = await images.evaluate(async (element, root) => {
      const { handleUploadClick } = await import(
        `${root}/src/pages/images/images.handlers.js`
      );
      const makeFile = async (name, width, height) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        c.getContext("2d").fillRect(0, 0, width, height);
        return new File(
          [await new Promise((r) => c.toBlob(r, "image/png"))],
          name,
          { type: "image/png" },
        );
      };
      const files = await Promise.all([
        makeFile("Image One.png", 32, 32),
        makeFile("Image Two.png", 1, 4097),
        makeFile("Image Three.png", 4097, 1),
      ]);
      const { appService, projectService } = element.deps;
      const originalPicker = appService.pickFiles;
      let alertCount = 0;
      const originalAlert = appService.showAlert;
      appService.pickFiles = async () => files;
      appService.showAlert = (...args) => {
        alertCount++;
        return originalAlert(...args);
      };
      try {
        await handleUploadClick(element.deps, { _event: { detail: {} } });
      } finally {
        appService.pickFiles = originalPicker;
        appService.showAlert = originalAlert;
      }
      const state = projectService.getRepositoryState();
      const names = Object.values(state.images.items)
        .filter((x) => x.type === "image")
        .map((x) => x.name);
      return { names, alertCount };
    }, `/@fs${process.cwd()}`);
    assert.equal(upload.alertCount, 1);
    assert.ok(upload.names.includes("Image One"));
    assert.ok(!upload.names.includes("Image Two"));
    assert.ok(!upload.names.includes("Image Three"));
    const dialog = page.locator("rtgl-global-ui #dialog[open]");
    await dialog.waitFor({ state: "visible" });
    assert.match(await dialog.innerText(), /Image Two.png/);
    assert.match(await dialog.innerText(), /Image Three.png/);
    await page.screenshot({ path: "/tmp/routevn-image-upload-warning.png" });
    console.log(
      "Real Images upload: valid resource created, oversized resources absent, one visible batch dialog.",
    );
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
