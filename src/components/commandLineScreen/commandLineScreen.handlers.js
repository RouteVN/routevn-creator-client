export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  // Initialize with existing screen data if available
  if (props?.screen?.layoutId) {
    store.setSelectedLayoutId({
      layoutId: props.screen.layoutId,
    });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  if (formValues.layoutId !== undefined) {
    store.setSelectedLayoutId({ layoutId: formValues.layoutId });
  }

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const { selectedLayoutId } = store.getState();

  // Create screen object with only non-empty values
  const screen = {};
  if (selectedLayoutId && selectedLayoutId !== "") {
    screen.layoutId = selectedLayoutId;
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
