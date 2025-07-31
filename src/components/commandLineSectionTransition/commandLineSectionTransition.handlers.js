export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
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

export const handleSubmitClick = (payload, deps) => {
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

export const handleBreadcumbClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (e.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
  }
};

export const handleFormChange = (e, deps) => {
  const { store, render } = deps;
  const { formValues } = e.detail;

  store.setFormValues(formValues);
  render();
};

export const handleResetClick = (e, deps) => {
  const { store, render } = deps;

  store.setFormValues({
    sameScene: "this_scene",
    sceneId: undefined,
    sectionId: undefined,
    animation: "fade",
  });

  render();
};

export const handleTabClick = (e, deps) => {
  const { render } = deps;
  render();
};
