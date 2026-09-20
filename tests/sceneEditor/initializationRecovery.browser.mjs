// Run against the existing watch server. Failure injection and project data
// live only in an isolated browser profile; no user projects are accessed.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const origin = process.env.ASSET_TEST_ORIGIN ?? "http://127.0.0.1:3001";

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const profile = await mkdtemp(join(tmpdir(), "routevn-scene-recovery-"));
  const browser = await engine.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
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
    await page.locator("rvn-project").evaluate((project) => {
      const { appService, projectService, graphicsService } = project.deps;
      const init = graphicsService.init;
      const destroy = graphicsService.destroy;
      const calls = [];
      let failures = 2;
      let pauseInitialization = false;
      let pauseRead = false;
      const read = projectService.getFileContent;
      const state = { calls, revision: projectService.getRepositoryRevision() };
      window.recoveryTest = state;
      graphicsService.init = async (options) => {
        calls.push("init");
        await init(options);
        if (pauseInitialization) {
          pauseInitialization = false;
          await new Promise((resolve) => {
            state.releaseInitialization = resolve;
          });
        }
        if (failures > 0) {
          failures -= 1;
          const cause = new Error("Injected renderer detail <not-markup>");
          cause.code = "test_renderer_failure";
          throw new Error("Injected graphics startup failure", { cause });
        }
      };
      graphicsService.destroy = (...args) => {
        calls.push("destroy");
        return destroy(...args);
      };
      projectService.getFileContent = async (...args) => {
        if (pauseRead) {
          pauseRead = false;
          const result = await read(...args);
          await new Promise((resolve) => {
            state.releaseRead = resolve;
          });
          return result;
        }
        return read(...args);
      };
      // A failed optional cache must not turn a successfully opened editor into
      // a failure screen, or leave the editor covered by the loading overlay.
      projectService.cacheSceneTextStats = async () => {
        throw new Error("Injected cache failure");
      };
      state.open = () =>
        appService.navigate("/project/scene-editor", {
          ...appService.getPayload(),
          s: "LL8EUke6dL2V",
        });
      state.otherSceneId = Object.values(
        projectService.getDomainState().scenes,
      ).find(
        (scene) => scene.type !== "folder" && scene.id !== "LL8EUke6dL2V",
      )?.id;
      state.openOtherScene = () =>
        appService.navigate("/project/scene-editor", {
          ...appService.getPayload(),
          s: state.otherSceneId,
        });
      state.back = () =>
        appService.navigate("/project/scenes", appService.getPayload());
      state.failNext = () => {
        failures = 1;
      };
      state.pauseNext = () => {
        pauseInitialization = true;
      };
      state.pauseNextRead = () => {
        pauseRead = true;
      };
      state.currentRevision = () => projectService.getRepositoryRevision();
      state.open();
    });

    const failed = page.locator("#scenePageError");
    const loading = page.locator("#scenePageLoading");
    const editor = page.locator("rvn-scene-editor-lexical");
    await failed.waitFor({ state: "visible" });
    await loading.waitFor({ state: "detached" });
    assert.equal(
      await page.locator("#sceneErrorMessage").innerText(),
      "Injected graphics startup failure",
    );
    assert.doesNotMatch(
      await failed.innerText(),
      /Step:|Stack traces:|Caused by:/,
    );
    assert.equal(await page.locator("#sceneErrorDetails").count(), 0);
    assert.equal(await failed.locator("rtgl-button").count(), 1);
    assert.equal(
      await page.locator("#recoveryBackButton").innerText(),
      "Back to Scene Map",
    );
    assert.equal(
      await page.locator("#sceneEditorContent").evaluate((node) => node.inert),
      true,
    );
    await mkdir(".artifacts/scene-recovery", { recursive: true });
    await page.screenshot({
      path: `.artifacts/scene-recovery/${name}-failed.png`,
    });

    await page.locator("#recoveryBackButton").click();
    await page.locator("rvn-scenes").waitFor({ state: "attached" });
    await page.evaluate(() => window.recoveryTest.open());
    await failed.waitFor({ state: "visible" });
    assert.deepEqual(await page.evaluate(() => window.recoveryTest.calls), [
      "init",
      "destroy",
      "init",
    ]);

    await page.locator("#recoveryBackButton").click();
    await page.locator("rvn-scenes").waitFor({ state: "attached" });
    await page.evaluate(() => window.recoveryTest.open());
    await failed.waitFor({ state: "detached" });
    await loading.waitFor({ state: "detached" });
    await page
      .locator('#sectionEditor0 [contenteditable="true"]')
      .waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#sceneEditorContent").evaluate((node) => node.inert),
      false,
    );
    assert.deepEqual(await page.evaluate(() => window.recoveryTest.calls), [
      "init",
      "destroy",
      "init",
      "destroy",
      "init",
    ]);
    await page.screenshot({
      path: `.artifacts/scene-recovery/${name}-ready.png`,
    });

    await page.evaluate(() => window.recoveryTest.back());
    await page.locator("rvn-scenes").waitFor({ state: "attached" });
    await page.evaluate(() => {
      window.recoveryTest.failNext();
      window.recoveryTest.open();
    });
    await failed.waitFor({ state: "visible" });
    await page.locator("#recoveryBackButton").click();
    await page.locator("rvn-scenes").waitFor({ state: "attached" });
    await editor.waitFor({ state: "detached" });

    // Navigation while a native-like initialization result is still pending.
    await page.evaluate(() => {
      window.recoveryTest.pauseNext();
      window.recoveryTest.open();
    });
    await page.waitForFunction(() =>
      Boolean(window.recoveryTest.releaseInitialization),
    );
    await page.evaluate(() => window.recoveryTest.back());
    await page.locator("rvn-scenes").waitFor({ state: "attached" });
    await page.evaluate(() => window.recoveryTest.releaseInitialization());
    await page.waitForTimeout(1200); // Include the old delayed canvas-render callback.
    assert.equal(await editor.count(), 0);
    assert.equal(await failed.count(), 0);

    // A late file result must not load into a replacement editor's renderer.
    await page.evaluate(() => {
      window.recoveryTest.pauseNextRead();
      window.recoveryTest.open();
    });
    await page.waitForFunction(() => Boolean(window.recoveryTest.releaseRead));
    await page.evaluate(() => window.recoveryTest.back());
    await page.locator("rvn-scenes").waitFor({ state: "attached" });
    await page.evaluate(() => window.recoveryTest.open());
    await loading.waitFor({ state: "detached" });
    await page
      .locator('#sectionEditor0 [contenteditable="true"]')
      .waitFor({ state: "visible" });
    await page.evaluate(() => window.recoveryTest.releaseRead());
    await page.waitForTimeout(200);
    assert.equal(await failed.count(), 0);
    assert.equal(await page.locator("#previewCanvasHost canvas").count(), 1);
    assert.equal(
      await page.evaluate(
        () =>
          window.recoveryTest.currentRevision() ===
          window.recoveryTest.revision,
      ),
      true,
    );
    // A same-page route request must use its new payload, even before the
    // router publishes it; duplicate route events must not restart that load.
    assert.ok(await page.evaluate(() => window.recoveryTest.otherSceneId));
    await page.evaluate(() => window.recoveryTest.back());
    await page.locator("rvn-scenes").waitFor({ state: "attached" });
    await page.evaluate(() => {
      window.recoveryTest.failNext();
      window.recoveryTest.open();
    });
    await failed.waitFor({ state: "visible" });
    await page.evaluate(() => window.recoveryTest.openOtherScene());
    await failed.waitFor({ state: "detached" });
    await loading.waitFor({ state: "detached" });
    assert.equal(
      await editor.evaluate((node) => node.store.selectSceneId()),
      await page.evaluate(() => window.recoveryTest.otherSceneId),
    );
    assert.deepEqual(errors, []);
    console.log(
      `${name}: failed startup, reopen, optional cache failure, Back to Scene Map, and late-result isolation passed`,
    );
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true });
  }
}
