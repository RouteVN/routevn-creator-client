// Run against the existing web watch server. Each browser uses isolated web
// storage, so no saved projects are changed.
//
// Regression: creating a section while a choice line is selected, with the
// default "Inherit state from selected line", copied the choice onto the new
// section's first line. Preview then stopped on that line after the choice
// jumped there.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.SCENE_EDITOR_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const sceneId = "LL8EUke6dL2V";
const choiceLayoutId = "H8LjzFSx1XVv";
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

  const { firstSectionId, choiceLineId, sectionIdsBefore } =
    await editor.evaluate(
      async (element, { sceneId, choiceLayoutId }) => {
        const { projectService, store } = element.deps;
        const scene = projectService.getRepositoryState().scenes.items[sceneId];
        const firstSectionId = store.selectSelectedSectionId();
        const choiceLineId = store.selectSelectedLineId();
        await projectService.updateLineAction({
          lineId: choiceLineId,
          actionType: "choice",
          action: {
            resourceId: choiceLayoutId,
            items: [
              {
                content: "Go on",
                events: {
                  click: {
                    actions: {
                      sectionTransition: {
                        sceneId,
                        sectionId: firstSectionId,
                      },
                    },
                  },
                },
              },
            ],
          },
        });
        return {
          firstSectionId,
          choiceLineId,
          sectionIdsBefore: Object.keys(scene.sections.items),
        };
      },
      { sceneId, choiceLayoutId },
    );
  const editorHandle = await editor.elementHandle();
  await page.waitForFunction(
    (element) =>
      element.deps.store.selectEffectivePresentationState().choice !==
      undefined,
    editorHandle,
  );

  // Keep the dialog's default "Inherit".
  await editor.evaluate((element) => {
    element.deps.store.showSectionCreateDialog({ defaultName: "Section Two" });
    element.deps.render();
  });
  await page
    .locator('#sectionCreateForm rtgl-input[data-field-name="name"] input')
    .fill("Section Two");
  await page
    .locator('#sectionCreateForm rtgl-button[data-action-id="submit"]')
    .click();
  await page.waitForFunction(
    ({ element, sceneId, sectionIdsBefore }) => {
      const { projectService } = element.deps;
      const sections =
        projectService.getRepositoryState().scenes.items[sceneId].sections;
      return Object.entries(sections.items).some(
        ([sectionId, section]) =>
          !sectionIdsBefore.includes(sectionId) &&
          section.lines?.tree?.length > 0,
      );
    },
    { element: editorHandle, sceneId, sectionIdsBefore },
  );

  const { secondSectionLineIds, firstLineActionKeys } = await editor.evaluate(
    async (
      element,
      { sceneId, firstSectionId, choiceLineId, sectionIdsBefore },
    ) => {
      const { projectService } = element.deps;
      const findSection = (sectionId) =>
        projectService.getRepositoryState().scenes.items[sceneId].sections
          .items[sectionId];
      const secondSectionId = Object.keys(
        projectService.getRepositoryState().scenes.items[sceneId].sections
          .items,
      ).find((sectionId) => !sectionIdsBefore.includes(sectionId));
      const firstLineId = findSection(secondSectionId).lines.tree[0].id;
      const firstLineActions =
        findSection(secondSectionId).lines.items[firstLineId].actions;
      const firstLineActionKeys = Object.keys(firstLineActions);
      const dialogue = firstLineActions.dialogue;

      await projectService.updateLineAction({
        lineId: firstLineId,
        actionType: "dialogue",
        action: { ...dialogue, content: [{ text: "Two one" }] },
      });
      for (const text of ["Two two", "Two three"]) {
        await projectService.createLineItem({
          sectionId: secondSectionId,
          data: {
            actions: {
              dialogue: {
                ui: dialogue.ui,
                mode: dialogue.mode,
                content: [{ text }],
              },
            },
          },
          position: "last",
        });
      }

      const choice = structuredClone(
        findSection(firstSectionId).lines.items[choiceLineId].actions.choice,
      );
      choice.items[0].events.click.actions.sectionTransition.sectionId =
        secondSectionId;
      await projectService.updateLineAction({
        lineId: choiceLineId,
        actionType: "choice",
        action: choice,
      });

      return {
        secondSectionId,
        secondSectionLineIds: findSection(secondSectionId).lines.tree.map(
          (node) => node.id,
        ),
        firstLineActionKeys,
      };
    },
    { sceneId, firstSectionId, choiceLineId, sectionIdsBefore },
  );

  assert.equal(
    firstLineActionKeys.includes("choice"),
    false,
    `New section's first line copied the choice: ${firstLineActionKeys}`,
  );
  assert.equal(secondSectionLineIds.length, 3);

  await editor.evaluate((element) => {
    const { graphicsService } = element.deps;
    const initRouteEngine = graphicsService.initRouteEngine;
    graphicsService.initRouteEngine = (projectData, options = {}) =>
      initRouteEngine(projectData, {
        ...options,
        onRenderState: (payload) => {
          window.previewRenderState = payload.renderState;
          return options.onRenderState?.(payload);
        },
      });
    window.previewLines = [];
    document.addEventListener(
      "current-line-changed",
      (event) => window.previewLines.push(event.detail.lineId),
      true,
    );
  });
  await page.locator("#previewButton").click();
  await page.waitForFunction(
    (choiceLineId) => window.previewLines.at(-1) === choiceLineId,
    choiceLineId,
  );
  const canvas = page.locator("rvn-vn-preview canvas").first();
  const box = await canvas.boundingBox();
  const choiceButton = await page.waitForFunction(() => {
    const find = (elements, x, y) => {
      for (const element of elements ?? []) {
        const left = x + (element.x ?? 0);
        const top = y + (element.y ?? 0);
        const actions = element.click?.payload?.actions;
        if (actions?.sectionTransition) {
          const target = element.children?.find((child) => child.width);
          return {
            x: left + (target?.x ?? 0) + target.width / 2,
            y: top + (target?.y ?? 0) + target.height / 2,
          };
        }
        const found = find(element.children, left, top);
        if (found) {
          return found;
        }
      }
    };
    return find(window.previewRenderState?.elements, 0, 0);
  });
  const { x, y } = await choiceButton.jsonValue();
  const scale = box.width / 1920;
  await page.mouse.click(box.x + x * scale, box.y + y * scale);

  const waitForPreviewLine = (lineId) =>
    page.waitForFunction(
      (lineId) => window.previewLines.at(-1) === lineId,
      lineId,
      { timeout: 5000 },
    );
  await waitForPreviewLine(secondSectionLineIds[0]);

  // A tap during the text reveal only completes the line.
  for (const lineId of secondSectionLineIds.slice(1)) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.mouse.click(
        box.x + box.width * 0.5,
        box.y + box.height * 0.15,
      );
      const advanced = await waitForPreviewLine(lineId).then(
        () => true,
        () => false,
      );
      if (advanced) {
        break;
      }
    }
    await waitForPreviewLine(lineId);
  }

  assert.deepEqual(await page.evaluate(() => window.previewLines), [
    choiceLineId,
    ...secondSectionLineIds,
  ]);
  assert.deepEqual(errors, []);
  console.log("New section choice advance check: PASS");
} finally {
  await browser.close();
}
