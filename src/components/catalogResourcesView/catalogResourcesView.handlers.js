const getDataAttribute = (event, name) => {
  return event?.currentTarget?.getAttribute?.(name) ?? undefined;
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
        x: payload._event.clientX,
        y: payload._event.clientY,
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

  if (action === "edit-item") {
    dispatchEvent(
      new CustomEvent("item-edit", {
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
