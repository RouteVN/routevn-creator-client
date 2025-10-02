export const handleAfterMount = async (deps) => {
  const { repositoryFactory, router, store, props } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { scenes } = repository.getState();

  store.setItems({
    items: scenes,
  });

  // Safe access to nested properties
  const sectionTransition = props?.line?.presentation?.sectionTransition;

  if (!sectionTransition) {
    return;
  }

  // Initialize form values from existing line data
  const transition = sectionTransition;
  const formValues = {
    animation: transition.animation || "fade",
  };

  if (transition.sceneId) {
    // Scene transition
    formValues.sameScene = "other_scene";
    formValues.sceneId = transition.sceneId;
  } else if (transition.sectionId) {
    // Section transition
    formValues.sameScene = "this_scene";
    formValues.sectionId = transition.sectionId;
  }

  store.setFormValues(formValues);
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const { formValues } = store.getState();

  if (formValues?.sameScene === "other_scene" && formValues?.sceneId) {
    // Scene transition
    dispatchEvent(
      new CustomEvent("submit", {
        detail: {
          sectionTransition: {
            sceneId: formValues.sceneId,
            animation: formValues.animation || "fade",
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  } else if (formValues?.sectionId) {
    // Section transition
    dispatchEvent(
      new CustomEvent("submit", {
        detail: {
          sectionTransition: {
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
