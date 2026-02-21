export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { layouts } = projectService.getState();

  // Safe access to nested properties
  const pushLayeredView = props?.pushLayeredView;

  store.setLayouts({
    layouts,
  });

  if (!pushLayeredView) {
    store.setFormValues({});
    store.setInitiated();
    render();
    return;
  }

  // Initialize form values from existing data
  const formValues = {
    resourceId: pushLayeredView.resourceId,
  };

  store.setFormValues({ payload: formValues });
  store.setInitiated();
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const { formValues } = store.getState();

  if (formValues?.resourceId) {
    dispatchEvent(
      new CustomEvent("submit", {
        detail: {
          pushLayeredView: {
            resourceId: formValues.resourceId,
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { values: formValues } = payload._event.detail;

  store.setFormValues({ payload: formValues });
  render();
};
