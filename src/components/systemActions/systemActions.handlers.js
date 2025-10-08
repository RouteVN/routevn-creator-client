export const handleBeforeMount = (deps) => {
  const { props, render, store } = deps;
  store.updateActions(props.actions);
  render();
};

export const handleOnUpdate = (changes, deps) => {
  const { render, store } = deps;
  const { newProps } = changes;
  store.updateActions(newProps.actions);
  render();
};

export const handleBackToActions = (deps) => {
  const { store, render } = deps;
  store.setMode({ mode: "actions" });
  render();
};

export const handleActionClicked = (deps, payload) => {
  const { store, render } = deps;

  store.setMode({
    mode: payload._event.detail.item.mode,
  });

  render();
};

export const handleCommandLineSubmit = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("actions-change", {
      detail: payload._event.detail,
    }),
  );
  store.hideActionsDialog();
  render();
};

export const handleAddActionButtonClicked = (deps) => {
  const { store, render } = deps;
  store.showActionsDialog();
  store.setMode({ mode: "actions" });
  render();
};

export const handleActionsDialogClose = (deps) => {
  const { store, render } = deps;
  store.hideActionsDialog();
  render();
};

export const handleActionItemClick = (deps, payload) => {
  const { store, render } = deps;
  const mode = payload._event.target.dataset.mode;
  store.showActionsDialog();
  store.setMode({ mode });
  render();
};
