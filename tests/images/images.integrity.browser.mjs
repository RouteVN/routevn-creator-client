// Run against the existing watch server. Each browser uses isolated web storage;
// failures are injected in memory, without changing saved project files.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";

for (const [engineName, engine] of Object.entries({ chromium })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    page.setDefaultTimeout(30000);
    await page.addInitScript(() => {
      window.RTGL_VT_RESET_APP_STATE = true;
    });
    await page.route(/\/src\/setup\.(tauri|ios|android)\.js/, async (route) => {
      const response = await route.fetch({
        url: route
          .request()
          .url()
          .replace(/setup\.(tauri|ios|android)\.js/, "setup.web.js"),
      });
      await route.fulfill({ response });
    });
    await page.goto(origin + "/projects");
    await page.locator('[data-testid="create-project-button"]').click();
    await page
      .locator('#createProjectForm rtgl-input[data-field-name="name"] input')
      .fill("Project One");
    await page
      .locator('#createProjectForm rtgl-button[data-action-id="submit"]')
      .click();
    await page.locator("#projectItem0").click();
    const fixture = await page
      .locator("rvn-project")
      .evaluate(async (element) => {
        const { appService, projectService } = element.deps;
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        canvas.getContext("2d").fillRect(0, 0, 8, 8);
        const goodBytes = new Uint8Array(
          await (await fetch(canvas.toDataURL())).arrayBuffer(),
        );
        const badBytes = goodBytes.slice();
        badBytes[badBytes.length - 8] ^= 1;
        const save = (bytes) =>
          projectService.storeFile({
            file: new File([bytes], "image.png", { type: "image/png" }),
          });
        const thumbnail = await save(goodBytes);
        const damaged = await save(badBytes);
        const valid = await save(goodBytes);
        const originalRead = projectService.getFileContent;
        window.renderedImageReads = [];
        projectService.getFileContent = (fileId) => {
          window.renderedImageReads.push(fileId);
          return originalRead(fileId);
        };
        for (const [imageId, fileId, metadata] of [
          [
            "damaged-image",
            damaged.fileId,
            { ...damaged.fileRecord, sha256: valid.fileRecord.sha256 },
          ],
          [
            "missing-image",
            "missing-original",
            { ...valid.fileRecord, id: "missing-original" },
          ],
          ["valid-image", valid.fileId, valid.fileRecord],
        ]) {
          const result = await projectService.createImage({
            imageId,
            fileRecords: [metadata, ...thumbnail.fileRecords],
            data: {
              type: "image",
              name:
                imageId === "damaged-image"
                  ? "Image One"
                  : imageId === "missing-image"
                    ? "Image Two"
                    : "Image Three",
              fileId,
              thumbnailFileId: thumbnail.fileId,
              width: 8,
              height: 8,
            },
          });
          if (result.valid === false) throw new Error(JSON.stringify(result));
        }
        appService.navigate("/project/images", appService.getPayload());
        return {
          damagedId: damaged.fileId,
          validId: valid.fileId,
          thumbnailId: thumbnail.fileId,
        };
      });
    const images = page.locator("rvn-images");
    await images.waitFor({ state: "attached" });
    const grid = page.locator("#groupview");
    const badCard = grid.locator('[data-item-id="damaged-image"]');
    const missingCard = grid.locator('[data-item-id="missing-image"]');
    for (const card of [badCard, missingCard]) {
      await card.scrollIntoViewIfNeeded();
      await card
        .locator('rvn-file-image [role="img"]')
        .waitFor({ state: "attached" });
      assert.ok(
        (await card.locator("rvn-file-image rtgl-text").allTextContents())
          .join(" ")
          .includes("re-upload"),
      );
      assert.equal(
        await card.locator('rtgl-svg[svg="warning-dead-end"]').count(),
        1,
      );
    }
    const goodCard = grid.locator('[data-item-id="valid-image"]');
    await goodCard.locator("img").evaluate((image) => image.decode());
    assert.equal(
      await goodCard.locator('rvn-file-image [role="img"]').count(),
      0,
    );
    await goodCard.click();
    await page
      .locator("#detailImagePreview img")
      .evaluate((image) => image.decode());

    // Hold verification open so a premature thumbnail render cannot hide
    // behind a fast local hash check.
    await images.evaluate((element) => {
      const { projectService } = element.deps;
      const checkFileIntegrity = projectService.checkFileIntegrity;
      const gate = new Promise((resolve) => {
        window.releaseImageIntegrityCheck = resolve;
      });
      window.imageIntegrityCheckStarted = false;
      projectService.checkFileIntegrity = async (fileId) => {
        window.imageIntegrityCheckStarted = true;
        await gate;
        return checkFileIntegrity(fileId);
      };
    });
    await badCard.click();
    const detail = page.locator("#detailImagePreview");
    await page.waitForFunction(() => window.imageIntegrityCheckStarted);
    assert.equal(await detail.locator("img").count(), 0);
    assert.equal(await detail.locator("rtgl-image").count(), 0);
    await page.evaluate(() => window.releaseImageIntegrityCheck());
    await detail.locator('[role="img"]').waitFor({ state: "attached" });
    assert.equal(await detail.locator("img").count(), 0);
    assert.ok(
      (await detail.locator("rtgl-text").allTextContents())
        .join(" ")
        .includes("re-upload"),
    );
    await mkdir(".artifacts/image-integrity", { recursive: true });
    await page.screenshot({
      path: `.artifacts/image-integrity/${engineName}.png`,
    });

    // Simulate re-upload through the production resource command. Keep the same
    // thumbnail to ensure changing only the original clears both warnings.
    const replacementId = await images.evaluate(
      async (element, thumbnailId) => {
        const { projectService } = element.deps;
        const content = await projectService.getFileContent(thumbnailId);
        const bytes = await (await fetch(content.url)).arrayBuffer();
        content.revoke?.();
        const replacement = await projectService.storeFile({
          file: new File([bytes], "replacement.png", { type: "image/png" }),
        });
        const result = await projectService.updateImage({
          imageId: "damaged-image",
          fileRecords: replacement.fileRecords,
          data: { fileId: replacement.fileId },
        });
        if (result.valid === false) throw new Error(JSON.stringify(result));
        return replacement.fileId;
      },
      fixture.thumbnailId,
    );
    for (const image of [
      badCard.locator("rvn-file-image"),
      detail.locator("rvn-file-image"),
    ]) {
      await image.locator("img").waitFor({ state: "attached" });
      await image.evaluate(async (element) => {
        const started = Date.now();
        while (element.deps.store.selectIsLoading()) {
          if (Date.now() - started > 5000)
            throw new Error("Integrity check did not finish");
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      });
      assert.equal(await image.locator('[role="img"]').count(), 0);
      await image.locator("img").evaluate((image) => image.decode());
    }
    const renderedReads = await page.evaluate(() => window.renderedImageReads);
    for (const id of [
      fixture.damagedId,
      fixture.validId,
      "missing-original",
      replacementId,
    ]) {
      assert.ok(
        !renderedReads.includes(id),
        "Original must only be read for hashing, not rendered",
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: damaged/missing originals warn in grid and sidebar without flashing thumbnails; re-upload clears both; originals are never rendered`,
    );
  } finally {
    await browser.close();
  }
}
