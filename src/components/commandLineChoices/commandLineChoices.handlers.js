export const handleAddChoiceClick = (e, deps) => {
  const { store, render } = deps;

  store.addChoice();
  render();
};

export const handleChoiceItemClick = (e, deps) => {
  const { store, render } = deps;
  // Placeholder for choice item interaction
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        choices: {
          choices: e?.choices,
        },
      },
    }),
  );
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};
