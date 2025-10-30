export const createInitialState = () => ({
  zoomLevel: 1.0,
  collapsedIds: [],
  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetItemId: null,
    items: [],
  },
  draggingGroupId: null,
});

export const setZoomLevel = (state, zoomLevel) => {
  state.zoomLevel = zoomLevel;
};

export const setDraggingGroupId = (state, groupId) => {
  state.draggingGroupId = groupId;
};

export const selectDraggingGroupId = ({ state }) => state.draggingGroupId;

export const selectZoomLevel = ({ state }) => state.zoomLevel;

export const toggleGroupCollapse = (state, { groupId }) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const showContextMenu = (state, { itemId, x, y }) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetItemId = itemId;
  state.dropdownMenu.items = [
    { label: "Delete", type: "item", value: "delete-item" },
  ];
};

export const hideContextMenu = (state) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetItemId = null;
  state.dropdownMenu.items = [];
};

export const selectDropdownMenu = ({ state }) => state.dropdownMenu;

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

  // Function to recursively set borderColor based on selectedItemId
  const setBorderColorForItems = (items) => {
    return items.map((item) => {
      const updatedItem = {
        ...item,
        borderColor: item.id === props.selectedItemId ? "fg" : "bo",
      };

      // If item has children, recursively process them
      if (item.children && Array.isArray(item.children)) {
        updatedItem.children = setBorderColorForItems(item.children);
      }

      return updatedItem;
    });
  };

  // Apply borderColor to all items in processedFlatGroups
  const finalProcessedGroups = setBorderColorForItems(processedFlatGroups);

  return {
    canUpload: [
      "images",
      "videos",
      "audio",
      "characterSprites",
      "fonts",
    ].includes(props.resourceType),
    draggingGroupId: state.draggingGroupId,
    fullWidthAttr: attrs["full-width-item"] === true ? "w=f" : "",
    resourceType: props.resourceType || "default",
    flatGroups: finalProcessedGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: props.searchQuery || "",
    title: props.title || null,
    uploadText: props.uploadText || "Upload Files",
    acceptedFileTypes: props.acceptedFileTypes || [],
    emptyMessage:
      props.emptyMessage ||
      `No ${props.resourceType || "items"} found matching "${props.searchQuery || ""}"`,
    imageHeight,
    maxWidth,
    mediaWidth,
    mediaHeight,
    zoomLevel: state.zoomLevel,
    showZoomControls: props.resourceType === "images" || props.resourceType === "characterSprites", // Only show for image related resources
    itemProperties: props.itemProperties || {},
    items: props.items || {},
    dropdownMenu: state.dropdownMenu,
  };
};
