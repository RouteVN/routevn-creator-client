export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { scenes } = projectService.getState();

  // Safe access to nested properties
  const sectionTransition = props?.sectionTransition;

  store.setScenes({
    scenes,
  });

  if (!sectionTransition) {
    const formValues = {
      sceneId: props?.currentSceneId,
    };
    store.setFormValues({ payload: formValues });
    store.setInitiated();
    render();
    return;
  }

  // Initialize form values from existing line data
  const transition = sectionTransition;
  const formValues = {
    animation: transition.animation,
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

  store.setFormValues({ payload: formValues });
  store.setInitiated();
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store, appService } = deps;
  const { formValues, scenes } = store.getState();

  if (!formValues?.sceneId) {
    appService.showToast("Please select a scene", { title: "Warning" });
    return;
  }

  if (!formValues?.sectionId) {
    appService.showToast("Please select a section", { title: "Warning" });
    return;
  }

  const selectedScene = scenes?.items?.[formValues.sceneId];
  const selectedSection =
    selectedScene?.sections?.items?.[formValues.sectionId];

  if (!selectedScene || !selectedSection) {
    appService.showToast("Please select a valid section for selected scene", {
      title: "Warning",
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sectionTransition: {
          sceneId: formValues.sceneId,
          sectionId: formValues.sectionId,
          animation: formValues.animation || "fade",
        },
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

  store.setFormValues({ payload: formValues });
  render();
};

export const handleTabClick = (deps) => {
  const { render } = deps;
  render();
};
