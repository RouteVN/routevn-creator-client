import {
  applyTagFilterPopoverSelection,
  clearTagFilterPopoverSelection,
  closeTagFilterPopoverFromOverlay,
  openTagFilterPopoverFromButton,
  toggleTagFilterPopoverOption,
} from "../../internal/ui/tagFilterPopover.handlers.js";

const MIN_ITEMS_PER_ROW = 1;
const MAX_ITEMS_PER_ROW = 12;

const getDataAttribute = (event, name) => {
  return event?.currentTarget?.getAttribute?.(name) ?? undefined;
};

const isColumnZoomControlMode = (props) => props?.zoomControlMode === "columns";

const toItemsPerRowFromColumnZoomControlValue = (value) => {
  return MIN_ITEMS_PER_ROW + MAX_ITEMS_PER_ROW - Math.round(value);
};

const getItemsPerRowConfigKey = (props) =>
  props?.itemsPerRowConfigKey ?? undefined;

const syncPersistedItemsPerRow = ({ appService, props, store } = {}) => {
  if (!isColumnZoomControlMode(props)) {
    return;
  }

  const configKey = getItemsPerRowConfigKey(props);
  if (!configKey || typeof appService?.getUserConfig !== "function") {
    return;
  }

  const itemsPerRow = appService.getUserConfig(configKey);
  if (itemsPerRow === undefined) {
    return;
  }

  store.setItemsPerRow({ itemsPerRow });
};

const persistItemsPerRow = ({ appService, props, store } = {}) => {
  const configKey = getItemsPerRowConfigKey(props);
  if (!configKey || typeof appService?.setUserConfig !== "function") {
    return;
  }

  appService.setUserConfig(configKey, store.selectItemsPerRow());
};

export const handleTagFilterButtonClick = openTagFilterPopoverFromButton;
export const handleTagFilterPopoverClose = closeTagFilterPopoverFromOverlay;
export const handleTagFilterOptionClick = toggleTagFilterPopoverOption;
export const handleTagFilterClearClick = clearTagFilterPopoverSelection;
export const handleTagFilterApplyClick = applyTagFilterPopoverSelection;

export const handleBeforeMount = (deps) => {
  syncPersistedItemsPerRow(deps);
};

export const handleMenuClick = (deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("menu-click", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSearchInput = (deps, payload) => {
  const { dispatchEvent } = deps;
  const value = payload._event.detail.value ?? "";

  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleTagFilterChange = (deps, payload) => {
  const { dispatchEvent } = deps;
  const tagIds = Array.isArray(payload._event.detail?.tagIds)
    ? payload._event.detail.tagIds
    : [];

  dispatchEvent(
    new CustomEvent("tag-filter-change", {
      detail: { tagIds },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = getDataAttribute(payload._event, "data-group-id");
  if (!groupId) {
    return;
  }

  store.toggleGroupCollapse({ groupId });
  render();
};

export const handleItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemDoubleClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-dblclick", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  dispatchEvent(
    new CustomEvent("add-click", {
      detail: {
        groupId: getDataAttribute(payload._event, "data-group-id"),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  store.showContextMenu({
    itemId,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleZoomChange = (deps, payload) => {
  const { store, render, props } = deps;
  if (!isColumnZoomControlMode(props)) {
    return;
  }

  const nextValue = parseFloat(
    payload._event.detail?.value ?? payload._event.target?.value ?? 1,
  );

  store.setItemsPerRow({
    itemsPerRow: toItemsPerRowFromColumnZoomControlValue(nextValue),
  });
  persistItemsPerRow(deps);
  render();
};

export const handleZoomIn = (deps) => {
  const { store, render, props } = deps;
  if (!isColumnZoomControlMode(props)) {
    return;
  }

  store.setItemsPerRow({ itemsPerRow: store.selectItemsPerRow() - 1 });
  persistItemsPerRow(deps);
  render();
};

export const handleZoomOut = (deps) => {
  const { store, render, props } = deps;
  if (!isColumnZoomControlMode(props)) {
    return;
  }

  store.setItemsPerRow({ itemsPerRow: store.selectItemsPerRow() + 1 });
  persistItemsPerRow(deps);
  render();
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const action = payload._event.detail.item?.value;
  const itemId = store.selectDropdownMenu().targetItemId;

  if (!itemId) {
    store.hideContextMenu();
    render();
    return;
  }

  if (action === "duplicate-item") {
    dispatchEvent(
      new CustomEvent("item-duplicate", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  if (action === "delete-item") {
    dispatchEvent(
      new CustomEvent("item-delete", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  store.hideContextMenu();
  render();
};
