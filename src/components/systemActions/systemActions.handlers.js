import { normalizeLineActions } from "../../internal/project/engineActions.js";

const toPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const normalizeActionsObject = (value) => {
  return normalizeLineActions(toPlainObject(value));
};

const mergeActions = (currentActions, nextPartialActions) => {
  return {
    ...toPlainObject(currentActions),
    ...toPlainObject(nextPartialActions),
  };
};

const syncRepositoryState = async (deps) => {
  const { store, projectService } = deps;
  await projectService.ensureRepository();
  store.setRepositoryState({
    repositoryState: projectService.getRepositoryState(),
  });
};

export const open = (deps, payload) => {
  const { store, render } = deps;
  const { mode, actions } = payload;
  const nextActions =
    actions !== undefined
      ? normalizeActionsObject(actions)
      : normalizeActionsObject(deps.props?.actions);

  store.updateActions(nextActions);
  store.showActionsDialog();
  store.setMode({ mode });
  render();
};

export const handleAfterMount = async (deps) => {
  const { render } = deps;
  await syncRepositoryState(deps);
  render();
};

export const handleBeforeMount = (deps) => {
  const { props, render, store } = deps;
  store.updateActions(normalizeActionsObject(props.actions));
  render();
};

export const handleOnUpdate = async (deps, changes) => {
  const { render, store } = deps;
  const { newProps } = changes;
  store.updateActions(normalizeActionsObject(newProps.actions));
  await syncRepositoryState(deps);
  render();
};

export const handleBackToActions = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;
  store.setMode({ mode: "actions" });
  render();
};

export const handleActionClicked = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;

  store.setMode({
    mode: payload._event.detail.item.mode,
  });

  render();
};

export const handleCommandLineSubmit = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render, dispatchEvent } = deps;
  const submittedActions = payload?._event?.detail || {};
  const nextActions = normalizeActionsObject(
    mergeActions(store.selectAction(), submittedActions),
  );

  store.updateActions(nextActions);
  dispatchEvent(
    new CustomEvent("actions-change", {
      detail: normalizeActionsObject(submittedActions),
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

export const handleEmbeddedCloseClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  deps.dispatchEvent(new CustomEvent("close"));
};

export const handleActionsDialogClose = (deps) => {
  const { store, render, dispatchEvent } = deps;
  store.hideActionsDialog();
  render();
  dispatchEvent(new CustomEvent("close"));
  store.setMode({ mode: "actions" });
};

export const handleActionItemClick = (deps, payload) => {
  const { store, render } = deps;
  const event = payload._event;
  const mode = event.currentTarget?.dataset?.mode;
  store.showActionsDialog();
  store.setMode({ mode });
  render();
};

export const handleActionItemRightClick = (deps, payload) => {
  const { store, render } = deps;
  const event = payload._event;
  event.preventDefault();
  store.showDropdownMenu({
    position: { x: event.clientX, y: event.clientY },
    actionType: event.currentTarget?.dataset?.mode,
  });
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const { detail } = payload._event;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;
  const actionType = store.selectDropdownMenuActionType();

  store.hideDropdownMenu();

  if (item.value === "delete" && actionType) {
    // Dispatch delete action event to parent component
    dispatchEvent(
      new CustomEvent("action-delete", {
        detail: { actionType },
      }),
    );
  }
  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};
