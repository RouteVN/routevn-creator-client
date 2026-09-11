// Run against watch:ios: node tests/ios/projectFolderSetup.browser.mjs
// The native Files dialog needs a physical phone; this fixture exercises the
// real page, iOS picker client and bridge callbacks in an isolated browser DB.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
const deviceName = process.env.IOS_TEST_DEVICE_NAME ?? "iPhone";
const localFilesRoot = `On My ${deviceName}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((deviceName) => {
    window.RTGL_VT_RESET_APP_STATE = true;
    window.folderTrial = {
      deviceName,
      selection: "valid",
      confirmFails: false,
      confirms: 0,
    };
    window.webkit = {
      messageHandlers: {
        RouteVNIOS: {
          postMessage({ id, method, payload }) {
            const trial = window.folderTrial;
            const folder = {
              uri: "routevn-folder://selected/folder-1",
              name: trial.displayPath ? "Other Projects" : "My Projects",
              displayPath:
                trial.displayPath ?? `On My ${deviceName}/My Projects`,
            };
            let value = true;
            let error;
            if (method === "markSplashReady") {
              return;
            } else if (method === "getProjectFolderSetup") {
              value = JSON.parse(
                localStorage.getItem("folder-trial-status") ??
                  JSON.stringify({ configured: false, deviceName }),
              );
            } else if (method === "openFolderPicker") {
              queueMicrotask(() =>
                window.__routeVNIOSFolderPickerResult({
                  requestId: payload.requestId,
                  folder: trial.selection === "cancel" ? undefined : folder,
                }),
              );
            } else if (method === "previewProjectFolderSetup") {
              if (trial.selection === "app")
                error = { code: "appFolder", message: "appFolder" };
              else value = folder;
            } else if (method === "confirmProjectFolderSetup") {
              trial.confirms += 1;
              if (trial.confirmFails)
                error = {
                  code: "NSCocoaError",
                  message: "Fixture write failure",
                };
              else {
                value = { configured: true, folder, deviceName };
                localStorage.setItem(
                  "folder-trial-status",
                  JSON.stringify(value),
                );
              }
            } else throw new Error(`Unexpected fixture bridge call: ${method}`);
            queueMicrotask(() =>
              window.__routeVNIOSBridgeResult({ id, ok: !error, value, error }),
            );
          },
        },
      },
    };
  }, deviceName);
  await page.route("**/src/setup.ios.js", async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace("setup.ios.js", "setup.web.js"),
    });
    const body = (await response.text()).replace(
      "export { deps };",
      `
      const { createIOSFilePicker } = await import('./deps/clients/ios/filePicker.js');
      const { createIOSProjectFolderSetup } = await import('./deps/clients/ios/projectFolderSetup.js');
      window.RTGL_VT_RESET_APP_STATE = false;
      const trialSetup = createIOSProjectFolderSetup({filePicker:createIOSFilePicker()});
      await trialSetup.load();
      appService.getProjectFolderSetup = () => trialSetup.getStatus();
      appService.pickProjectFolderSetup = (options) => trialSetup.pick(options);
      appService.confirmProjectFolderSetup = (options) => trialSetup.confirm(options);
      appService.resolveProjectFolderSetupRoute = (path) => trialSetup.getStatus().configured ? path : '/project-folder-setup';
      window.folderTrial.appService = appService;
      window.folderTrial.projectService = projectService;
      export { deps };
    `,
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/project-folder-setup*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch({ url: origin + "/ios/index.html" });
    await route.fulfill({ response });
  });
  await page.goto(origin + "/project-folder-setup?vt-input-mode=touch");
  const setup = page.locator("#setupFolderButton");
  await setup.waitFor();
  await page
    .getByText(`Choose “${localFilesRoot}” or create your own folder.`, {
      exact: true,
    })
    .waitFor();
  await page.screenshot({ path: "/tmp/routevn-folder-initial-browser.png" });
  await page.evaluate(() => {
    window.folderTrial.selection = "app";
  });
  await setup.click();
  await page
    .locator("#projectFolderError", { hasText: "belongs to an app" })
    .waitFor();
  await page.evaluate(() => {
    window.folderTrial.selection = "valid";
  });
  await setup.click();
  await page
    .locator("#projectFolderPath", {
      hasText: `${localFilesRoot}/My Projects`,
    })
    .waitFor();
  assert.equal(await page.evaluate(() => window.folderTrial.confirms), 0);
  await page.screenshot({ path: "/tmp/routevn-folder-confirm-browser.png" });
  await page.evaluate(() => {
    window.folderTrial.selection = "cancel";
  });
  await setup.click();
  await page.locator("#confirmFolderButton:not([disabled])").waitFor();
  await page.evaluate(() => {
    window.folderTrial.confirmFails = true;
  });
  await page.locator("#confirmFolderButton").click();
  await page
    .locator("#projectFolderError", { hasText: "Could not save" })
    .waitFor();
  await page.evaluate(() => {
    window.folderTrial.confirmFails = false;
  });
  await page.locator("#confirmFolderButton").click();
  await page.locator("#continueFolderButton").waitFor();
  await page
    .getByText(
      `This folder belongs to an app. Choose a separate folder under ${localFilesRoot}.`,
      { exact: true },
    )
    .waitFor({ state: "hidden" });
  await page
    .getByText(
      "Could not save the folder setup. Check access and available space, then try again.",
      { exact: true },
    )
    .waitFor({ state: "hidden" });
  await page.screenshot({ path: "/tmp/routevn-folder-saved-browser.png" });
  await page.reload();
  await page.locator("#continueFolderButton").waitFor();
  await page.locator("#continueFolderButton").click();
  await page
    .locator("rvn-projects #mobileCreateMenuButton, rvn-projects #createButton")
    .waitFor();

  // Config uses the real page and navigation, with an isolated browser project.
  await page.evaluate(async () => {
    const { appService } = window.folderTrial;
    const project = await appService.createNewProject({
      name: "Project One",
      description: "",
      language: "en",
      template: "default",
      projectResolution: { width: 1920, height: 1080 },
    });
    window.folderTrial.projectId = project.id;
    appService.navigate("/project/config", { p: project.id });
  });
  await page.locator("rvn-config #languageSection").waitFor();
  assert.equal(await page.locator("#projectFolderSection").count(), 0);
  await page.evaluate(async () => {
    window.folderTrial.appService.navigate("/projects");
  });
  await page
    .locator("rvn-projects #mobileCreateMenuButton, rvn-projects #createButton")
    .waitFor();
  await page.evaluate(async () => {
    window.folderTrial.appService.getPlatform = () => "ios";
    window.folderTrial.appService.navigate("/project/config", {
      p: window.folderTrial.projectId,
    });
  });
  const configuredPath = page.locator("#configuredProjectFolderPath");
  await configuredPath.waitFor();
  assert.equal(
    await configuredPath.textContent(),
    `${localFilesRoot}/My Projects`,
  );
  await page.screenshot({
    path: "/tmp/routevn-config-project-folder-browser.png",
  });
  const previousConfirmCount = await page.evaluate(
    () => window.folderTrial.confirms,
  );
  await page.locator("#changeProjectFolderButton").click();
  await page.locator("#setupFolderButton").waitFor();
  assert.equal(
    await page.evaluate(() => window.folderTrial.confirms),
    previousConfirmCount,
  );
  await page.locator("#continueFolderButton").click();
  await configuredPath.waitFor();
  assert.equal(
    await page.evaluate(() => window.folderTrial.appService.getPath()),
    "/project/config",
  );
  await page.locator("#changeProjectFolderButton").click();
  await page.locator("#setupFolderButton").waitFor();
  await page.evaluate(() => {
    window.folderTrial.selection = "cancel";
  });
  await page.locator("#setupFolderButton").click();
  await page.locator("#continueFolderButton:not([disabled])").waitFor();
  assert.equal(
    await page.locator("#projectFolderPath").textContent(),
    `${localFilesRoot}/My Projects`,
  );
  await page.locator("#continueFolderButton").click();
  await configuredPath.waitFor();
  assert.equal(
    await configuredPath.textContent(),
    `${localFilesRoot}/My Projects`,
  );
  await page.locator("#changeProjectFolderButton").click();
  await page.locator("#setupFolderButton").waitFor();
  await page.evaluate(() => {
    window.folderTrial.selection = "valid";
    window.folderTrial.displayPath = `On My ${window.folderTrial.deviceName}/Other Projects`;
    // The previous project may not exist in a newly selected library. Config
    // must remain accessible because it contains app settings and folder setup.
    window.folderTrial.projectService.ensureRepository = async () => {
      throw new Error("Previous project is outside the selected library");
    };
  });
  await page.locator("#setupFolderButton").click();
  await page.locator("#confirmFolderButton").waitFor();
  await page.locator("#confirmFolderButton").click();
  await page.locator("#continueFolderButton").click();
  await configuredPath.waitFor();
  assert.equal(
    await page.evaluate(() => window.folderTrial.appService.getPath()),
    "/project/config",
  );
  assert.equal(
    await page.evaluate(() =>
      window.folderTrial.appService.getCurrentProjectId(),
    ),
    await page.evaluate(() => window.folderTrial.projectId),
  );
  assert.equal(
    await configuredPath.textContent(),
    `${localFilesRoot}/Other Projects`,
  );
  await page.evaluate(() =>
    window.folderTrial.appService.navigate("/projects"),
  );
  const projectPage = page.locator("rvn-projects");
  const scroller = page.locator("#projectsScroll");
  await scroller.waitFor();
  await projectPage.evaluate((element) => {
    element.store.setProjects({
      projects: [{ id: "project-1", name: "Project One" }],
    });
    element.render();
    const { appService, projectService } = window.folderTrial;
    window.folderTrial.projectClicks = { alerts: [], opens: [], routes: [] };
    window.folderTrial.restoreProjectClicks = () => {
      Object.assign(appService, originalAppMethods);
      projectService.ensureProjectCompatibleById = originalEnsure;
    };
    const originalAppMethods = {
      showAlert: appService.showAlert,
      navigate: appService.navigate,
      setCurrentProjectEntry: appService.setCurrentProjectEntry,
    };
    const originalEnsure = projectService.ensureProjectCompatibleById;
    appService.showAlert = (alert) => {
      window.folderTrial.projectClicks.alerts.push(alert);
    };
    appService.navigate = (path) => {
      window.folderTrial.projectClicks.routes.push(path);
    };
    appService.setCurrentProjectEntry = () => {};
    projectService.ensureProjectCompatibleById = async (projectId) => {
      window.folderTrial.projectClicks.opens.push(projectId);
    };
  });
  // A tap on empty list space must never try to open a project.
  await scroller.click({ position: { x: 5, y: 5 } });
  assert.deepEqual(
    await page.evaluate(() => window.folderTrial.projectClicks),
    { alerts: [], opens: [], routes: [] },
  );
  // Nested card content bubbles through the list, but must open only once.
  await page.locator("#projectItem0 rtgl-text").first().click();
  await page.waitForFunction(
    () => window.folderTrial.projectClicks.routes.length > 0,
  );
  assert.deepEqual(
    await page.evaluate(() => window.folderTrial.projectClicks),
    { alerts: [], opens: ["project-1"], routes: ["/project"] },
  );
  await page.evaluate(() => window.folderTrial.restoreProjectClicks());
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    for (const count of [0, 1, 30]) {
      await projectPage.evaluate((element, count) => {
        element.store.setProjects({
          projects: Array.from({ length: count }, (_, index) => ({
            id: `project-${index}`,
            name: `Project ${index + 1}`,
          })),
        });
        element.render();
      }, count);
      const geometry = await scroller.evaluate(async (element) => {
        const root = element.getRootNode();
        const header = root.querySelector("#mobileCreateMenuButton");
        const footer = root.querySelector("#appVersionButton");
        const before = [header, footer].map(
          (el) => el.getBoundingClientRect().top,
        );
        element.scrollTop = element.scrollHeight;
        await new Promise(requestAnimationFrame);
        return {
          overflow: getComputedStyle(element).overflowY,
          overscroll: getComputedStyle(element).overscrollBehaviorY,
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
          before,
          after: [header, footer].map((el) => el.getBoundingClientRect().top),
          rootScrollTop: document.scrollingElement.scrollTop,
        };
      });
      assert.equal(geometry.overflow, "scroll");
      assert.equal(geometry.overscroll, "contain");
      assert.ok(geometry.scrollWidth <= geometry.width + 1);
      assert.deepEqual(
        geometry.after,
        geometry.before,
        "Header and footer must remain fixed",
      );
      assert.equal(geometry.rootScrollTop, 0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const platform of ["web", "android", "tauri"]) {
    await projectPage.evaluate((element, platform) => {
      element.store.setPlatform({ platform });
      element.render();
    }, platform);
    await page.waitForFunction(
      () => {
        const element = document
          .querySelector("rvn-app")
          .shadowRoot.querySelector("rvn-projects")
          .shadowRoot.querySelector("#projectsScroll");
        return getComputedStyle(element).overflowY === "auto";
      },
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await scroller.getAttribute("sv"), "");
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${deviceName} onboarding, errors, Config return/path, Projects card/background taps, and empty/short/long scroll layout in portrait, landscape and tablet sizes.`,
  );
} finally {
  await browser.close();
}
