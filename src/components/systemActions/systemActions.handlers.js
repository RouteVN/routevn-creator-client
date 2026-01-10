import { filter, tap } from "rxjs";
export const open = (deps, payload) => {
  const { store, render } = deps;
  const { mode } = payload;
  store.showActionsDialog();
  store.setMode({ mode });
  render();
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;

  await projectService.ensureRepository();
  const repositoryState = projectService.getState();

  store.setRepositoryState(repositoryState);
  render();
};

export const handleBeforeMount = (deps) => {
  const { props, render, store } = deps;
  store.updateActions(props.actions);
  render();
};

export const handleOnUpdate = (deps, changes) => {
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

export const subscriptions = (deps) => {
  const { subject, store, render } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === "updatePresentationState"),
      tap(({ payload }) => {
        store.setLocalPresentationState(payload);
        render();
      }),
    ),
  ];
};
