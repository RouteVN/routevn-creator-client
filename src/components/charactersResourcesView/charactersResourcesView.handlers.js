import {
  applyTagFilterPopoverSelection,
  clearTagFilterPopoverSelection,
  closeTagFilterPopoverFromOverlay,
  openTagFilterPopoverFromButton,
  toggleTagFilterPopoverOption,
} from "../../internal/ui/tagFilterPopover.handlers.js";

const getDataAttribute = (event, name) => {
  return event?.currentTarget?.getAttribute?.(name) ?? undefined;
};

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

export const handleTagFilterButtonClick = openTagFilterPopoverFromButton;
export const handleTagFilterPopoverClose = closeTagFilterPopoverFromOverlay;
export const handleTagFilterOptionClick = toggleTagFilterPopoverOption;
export const handleTagFilterClearClick = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  clearTagFilterPopoverSelection(deps, payload);

  if (
    !parseBooleanProp(props.searchInFilterPopover) ||
    !props.searchQuery?.trim()
  ) {
    return;
  }

  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value: "" },
      bubbles: true,
      composed: true,
    }),
  );
};
export const handleTagFilterApplyClick = applyTagFilterPopoverSelection;

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

export const handleSpritesButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("sprites-button-click", {
      detail: { itemId },
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

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleContextMenuClickItem = (deps) => {
  const { store, render, dispatchEvent } = deps;
  const itemId = store.selectDropdownMenu().targetItemId;

  if (!itemId) {
    store.hideContextMenu();
    render();
    return;
  }

  dispatchEvent(
    new CustomEvent("item-delete", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );

  store.hideContextMenu();
  render();
};
