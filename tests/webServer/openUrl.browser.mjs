// Uses isolated browser storage and in-memory server entries against watch:web.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.WEB_SERVER_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const previewServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end(
    "<!doctype html><title>Project One Preview</title><h1>Project One</h1>",
  );
});
await new Promise((resolve) => previewServer.listen(0, "127.0.0.1", resolve));
const serverUrl = `http://127.0.0.1:${previewServer.address().port}/`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() => {
    window.RTGL_VT_RESET_APP_STATE = true;
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
  await page.locator("rvn-project").evaluate((element) => {
    const { appService } = element.deps;
    appService.navigate(
      "/project/releases/web-server",
      appService.getPayload(),
    );
  });
  const surface = page.locator("rvn-web-server");
  await surface.waitFor({ state: "attached" });
  await surface.evaluate((element, url) => {
    const { store, appService, render } = element.deps;
    appService.stopStaticWebServer = async () => {};
    store.setPlatform({ platform: "tauri" });
    store.setServers({
      servers: [
        {
          id: "server-one",
          serverId: "server-one",
          name: "Project One",
          rootPath: "/exports/project-one",
          url,
          status: "running",
        },
        {
          id: "server-two",
          name: "Project Two",
          rootPath: "/exports/project-two",
          url: "",
          status: "stopped",
        },
      ],
    });
    store.setSelectedItemId({ itemId: "server-two" });
    render();
  }, serverUrl);
  assert.equal(await page.locator("#openUrlBtn1").count(), 0);
  assert.equal(await page.locator("#openDetailUrlBtn").count(), 0);
  const openAndCheck = async (selector) => {
    const popupPromise = page.waitForEvent("popup");
    await page.locator(selector).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), serverUrl);
    assert.equal(await popup.title(), "Project One Preview");
    await popup.close();
  };
  await openAndCheck("#openUrlBtn0");
  assert.equal(
    await surface.evaluate(
      (element) => element.store.selectViewData().selectedItemId,
    ),
    "server-two",
  );
  await page.locator("#serverItemRef0").click();
  await openAndCheck("#openDetailUrlBtn");
  await mkdir(".artifacts/web-server", { recursive: true });
  await page.screenshot({ path: ".artifacts/web-server/open-url-wide.png" });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.screenshot({ path: ".artifacts/web-server/open-url-narrow.png" });
  await page.locator("#stopDetailServerBtn").click();
  await page.locator("#openDetailUrlBtn").waitFor({ state: "detached" });
  assert.equal(await page.locator("#openUrlBtn0").count(), 0);
  console.log(
    "Web server URL opens from row and details; stopped entries hide actions and opening preserves selection.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => previewServer.close(resolve));
}
