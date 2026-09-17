// Run against watch:ios with isolated web storage. Checks that iOS content
// follows its real container when it differs from the viewport, then restores.
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
      viewport: { width: 1133, height: 744 },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openTouchProjectsPage(page);
    await createProjectFromMenu(page);
    await page.locator("#projectItem0").waitFor({ state: "visible" });
    await page.locator("rvn-app").evaluate((app) => {
      app.store.setPlatform({ platform: "ios" });
      app.render();
    });
    // Projects has its own page-width wrapper in addition to the app shell.
    // The available container may differ from WebKit's stale viewport units.
    for (const width of [1133, 561.5, 744, 1133]) {
      await page.evaluate((width) => {
        document.body.style.width = `${width}px`;
      }, width);
      const scroller = await page.locator("#projectsScroll").boundingBox();
      assert.ok(
        Math.abs(scroller.width - width) < 1,
        `${engineName} iOS Projects: ${scroller.width}px must follow container ${width}px`,
      );
    }
    console.log(
      `${engineName} iOS Projects: page fills its changing container`,
    );
    await page.locator("rvn-projects").evaluate((projects) => {
      const project = projects.deps.store.selectProjects()[0];
      projects.deps.appService.navigate("/project", { p: project.id });
    });
    await page.locator("#projectTitle").waitFor({ state: "visible" });
    await page
      .locator("rvn-app")
      .evaluate((app) =>
        app.deps.appService.navigate(
          "/project/images",
          app.deps.appService.getPayload(),
        ),
      );
    await page
      .locator("rvn-media-resources-view #scrollContainer")
      .waitFor({ state: "visible" });
    for (const platform of ["ios", "android", "web"]) {
      await page.locator("rvn-app").evaluate((app, platform) => {
        app.store.setPlatform({ platform });
        app.render();
      }, platform);
      for (const viewport of [
        { width: 1133, height: 744 },
        { width: 744, height: 1133 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const widths =
          platform === "ios"
            ? [viewport.width, viewport.width / 2 - 5, viewport.width]
            : [viewport.width];
        for (const width of widths) {
          await page.evaluate((width) => {
            document.body.style.width = `${width}px`;
          }, width);
          const actual = await page
            .locator("rvn-media-resources-view #scrollContainer")
            .boundingBox();
          assert.ok(
            Math.abs(actual.width - width) < 1,
            `${engineName} ${platform}: content ${actual.width}px must follow container ${width}px`,
          );
        }
      }
      console.log(
        `${engineName} ${platform}: content fills its container across phone and iPad sizes`,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
