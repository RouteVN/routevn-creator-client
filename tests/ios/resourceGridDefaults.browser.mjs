// Run against watch:ios. Real resource pages with isolated browser project data.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { openTouchProjectsPage } from "../support/mobileBrowserApp.mjs";

const resourcePages = [
  ["images", "rvn-media-resources-view", "image"],
  ["colors", "rvn-catalog-resources-view", "color"],
  ["text-styles", "rvn-text-style-resources-view", "textStyle"],
];

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 768, height: 1024 },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openTouchProjectsPage(page);
    await page.locator("#mobileCreateMenuButton").waitFor();
    await page.evaluate(async () => {
      const { appService } = document.querySelector("rvn-app").deps;
      const project = await appService.createNewProject({
        name: "Project One",
        description: "",
        language: "en",
        template: "default",
        projectResolution: { width: 1920, height: 1080 },
      });
      window.gridTrial = { appService, projectId: project.id };
    });

    for (const [route, tag, cardKind] of resourcePages) {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.evaluate((route) => {
        const { appService, projectId } = window.gridTrial;
        appService.navigate(`/project/${route}`, { p: projectId });
      }, route);
      const view = page.locator(tag);
      await view.waitFor({ state: "attached" });
      await view.evaluate((element, cardKind) => {
        element.groups = [
          {
            id: "folder-1",
            name: "Resources",
            fullLabel: "Resources",
            children: Array.from({ length: 8 }, (_, index) => ({
              id: `resource-${index}`,
              name: `Resource ${index + 1}`,
              cardKind,
              color: "#5599dd",
            })),
          },
        ];
      }, cardKind);
      const grid = view.locator("rtgl-grid").first();
      for (const [width, height, columns] of [
        [768, 1024, 6],
        [1024, 768, 6],
        [600, 1024, 2],
        [390, 844, 2],
        [767, 1024, 2],
        [768, 1024, 6],
      ]) {
        await page.setViewportSize({ width, height });
        await grid.evaluate(async (element, columns) => {
          await new Promise((resolve, reject) => {
            const deadline = Date.now() + 3000;
            const check = () => {
              const tracks =
                getComputedStyle(element).gridTemplateColumns.split(" ");
              if (tracks.length === columns) return resolve();
              if (Date.now() > deadline)
                return reject(
                  new Error(`Expected ${columns} tracks, got ${tracks}`),
                );
              requestAnimationFrame(check);
            };
            check();
          });
        }, columns);
        assert.equal(
          await view.evaluate((element) => element.store.selectItemsPerRow()),
          columns,
        );
        const geometry = await grid.evaluate((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        assert.ok(geometry.scrollWidth <= geometry.width + 1);
      }
      await page.screenshot({
        path: `/tmp/routevn-${name}-${route}-tablet-grid.png`,
      });
      await view.evaluate((element) => {
        const configKey = element.props.itemsPerRowConfigKey.replace(
          ".itemsPerRow",
          ".mobileItemsPerRow",
        );
        element.deps.appService.setUserConfig(configKey, 3);
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await grid.evaluate(async (element) => {
        for (let frame = 0; frame < 60; frame++) {
          if (
            getComputedStyle(element).gridTemplateColumns.split(" ").length ===
            3
          )
            return;
          await new Promise(requestAnimationFrame);
        }
        throw new Error("Saved column preference was not restored");
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${name}: media, catalog and text style grids at phone/tablet/Split View widths; saved preferences retained.`,
    );
  } finally {
    await browser.close();
  }
}
