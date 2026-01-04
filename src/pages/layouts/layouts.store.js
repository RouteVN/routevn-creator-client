import { toFlatGroups, toFlatItems } from "insieme";

const layoutForm = {
  title: "Add Layout",
  fields: [
    {
      name: "name",
      inputType: "inputText",
      label: "Layout Name",
      required: true,
    },
    {
      name: "layoutType",
      inputType: "select",
      label: "Layout Type",
      required: true,
      options: [
        { value: "normal", label: "Normal" },
        { value: "dialogue", label: "Dialogue" },
        { value: "choice", label: "Choice" },
        { value: "base", label: "Base" },
      ],
      tooltip: {
        content:
          "Normal is layout that can be used for background or menu pages. Dialogue is used for text dialogue layout. Choice is used for the choices. Base is a general purpose layout type.",
      },
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        content: "Add Layout",
      },
    ],
  },
};

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    {
      name: "layoutTypeDisplay",
      inputType: "read-only-text",
      description: "Layout Type",
    },
  ],
};

export const createInitialState = () => ({
  layoutsData: { tree: [], items: {} },
  selectedItemId: null,
  searchQuery: "",
  fieldResources: {},
  isAddDialogOpen: false,
  targetGroupId: null,
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

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const setItems = (state, layoutsData) => {
  state.layoutsData = layoutsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const openAddDialog = (state, groupId) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId;
};

export const closeAddDialog = (state) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = null;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.layoutsData);
  const rawFlatGroups = toFlatGroups(state.layoutsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    const layoutTypeLabels = {
      normal: "Normal",
      dialogue: "Dialogue",
      choice: "Choice",
      base: "Base",
    };

    const layoutTypeLabel = selectedItem.layoutType
      ? layoutTypeLabels[selectedItem.layoutType] || selectedItem.layoutType
      : "";

    defaultValues = {
      name: selectedItem.name,
      layoutTypeDisplay: layoutTypeLabel,
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
          return name.includes(searchQuery);
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

  // Apply selection styling (collapse state is now handled by groupResourcesView)
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    children: (group.children || []).map((item) => ({
      ...item,
      selectedStyle:
        item.id === state.selectedItemId
          ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
          : "",
    })),
  }));

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "layouts",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "layouts",
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    form,
    defaultValues,
    fieldResources: state.fieldResources,
    searchQuery: state.searchQuery,
    resourceType: "layouts",
    title: "Layouts",
    isAddDialogOpen: state.isAddDialogOpen,
    layoutForm: layoutForm,
    layoutFormDefaults: {
      name: "",
      layoutType: "dialogue",
    },
  };
};
