import { toFlatGroups, toFlatItems } from "../../domain/treeHelpers.js";

const layoutForm = {
  title: "Add Layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Layout Name",
      required: true,
    },
    {
      name: "layoutType",
      type: "select",
      label: "Layout Type",
      required: true,
      options: [
        { value: "normal", label: "Normal" },
        { value: "dialogue", label: "Dialogue" },
        { value: "nvl", label: "NVL" },
        { value: "choice", label: "Choice" },
        { value: "base", label: "Base" },
      ],
      tooltip: {
        content:
          "Normal is layout that can be used for background or menu pages. Dialogue is used for ADV mode text dialogue layout. NVL is used for novel mode accumulated dialogue layout. Choice is used for the choices. Base is a general purpose layout type.",
      },
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Layout",
      },
    ],
  },
};

export const createInitialState = () => ({
  layoutsData: { tree: [], items: {} },
  selectedItemId: null,
  searchQuery: "",
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

export const setItems = ({ state }, { layoutsData } = {}) => {
  state.layoutsData = layoutsData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId;
};

export const closeAddDialog = ({ state }, _payload = {}) => {
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
    : undefined;

  const layoutTypeLabels = {
    normal: "Normal",
    dialogue: "Dialogue",
    nvl: "NVL",
    choice: "Choice",
    base: "Base",
  };
  const selectedLayoutTypeLabel = selectedItem?.layoutType
    ? (layoutTypeLabels[selectedItem.layoutType] ?? selectedItem.layoutType)
    : "";
  const detailFields = selectedItem
    ? [
        {
          type: "text",
          label: "Layout Type",
          value: selectedLayoutTypeLabel,
        },
      ]
    : [];

  // Apply search filter
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  let filteredGroups = rawFlatGroups;

  if (searchQuery) {
    filteredGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children ?? []).filter((item) => {
          const name = (item.name ?? "").toLowerCase();
          return name.includes(searchQuery);
        });

        const groupName = (group.name ?? "").toLowerCase();
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
    children: (group.children ?? []).map((item) => ({
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
    selectedItemName: selectedItem?.name ?? "",
    detailFields,
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
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
