import { toFlatGroups, toFlatItems } from "../../domain/treeHelpers.js";

export const createInitialState = () => ({
  transformData: { tree: [], items: {} },
  selectedItemId: null,
  searchQuery: "",
  collapsedIds: [],
  contextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
  ],
  // Transform dialog state (moved from groupTransformsView)
  isDialogOpen: false,
  targetGroupId: null,
  editMode: false,
  editItemId: null,
  defaultValues: {
    name: "",
    x: "0",
    y: "0",
    scaleX: "1",
    scaleY: "1",
    anchor: { anchorX: 0, anchorY: 0 },
    rotation: "0",
  },
  transformForm: {
    title: "Add Transform",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "x",
        type: "slider-with-input",
        min: 0,
        max: 1920,
        step: 1,
        label: "Position X",
        required: true,
      },
      {
        name: "y",
        type: "slider-with-input",
        min: 0,
        max: 1080,
        step: 1,
        label: "Position Y",
        required: true,
      },
      {
        name: "scaleX",
        type: "slider-with-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: "Scale X",
        required: true,
      },
      {
        name: "scaleY",
        type: "slider-with-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: "Scale Y",
        required: true,
      },
      {
        name: "anchor",
        type: "select",
        label: "Anchor",
        placeholder: "Choose a anchor",
        options: [
          { id: "tl", label: "Top Left", value: { anchorX: 0, anchorY: 0 } },
          {
            id: "tc",
            label: "Top Center",
            value: { anchorX: 0.5, anchorY: 0 },
          },
          { id: "tr", label: "Top Right", value: { anchorX: 1, anchorY: 0 } },
          {
            id: "cl",
            label: "Center Left",
            value: { anchorX: 0, anchorY: 0.5 },
          },
          {
            id: "cc",
            label: "Center Center",
            value: { anchorX: 0.5, anchorY: 0.5 },
          },
          {
            id: "cr",
            label: "Center Right",
            value: { anchorX: 1, anchorY: 0.5 },
          },
          { id: "bl", label: "Bottom Left", value: { anchorX: 0, anchorY: 1 } },
          {
            id: "bc",
            label: "Bottom Center",
            value: { anchorX: 0.5, anchorY: 1 },
          },
          {
            id: "br",
            label: "Bottom Right",
            value: { anchorX: 1, anchorY: 1 },
          },
        ],
        required: true,
      },
      // {
      //   name: "rotation",
      //   type: "slider-input",
      //   min: -360,
      //   max: 360,
      //   step: 1,
      //   label: "Rotation",
      //   tooltip: {
      //     content: "In degrees. 360 is a full rotation",
      //   },
      //   required: true,
      // },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Add Transform",
        },
      ],
    },
  },
});

export const setItems = ({ state }, { transformData } = {}) => {
  state.transformData = transformData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
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

// Transform dialog management (moved from groupTransformsView)
export const openTransformFormDialog = ({ state }, options = {}) => {
  const {
    editMode = false,
    itemId = undefined,
    itemData = undefined,
    targetGroupId = undefined,
  } = options;

  // Set edit mode and update form accordingly
  state.editMode = editMode;
  state.editItemId = itemId;
  state.targetGroupId = targetGroupId;

  // Update form based on edit mode
  if (editMode) {
    state.transformForm.title = "Edit Transform";
    state.transformForm.actions.buttons[0].content = "Update Transform";
  } else {
    state.transformForm.title = "Add Transform";
    state.transformForm.actions.buttons[0].content = "Add Transform";
  }

  // Set default values based on item data
  if (itemData) {
    state.defaultValues = {
      name: itemData.name ?? "",
      x: String(itemData.x ?? "0"),
      y: String(itemData.y ?? "0"),
      scaleX: String(itemData.scaleX ?? "1"),
      scaleY: String(itemData.scaleY ?? "1"),
      anchor: { anchorX: itemData.anchorX, anchorY: itemData.anchorY },
      //rotation: String(itemData.rotation || "0"),
    };
  } else {
    state.defaultValues = {
      name: "",
      x: "0",
      y: "0",
      scaleX: "1",
      scaleY: "1",
      anchor: { anchorX: 0, anchorY: 0 },
      //rotation: "0",
    };
  }

  // Open dialog
  state.isDialogOpen = true;
};

export const closeTransformFormDialog = ({ state }, _payload = {}) => {
  // Close dialog
  state.isDialogOpen = false;

  // Reset all form state
  state.editMode = false;
  state.editItemId = null;
  state.targetGroupId = null;

  // Reset default values
  state.defaultValues = {
    name: "",
    x: "0",
    y: "0",
    scaleX: "1",
    scaleY: "1",
    anchor: { anchorX: 0, anchorY: 0 },
    //rotation: "0",
  };

  // Reset form to add mode
  state.transformForm.title = "Add Transform";
  state.transformForm.actions.buttons[0].content = "Add Transform";
};

export const selectTargetGroupId = ({ state }) => {
  return state.targetGroupId;
};

export const selectEditMode = ({ state }) => {
  return state.editMode;
};

export const selectEditItemId = ({ state }) => {
  return state.editItemId;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toFlatItems(state.transformData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.transformData);
  const rawFlatGroups = toFlatGroups(state.transformData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;

  const detailFields = selectedItem
    ? [
        {
          type: "slot",
          slot: "transform-preview",
          label: "",
        },
        {
          type: "text",
          label: "Position X",
          value: String(selectedItem.x ?? 0),
        },
        {
          type: "text",
          label: "Position Y",
          value: String(selectedItem.y ?? 0),
        },
        {
          type: "text",
          label: "Scale X",
          value: String(selectedItem.scaleX ?? 1),
        },
        {
          type: "text",
          label: "Scale Y",
          value: String(selectedItem.scaleY ?? 1),
        },
        {
          type: "text",
          label: "Anchor X",
          value: String(selectedItem.anchorX ?? 0),
        },
        {
          type: "text",
          label: "Anchor Y",
          value: String(selectedItem.anchorY ?? 0),
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

  // Apply collapsed state and selection styling
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id)
      ? []
      : (group.children ?? []).map((item) => ({
          ...item,
          selectedStyle:
            item.id === state.selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
  }));

  // TODO this is hacky way to work around limitation of passing props
  const items = {};
  flatGroups.forEach((group) => {
    group.children.forEach((child) => {
      items[child.id] = child;
    });
  });

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "transforms",
    repositoryTarget: "transforms",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields,
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    searchQuery: state.searchQuery,
    resourceType: "transforms",
    title: "Transforms",
    // Dialog state for transforms (moved from groupTransformsView)
    isDialogOpen: state.isDialogOpen,
    editMode: state.editMode,
    editItemId: state.editItemId,
    transformForm: state.transformForm,
    dialogDefaultValues: state.defaultValues,
    items,
    selectedItem,
  };
};
