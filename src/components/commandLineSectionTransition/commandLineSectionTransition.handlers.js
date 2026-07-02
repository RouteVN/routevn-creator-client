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
  };

  if (transition.sceneId) {
    // Scene transition
    formValues.sceneId = transition.sceneId;
  } else {
    // Default to current scene if no scene specified
    formValues.sceneId = props?.currentSceneId;
  }

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
  const { store, render } = deps;
  const { values: formValues } = payload._event.detail;

  store.setFormValues(formValues);
  render();
};

export const handleTabClick = (deps) => {
  const { render } = deps;
  render();
};
