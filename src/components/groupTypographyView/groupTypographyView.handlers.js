export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleBeforeMount = (deps) => {
  const { render, store, repository } = deps;
  const { colors, fonts } = repository.getState();
  store.setColorsData(colors);
  store.setFontsData(fonts);
  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleTypographyItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("typography-item-", "");

  // Forward typography item selection to parent
  dispatchEvent(
    new CustomEvent("typography-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleTypographyItemDoubleClick = (e, deps) => {
  const { dispatchEvent, props } = deps;
  e.stopPropagation(); // Prevent other click handlers

  const itemId = e.currentTarget.id.replace("typography-item-", "");

  // Find the item data
  const item = props.flatGroups
    ?.flatMap((group) => group.children || [])
    .find((item) => item.id === itemId);

  if (item) {
    // Forward typography item double-click to parent
    dispatchEvent(
      new CustomEvent("typography-item-double-click", {
        detail: { itemId, item },
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handleAddTypographyClick = (e, deps) => {
  const { dispatchEvent } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-typography-button-", "");

  // Forward add typography click to parent
  dispatchEvent(
    new CustomEvent("add-typography-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};
