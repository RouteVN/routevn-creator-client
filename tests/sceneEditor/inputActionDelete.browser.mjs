// Run against the existing web watch server. Each browser uses isolated web
// storage, so no saved projects are changed.
//
// Regression: Delete in the right-click menu of the Input card in the
// presentation state list did nothing. The card is tagged with the `input`
// mode that opens its editor, while the action is stored as `form`.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.SCENE_EDITOR_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const sceneId = "LL8EUke6dL2V";
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  await page.locator("rvn-project").evaluate((project, sceneId) => {
    const { appService } = project.deps;
    appService.navigate("/project/scene-editor", {
      ...appService.getPayload(),
      s: sceneId,
    });
  }, sceneId);
  await page.locator("#previewCanvasHost canvas").waitFor({ state: "visible" });
  await page.locator("#scenePageLoading").waitFor({ state: "detached" });
  const editor = page.locator("rvn-scene-editor-lexical");
  const editorHandle = await editor.elementHandle();

  const { lineId, sectionId, inputLayoutId, choiceLayoutId, startActions } =
    await editor.evaluate((element, sceneId) => {
      const { projectService, store } = element.deps;
      const repositoryState = projectService.getRepositoryState();
      const findLayoutId = (layoutType) =>
        Object.entries(repositoryState.layouts.items).find(
          ([, layout]) => layout.layoutType === layoutType,
        )?.[0];
      const lineId = store.selectSelectedLineId();
      const sectionId = store.selectSelectedSectionId();
      return {
        lineId,
        sectionId,
        inputLayoutId: findLayoutId("input"),
        choiceLayoutId: findLayoutId("choice"),
        startActions:
          repositoryState.scenes.items[sceneId].sections.items[sectionId].lines
            .items[lineId].actions,
      };
    }, sceneId);
  assert.ok(inputLayoutId, "the starter project has an input layout");
  assert.ok(choiceLayoutId, "the starter project has a choice layout");
  assert.ok(
    Object.keys(startActions).length > 0,
    "the selected line starts with other actions",
  );

  const lineRef = { element: editorHandle, sceneId, sectionId, lineId };
  const readLineActions = () =>
    page.evaluate(
      ({ element, sceneId, sectionId, lineId }) =>
        element.deps.projectService.getRepositoryState().scenes.items[sceneId]
          .sections.items[sectionId].lines.items[lineId].actions,
      lineRef,
    );
  // Saving a line stores the starter line's dialogue layout as `ui` instead of
  // the older `gui`, so compare both spellings as one.
  const withCurrentDialogueUi = (actions) => {
    const { gui, ...dialogue } = actions.dialogue;
    return { ...actions, dialogue: { ui: gui, ...dialogue } };
  };
  const waitForStoredAction = (actionType, isStored) =>
    page.waitForFunction(
      ({ element, sceneId, sectionId, lineId, actionType, isStored }) =>
        Object.hasOwn(
          element.deps.projectService.getRepositoryState().scenes.items[sceneId]
            .sections.items[sectionId].lines.items[lineId].actions,
          actionType,
        ) === isStored,
      { ...lineRef, actionType, isStored },
    );

  // Adds the action to the selected line, deletes it from its card's
  // right-click menu, and checks that only that action was removed.
  const deleteFromCard = async ({ mode, actionType, action }) => {
    assert.equal(Object.hasOwn(await readLineActions(), actionType), false);
    await editor.evaluate(
      (element, { lineId, actionType, action }) =>
        element.deps.projectService.updateLineAction({
          lineId,
          actionType,
          action,
        }),
      { lineId, actionType, action },
    );
    await waitForStoredAction(actionType, true);
    const { [actionType]: storedAction, ...otherActions } =
      await readLineActions();
    assert.deepEqual(storedAction, action);

    const card = page.locator(
      `rvn-system-actions [data-mode="${mode}"]:visible`,
    );
    await card.waitFor({ state: "visible" });
    assert.equal(await card.count(), 1, `one ${mode} card is shown`);

    await card.click({ button: "right" });
    const menuItems = page.locator(
      'rtgl-dropdown-menu[open] [role="menuitem"]',
    );
    await menuItems.first().waitFor({ state: "visible" });
    assert.equal(await menuItems.count(), 1);
    assert.equal((await menuItems.first().innerText()).trim(), "Delete");
    await menuItems.first().click();

    await waitForStoredAction(actionType, false);
    await card.waitFor({ state: "detached" });
    assert.equal(
      await page.locator("rtgl-dropdown-menu[open]").count(),
      0,
      "the menu closes after Delete",
    );
    assert.deepEqual(
      withCurrentDialogueUi(await readLineActions()),
      withCurrentDialogueUi(otherActions),
      `deleting the ${mode} card leaves the line's other actions as they were`,
    );
  };

  const inputAction = { resourceId: inputLayoutId, fields: {} };
  await deleteFromCard({
    mode: "input",
    actionType: "form",
    action: inputAction,
  });
  // A card whose mode is also its stored key keeps working.
  await deleteFromCard({
    mode: "choice",
    actionType: "choice",
    action: { resourceId: choiceLayoutId, items: [{ content: "Go on" }] },
  });
  // The Input card can be added back and deleted again.
  await deleteFromCard({
    mode: "input",
    actionType: "form",
    action: inputAction,
  });

  assert.deepEqual(errors, []);
  console.log("Input action delete from the presentation state: PASS");
} finally {
  await browser.close();
}
