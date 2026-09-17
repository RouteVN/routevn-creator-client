// Run against watch:ios. Exercises the real iOS Config route policy and
// mobile menus with isolated web storage, without requiring a native bridge.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import {
  openTouchProjectsPage,
  createProjectFromMenu,
} from "../support/mobileBrowserApp.mjs";

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 744, height: 1133 },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openTouchProjectsPage(page);
    await createProjectFromMenu(page);
    await page.locator("#projectItem0").waitFor({ state: "visible" });
    await page.locator("rvn-projects").evaluate((projects) => {
      const project = projects.deps.store.selectProjects()[0];
      projects.deps.appService.navigate("/project", { p: project.id });
    });
    await page.locator("#projectTitle").waitFor({ state: "visible" });
    await page.locator("rvn-app").evaluate(async (app, handlerURL) => {
      const { createRouteTransitionRunner } = await import(handlerURL);
      // Exercise iOS Config's repository-free route with isolated web storage.
      const deps = {
        ...app.deps,
        appService: { ...app.deps.appService, getPlatform: () => "ios" },
      };
      await createRouteTransitionRunner(deps)({
        path: "/project/config",
        payload: app.deps.appService.getPayload(),
        historyMode: "replace",
      });
    }, `/@fs${process.cwd()}/src/pages/app/app.handlers.js`);
    await page.locator("rvn-config").waitFor({ state: "attached" });
    assert.equal(
      await page
        .locator("rvn-app")
        .evaluate((app) => app.deps.projectService.getEnsuredProjectId()),
      undefined,
    );

    for (const viewport of [
      { width: 744, height: 1133 },
      { width: 1133, height: 744 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const [index, itemId] of [
        [0, "images"],
        [1, "scene-map"],
        [2, "versions"],
        [3, "project"],
      ]) {
        const tab = await page.locator(`#mobileTabItem${index}`).boundingBox();
        await page.touchscreen.tap(
          tab.x + tab.width / 2,
          tab.y + tab.height / 2,
        );
        const item = page.locator(
          `rvn-mobile-sidebar [data-item-id="${itemId}"]`,
        );
        await item.waitFor({ state: "visible" });
        const rect = await item.boundingBox();
        assert.ok(rect.width > 0 && rect.height > 0);
        assert.ok(
          rect.y >= viewport.height / 2 &&
            rect.y + rect.height <= viewport.height,
          `${engineName}: ${itemId} must appear inside the bottom sheet: ${JSON.stringify(rect)}`,
        );
        await page.touchscreen.tap(viewport.width / 2, 60);
        await page.locator("rvn-mobile-sheet").waitFor({ state: "detached" });
      }
      console.log(
        `${engineName} ${viewport.width}x${viewport.height}: all four menus render and dismiss without a repository`,
      );
    }

    // A menu link must still navigate and let app orchestration load the project.
    await page.locator("#mobileTabItem3").click();
    await page.locator('rvn-mobile-sidebar [data-item-id="project"]').click();
    await page.locator("#projectTitle").waitFor({ state: "visible" });
    assert.ok(
      await page
        .locator("rvn-app")
        .evaluate((app) => app.deps.projectService.getEnsuredProjectId()),
    );
    await page.locator("rvn-mobile-sheet").waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    console.log(
      `${engineName}: menu navigation reloads the project without errors`,
    );
  } finally {
    await browser.close();
  }
}
