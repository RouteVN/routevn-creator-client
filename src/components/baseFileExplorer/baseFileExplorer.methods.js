export function selectItem(payload = {}) {
  const { itemId } = payload;

  this.transformedHandlers.handlePageItemClick({
    _event: {
      detail: {
        itemId,
      },
    },
  });
}

export function getSelectedItem(payload = {}) {
  return this.transformedHandlers.handleGetSelectedItem({
    _event: {
      detail: payload,
    },
  });
}

export function navigateSelection(payload = {}) {
  return this.transformedHandlers.handleNavigateSelection({
    _event: {
      detail: payload,
    },
  });
}

export function setSelectedFolderExpanded(payload = {}) {
  return this.transformedHandlers.handleSetSelectedFolderExpanded({
    _event: {
      detail: payload,
    },
  });
}

export function setFolderCollapsed(payload = {}) {
  return this.transformedHandlers.handleSetFolderCollapsed({
    _event: {
      detail: payload,
    },
  });
}
