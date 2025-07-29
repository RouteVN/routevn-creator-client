import { toFlatGroups, toFlatItems } from "../../deps/repository";

const hexToRgb = (hex) => {
  if (!hex) return "";
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "";
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgb(${r}, ${g}, ${b})`;
};

const hexToBase64Image = (hex) => {
  if (!hex) return "";

  // Create a canvas element
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Set canvas size
  canvas.width = 100;
  canvas.height = 100;

  // Fill with the color
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 100, 100);

  // Convert to base64
  return canvas.toDataURL("image/png");
};

const form = {
  fields: [
    { name: "colorImage", inputType: "image" },
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "hex", inputType: "read-only-text", description: "Hex Value" },
    { name: "rgb", inputType: "read-only-text", description: "RGB Value" },
  ],
};

export const INITIAL_STATE = Object.freeze({
  colorsData: { tree: [], items: {} },
  selectedItemId: null,
  isEditDialogOpen: false,
  editItemId: null,
  isAddDialogOpen: false,
  targetGroupId: null,
});

export const setItems = (state, colorsData) => {
  state.colorsData = colorsData;
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
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.colorsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.colorsData);
  const flatGroups = toFlatGroups(state.colorsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  let currentForm = {
    fields: form.fields.map((field) => ({ ...field })),
  };
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      hex: selectedItem.hex || "",
      rgb: hexToRgb(selectedItem.hex) || "",
    };
    // Update the image field with src
    currentForm.fields[0].src = hexToBase64Image(selectedItem.hex);
  }

  // Get edit item details
  const editItem = state.editItemId
    ? flatItems.find((item) => item.id === state.editItemId)
    : null;

  let editDefaultValues = {};
  let editForm = {
    title: "Edit Color",
    description: "Edit the color",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the color name",
        required: true,
      },
      {
        name: "hex",
        inputType: "colorPicker",
        label: "Hex Value",
        description: "Enter the hex color value (e.g., #ff0000)",
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
    description: "Create a new color",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the color name",
        required: true,
      },
      {
        name: "hex",
        inputType: "colorPicker",
        label: "Hex Value",
        description: "Enter the hex color value (e.g., #ff0000)",
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

  const addDefaultValues = {
    name: "",
    hex: "#ff0000",
  };

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "colors",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "colors",
    form: currentForm,
    defaultValues,
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues,
    editForm,
    isAddDialogOpen: state.isAddDialogOpen,
    addDefaultValues,
    addForm,
  };
};
