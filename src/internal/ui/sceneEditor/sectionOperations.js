import { nanoid } from "nanoid";
import {
  renderSceneEditorState,
  updateSceneEditorSectionChanges,
} from "./runtime.js";

export const isSectionsOverviewOpen = (store) => {
  return store.selectIsSectionsOverviewOpen();
};

export const scrollSceneEditorSectionTabIntoView = (deps, sectionId) => {
  const { refs } = deps;

  requestAnimationFrame(() => {
    const refIds = refs?.();
    const refElements = Object.values(refIds || {});
    const tabRef = refElements.find(
      (element) => element?.dataset?.sectionId === sectionId,
    );
    const tabElement =
      tabRef ||
      Array.from(document.querySelectorAll("[data-section-id]")).find(
        (element) => element.getAttribute("data-section-id") === sectionId,
      );

    tabElement?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });
};

export const selectSceneEditorSection = async (deps, sectionId) => {
  const { store, render, subject } = deps;

  store.setSelectedSectionId({ selectedSectionId: sectionId });
  const scene = store.selectScene();
  const nextSection = scene?.sections?.find(
    (section) => section.id === sectionId,
  );
  if (nextSection?.lines?.length > 0) {
    store.setSelectedLineId({ selectedLineId: nextSection.lines[0].id });
  } else {
    store.setSelectedLineId({ selectedLineId: undefined });
  }

  await updateSceneEditorSectionChanges(deps);

  render();
  scrollSceneEditorSectionTabIntoView(deps, sectionId);
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const reconcileSceneEditorSelection = (store) => {
  const scene = store.selectScene();
  const previousSectionId = store.selectSelectedSectionId();
  const previousLineId = store.selectSelectedLineId();

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

export const createSceneEditorSectionWithName = async (
  deps,
  sectionName,
  syncProjectState,
) => {
  const { store, projectService, render } = deps;
  const sceneId = store.selectSceneId();
  const newSectionId = nanoid();
  const newLineId = nanoid();

  const { layouts } = projectService.getState();
  let dialogueLayoutId;
  let baseLayoutId;

  if (layouts?.items) {
    for (const [layoutId, layout] of Object.entries(layouts.items)) {
      if (!dialogueLayoutId && layout.layoutType === "dialogue") {
        dialogueLayoutId = layoutId;
      }
      if (!baseLayoutId && layout.layoutType === "base") {
        baseLayoutId = layoutId;
      }
      if (dialogueLayoutId && baseLayoutId) {
        break;
      }
    }
  }

  const actions = {
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

  if (baseLayoutId) {
    actions.base = {
      resourceId: baseLayoutId,
      resourceType: "layout",
    };
  }

  await projectService.createSectionItem({
    sceneId,
    sectionId: newSectionId,
    name: sectionName,
    position: "last",
  });
  await projectService.createLineItem({
    sectionId: newSectionId,
    lineId: newLineId,
    line: {
      actions,
    },
    position: "last",
  });

  syncProjectState(store, projectService);
  store.setSelectedSectionId({ selectedSectionId: newSectionId });
  store.setSelectedLineId({ selectedLineId: newLineId });
  render();
  scrollSceneEditorSectionTabIntoView(deps, newSectionId);

  setTimeout(async () => {
    await renderSceneEditorState(deps);
  }, 10);
};
