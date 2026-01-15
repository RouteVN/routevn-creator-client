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
    { name: "colorImage", inputType: "image", src: "${colorImage.src}" },
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "hex", inputType: "read-only-text", description: "Hex Value" },
    { name: "rgb", inputType: "read-only-text", description: "RGB Value" },
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
  deleteWarningVisible: false,
  deleteWarningItemId: null,
  deleteWarningUsage: null,
});

export const setItems = (state, colorsData) => {
  state.colorsData = colorsData;
};

export const setContext = (state, context) => {
  state.context = context;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const openEditDialog = (state, itemId) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
};

export const closeEditDialog = (state) => {
  state.isEditDialogOpen = false;
  state.editItemId = null;
};

export const openAddDialog = (state, groupId) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId;
};

export const closeAddDialog = (state) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = null;
  state.addDefaultValues = {
    name: "",
    hex: "#ffffff",
  };
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const showDeleteWarning = (state, { itemId, usage }) => {
  state.deleteWarningVisible = true;
  state.deleteWarningItemId = itemId;
  state.deleteWarningUsage = usage;
};

export const hideDeleteWarning = (state) => {
  state.deleteWarningVisible = false;
  state.deleteWarningItemId = undefined;
  state.deleteWarningUsage = null;
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
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      hex: selectedItem.hex || "",
      rgb: hexToRgb(selectedItem.hex) || "",
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
        inputType: "inputText",
        label: "Name",
        required: true,
      },
      {
        name: "hex",
        inputType: "colorPicker",
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
          content: "Update Color",
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
        inputType: "inputText",
        label: "Color Name",
        required: true,
      },
      {
        name: "hex",
        inputType: "colorPicker",
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
          content: "Add Color",
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
    context: state.context,
    defaultValues,
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues,
    editForm,
    isAddDialogOpen: state.isAddDialogOpen,
    addDefaultValues: state.addDefaultValues,
    addForm,
    searchQuery: state.searchQuery,
    resourceType: "colors",
    deleteWarningVisible: state.deleteWarningVisible,
    deleteWarningItemId: state.deleteWarningItemId,
    deleteWarningUsage: state.deleteWarningUsage,
  };
};
