export const INITIAL_STATE = Object.freeze({
  zoomLevel: 1.0,
});

export const setZoomLevel = (state, zoomLevel) => {
  state.zoomLevel = zoomLevel;
};

export const toViewData = ({ state, props, attrs }) => {
  // Calculate dimensions based on zoom level for all media types
  const baseHeight = props.imageHeight || 150;
  const baseWidth = props.maxWidth || 400;
  const baseMediaWidth = 225; // Base width for media items (audio, video, etc.)
  const baseMediaHeight = 150; // Base height for media items (audio, video, etc.)
  const imageHeight = Math.round(baseHeight * state.zoomLevel);
  const maxWidth = Math.round(baseWidth * state.zoomLevel);
  const mediaWidth = Math.round(baseMediaWidth * state.zoomLevel);
  const mediaHeight = Math.round(baseMediaHeight * state.zoomLevel);

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
    imageHeight,
    maxWidth,
    mediaWidth,
    mediaHeight,
    zoomLevel: state.zoomLevel,
    showZoomControls: attrs["show-zoom-controls"] !== "false", // Default to true unless explicitly set to "false"
    itemProperties: props.itemProperties || {},
    items: props.items || {},
  };
};
