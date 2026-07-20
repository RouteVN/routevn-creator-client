const RESOURCE_VIEW_ITEM_SELECTOR = "[data-resource-view-item='true']";
const RESOURCE_VIEW_CONTROL_SELECTOR = "[data-resource-view-control='true']";

const eventPathContains = (event, selector) => {
  const eventPath = event?.composedPath?.() ?? [event?.target];
  return eventPath.some((element) => element?.matches?.(selector));
};

export const dispatchResourceViewBackgroundClick = (deps, payload) => {
  const event = payload._event;
  if (
    eventPathContains(event, RESOURCE_VIEW_ITEM_SELECTOR) ||
    eventPathContains(event, RESOURCE_VIEW_CONTROL_SELECTOR)
  ) {
    return;
  }

  deps.dispatchEvent(
    new CustomEvent("background-click", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const clearResourcePageSelection = (
  deps,
  { fileExplorerRefName = "fileExplorer" } = {},
) => {
  const { store, refs, render } = deps;

  store.setSelectedFolderId({ folderId: undefined });
  store.setSelectedItemId({ itemId: undefined });
  refs[fileExplorerRefName]?.clearSelection?.();
  render();
};
