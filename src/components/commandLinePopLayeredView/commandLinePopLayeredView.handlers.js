export const handleAfterMount = (deps) => {
  const { store, render } = deps;

  store.setInitiated();
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        popLayeredView: {},
      },
      bubbles: true,
      composed: true,
    }),
  );
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
