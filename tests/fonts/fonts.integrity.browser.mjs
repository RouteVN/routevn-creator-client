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
        const { projectService, appService } = element.deps;
        const repository = projectService.getRepositoryState();
        const base = Object.values(repository.fonts.items).find(
          (item) => item.fileId,
        );
        const content = await projectService.getFileContent(base.fileId);
        const bytes = await (await fetch(content.url)).arrayBuffer();
        content.revoke?.();
        const stored = await projectService.storeFile({
          file: new File([bytes], "font.ttf", { type: "font/ttf" }),
        });
        for (const [fontId, fileId, name] of [
          ["damaged-font", stored.fileId, "Font One"],
          ["missing-font", "missing-font-file", "Font Two"],
        ]) {
          const record = {
            ...stored.fileRecord,
            id: fileId,
            sha256: "0".repeat(64),
          };
          const result = await projectService.createFont({
            fontId,
            fileRecords: [record],
            data: {
              type: "font",
              fontFamily: fileId,
              name,
              fileId,
              minWeight: base.minWeight,
              defaultWeight: base.defaultWeight,
              maxWeight: base.maxWeight,
            },
          });
          if (result.valid === false) throw new Error(JSON.stringify(result));
        }
        appService.navigate("/project/fonts", appService.getPayload());
        return { validFileId: base.fileId };
      });
    const fonts = page.locator("rvn-fonts");
    await fonts.waitFor({ state: "attached" });
    const damaged = page.locator('#groupview [data-item-id="damaged-font"]');
    for (const id of ["damaged-font", "missing-font"]) {
      const card = page.locator(`#groupview [data-item-id="${id}"]`);
      await card
        .locator('rvn-font-preview [role="img"]')
        .waitFor({ state: "visible" });
      assert.equal(
        await card.locator('rtgl-svg[svg="warning-dead-end"]').count(),
        1,
      );
      assert.ok(
        (await card.locator("rvn-font-preview rtgl-text").allTextContents())
          .join(" ")
          .toLowerCase()
          .includes("re-upload"),
      );
      assert.equal(
        await card.locator("rvn-route-graphics-text-preview").count(),
        0,
      );
    }
    await damaged.click();
    const detail = page.locator("#detailFontPreview");
    await detail.locator('[role="img"]').waitFor({ state: "visible" });
    await mkdir(".artifacts/font-integrity", { recursive: true });
    await page.screenshot({
      path: `.artifacts/font-integrity/${engineName}.png`,
    });
    await fonts.evaluate(async (element, fileId) => {
      const result = await element.deps.projectService.updateFont({
        fontId: "damaged-font",
        data: { fileId },
      });
      if (result.valid === false) throw new Error(JSON.stringify(result));
    }, fixture.validFileId);
    for (const preview of [damaged.locator("rvn-font-preview"), detail]) {
      await preview
        .locator('#main[data-preview-status="ready"]')
        .waitFor({ state: "attached" });
      assert.equal(
        await preview.locator('rtgl-svg[svg="warning-dead-end"]').count(),
        0,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: missing/damaged fonts warn in grid and sidebar; replacement clears warnings`,
    );
  } finally {
    await browser.close();
  }
}
