export const handleBeforeMount = (deps) => {
  const { props, render, store } = deps;
  console.log("props", props);
  store.updateActions(props.actions);
  render();
};

export const handleOnUpdate = (changes, deps) => {
  console.log("system actions on update", changes);
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
  console.log("payload._event.detail", payload._event.detail);

  store.setMode({
    mode: payload._event.detail.item.mode,
  });

  render();
};

export const handleCommandLineSubmit = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  console.log("payload._event.detail", payload._event.detail);
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
  render();
};

export const handleActionsDialogClose = (deps) => {
  const { store, render } = deps;
  store.hideActionsDialog();
  render();
};
