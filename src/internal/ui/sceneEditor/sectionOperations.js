import { generateId } from "../../id.js";
import {
  renderSceneEditorState,
  updateSceneEditorSectionChanges,
} from "./runtime.js";

export const isSectionsOverviewOpen = (store) => {
  return store.selectIsSectionsOverviewOpen();
};

const updateSceneEditorSelectionPayload = (
  appService,
  { sectionId, lineId } = {},
) => {
  if (!appService?.getPayload || !appService?.setPayload) {
    return;
  }

  const nextPayload = {
    ...appService.getPayload(),
    sectionId,
  };

  if (lineId) {
    nextPayload.lineId = lineId;
  } else {
    delete nextPayload.lineId;
  }

  appService.setPayload(nextPayload);
};

export const scrollSceneEditorSectionTabIntoView = (deps, sectionId) => {
  const { refs } = deps;
  const scheduleFrame =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);

  scheduleFrame(() => {
    const scrollContainer = refs.sceneEditorSectionsScroll;
    if (!scrollContainer) {
      return;
    }

    const sectionElement = Array.from(
      scrollContainer.querySelectorAll("[data-section-block-id]"),
    ).find((element) => element.dataset.sectionBlockId === sectionId);
    if (!sectionElement) {
      return;
    }

    // Sticky headers move with the viewport; the section block keeps its
    // original position. Align it directly, without the line scroll padding.
    const sectionTop = sectionElement.getBoundingClientRect().top;
    const containerTop = scrollContainer.getBoundingClientRect().top;
    scrollContainer.scrollTo({
      top:
        scrollContainer.scrollTop +
        sectionTop -
        containerTop -
        scrollContainer.clientTop,
      behavior: "instant",
    });
  });
};

export const selectSceneEditorSection = async (deps, sectionId) => {
  const { store, render, subject, appService } = deps;

  store.setSelectedSectionId({ selectedSectionId: sectionId });
  const scene = store.selectScene();
  const nextSection = scene?.sections?.find(
    (section) => section.id === sectionId,
  );
  let nextLineId;
  if (nextSection?.lines?.length > 0) {
    nextLineId = nextSection.lines[0].id;
    store.setSelectedLineId({ selectedLineId: nextLineId });
  } else {
    store.setSelectedLineId({ selectedLineId: undefined });
  }

  updateSceneEditorSelectionPayload(appService, {
    sectionId,
    lineId: nextLineId,
  });

  await updateSceneEditorSectionChanges(deps);

  render();
  scrollSceneEditorSectionTabIntoView(deps, sectionId);
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const reconcileSceneEditorSelection = (store) => {
  const scene = store.selectScene();
  const previousSectionId = store.selectSelectedSectionId();
  const previousLineId =
    store.selectActionTargetLineId?.() || store.selectSelectedLineId();

  if (!scene || !Array.isArray(scene.sections) || scene.sections.length === 0) {
    if (previousSectionId !== undefined) {
      store.setSelectedSectionId({ selectedSectionId: undefined });
    }
    if (previousLineId !== undefined) {
      store.setSelectedLineId({ selectedLineId: undefined });
    }
    return {
      sectionId: undefined,
      lineId: undefined,
    };
  }

  const resolvedSection =
    scene.sections.find((section) => section.id === previousSectionId) ||
    scene.sections[0];
  const resolvedSectionId = resolvedSection?.id;
  const resolvedLine =
    resolvedSection?.lines?.find((line) => line.id === previousLineId) ||
    resolvedSection?.lines?.[0];
  const resolvedLineId = resolvedLine?.id;

  if (resolvedSectionId !== previousSectionId) {
    store.setSelectedSectionId({ selectedSectionId: resolvedSectionId });
  }

  if (resolvedLineId !== previousLineId) {
    store.setSelectedLineId({ selectedLineId: resolvedLineId });
  }

  return {
    sectionId: resolvedSectionId,
    lineId: resolvedLineId,
  };
};

const createInheritedPresentationActions = (presentationState = {}) => {
  const actions = {};

  for (const [key, value] of Object.entries(presentationState || {})) {
    if (value === undefined) {
      continue;
    }

    if (key === "dialogue" && value && typeof value === "object") {
      const dialogue = structuredClone(value);
      if (dialogue.clear !== true) {
        dialogue.content = [{ text: "" }];
      }
      actions.dialogue = dialogue;
      continue;
    }

    actions[key] = structuredClone(value);
  }

  return actions;
};

export const createSceneEditorSectionWithName = async (
  deps,
  sectionName,
  syncProjectState,
  options = {},
) => {
  const { store, projectService, render } = deps;
  const {
    inheritPresentationFromSelectedLine = true,
    position = "last",
    positionTargetId,
  } = options;
  const sceneId = store.selectSceneId();
  const newSectionId = generateId();
  const newLineId = generateId();

  const repositoryState = projectService.getState();
  const layouts = repositoryState.layouts;
  const controls = repositoryState.controls;
  let dialogueLayoutId;
  let controlId;

  if (layouts?.items) {
    for (const [layoutId, layout] of Object.entries(layouts.items)) {
      if (!dialogueLayoutId && layout.layoutType === "dialogue-adv") {
        dialogueLayoutId = layoutId;
      }
      if (dialogueLayoutId) {
        break;
      }
    }
  }

  if (controls?.items) {
    for (const [itemId, control] of Object.entries(controls.items)) {
      if (control?.type === "control") {
        controlId = itemId;
        break;
      }
    }
  }

  const defaultActions = {
    dialogue: dialogueLayoutId
      ? {
          ui: {
            resourceId: dialogueLayoutId,
          },
          mode: "adv",
          content: [{ text: "" }],
        }
      : {
          mode: "adv",
          content: [{ text: "" }],
        },
  };

  if (controlId) {
    defaultActions.control = {
      resourceId: controlId,
      resourceType: "control",
    };
  }

  const inheritedActions = inheritPresentationFromSelectedLine
    ? createInheritedPresentationActions(
        store.selectEffectivePresentationState(),
      )
    : {};
  const actions =
    Object.keys(inheritedActions).length > 0
      ? inheritedActions
      : defaultActions;

  await projectService.createSectionItem({
    sceneId,
    sectionId: newSectionId,
    position,
    positionTargetId,
    data: {
      name: sectionName,
    },
  });
  await projectService.createLineItem({
    sectionId: newSectionId,
    lineId: newLineId,
    data: {
      actions,
    },
    position: "last",
  });

  syncProjectState(store, projectService);
  render();

  setTimeout(async () => {
    await renderSceneEditorState(deps);
  }, 10);
};
