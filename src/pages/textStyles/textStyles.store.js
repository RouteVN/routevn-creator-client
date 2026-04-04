import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";

// Helper function to create add color form
const createAddColorForm = (colorFolderOptions) => ({
  title: "Add New Color",
  description: "Create a new color for text styles",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Color Name",
      description: "Enter the color name",
      required: true,
    },
    {
      name: "hex",
      type: "color-picker",
      label: "Hex Value",
      description: "Choose or enter a hex color value",
      required: true,
    },
    {
      name: "folderId",
      type: "select",
      label: "Folder",
      description: "Choose where to save the color",
      options: colorFolderOptions,
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
});

// Helper function to create add font form
const createAddFontForm = (fontFolderOptions) => ({
  title: "Add New Font",
  description: "Upload a new font for text styles",
  fields: [
    {
      name: "folderId",
      type: "select",
      label: "Folder",
      description: "Choose where to save the font",
      options: fontFolderOptions,
      required: true,
    },
    {
      slot: "font-upload",
      type: "slot",
      label: "Font File",
      description: "Click or drag and drop a font file here",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Font",
      },
    ],
  },
});

const getPreviewTextValue = ({ previewText, name } = {}) => {
  if (typeof previewText === "string" && previewText.trim().length > 0) {
    return previewText;
  }

  return name ?? "";
};

