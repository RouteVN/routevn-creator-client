import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "x", inputType: "read-only-text", description: "Position X" },
    { name: "y", inputType: "read-only-text", description: "Position Y" },
    { name: "scaleX", inputType: "read-only-text", description: "Scale X" },
    { name: "scaleY", inputType: "read-only-text", description: "Scale Y" },
    { name: "anchorX", inputType: "read-only-text", description: "Anchor X" },
    { name: "anchorY", inputType: "read-only-text", description: "Anchor Y" },
    { name: "rotation", inputType: "read-only-text", description: "Rotation" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  transformData: { tree: [], items: {} },
  selectedItemId: null,
  searchQuery: "",
  collapsedIds: [],
  contextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Duplicate", type: "item", value: "duplicate-item" },
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
    anchor: { anchorX: 0.5, anchorY: 0.5 },
    rotation: "0",
  },
  transformForm: {
    title: "Add Transform",
    description: "Create a new transform configuration",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the transform name",
        required: true,
      },
      {
        name: "x",
        inputType: "slider-input",
        min: 0,
        max: 1920,
        step: 1,
        label: "Position X",
        description: "Enter the X coordinate (e.g., 100, 50%)",
        required: true,
      },
      {
        name: "y",
        inputType: "slider-input",
        min: 0,
        max: 1080,
        step: 1,
        label: "Position Y",
        description: "Enter the Y coordinate (e.g., 200, 25%)",
        required: true,
      },
      {
        name: "scaleX",
        inputType: "slider-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: "Scale X",
        description: "Enter the scale factor (e.g., 1, 0.5, 2)",
        required: true,
      },
      {
        name: "scaleY",
        inputType: "slider-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: "Scale Y",
        description: "Enter the scale factor (e.g., 1, 0.5, 2)",
        required: true,
      },
      {
        name: "anchor",
        inputType: "select",
        label: "Anchor",
        description:
          "Enter the anchor point (e.g., center, top-left, bottom-right)",
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
      {
        name: "rotation",
        inputType: "slider-input",
        min: -360,
        max: 360,
        step: 1,
        label: "Rotation",
        description: "Enter the rotation in degrees (e.g., 0, 45, 180)",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Add Transform",
        },
      ],
    },
  },
});

export const setItems = (state, transformData) => {
  state.transformData = transformData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
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

// Transform dialog management (moved from groupTransformsView)
export const openTransformFormDialog = (state, options = {}) => {
  const {
    editMode = false,
    itemId = null,
    itemData = null,
    targetGroupId = null,
  } = options;

  // Set edit mode and update form accordingly
  state.editMode = editMode;
  state.editItemId = itemId;
  state.targetGroupId = targetGroupId;

  // Update form based on edit mode
  if (editMode) {
    state.transformForm.title = "Edit Transform";
    state.transformForm.description = "Edit the transform configuration";
    state.transformForm.actions.buttons[0].content = "Update Transform";
  } else {
    state.transformForm.title = "Add Transform";
    state.transformForm.description = "Create a new transform configuration";
    state.transformForm.actions.buttons[0].content = "Add Transform";
  }

  // Set default values based on item data
  if (itemData) {
    state.defaultValues = {
      name: itemData.name || "",
      x: String(itemData.x || "0"),
      y: String(itemData.y || "0"),
      scaleX: String(itemData.scaleX || "1"),
      scaleY: String(itemData.scaleY || "1"),
      anchor: { anchorX: itemData.anchorX, anchorY: itemData.anchorY },
      rotation: String(itemData.rotation || "0"),
    };
  } else {
    state.defaultValues = {
      name: "",
      x: "0",
      y: "0",
      scaleX: "1",
      scaleY: "1",
      anchor: { anchorX: 0.5, anchorY: 0.5 },
      rotation: "0",
    };
  }

  // Open dialog
  state.isDialogOpen = true;
};

export const closeTransformFormDialog = (state) => {
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
    anchor: { anchorX: 0.5, anchorY: 0.5 },
    rotation: "0",
  };

  // Reset form to add mode
  state.transformForm.title = "Add Transform";
  state.transformForm.description = "Create a new transform configuration";
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

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.transformData);
  const rawFlatGroups = toFlatGroups(state.transformData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      x: selectedItem.x || "",
      y: selectedItem.y || "",
      scaleX: selectedItem.scaleX || "",
      scaleY: selectedItem.scaleY || "",
      anchorX: selectedItem.anchorX || "",
      anchorY: selectedItem.anchorY || "",
      rotation: selectedItem.rotation || "",
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
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    form,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "transforms",
    searchPlaceholder: "Search transforms...",
    // Dialog state for transforms (moved from groupTransformsView)
    isDialogOpen: state.isDialogOpen,
    editMode: state.editMode,
    editItemId: state.editItemId,
    transformForm: state.transformForm,
    dialogDefaultValues: state.defaultValues,
    items,
  };
};
