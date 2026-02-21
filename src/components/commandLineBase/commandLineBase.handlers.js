export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  // Initialize with existing base data if available
  if (props?.base?.resourceId) {
    store.setSelectedResourceId({
      resourceId: props.base.resourceId,
    });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { values: formValues } = payload._event.detail;

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

  // Create base object with only non-empty values
  const base = {
    resourceType: "layout",
  };
  if (selectedLayoutId && selectedLayoutId !== "") {
    base.resourceId = selectedLayoutId;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        base,
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
