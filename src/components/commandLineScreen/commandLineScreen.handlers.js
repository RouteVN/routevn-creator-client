export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  // Initialize with existing screen data if available
  if (props?.screen?.resourceId) {
    store.setSelectedResourceId({
      resourceId: props.screen.resourceId,
    });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  if (formValues.resourceId !== undefined) {
    store.setSelectedResourceId({ resourceId: formValues.resourceId });
  }

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const { selectedLayoutId } = store.getState();

  // Create screen object with only non-empty values
  const screen = {
    resourceType: 'layout'
  };
  if (selectedLayoutId && selectedLayoutId !== "") {
    screen.resourceId = selectedLayoutId;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        screen,
      },
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
