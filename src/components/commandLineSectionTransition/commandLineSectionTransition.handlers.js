import { findSceneIdBySectionId } from "../../internal/project/projection.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { animations, scenes } = projectService.getRepositoryState();

  // Safe access to nested properties
  const sectionTransition = props?.sectionTransition;

  store.setScenes({
    scenes,
  });
  store.setAnimations({
    animations,
  });

  if (!sectionTransition) {
    const formValues = {
      sceneId: props?.currentSceneId,
    };
    store.setFormValues(formValues);
    store.setInitiated();
    render();
    return;
  }

  // Initialize form values from existing line data
  const transition = sectionTransition;
  const formValues = {
    transitionAnimationId: transition.screen?.animations?.resourceId,
    playbackSpeed: transition.screen?.animations?.playback?.speed,
    playbackContinuity: transition.screen?.animations?.playback?.continuity,
  };

  // A transition saved with only its section goes to that section's scene.
  // The current scene is the fallback, and the layout editor has none.
  formValues.sceneId =
    transition.sceneId ??
    findSceneIdBySectionId(scenes, transition.sectionId) ??
    props?.currentSceneId;

  if (transition.sectionId) {
    // Section transition
    formValues.sectionId = transition.sectionId;
  }

  store.setFormValues(formValues);
  store.setInitiated();
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store, appService, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const warningTitle = localizeCommandLineText("Warning", copy);
  const { formValues, scenes } = store.selectSubmitData();

  // With the scene and section cleared, submitting removes the transition.
  if (!formValues?.sceneId && !formValues?.sectionId) {
    dispatchEvent(
      new CustomEvent("action-delete", {
        detail: { actionType: "sectionTransition" },
      }),
    );
    return;
  }

  if (!formValues?.sceneId) {
    appService.showAlert({
      message: localizeCommandLineText("Please select a scene", copy),
      title: warningTitle,
    });
    return;
  }

  if (!formValues?.sectionId) {
    appService.showAlert({
      message: localizeCommandLineText("Please select a section", copy),
      title: warningTitle,
    });
    return;
  }

  const selectedScene = scenes?.items?.[formValues.sceneId];
  const selectedSection =
    selectedScene?.sections?.items?.[formValues.sectionId];

  if (!selectedScene || !selectedSection) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Please select a valid section for selected scene",
        copy,
      ),
      title: warningTitle,
    });
    return;
  }

  const sectionTransition = {
    sceneId: formValues.sceneId,
    sectionId: formValues.sectionId,
  };

  if (formValues.transitionAnimationId) {
    sectionTransition.screen = {
      animations: {
        resourceId: formValues.transitionAnimationId,
        playback: {
          continuity: formValues.playbackContinuity,
          speed: formValues.playbackSpeed,
        },
      },
    };
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sectionTransition,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (payload._event.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render, refs } = deps;
  const formValues = { ...payload._event.detail.values };

  // A section belongs to its scene, so clearing the scene clears the section.
  if (!formValues.sceneId && formValues.sectionId !== undefined) {
    formValues.sectionId = undefined;
    refs.transitionForm.setValues({ values: { sectionId: undefined } });
  }

  store.setFormValues(formValues);
  render();
};

export const handleTabClick = (deps) => {
  const { render } = deps;
  render();
};
