import { toFlatItems } from "../../internal/project/tree.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

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
  const { animations, scenes } = projectService.getRepositoryState();
  const sectionId = props?.resetStoryAtSection?.sectionId;
  const sceneId = resolveInitialSceneId(
    scenes,
    props?.currentSceneId,
    sectionId,
  );

  store.setScenes({
    scenes,
  });
  store.setAnimations({
    animations,
  });
  store.setFormValues({
    values: {
      sceneId,
      sectionId,
      transitionAnimationId:
        props?.resetStoryAtSection?.screen?.animations?.resourceId,
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
  const { appService, dispatchEvent, store, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const warningTitle = localizeCommandLineText("Warning", copy);
  const { formValues, scenes } = store.selectSubmitData();
  const sceneId = formValues?.sceneId;
  const sectionId = formValues?.sectionId;

  if (!sceneId) {
    appService.showAlert({
      message: localizeCommandLineText("Please select a scene", copy),
      title: warningTitle,
    });
    return;
  }

  if (!sectionId) {
    appService.showAlert({
      message: localizeCommandLineText("Please select a section", copy),
      title: warningTitle,
    });
    return;
  }

  const selectedScene = scenes?.items?.[sceneId];
  const selectedSection = selectedScene?.sections?.items?.[sectionId];

  if (!selectedScene || !selectedSection || !hasSectionId(scenes, sectionId)) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Please select a valid section for selected scene",
        copy,
      ),
      title: warningTitle,
    });
    return;
  }

  const resetStoryAtSection = {
    sectionId,
  };

  if (formValues.transitionAnimationId) {
    resetStoryAtSection.screen = {
      animations: {
        resourceId: formValues.transitionAnimationId,
      },
    };
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        resetStoryAtSection,
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
