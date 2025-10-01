export const INITIAL_STATE = Object.freeze({});

export const toViewData = ({ state, props, attrs }) => {
  return {
    fullWidthAttr: attrs["full-width-item"] === true ? "w=f" : "",
    resourceType: props.resourceType || "default",
    flatGroups: props.flatGroups || [],
    selectedItemId: props.selectedItemId,
    searchQuery: props.searchQuery || "",
    uploadText: props.uploadText || "Upload Files",
    acceptedFileTypes: props.acceptedFileTypes || [],
    searchPlaceholder: props.searchPlaceholder || "Search...",
    emptyMessage:
      props.emptyMessage ||
      `No ${props.resourceType || "items"} found matching "${props.searchQuery || ""}"`,
    imageHeight: props.imageHeight,
    maxWidth: props.maxWidth,
    itemProperties: props.itemProperties || {},
    items: props.items || {},
  };
};
