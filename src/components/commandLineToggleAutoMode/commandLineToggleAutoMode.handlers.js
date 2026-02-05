export const handleFormChange = (deps, payload) => {
  const { render } = deps;
  const { formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent } = deps;

  // Create toggleAutoMode object with empty payload
  const toggleAutoMode = {};

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        toggleAutoMode,
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
