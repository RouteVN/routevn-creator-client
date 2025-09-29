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

export const handleBackToActions = (e, deps) => {
  const { store, render } = deps;
  store.setMode({ mode: "actions" });
  render();
};

export const handleActionClicked = (e, deps) => {
  const { store, render } = deps;
  console.log("e.detail", e.detail);

  store.setMode({
    mode: e.detail.item.mode,
  });

  render();
};

export const handleCommandLineSubmit = (e, deps) => {
  const { store, render, dispatchEvent } = deps;
  console.log("e.detail", e.detail);
  dispatchEvent(
    new CustomEvent("actions-change", {
      detail: e.detail,
    }),
  );
  store.hideActionsDialog();
  render();
};

export const handleAddActionButtonClicked = (e, deps) => {
  const { store, render } = deps;
  store.showActionsDialog();
  render();
};

export const handleActionsDialogClose = (e, deps) => {
  const { store, render } = deps;
  store.hideActionsDialog();
  render();
};
