import { toFlatGroups, toFlatItems } from "insieme";

const hexToRgb = (hex) => {
  if (!hex) return "";
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "";
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgb(${r}, ${g}, ${b})`;
};

const form = {
  fields: [
    { name: "colorImage", type: "image", src: "${colorImage.src}" },
    { name: "name", type: "popover-input", label: "Name" },
    {
      name: "hex",
      type: "read-only-text",
      label: "Hex Value",
      content: "${hex}",
    },
    {
      name: "rgb",
      type: "read-only-text",
      label: "RGB Value",
      content: "${rgb}",
    },
  ],
};

export const createInitialState = () => ({
  colorsData: { tree: [], items: {} },
  selectedItemId: null,
  isEditDialogOpen: false,
  editItemId: null,
  isAddDialogOpen: false,
  targetGroupId: null,
  searchQuery: "",
  collapsedIds: [],
  context: {
    colorImage: {
      src: "",
    },
  },
  addDefaultValues: {
    name: "",
    hex: "#ffffff",
  },
  contextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Duplicate", type: "item", value: "duplicate-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
  ],
});

export const setItems = ({ state }, { colorsData } = {}) => {
  state.colorsData = colorsData;
};

export const setContext = ({ state }, { context } = {}) => {
  state.context = context;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const openEditDialog = ({ state }, { itemId } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = null;
};

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId;
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = null;
  state.addDefaultValues = {
    name: "",
    hex: "#ffffff",
  };
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const toggleGroupCollapse = ({ state }, { groupId } = {}) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.colorsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.colorsData);
  const rawFlatGroups = toFlatGroups(state.colorsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  let formContext = {
    ...state.context,
    hex: "",
    rgb: "",
  };
  if (selectedItem) {
    const hex = selectedItem.hex ?? "";
    const rgb = hexToRgb(hex);
    defaultValues = {
      name: selectedItem.name,
      hex,
      rgb,
    };
    formContext = {
      ...state.context,
      hex,
      rgb,
    };
  }

  // Apply search filter
  const searchQuery = state.searchQuery.toLowerCase().trim();
  let filteredGroups = rawFlatGroups;

  if (searchQuery) {
    filteredGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children || []).filter((item) => {
          const name = (item.name || "").toLowerCase();
          const hex = (item.hex || "").toLowerCase();
          return name.includes(searchQuery) || hex.includes(searchQuery);
        });

        const groupName = (group.name || "").toLowerCase();
        const shouldIncludeGroup =
          filteredChildren.length > 0 || groupName.includes(searchQuery);

        return shouldIncludeGroup
          ? {
              ...group,
              children: filteredChildren,
              hasChildren: filteredChildren.length > 0,
            }
          : null;
      })
      .filter(Boolean);
  }

  // Apply collapsed state and selection styling
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id)
      ? []
      : (group.children || []).map((item) => ({
          ...item,
          selectedStyle:
            item.id === state.selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
  }));

  // Get edit item details
  const editItem = state.editItemId
    ? flatItems.find((item) => item.id === state.editItemId)
    : null;

  let editDefaultValues = {};
  let editForm = {
    title: "Edit Color",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "hex",
        type: "color-picker",
        label: "Hex Value",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Update Color",
        },
      ],
    },
  };

  if (editItem) {
    editDefaultValues = {
      name: editItem.name,
      hex: editItem.hex || "",
    };
  }

  // Add form configuration
  const addForm = {
    title: "Add Color",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Color Name",
        required: true,
      },
      {
        name: "hex",
        type: "color-picker",
        label: "Hex Value",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Add Color",
        },
      ],
    },
  };

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "colors",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "colors",
    title: "Colors",
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    form,
    context: formContext,
    defaultValues,
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues,
    editForm,
    isAddDialogOpen: state.isAddDialogOpen,
    addDefaultValues: state.addDefaultValues,
    addForm,
    searchQuery: state.searchQuery,
    resourceType: "colors",
  };
};
