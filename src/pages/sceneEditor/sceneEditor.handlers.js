import { nanoid } from "nanoid";
import { toFlatItems } from "../../repository";

export const handleOnMount = (deps) => {
  const { store, router, render, repository, getRefIds } = deps;
  const { sceneId } = router.getPayload();
  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      steps: toFlatItems(section.steps),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });
  store.setSelectedSectionId(scene.sections[0].id);
  console.log('scene', scene)
};

export const handleSectionTabClick = (e, deps) => {
  const { store, render } = deps;
  const id = e.currentTarget.id.replace("section-tab-", "");
  store.setSelectedSectionId(id);
  render();
};

export const handleEditorDataChanaged = (e, deps) => {
  const { repository, store } = deps;
  console.log("editor data changed", e.detail);
  // const { stepId, content } = e.detail;
  // const sceneId = store.selectSceneId();
  // const sectionId = store.selectSelectedSectionId();

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const stepId = e.detail.stepId;

  repository.addAction({
    actionType: "treeUpdate",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps`,
    value: {
      id: stepId,
      replace: false,
      item: {
        instructions: {
          presentationInstructions: {
            dialogue: {
              text: e.detail.content,
            }
          },
        },
      },
    }
  })
  // actionType: "treePush",
  // target: `scenes.items.${sceneId}.sections`,
  // value: {
  //   parent: "_root",
  //   position: "last",
  //   item: {
  //     id: newSectionId,
  //     name: "Section New",
  //     steps: {
  //       items: {
  //         instructions: {
  //           presentationInstructions: {},
  //         },
  //       },
  //       tree: [
  //         {
  //           id: newStepId,
  //         },
  //       ],
  //     },
  //   },
  // },
};

export const handleAddInstructionButtonClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleSectionAddClick = (e, deps) => {
  const { store, repository, render } = deps;

  const sceneId = store.selectSceneId();
  const newSectionId = nanoid();
  const newStepId = nanoid();

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections`,
    value: {
      parent: "_root",
      position: "last",
      item: {
        id: newSectionId,
        name: "Section New",
        steps: {
          items: {
            instructions: {
              presentationInstructions: {},
            },
          },
          tree: [
            {
              id: newStepId,
            },
          ],
        },
      },
    },
  });

  const { scenes } = repository.getState();
  const newScene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  newScene.sections = toFlatItems(newScene.sections);
  store.setScene({
    id: sceneId,
    scene: newScene,
  });
  store.setSelectedSectionId(newSectionId);
  render();
};

export const handleNewLine = (e, deps) => {
  const { store, render, repository } = deps;

  const sceneId = store.selectSceneId();
  const newStepId = nanoid();
  const sectionId = store.selectSelectedSectionId();

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps`,
    value: {
      parent: "_root",
      position: "last",
      item: {
        id: newStepId,
        instructions: {
          presentationInstructions: {},
        },
      },
    },
  });

  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      steps: toFlatItems(section.steps),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });

  render();
};

export const handleMoveUp = (e, deps) => {
  const { store, getRefIds, render } = deps;
  const previousStepId = store.selectPreviousStepId({ stepId: e.detail.stepId });
  console.log("move up", e.detail.stepId);
  console.log("previousStepId", previousStepId);

  const refIds = getRefIds();
  console.log("refIds", refIds);
  const stepsEditorRef = refIds["steps-editor"];
  console.log('stepsEditorRef', stepsEditorRef)
  stepsEditorRef.elm.transformedHandlers.updateSelectedStep(previousStepId);

  // store.setSelectedStepId(previousStepId);
  render();
};

export const handleMoveDown = (e, deps) => {
  const { store, getRefIds, render } = deps;
  console.log('e.detail.stepId', e.detail.stepId)
  const nextStepId = store.selectNextStepId({ stepId: e.detail.stepId });
  console.log("move down", e.detail.stepId);
  console.log("nextStepId", nextStepId);

  const refIds = getRefIds();
  const stepsEditorRef = refIds["steps-editor"];
  stepsEditorRef.elm.transformedHandlers.updateSelectedStep(nextStepId);
  render();
};

export const handleBackgroundActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleActionsOverlayClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("steps-editor");
  render();
};

export const handleActionsContainerClick = (e, deps) => {
  e.stopPropagation();
};

export const handleActionClicked = (e, deps) => {
  const { store, render } = deps;
  // console.log('e.deatil', e.detail)
  store.setMode(e.detail.item.mode);
  render();
};

export const handleSectionTabRightClick = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault(); // Prevent default browser context menu

  const sectionId = e.currentTarget.id.replace("section-tab-", "");

  store.showSectionDropdownMenu({
    position: {
      x: e.clientX,
      y: e.clientY,
    },
    sectionId,
  });

  render();
};

export const handleDropdownMenuClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render, repository } = deps;
  const action = e.detail.item.value; // Access value from item object
  const sectionId = store.getState().dropdownMenu.sectionId;
  const sceneId = store.selectSceneId();

  // Store position before hiding dropdown (for rename popover)
  const position = store.getState().dropdownMenu.position;

  store.hideDropdownMenu();

  if (action === "delete-section") {
    // Delete section from repository
    const scene = store.selectScene();
    repository.addAction({
      actionType: "treeDelete",
      target: `scenes.items.${sceneId}.sections`,
      value: {
        id: sectionId,
      },
    });

    // Update scene data and select first remaining section
    const { scenes } = repository.getState();
    const newScene = toFlatItems(scenes)
      .filter((item) => item.type === "scene")
      .find((item) => item.id === sceneId);
    newScene.sections = toFlatItems(newScene.sections);
    store.setScene({
      id: sceneId,
      scene: newScene,
    });

    if (newScene.sections.length > 0) {
      store.setSelectedSectionId(newScene.sections[0].id);
    }
  } else if (action === "rename-section") {
    // Show rename popover using the stored position
    store.showPopover({
      position,
      sectionId,
    });
  }

  render();
};

export const handlePopoverClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;

  // Extract action and values from detail
  const action = detail.action || detail.actionId;
  const values = detail.values || detail.formValues || detail;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    // Get the popover section ID from state
    const sectionId = store.getState().popover.sectionId;
    const sceneId = store.selectSceneId();

    // Hide popover
    store.hidePopover();

    // Update section name in repository
    if (sectionId && values.name && sceneId) {
      repository.addAction({
        actionType: "treeUpdate",
        target: `scenes.items.${sceneId}.sections`,
        value: {
          id: sectionId,
          replace: false,
          item: {
            name: values.name,
          },
        },
      });

      // Update scene data
      const { scenes } = repository.getState();
      const newScene = toFlatItems(scenes)
        .filter((item) => item.type === "scene")
        .find((item) => item.id === sceneId);
      newScene.sections = toFlatItems(newScene.sections);
      store.setScene({
        id: sceneId,
        scene: newScene,
      });
    }

    render();
  }
};
