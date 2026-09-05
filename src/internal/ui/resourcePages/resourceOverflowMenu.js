export const buildResourceOverflowMenuItems = ({
  showZoom = false,
  showFilter = false,
  i18n = {},
}) => {
  const copy = i18n.resourcePages ?? {};
  const items = [];
  if (showZoom) {
    items.push({
      label: copy.zoomLabel ?? "Zoom",
      type: "item",
      value: "zoom",
    });
  }
  if (showFilter) {
    items.push({
      label: copy.filterLabel ?? "Filter",
      type: "item",
      value: "filter",
    });
  }
  return items;
};

export const handleResourceImportMenuAction = (deps, payload) => {
  const { props, store, render } = deps;
  const { item, position } = payload._event.detail;

  if (item.value === "zoom") {
    store.openZoomPopover({ position });
  } else if (item.value === "filter") {
    store.openTagFilterPopover({
      position,
      tagIds: props.selectedTagFilterValues ?? [],
    });
  } else {
    return;
  }

  render();
};
