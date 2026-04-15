import { toFlatItems } from "../../internal/project/tree.js";

const hasSectionId = (scenes = {}, sectionId) => {
  if (typeof sectionId !== "string" || sectionId.length === 0) {
    return false;
  }

  return Object.values(scenes?.items ?? {}).some((scene) => {
    return scene?.sections?.items?.[sectionId] !== undefined;
  });
};

const findSceneIdBySectionId = (scenes = {}, sectionId) => {
  if (typeof sectionId !== "string" || sectionId.length === 0) {
    return undefined;
  }

  for (const [sceneId, scene] of Object.entries(scenes?.items ?? {})) {
    if (scene?.sections?.items?.[sectionId] !== undefined) {
      return sceneId;
    }
  }

  return undefined;
};

const resolveInitialSceneId = (scenes = {}, currentSceneId, sectionId) => {
  const sceneIdFromSection = findSceneIdBySectionId(scenes, sectionId);
  if (sceneIdFromSection) {
    return sceneIdFromSection;
  }

  if (currentSceneId && scenes?.items?.[currentSceneId]) {
    return currentSceneId;
  }

  return toFlatItems(scenes).find((item) => item.type === "scene")?.id;
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { scenes } = projectService.getRepositoryState();
  const sectionId = props?.resetStoryAtSection?.sectionId;
  const sceneId = resolveInitialSceneId(
    scenes,
    props?.currentSceneId,
    sectionId,
  );

  store.setScenes({
    scenes,
  });
  store.setFormValues({
    values: {
      sceneId,
      sectionId,
    },
  });
  render();
};

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const values = payload?._event?.detail?.values;
  if (!values) {
    return;
  }

  store.setFormValues({ values });
  render();
};

export const handleSubmitClick = (deps) => {
  const { appService, dispatchEvent, store } = deps;
  const { formValues, scenes } = store.getState();
  const sceneId = formValues?.sceneId;
  const sectionId = formValues?.sectionId;

  if (!sceneId) {
    appService.showToast("Please select a scene", {
      title: "Warning",
    });
    return;
  }

  if (!sectionId) {
    appService.showToast("Please select a section", {
      title: "Warning",
    });
    return;
  }

  const selectedScene = scenes?.items?.[sceneId];
  const selectedSection = selectedScene?.sections?.items?.[sectionId];

  if (!selectedScene || !selectedSection || !hasSectionId(scenes, sectionId)) {
    appService.showToast("Please select a valid section for selected scene", {
      title: "Warning",
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        resetStoryAtSection: {
          sectionId,
        },
      },
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload?._event?.detail?.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
