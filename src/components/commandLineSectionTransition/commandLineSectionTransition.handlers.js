export const handleAfterMount = async (deps) => {
  const { repositoryFactory, router, store, props, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { scenes } = repository.getState();

  // Safe access to nested properties
  const sectionTransition = props?.sectionTransition;

  store.setItems({
    items: scenes,
  });

  if (!sectionTransition) {
    // Initialize with defaults when creating new transition
    const formValues = {
      sceneId: props?.currentSceneId,
    };
    store.setFormValues(formValues);
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

  store.setFormValues(formValues);
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const { formValues } = store.getState();

  if (formValues?.sceneId) {
    // Scene transition
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
  }
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
  const { formValues } = payload._event.detail;

  store.setFormValues(formValues);
  render();
};

export const handleTabClick = (deps) => {
  const { render } = deps;
  render();
};
