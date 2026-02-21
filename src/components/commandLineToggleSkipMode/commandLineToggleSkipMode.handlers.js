export const handleFormChange = (deps, payload) => {
  const { render } = deps;
  const { values: formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent } = deps;

  // Create toggleSkipMode object with empty payload
  const toggleSkipMode = {};

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        toggleSkipMode,
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