export const createInitialState = () => ({
  textStylesData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  selectedItemId: undefined,
  searchQuery: "",

  // Dialog state
  isDialogOpen: false,
  targetGroupId: undefined,
  editMode: false,
  editingItemId: undefined,

  // Add color dialog state
  isAddColorDialogOpen: false,
  newColorData: {
    name: "",
    hex: "#ff0000",
    folderId: "_root",
  },

  // Add font dialog state
  isAddFontDialogOpen: false,
  selectedFontFile: undefined,
  hasSelectedFont: false,
  selectedFontFileName: "",
  dragDropText: "Click or drag font file here",
  newFontData: {
    folderId: "_root",
  },

  // Form values for preview
  currentFormValues: {
    name: "",
    fontColor: "",
    strokeColor: "",
    fontStyle: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    strokeWidth: 0,
    previewText: "",
  },

  defaultValues: {
    name: "",
    fontColor: "",
    strokeColor: "",
    fontStyle: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    strokeWidth: 0,
    previewText: "",
  },

  folderContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  itemContextMenuItems: [
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Duplicate", type: "item", value: "duplicate-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  centerItemContextMenuItems: [
    { label: "Duplicate", type: "item", value: "duplicate-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
  ],
});

export const setItems = ({ state }, { textStylesData } = {}) => {
  state.textStylesData = textStylesData;
};

export const setColorsData = ({ state }, { colorsData } = {}) => {
  state.colorsData = colorsData;
};

export const setFontsData = ({ state }, { fontsData } = {}) => {
  state.fontsData = fontsData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

// Dialog management
export const toggleDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = !state.isDialogOpen;
};

export const setTargetGroupId = ({ state }, { groupId } = {}) => {
  state.targetGroupId = groupId;
};

export const setEditMode = ({ state }, { itemId } = {}) => {
  state.editMode = true;
  state.editingItemId = itemId;
};

export const clearEditMode = ({ state }, _payload = {}) => {
  state.editMode = false;
  state.editingItemId = undefined;
};

export const updateFormValues = ({ state }, { formData } = {}) => {
  const newValues = { ...state.currentFormValues, ...formData };
  if (newValues.previewText == null) {
    newValues.previewText = "";
  }
  state.currentFormValues = newValues;
};

export const resetFormValues = ({ state }, _payload = {}) => {
  state.currentFormValues = {
    name: "",
    fontColor: "",
    strokeColor: "",
    fontStyle: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    strokeWidth: 0,
    previewText: "",
  };
};

export const setFormValuesFromItem = ({ state }, { item } = {}) => {
  if (!item) {
    throw new Error("Item is required for setFormValuesFromItem");
  }
  state.currentFormValues = {
    name: item.name || "",
    fontColor: item.colorId || "",
    strokeColor: item.strokeColorId || "",
    fontStyle: item.fontId || "",
    fontSize: item.fontSize,
    lineHeight: item.lineHeight,
    fontWeight: item.fontWeight,
    strokeWidth: item.strokeWidth ?? 0,
    previewText: item.previewText || "",
  };
};

// Add color dialog management
export const openAddColorDialog = ({ state }, _payload = {}) => {
  state.isAddColorDialogOpen = true;
};

export const closeAddColorDialog = ({ state }, _payload = {}) => {
  state.isAddColorDialogOpen = false;
  state.newColorData = {
    name: "",
    hex: "#ff0000",
    folderId: "_root",
  };
};

export const updateNewColorData = ({ state }, { data } = {}) => {
  state.newColorData = { ...state.newColorData, ...data };
};

// Add font dialog management
export const openAddFontDialog = ({ state }, _payload = {}) => {
  state.isAddFontDialogOpen = true;
};

export const closeAddFontDialog = ({ state }, _payload = {}) => {
  state.isAddFontDialogOpen = false;
  state.selectedFontFile = undefined;
  state.hasSelectedFont = false;
  state.selectedFontFileName = "";
  state.dragDropText = "Click or drag font file here";
  state.newFontData = {
    folderId: "_root",
  };
};

export const updateNewFontData = ({ state }, { data } = {}) => {
  state.newFontData = { ...state.newFontData, ...data };
};

export const setSelectedFontFile = ({ state }, { data } = {}) => {
  state.selectedFontFile = data.file;
  state.hasSelectedFont = true;
  state.selectedFontFileName = data.fileName;
  state.selectedFontUploadResult = data.uploadResult;
  state.dragDropText = "Replace font file";
};

export const clearSelectedFontFile = ({ state }, _payload = {}) => {
  state.selectedFontFile = undefined;
  state.hasSelectedFont = false;
  state.selectedFontFileName = "";
  state.selectedFontUploadResult = undefined;
  state.dragDropText = "Drop font file here or click to browse";
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return undefined;
  const flatItems = toFlatItems(state.textStylesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectItemById = ({ state }, itemId) => {
  const flatItems = toFlatItems(state.textStylesData);
  return flatItems.find((item) => item.id === itemId);
};

export const selectColorsData = ({ state }) => state.colorsData;

export const selectFontsData = ({ state }) => state.fontsData;

export const selectTypographyData = ({ state }) => state.textStylesData;

export const selectDialogState = ({ state }) => ({
  targetGroupId: state.targetGroupId,
  editMode: state.editMode,
  editingItemId: state.editingItemId,
});

export const selectSelectedFontFile = ({ state }) => state.selectedFontFile;

export const selectSelectedFontData = ({ state }) => ({
  file: state.selectedFontFile,
  fileName: state.selectedFontFileName,
  uploadResult: state.selectedFontUploadResult,
});

export const selectViewData = ({ state }) => {
  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.textStylesData),
  );
  const rawFlatGroups = toFlatGroups(state.textStylesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;

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
          : undefined;
      })
      .filter(Boolean);
  }

  // Helper function to get color hex from ID
  const getColorHex = (colorId) => {
    if (!colorId) return "#000000";
    const colorItems = toFlatItems(state.colorsData);
    const color = colorItems.find(
      (item) => item.type === "color" && item.id === colorId,
    );
    return color ? color.hex : "#000000";
  };

  // Helper function to get font data from ID
  const getFontData = (fontId) => {
    if (!fontId) return { fontFamily: undefined, fileId: undefined };
    const fontItems = toFlatItems(state.fontsData);
    const font = fontItems.find(
      (item) => item.type === "font" && item.id === fontId,
    );
    return font
      ? { fontFamily: font.fontFamily, fileId: font.fileId }
      : { fontFamily: fontId, fileId: undefined };
  };

  // Add text style preview data. Collapse state is owned by the center view.
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    children: (group.children ?? []).map((item) => {
      const fontData = getFontData(item.fontId);
      return {
        ...item,
        fontStyle: fontData.fontFamily,
        fontFileId: fontData.fileId,
        color: getColorHex(item.colorId),
        strokeColor: item.strokeColorId ? getColorHex(item.strokeColorId) : "",
        strokeWidth: item.strokeColorId ? (item.strokeWidth ?? 0) : 0,
        previewText: getPreviewTextValue(item),
        selectedStyle:
          item.id === state.selectedItemId
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
      };
    }),
  }));

  // Helper function to get color name from ID
  const getColorName = (colorId) => {
    if (!colorId) return "";
    const colorItems = toFlatItems(state.colorsData);
    const color = colorItems.find(
      (item) => item.type === "color" && item.id === colorId,
    );
    if (!color) return "";
    return color.name ?? "";
  };

  // Helper function to get font name from ID
  const getFontName = (fontId) => {
    if (!fontId) return "";
    const fontItems = toFlatItems(state.fontsData);
    const font = fontItems.find(
      (item) => item.type === "font" && item.id === fontId,
    );
    if (!font) return "";
    return font.fontFamily ?? "";
  };

  const detailPreviewFontData = selectedItem
    ? getFontData(selectedItem.fontId)
    : { fontFamily: undefined, fileId: undefined };

  const detailFields = selectedItem
    ? [
        {
          type: "slot",
          slot: "text-style-preview",
          label: "",
        },
        {
          type: "text",
          label: "Font Size",
          value: String(selectedItem.fontSize ?? ""),
        },
        {
          type: "text",
          label: "Line Height",
          value: String(selectedItem.lineHeight ?? ""),
        },
        {
          type: "text",
          label: "Color",
          value: selectedItem.colorId ? getColorName(selectedItem.colorId) : "",
        },
        {
          type: "text",
          label: "Outline Color",
          value: selectedItem.strokeColorId
            ? getColorName(selectedItem.strokeColorId)
            : "",
        },
        {
          type: "text",
          label: "Font",
          value: selectedItem.fontId ? getFontName(selectedItem.fontId) : "",
        },
        {
          type: "text",
          label: "Font Weight",
          value: String(selectedItem.fontWeight ?? ""),
        },
        {
          type: "text",
          label: "Outline Thickness",
          value: String(
            selectedItem.strokeColorId ? (selectedItem.strokeWidth ?? 0) : 0,
          ),
        },
        {
          type: "text",
          label: "Preview Text",
          value: selectedItem.previewText ?? "",
        },
      ]
    : [];

  // Generate color options for dialog form
  const colorOptions = state.colorsData
    ? toFlatItems(state.colorsData)
        .filter((item) => item.type === "color")
        .map((color) => ({
          label: color.name,
          value: color.id,
        }))
    : [];

  // Generate font options for dialog form
  const fontOptions = state.fontsData
    ? toFlatItems(state.fontsData)
        .filter((item) => item.type === "font")
        .map((font) => ({
          label: font.fontFamily,
          value: font.id,
        }))
    : [];

  // Generate folder options for add color dialog
  const colorFolderOptions = [
    { value: "_root", label: "Root Folder" },
    ...toFlatItems(state.colorsData)
      .filter((item) => item.type === "folder")
      .map((folder) => ({
        value: folder.id,
        label: folder.name || folder.id,
      })),
  ];

  // Generate folder options for add font dialog
  const fontFolderOptions = [
    { value: "_root", label: "Root Folder" },
    ...toFlatItems(state.fontsData)
      .filter((item) => item.type === "folder")
      .map((folder) => ({
        value: folder.id,
        label: folder.name || folder.id,
      })),
  ];

  // Get editing item data if in edit mode
  const editingItem =
    state.editMode && state.editingItemId
      ? flatGroups
          ?.flatMap((group) => group.children || [])
          .find((item) => item.id === state.editingItemId)
      : undefined;

  // Generate dynamic dialog form with dropdown options
  const dialogForm = {
    title: state.editMode ? "Edit Typography" : "Add Typography",
    description: state.editMode
      ? "Update text style"
      : "Create a new text style",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "fontColor",
        type: "select",
        label: "Color",
        placeholder: "Choose a color",
        options: colorOptions,
        addOption: { label: "Add new color" },
        required: true,
      },
      {
        name: "strokeColor",
        type: "select",
        label: "Outline Color",
        placeholder: "Choose an outline color",
        options: colorOptions,
        addOption: { label: "Add new color" },
        required: false,
      },
      {
        name: "strokeWidth",
        type: "slider-with-input",
        label: "Outline Thickness",
        min: 0,
        max: 12,
        step: 0.5,
        unit: "px",
        required: false,
      },
      {
        name: "fontStyle",
        type: "select",
        label: "Font Style",
        placeholder: "Choose a font",
        options: fontOptions,
        addOption: { label: "Add new font" },
        required: true,
      },
      {
        name: "fontSize",
        type: "slider-with-input",
        label: "Font Size",
        min: 8,
        max: 72,
        step: 1,
        unit: "px",
        required: true,
      },
      {
        name: "lineHeight",
        type: "slider-with-input",
        label: "Line Height",
        min: 0.8,
        max: 3.0,
        step: 0.1,
        required: true,
      },
      {
        name: "fontWeight",
        type: "select",
        label: "Font Weight",
        placeholder: "Choose font weight",
        options: [
          { label: "100 - Thin", value: "100" },
          { label: "200 - Extra Light", value: "200" },
          { label: "300 - Light", value: "300" },
          { label: "400 - Normal", value: "400" },
          { label: "500 - Medium", value: "500" },
          { label: "600 - Semi Bold", value: "600" },
          { label: "700 - Bold", value: "700" },
          { label: "800 - Extra Bold", value: "800" },
          { label: "900 - Black", value: "900" },
        ],
        required: true,
      },
      {
        name: "previewText",
        type: "input-text",
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
          label: state.editMode ? "Update Typography" : "Add Typography",
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
          strokeColor: editingItem.strokeColorId || "",
          fontStyle: editingItem.fontId || "",
          fontSize: editingItem.fontSize,
          lineHeight: editingItem.lineHeight,
          fontWeight: editingItem.fontWeight,
          strokeWidth: editingItem.strokeWidth ?? 0,
          previewText: editingItem.previewText ?? "",
        }
      : state.defaultValues;

  // Add color dialog form
  const addColorForm = createAddColorForm(colorFolderOptions);

  // Add font dialog form
  const addFontForm = createAddFontForm(fontFolderOptions);

  // Get preview values based on current form values
  const getPreviewColor = () => {
    const colorId = state.currentFormValues.fontColor;
    if (!colorId) return undefined;
    try {
      return getColorHex(colorId);
    } catch (error) {
      console.error("Failed to get preview color:", error);
      return undefined;
    }
  };

  const getPreviewFontData = () => {
    const fontId = state.currentFormValues.fontStyle;
    if (!fontId) return { fontFamily: undefined, fileId: undefined };
    try {
      return getFontData(fontId);
    } catch (error) {
      console.error("Failed to get preview font data:", error);
      return { fontFamily: undefined, fileId: undefined };
    }
  };

  const previewFontData = getPreviewFontData();

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "textStyles",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields,
    detailPreviewText: getPreviewTextValue(selectedItem),
    detailPreviewFontSize: selectedItem?.fontSize ?? 16,
    detailPreviewLineHeight: selectedItem?.lineHeight ?? 1.5,
    detailPreviewFontWeight: selectedItem?.fontWeight ?? "400",
    detailPreviewColor: selectedItem?.colorId
      ? getColorHex(selectedItem.colorId)
      : undefined,
    detailPreviewStrokeColor: selectedItem?.strokeColorId
      ? getColorHex(selectedItem.strokeColorId)
      : undefined,
    detailPreviewStrokeWidth: selectedItem?.strokeColorId
      ? (selectedItem?.strokeWidth ?? 0)
      : 0,
    detailPreviewFontFamily: detailPreviewFontData.fontFamily,
    detailPreviewFontFileId: detailPreviewFontData.fileId,
    title: "Typography",
    folderContextMenuItems: state.folderContextMenuItems,
    itemContextMenuItems: state.itemContextMenuItems,
    centerItemContextMenuItems: state.centerItemContextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    colorsData: state.colorsData,
    fontsData: state.fontsData,

    // Dialog-related data
    isDialogOpen: state.isDialogOpen,
    dialogForm: dialogForm,
    dialogDefaultValues,
    formKey: `${state.selectedItemId}-${state.isDialogOpen || state.isAddFontDialogOpen}`,

    // Add color dialog data
    isAddColorDialogOpen: state.isAddColorDialogOpen,
    addColorForm: addColorForm,
    addColorDefaultValues: state.newColorData,

    // Add font dialog data
    isAddFontDialogOpen: state.isAddFontDialogOpen,
    addFontForm: addFontForm,
    addFontDefaultValues: state.newFontData,
    selectedFontFile: state.selectedFontFile,
    hasSelectedFont: state.hasSelectedFont,
    selectedFontFileName: state.selectedFontFileName,
    dragDropText: state.dragDropText,
    fontFileTypes: [".ttf", ".otf", ".woff", ".woff2"],

    // Preview values for dialog
    previewText: getPreviewTextValue(state.currentFormValues),
    previewFontSize: state.currentFormValues.fontSize,
    previewLineHeight: state.currentFormValues.lineHeight,
    previewFontWeight: state.currentFormValues.fontWeight,
    previewColor: getPreviewColor(),
    previewStrokeColor: state.currentFormValues.strokeColor
      ? getColorHex(state.currentFormValues.strokeColor)
      : undefined,
    previewStrokeWidth: state.currentFormValues.strokeColor
      ? (state.currentFormValues.strokeWidth ?? 0)
      : 0,
    previewFontFamily: previewFontData.fontFamily,
    previewFontFileId: previewFontData.fileId,
    searchQuery: state.searchQuery,
    resourceType: "textStyles",
  };
};
