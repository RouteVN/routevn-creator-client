export const createInitialState = () => ({
  zoomLevel: 1,
  collapsedIds: [],
  hoveredItemId: undefined,
  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetItemId: undefined,
    items: [],
  },
  draggingGroupId: undefined,
});

export const setZoomLevel = ({ state }, { zoomLevel } = {}) => {
  state.zoomLevel = zoomLevel;
};

export const selectZoomLevel = ({ state }) => state.zoomLevel;

export const setDraggingGroupId = ({ state }, { groupId } = {}) => {
  state.draggingGroupId = groupId;
};

export const selectDraggingGroupId = ({ state }) => state.draggingGroupId;

export const setHoveredItemId = ({ state }, { itemId } = {}) => {
  state.hoveredItemId = itemId;
};

export const selectHoveredItemId = ({ state }) => state.hoveredItemId;

export const toggleGroupCollapse = ({ state }, { groupId } = {}) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
    return;
  }

  state.collapsedIds.push(groupId);
};

export const showContextMenu = ({ state, props }, { itemId, x, y } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetItemId = itemId;
  state.dropdownMenu.items = props.itemContextMenuItems ?? [
    { label: "Delete", type: "item", value: "delete-item" },
  ];
};

export const hideContextMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetItemId = undefined;
  state.dropdownMenu.items = [];
};

export const selectDropdownMenu = ({ state }) => state.dropdownMenu;

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

const resolveDefaultBorderColor = () => {
  return "bo";
};

export const selectViewData = ({ state, props, props: attrs }) => {
  const baseHeight = props.imageHeight ?? 150;
  const baseWidth = props.maxWidth ?? 400;
  const baseMediaWidth = 225;
  const baseMediaHeight = 150;
  const imageHeight = Math.round(baseHeight * state.zoomLevel);
  const maxWidth = Math.round(baseWidth * state.zoomLevel);
  const mediaWidth = Math.round(baseMediaWidth * state.zoomLevel);
  const mediaHeight = Math.round(baseMediaHeight * state.zoomLevel);
  const showZoomControlsAttr =
    attrs.showZoomControls ?? attrs["show-zoom-controls"];
  const showBackButtonAttr = attrs.showBackButton ?? attrs["show-back-button"];
  const canUploadAttr = attrs.canUpload ?? attrs["can-upload"];

  const groups = (props.groups ?? []).map((group) => {
    const isCollapsed = state.collapsedIds.includes(group.id);
    const children = isCollapsed ? [] : (group.children ?? []);

    return {
      ...group,
      isCollapsed,
      children: children.map((item) => {
        const isSelected = item.id === props.selectedItemId;
        const defaultBorderColor = resolveDefaultBorderColor();
        const isInteractive = item.isInteractive !== false;

        return {
          ...item,
          domItemId: isInteractive ? item.id : "",
          cursor: isInteractive ? "pointer" : "default",
          itemBorderColor: isSelected ? "pr" : defaultBorderColor,
          itemHoverBorderColor: isSelected
            ? "pr"
            : !isInteractive
              ? defaultBorderColor
              : "ac",
          showPreviewIcon: Boolean(
            isInteractive && item.canPreview && item.id === state.hoveredItemId,
          ),
        };
      }),
    };
  });

  return {
    navTitle: props.navTitle,
    groups,
    selectedItemId: props.selectedItemId,
    searchQuery: props.searchQuery ?? "",
    searchPlaceholder: props.searchPlaceholder ?? "Search...",
    uploadText: props.uploadText ?? "Upload Files",
    emptyMessage:
      props.emptyMessage ??
      `No items found matching "${props.searchQuery ?? ""}"`,
    acceptedFileTypes: props.acceptedFileTypes ?? [],
    imageHeight,
    maxWidth,
    mediaWidth,
    mediaHeight,
    zoomLevel: state.zoomLevel,
    showZoomControls: parseBooleanProp(showZoomControlsAttr),
    showBackButton: parseBooleanProp(showBackButtonAttr),
    canUpload: parseBooleanProp(canUploadAttr, true),
    draggingGroupId: state.draggingGroupId,
    dropdownMenu: state.dropdownMenu,
  };
};
