import { toFlatGroups, toFlatItems } from "../../deps/repository";

const typographyToBase64Image = (typography, colorsData, fontsData) => {
  if (!typography) return "";

  // Create a canvas element
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Set canvas size
  canvas.width = 300;
  canvas.height = 120;

  // Use dark mode colors as default
  const backgroundColor = "#1a1a1a"; // Dark background
  let textColor = "#ffffff"; // Default light text

  // Fill with background color
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, 300, 120);

  // Get color hex from colorId
  if (typography.colorId && colorsData) {
    const colorItems = toFlatItems(colorsData);
    const color = colorItems.find(
      (item) => item.type === "color" && item.id === typography.colorId,
    );
    if (color && color.hex) {
      textColor = color.hex;
    }
  }

  // Get font family from fontId
  let fontFamily = "sans-serif";
  if (typography.fontId && fontsData) {
    const fontItems = toFlatItems(fontsData);
    const font = fontItems.find(
      (item) => item.type === "font" && item.id === typography.fontId,
    );
    if (font && font.fontFamily) {
      fontFamily = font.fontFamily;
    }
  }

  // Set font properties
  const fontSize = typography.fontSize || 16;
  const fontWeight = typography.fontWeight || "400";
  const lineHeight = typography.lineHeight || 1.5;

  // Set text properties
  ctx.fillStyle = textColor;
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Draw text with line wrapping
  const text =
    typography.previewText || "The quick brown fox jumps over the lazy dog";
  const maxWidth = 280; // Leave some padding
  const x = 10;
  let y = 10;

  // Simple word wrapping
  const words = text.split(" ");
  let line = "";
  const lineHeightPx = fontSize * lineHeight;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeightPx;

      // Stop if we're running out of space
      if (y + lineHeightPx > 110) break;
    } else {
      line = testLine;
    }
  }

  // Draw the last line
  if (line.length > 0 && y + lineHeightPx <= 110) {
    ctx.fillText(line, x, y);
  }

  // Convert to base64
  return canvas.toDataURL("image/png");
};

export const INITIAL_STATE = Object.freeze({
  typographyData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  selectedItemId: null,

  // Dialog state
  isDialogOpen: false,
  targetGroupId: null,
  editMode: false,
  editingItemId: null,

  // Form values for preview
  currentFormValues: {
    name: "",
    fontColor: "",
    fontStyle: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    previewText: "The quick brown fox jumps over the lazy dog",
  },

  defaultValues: {
    name: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    previewText: "The quick brown fox jumps over the lazy dog",
  },
});

export const setItems = (state, typographyData) => {
  state.typographyData = typographyData;
};

export const setColorsData = (state, colorsData) => {
  state.colorsData = colorsData;
};

