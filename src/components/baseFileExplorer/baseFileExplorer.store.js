// Context menu constants
const CONTEXT_MENU_FOLDERS = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const CONTEXT_MENU_ITEMS = [
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const EMPTY_CONTEXT_MENU_ITEMS = [
  { label: "New Folder", type: "item", value: "new-item" },
];

export const createInitialState = () => ({
  isDragging: false,
  selectedItemId: undefined,

  // -2 means no target drag index
  targetDragIndex: -2,
  targetDragPosition: 0,
  targetDropPosition: "above",
  itemRects: {},
  containerTop: 0,
  forbiddenIndices: [],

  // Track collapsed folder IDs
  collapsedIds: [],

  // Dropdown menu state
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    itemId: null,
  },

  // Popover state
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    itemId: null,
  },
});

export const startDragging = (
  state,
  { id, itemRects, containerTop, forbiddenIndices },
) => {
  state.isDragging = true;
  state.selectedItemId = id;
  state.itemRects = itemRects;
  state.containerTop = containerTop;
  state.forbiddenIndices = forbiddenIndices || [];
};

export const stopDragging = (state) => {
  state.isDragging = false;
  state.selectedItemId = undefined;
  state.targetDragIndex = -2;
  state.targetDragPosition = 0;
  state.targetDropPosition = "above";
  state.itemRects = {};
  state.containerTop = 0;
  state.forbiddenIndices = [];
};

export const setTargetDragIndex = (state, index) => {
  state.targetDragIndex = index;
};

export const setTargetDragPosition = (state, position) => {
  state.targetDragPosition = position;
};

export const setTargetDropPosition = (state, dropPosition) => {
  state.targetDropPosition = dropPosition;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectTargetDragIndex = ({ state }) => {
  return state.targetDragIndex;
};

export const selectTargetDragPosition = ({ state }) => {
  return state.targetDragPosition;
};

export const selectTargetDropPosition = ({ state }) => {
  return state.targetDropPosition;
};

export const selectItemRects = ({ state }) => {
  return state.itemRects;
};

export const selectContainerTop = ({ state }) => {
  return state.containerTop;
};

export const selectIsDragging = ({ state }) => {
  return state.isDragging;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectForbiddenIndices = ({ state }) => {
  return state.forbiddenIndices;
};

export const selectCollapsedIds = ({ state }) => {
  return state.collapsedIds;
};

export const toggleFolderExpand = (state, folderId) => {
  const currentIndex = state.collapsedIds.indexOf(folderId);

  if (currentIndex >= 0) {
    // Remove from collapsed list (expand)
    state.collapsedIds.splice(currentIndex, 1);
  } else {
    // Add to collapsed list (collapse)
    state.collapsedIds.push(folderId);
  }
};

export const showDropdownMenuFileExplorerItem = (
  state,
  { position, id, type, contextMenuItems },
) => {
  let items;
  if (contextMenuItems) {
    items = contextMenuItems;
  } else {
    items = type === "folder" ? CONTEXT_MENU_FOLDERS : CONTEXT_MENU_ITEMS;
  }

  state.dropdownMenu = {
    isOpen: true,
    position,
    itemId: id,
    items,
  };
};

export const showDropdownMenuFileExplorerEmpty = (
  state,
  { position, emptyContextMenuItems },
) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    itemId: null,
    items: emptyContextMenuItems || EMPTY_CONTEXT_MENU_ITEMS,
  };
};

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    itemId: null,
  };
};

export const selectDropdownMenuItemId = ({ state }) => {
  return state.dropdownMenu.itemId;
};

export const selectDropdownMenuPosition = ({ state }) => {
  return state.dropdownMenu.position;
};

export const showPopover = (state, { position, itemId }) => {
  state.popover = {
    isOpen: true,
    position,
    itemId,
  };
};

export const hidePopover = (state) => {
  state.popover = {
    isOpen: false,
    itemId: null,
    position: { x: 0, y: 0 },
  };
};

export const selectPopoverItem = ({ state, props }) => {
  if (!state.popover.itemId) return null;
  // Find the item from the props.items array
  const flatItems = props.items || [];
  return flatItems.find((item) => item.id === state.popover.itemId);
};

export const selectPopoverItemId = ({ state }) => {
  return state.popover.itemId;
};

export const selectViewData = ({ state, props, attrs }) => {
  let items = props.items || [];

  // Filter items based on collapsed state
  const visibleItems = items.filter((item) => {
    // Always show root level items
    if (item._level === 0) return true;

    // Check if any parent is collapsed
    let currentParentId = item.parentId;
    while (currentParentId) {
      if (state.collapsedIds.includes(currentParentId)) {
        return false; // Parent is collapsed, hide this item
      }
      // Find the parent's parent
      const parent = items.find((p) => p.id === currentParentId);
      currentParentId = parent?.parentId;
    }

    return true;
  });

  const targetDragItem = visibleItems[state.targetDragIndex];

  // Map items with additional UI properties
  const processedItems = visibleItems.map((item) => {
    const isCollapsed = state.collapsedIds.includes(item.id);
    const arrowIcon = item.hasChildren
      ? isCollapsed
        ? "folderArrowRight"
        : "folderArrowDown"
      : null;

    let bc = "tr";
    let hBgc = "mu";
    let bgc = "";
    if (
      state.targetDropPosition === "inside" &&
      item.id === targetDragItem?.id
    ) {
      bc = "fg";
    }

    if (state.isDragging) {
      hBgc = "";
    }

    if (item.id === state.selectedItemId) {
      bgc = "mu";
    }

    return {
      ...item,
      ml: item._level * 16,
      arrowIcon,
      bc,
      hBgc,
      bgc,
    };
  });

  // Calculate left offset for drag indicator bar
  let targetDragLeftOffset = 0;
  if (targetDragItem && state.targetDropPosition !== "inside") {
    // When dropping above an item, use that item's level
    // When dropping below an item, use that item's level
    targetDragLeftOffset = targetDragItem._level * 24;
  }

  // Get current item for rename form
  const currentItem = selectPopoverItem({ state, props });

  // Form configuration for renaming
  const renameForm = currentItem
    ? {
        fields: [
          {
            name: "name",
            inputType: "inputText",
            label: "Name",
            required: true,
          },
        ],
        actions: {
          layout: "",
          buttons: [
            {
              id: "submit",
              variant: "pr",
              content: "Rename",
            },
          ],
        },
      }
    : {
        fields: [],
      };

  const viewData = {
    ...state,
    items: processedItems,
    renameFormDefaultValues: {
      name: currentItem?.name,
    },
    targetDragIndex: state.targetDragIndex,
    targetDragPosition: state.targetDragPosition,
    targetDropPosition: state.targetDropPosition,
    targetDragLeftOffset,
    isDragging: state.isDragging,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
    attrs,
    noEmptyMessage: attrs["no-empty-message"],
    shrinkable: attrs.shrinkable,
  };

  return viewData;
};
