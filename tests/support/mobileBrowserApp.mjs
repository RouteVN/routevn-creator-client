// Use the iOS shell with web adapters and isolated browser storage. Tests of
// native adapters supply their own bridge fixtures instead of this setup.
export const openTouchProjectsPage = async (page) => {
  const origin = process.env.IOS_TEST_ORIGIN ?? "http://127.0.0.1:3004";
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
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch({ url: origin + "/ios/index.html" });
    await route.fulfill({ response });
  });
  await page.goto(origin + "/projects?vt-input-mode=touch");
};

export const createProjectFromMenu = async (page) => {
  await page.locator("#mobileCreateMenuButton").click();
  await page
    .locator("#mobileActionMenu [role='menuitem']")
    .filter({ hasText: "Create Project" })
    .click();
  await page
    .locator("#createProjectForm rtgl-input[data-field-name='name'] input")
    .fill("Project One");
  await page
    .locator("#createProjectForm rtgl-button[data-action-id='submit']")
    .click();
};
