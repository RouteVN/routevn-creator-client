export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  if (props?.control?.resourceId) {
    store.setSelectedResourceId({
      resourceId: props.control.resourceId,
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
  const { selectedControlId } = store.getState();

  const control = {
    resourceType: "control",
  };
  if (selectedControlId && selectedControlId !== "") {
    control.resourceId = selectedControlId;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        control,
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
