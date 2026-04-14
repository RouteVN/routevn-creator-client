const toPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const mergeActions = (currentActions, nextActions) => {
  return {
    ...toPlainObject(currentActions),
    ...toPlainObject(nextActions),
  };
};

const removeAction = (actions, actionType) => {
  const nextActions = {
    ...toPlainObject(actions),
  };

  if (!actionType) {
    return nextActions;
  }

  delete nextActions[actionType];
  return nextActions;
};

const syncStateFromProps = (deps, showConfirmDialog = {}) => {
  const { props, store } = deps;
  const layouts = Array.isArray(props.layouts) ? props.layouts : [];
  const confirmDialogLayouts = layouts.filter(
    (layout) => layout.layoutType === "confirmDialog",
  );
  const selectedResourceId = showConfirmDialog?.resourceId;
  const hasSelectedLayout = confirmDialogLayouts.some(
    (layout) => layout.id === selectedResourceId,
  );

  store.setSelectedResourceId({
    resourceId: hasSelectedLayout
      ? selectedResourceId
      : (confirmDialogLayouts[0]?.id ?? ""),
  });
  store.setConfirmActions({
    actions: toPlainObject(showConfirmDialog?.confirmActions),
  });
  store.setCancelActions({
    actions: toPlainObject(showConfirmDialog?.cancelActions),
  });
};

export const handleBeforeMount = (deps) => {
  syncStateFromProps(deps, deps.props?.showConfirmDialog);
};

export const handleOnUpdate = (deps, changes) => {
  syncStateFromProps(deps, changes?.newProps?.showConfirmDialog);
};

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const { values } = payload._event.detail;

  if (!values) {
    return;
  }

  store.setSelectedResourceId({
    resourceId: values.resourceId ?? "",
  });
  render();
};

export const handleConfirmActionsClick = (deps) => {
  const { render, store } = deps;
  store.setMode({ mode: "confirmActions" });
  render();
};

export const handleCancelActionsClick = (deps) => {
  const { render, store } = deps;
  store.setMode({ mode: "cancelActions" });
  render();
};

export const handleConfirmActionsChange = (deps, payload) => {
  const { render, store } = deps;
  const state = store.getState();
  store.setConfirmActions({
    actions: mergeActions(state.confirmActions, payload._event.detail),
  });
  render();
};

export const handleCancelActionsChange = (deps, payload) => {
  const { render, store } = deps;
  const state = store.getState();
  store.setCancelActions({
    actions: mergeActions(state.cancelActions, payload._event.detail),
  });
  render();
};

export const handleConfirmActionsDelete = (deps, payload) => {
  const { render, store } = deps;
  const actionType = payload._event.detail?.actionType;
  const state = store.getState();

  store.setConfirmActions({
    actions: removeAction(state.confirmActions, actionType),
  });
  render();
};

export const handleCancelActionsDelete = (deps, payload) => {
  const { render, store } = deps;
  const actionType = payload._event.detail?.actionType;
  const state = store.getState();

  store.setCancelActions({
    actions: removeAction(state.cancelActions, actionType),
  });
  render();
};

export const handleNestedActionsClose = (deps) => {
  const { render, store } = deps;
  store.setMode({ mode: "current" });
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const state = store.getState();

  if (!state.selectedResourceId) {
    return;
  }

  const detail = {
    showConfirmDialog: {
      resourceId: state.selectedResourceId,
      confirmActions: toPlainObject(state.confirmActions),
    },
  };

  if (Object.keys(toPlainObject(state.cancelActions)).length > 0) {
    detail.showConfirmDialog.cancelActions = toPlainObject(state.cancelActions);
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail,
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent, render, store } = deps;
  const itemId = payload._event.detail.id;

  if (itemId === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
    return;
  }

  if (itemId === "current") {
    store.setMode({ mode: "current" });
    render();
  }
};
