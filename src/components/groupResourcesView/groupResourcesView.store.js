export const createInitialState = () => ({
  zoomLevel: 1.0,
  collapsedIds: [],
});

export const setZoomLevel = (state, zoomLevel) => {
  state.zoomLevel = zoomLevel;
};

export const toggleGroupCollapse = (state, { groupId }) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const selectViewData = ({ state, props, attrs }) => {
  // Calculate dimensions based on zoom level for all media types
  const baseHeight = props.imageHeight || 150;
  const baseWidth = props.maxWidth || 400;
  const baseMediaWidth = 225; // Base width for media items (audio, video, etc.)
  const baseMediaHeight = 150; // Base height for media items (audio, video, etc.)
  const imageHeight = Math.round(baseHeight * state.zoomLevel);
  const maxWidth = Math.round(baseWidth * state.zoomLevel);
  const mediaWidth = Math.round(baseMediaWidth * state.zoomLevel);
  const mediaHeight = Math.round(baseMediaHeight * state.zoomLevel);

  // Apply collapse state to flatGroups
  const processedFlatGroups = (props.flatGroups || []).map((group) => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id) ? [] : group.children || [],
  }));

  return {
    fullWidthAttr: attrs["full-width-item"] === true ? "w=f" : "",
    resourceType: props.resourceType || "default",
    flatGroups: processedFlatGroups,
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