export const setFontsData = (state, fontsData) => {
  state.fontsData = fontsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

// Dialog management
export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

export const setEditMode = (state, itemId) => {
  state.editMode = true;
  state.editingItemId = itemId;
};

export const clearEditMode = (state) => {
  state.editMode = false;
  state.editingItemId = null;
};

export const updateFormValues = (state, formData) => {
  state.currentFormValues = { ...state.currentFormValues, ...formData };
};

export const resetFormValues = (state) => {
  state.currentFormValues = {
    name: "",
    fontColor: "",
    fontStyle: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    previewText: "The quick brown fox jumps over the lazy dog",
  };
};

export const setFormValuesFromItem = (state, item) => {
  state.currentFormValues = {
    name: item.name || "",
    fontColor: item.colorId || "",
    fontStyle: item.fontId || "",
    fontSize: item.fontSize || 16,
    lineHeight: item.lineHeight || 1.5,
    fontWeight: item.fontWeight || "400",
    previewText:
      item.previewText || "The quick brown fox jumps over the lazy dog",
  };
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.typographyData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.typographyData);
  const flatGroups = toFlatGroups(state.typographyData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Helper function to get color name from ID
  const getColorName = (colorId) => {
    if (!colorId) return "";
    const colorItems = toFlatItems(state.colorsData);
    const color = colorItems.find(
      (item) => item.type === "color" && item.id === colorId,
    );
    return color ? color.name : colorId;
  };

  // Helper function to get font name from ID
  const getFontName = (fontId) => {
    if (!fontId) return "";
    const fontItems = toFlatItems(state.fontsData);
    const font = fontItems.find(
      (item) => item.type === "font" && item.id === fontId,
    );
    return font ? font.fontFamily : fontId;
  };

  // Helper functions for dialog form
  const getColorHex = (colorId) => {
    if (!colorId) return "#000000";
    const color = toFlatItems(state.colorsData)
      .filter((item) => item.type === "color")
      .find((color) => color.id === colorId);
    return color ? color.hex : "#000000";
  };

  const getFontData = (fontId) => {
    if (!fontId) return { fontFamily: null, fileId: null };
    const font = toFlatItems(state.fontsData)
      .filter((item) => item.type === "font")
      .find((font) => font.id === fontId);
    return font
      ? { fontFamily: font.fontFamily, fileId: font.fileId }
      : { fontFamily: fontId, fileId: null };
  };

  // Generate color options for dialog form
  const colorOptions = state.colorsData
    ? toFlatItems(state.colorsData)
        .filter((item) => item.type === "color")
        .map((color) => ({
          id: color.id,
          label: color.name,
          value: color.id,
        }))
    : [];

  // Generate font options for dialog form
  const fontOptions = state.fontsData
    ? toFlatItems(state.fontsData)
        .filter((item) => item.type === "font")
        .map((font) => ({
          id: font.id,
          label: font.fontFamily,
          value: font.id,
        }))
    : [];

  // Get editing item data if in edit mode
  const editingItem =
    state.editMode && state.editingItemId
      ? flatGroups
          ?.flatMap((group) => group.children || [])
          .find((item) => item.id === state.editingItemId)
      : null;

  // Generate dynamic dialog form with dropdown options
  const dialogForm = {
    title: state.editMode ? "Edit Typography" : "Add Typography",
    description: state.editMode
      ? "Update typography style"
      : "Create a new typography style",
    fields: [
      {
        name: "name",
        inputType: "inputText",
        label: "Name",
        required: true,
      },
      {
        name: "fontColor",
        inputType: "select",
        label: "Color",
        placeholder: "Choose a color",
        options: colorOptions,
        required: true,
      },
      {
        name: "fontStyle",
        inputType: "select",
        label: "Font Style",
        placeholder: "Choose a font",
        options: fontOptions,
        required: true,
      },
      {
        name: "fontSize",
        inputType: "slider-input",
        label: "Font Size",
        min: 8,
        max: 72,
        step: 1,
        unit: "px",
        required: true,
      },
      {
        name: "lineHeight",
        inputType: "slider-input",
        label: "Line Height",
        min: 0.8,
        max: 3.0,
        step: 0.1,
        required: true,
      },
      {
        name: "fontWeight",
        inputType: "select",
        label: "Font Weight",
        placeholder: "Choose font weight",
        options: [
          { id: "100", label: "100 - Thin", value: "100" },
          { id: "200", label: "200 - Extra Light", value: "200" },
          { id: "300", label: "300 - Light", value: "300" },
          { id: "400", label: "400 - Normal", value: "400" },
          { id: "500", label: "500 - Medium", value: "500" },
          { id: "600", label: "600 - Semi Bold", value: "600" },
          { id: "700", label: "700 - Bold", value: "700" },
          { id: "800", label: "800 - Extra Bold", value: "800" },
          { id: "900", label: "900 - Black", value: "900" },
        ],
        required: true,
      },
      {
        name: "previewText",
        inputType: "inputText",
        label: "Preview Text",
        required: false,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: state.editMode ? "Update Typography" : "Add Typography",
        },
      ],
    },
  };

  // Set default values based on edit mode for dialog
  const dialogDefaultValues =
    state.editMode && editingItem
      ? {
          name: editingItem.name || "",
          fontColor: editingItem.colorId || "",
          fontStyle: editingItem.fontId || "",
          fontSize: editingItem.fontSize || 16,
          lineHeight: editingItem.lineHeight || 1.5,
          fontWeight: editingItem.fontWeight || "400",
          previewText:
            editingItem.previewText ||
            "The quick brown fox jumps over the lazy dog",
        }
      : state.defaultValues;

  // Get preview values based on current form values
  const getPreviewColor = () => {
    const colorId = state.currentFormValues.fontColor;
    return getColorHex(colorId);
  };

  const getPreviewFontData = () => {
    const fontId = state.currentFormValues.fontStyle;
    return getFontData(fontId);
  };

  const previewFontData = getPreviewFontData();

  let detailFormDefaultValues = {};
  let detailForm = {
    fields: [
      { name: "name", inputType: "popover-input", description: "Name" },
      {
        name: "fontSize",
        inputType: "read-only-text",
        description: "Font Size",
      },
      {
        name: "lineHeight",
        inputType: "read-only-text",
        description: "Line Height",
      },
      { name: "colorName", inputType: "read-only-text", description: "Color" },
      { name: "fontName", inputType: "read-only-text", description: "Font" },
      {
        name: "fontWeight",
        inputType: "read-only-text",
        description: "Font Weight",
      },
      {
        name: "previewText",
        inputType: "read-only-text",
        description: "Preview Text",
      },
    ],
  };

  if (selectedItem) {
    // Generate typography preview image
    const previewImage = typographyToBase64Image(
      selectedItem,
      state.colorsData,
      state.fontsData,
    );

    // Add preview image field to the form
    detailForm = {
      fields: [
        {
          name: "typographyPreview",
          inputType: "image",
          src: previewImage,
        },
        { name: "name", inputType: "popover-input", description: "Name" },
        {
          name: "fontSize",
          inputType: "read-only-text",
          description: "Font Size",
        },
        {
          name: "lineHeight",
          inputType: "read-only-text",
          description: "Line Height",
        },
        {
          name: "colorName",
          inputType: "read-only-text",
          description: "Color",
        },
        { name: "fontName", inputType: "read-only-text", description: "Font" },
        {
          name: "fontWeight",
          inputType: "read-only-text",
          description: "Font Weight",
        },
        {
          name: "previewText",
          inputType: "read-only-text",
          description: "Preview Text",
        },
      ],
    };

    detailFormDefaultValues = {
      name: selectedItem.name,
      fontSize: selectedItem.fontSize || "",
      lineHeight: selectedItem.lineHeight || "",
      colorName: getColorName(selectedItem.colorId),
      fontName: getFontName(selectedItem.fontId),
      fontWeight: selectedItem.fontWeight || "",
      previewText: selectedItem.previewText || "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "typography",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "typography",
    colorsData: state.colorsData,
    fontsData: state.fontsData,
    form: detailForm,
    defaultValues: detailFormDefaultValues,

    // Dialog-related data
    isDialogOpen: state.isDialogOpen,
    dialogForm: dialogForm,
    dialogDefaultValues: dialogDefaultValues,
    formKey: state.editMode ? `edit-${state.editingItemId}` : "add-typography",

    // Preview values for dialog
    previewText:
      state.currentFormValues.previewText ||
      "The quick brown fox jumps over the lazy dog",
    previewFontSize: state.currentFormValues.fontSize || 16,
    previewLineHeight: state.currentFormValues.lineHeight || 1.5,
    previewFontWeight: state.currentFormValues.fontWeight || "400",
    previewColor: getPreviewColor(),
    previewFontFamily: previewFontData.fontFamily,
    previewFontFileId: previewFontData.fileId,
  };
};
