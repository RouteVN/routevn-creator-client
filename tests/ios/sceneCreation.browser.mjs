// Run against watch:ios. Uses real scene forms and isolated browser project data.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";

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
    await page.addInitScript(() => {
      window.RTGL_VT_RESET_APP_STATE = true;
    });
    await page.route("**/src/setup.ios.js", async (route) => {
      const response = await route.fetch({
        url: route.request().url().replace("setup.ios.js", "setup.web.js"),
      });
      await route.fulfill({ response });
    });
    await page.route("**/projects?*", async (route) => {
      if (route.request().resourceType() !== "document")
        return route.continue();
      const response = await route.fetch({ url: origin + "/ios/index.html" });
      await route.fulfill({ response });
    });
    await page.goto(origin + "/projects?vt-input-mode=touch");
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
      appService.navigate("/project/scenes", { p: project.id });
    });

    const scenes = page.locator("rvn-scenes");
    await scenes.locator("#whiteboard").waitFor({ state: "attached" });
    const initialCount = await scenes.evaluate(
      (element) =>
        Object.keys(
          element.deps.projectService.getRepositoryState().scenes.items,
        ).length,
    );
    const openForm = async () => {
      await scenes.locator("#whiteboard").evaluate((element) => {
        element.dispatchEvent(
          new CustomEvent("canvas-context-menu", {
            detail: {
              formX: 160,
              formY: 180,
              whiteboardX: 120,
              whiteboardY: 100,
            },
            bubbles: true,
            composed: true,
          }),
        );
      });
    };
    await openForm();
    const input = page.locator(
      "#sceneForm rtgl-input[data-field-name='name'] input",
    );
    const submit = page.locator(
      "#sceneForm rtgl-button[data-action-id='submit']",
    );
    await input.waitFor();
    assert.equal(await input.inputValue(), "");
    for (const value of ["", "   "]) {
      await input.fill(value);
      await submit.click();
      await page
        .getByText("Scene name is required.", { exact: true })
        .waitFor();
      assert.equal(
        await scenes.evaluate((element) => element.store.selectShowSceneForm()),
        true,
      );
      assert.equal(
        await scenes.evaluate(
          (element) =>
            Object.keys(
              element.deps.projectService.getRepositoryState().scenes.items,
            ).length,
        ),
        initialCount,
      );
    }
    await input.fill("  Scene One  ");
    await submit.click();
    await input.waitFor({ state: "hidden" });
    await page.waitForFunction((initialCount) => {
      const app = document.querySelector("rvn-app");
      const element = app.shadowRoot.querySelector("rvn-scenes");
      return (
        Object.keys(
          element.deps.projectService.getRepositoryState().scenes.items,
        ).length ===
        initialCount + 1
      );
    }, initialCount);
    const createdName = await scenes.evaluate((element) => {
      const items = Object.values(
        element.deps.projectService.getRepositoryState().scenes.items,
      );
      return items.find((item) => item.name === "Scene One")?.name;
    });
    assert.equal(createdName, "Scene One");
    await openForm();
    await input.waitFor();
    assert.equal(await input.inputValue(), "");
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${name}: blank initial scene name; empty/whitespace rejected; named creation trimmed; reopened form blank.`,
    );
  } finally {
    await browser.close();
  }
}
