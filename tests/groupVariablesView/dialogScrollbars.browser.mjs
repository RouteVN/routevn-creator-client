// Run against the Android/web watch server with isolated browser storage.
// The computed-variable scroller uses sbv=touch: on touch devices its
// scrollbar stays visible at rest; with a mouse it keeps hover reveal.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.DIALOG_TEST_ORIGIN ?? "http://127.0.0.1:3001";

const openComputedDialog = async (browser, options) => {
  const page = await browser.newPage({
    viewport: { width: 403, height: 680 },
    ...options,
  });
  page.setDefaultTimeout(30000);
  await page.addInitScript(() => {
    window.RTGL_VT_RESET_APP_STATE = true;
  });
  await page.route(/\/src\/setup\.(android|ios|tauri)\.js/, async (route) => {
    const response = await route.fetch({
      url: route
        .request()
        .url()
        .replace(/setup\.(android|ios|tauri)\.js/, "setup.web.js"),
    });
    await route.fulfill({ response });
  });
  await page.goto(origin + "/projects?vt-input-mode=touch");
  await page.locator("#mobileCreateMenuButton").click();
  await page
    .locator("#mobileActionMenu [role='menuitem']")
    .filter({ hasText: "Create Project" })
    .click();
  await page
    .locator('#createProjectForm rtgl-input[data-field-name="name"] input')
    .fill("Project One");
  await page
    .locator('#createProjectForm rtgl-button[data-action-id="submit"]')
    .click();
  await page.locator("#projectItem0").click();
  await page.locator("rvn-project").evaluate((project) => {
    const { appService } = project.deps;
    appService.navigate("/project/variables", appService.getPayload());
  });
  await page.locator("#addVariableButtonRef0").click();
  await page
    .locator("rtgl-global-ui #dropdownMenu [role='menuitem']")
    .filter({ hasText: /^Computed$/ })
    .click();
  const scroller = page.locator("#computedFormScrollContainer");
  await scroller.waitFor({ state: "visible" });
  await scroller
    .locator('[part~="scrollbar-layer"][data-enabled]')
    .waitFor({ state: "visible" });
  const readScrollbar = () =>
    scroller.evaluate((element) => {
      const track = element.shadowRoot.querySelector(
        '[part~="scrollbar-track-vertical"]',
      );
      const thumb = element.shadowRoot.querySelector(
        '[part~="scrollbar-thumb-vertical"]',
      );
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        opacity: getComputedStyle(track).opacity,
        pointerEvents: getComputedStyle(track).pointerEvents,
        thumbTop: thumb.getBoundingClientRect().top,
        trackVisible: track.checkVisibility({ checkOpacity: true }),
      };
    });
  await page.waitForTimeout(300);
  return { page, scroller, readScrollbar };
};

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const { page, scroller, readScrollbar } = await openComputedDialog(
      browser,
      { hasTouch: true, isMobile: true },
    );
    const before = await readScrollbar();
    console.log(engineName, "overflowing computed form", before);
    assert.ok(before.scrollHeight > before.clientHeight);
    assert.equal(
      before.opacity,
      "1",
      "Overflowing popup needs a visible scrollbar without hover",
    );
    assert.ok(before.trackVisible);
    assert.equal(before.pointerEvents, "auto", "Scrollbar should be draggable");
    const thumb = await scroller.evaluate((element) =>
      element.shadowRoot
        .querySelector('[part~="scrollbar-thumb-vertical"]')
        .getBoundingClientRect()
        .toJSON(),
    );
    const thumbX = thumb.x + thumb.width / 2;
    const thumbY = thumb.y + thumb.height / 2;
    await page.mouse.move(thumbX, thumbY);
    await page.mouse.down();
    await page.mouse.move(thumbX, thumbY + 40, { steps: 5 });
    await page.mouse.up();
    assert.ok(
      (await readScrollbar()).scrollTop > 0,
      "Dragging the thumb scrolls the popup",
    );
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.waitForTimeout(100);
    const after = await readScrollbar();
    assert.ok(after.scrollTop > 0);
    assert.ok(
      after.thumbTop > before.thumbTop,
      "Thumb should follow the scroll position",
    );
    const viewport = await scroller.boundingBox();
    const operation = await page.locator("#addOperationButton").boundingBox();
    assert.ok(
      operation.y >= viewport.y &&
        operation.y + operation.height <= viewport.y + viewport.height,
      "Scrolling reveals the operation control",
    );
    const submit = await page.locator("#computedSubmitButton").boundingBox();
    assert.ok(
      submit.y >= 0 && submit.y + submit.height <= 680,
      "Submit stays in the viewport",
    );

    await page.setViewportSize({ width: 1440, height: 1400 });
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    const fitting = await readScrollbar();
    assert.ok(
      fitting.scrollHeight <= fitting.clientHeight,
      "Large viewport fits the form",
    );
    assert.equal(
      fitting.trackVisible,
      false,
      "No scrollbar when the popup content fits",
    );
    await page.close();

    const mouse = await openComputedDialog(browser, {});
    await mouse.page.mouse.move(1, 1);
    await mouse.page.waitForTimeout(200);
    const atRest = await mouse.readScrollbar();
    assert.ok(atRest.scrollHeight > atRest.clientHeight);
    assert.equal(
      atRest.opacity,
      "0",
      "A mouse device keeps the scrollbar hidden at rest",
    );
    const box = await mouse.scroller.boundingBox();
    await mouse.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await mouse.page.waitForTimeout(200);
    assert.equal(
      (await mouse.readScrollbar()).opacity,
      "1",
      "Hovering reveals the scrollbar with a mouse",
    );
    await mouse.page.close();

    console.log(
      `${engineName}: touch overflow indicator, dragging, reachable controls, pinned action, no-overflow, and mouse hover checks passed`,
    );
  } finally {
    await browser.close();
  }
}
