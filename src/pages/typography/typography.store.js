import { toFlatGroups, toFlatItems } from "insieme";

// Helper function to create add color form
const createAddColorForm = (colorFolderOptions) => ({
  title: "Add New Color",
  description: "Create a new color for typography",
  fields: [
    {
      name: "name",
      inputType: "input-text",
      label: "Color Name",
      description: "Enter the color name",
      required: true,
    },
    {
      name: "hex",
      inputType: "color-picker",
      label: "Hex Value",
      description: "Choose or enter a hex color value",
      required: true,
    },
    {
      name: "folderId",
      inputType: "select",
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
        content: "Add Color",
      },
    ],
  },
});

// Helper function to create add font form
const createAddFontForm = (fontFolderOptions) => ({
  title: "Add New Font",
  description: "Upload a new font for typography",
  fields: [
    {
      name: "folderId",
      inputType: "select",
      label: "Folder",
      description: "Choose where to save the font",
      options: fontFolderOptions,
      required: true,
    },
    {
      slot: "font-upload",
      inputType: "slot",
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
        content: "Add Font",
      },
    ],
  },
});

const form = {
  fields: [
    {
      name: "typographyPreview",
      inputType: "image",
      src: "${typographyPreview.src}",
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

export const createInitialState = () => ({
  typographyData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  selectedItemId: undefined,
  searchQuery: "",
  context: {
    typographyPreview: {
      src: "",
    },
  },

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
    fontStyle: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    previewText: "",
  },

  defaultValues: {
    name: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    previewText: "",
  },

  // Context menu items
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

export const setItems = ({ state }, { typographyData } = {}) => {
  state.typographyData = typographyData;
};

export const setColorsData = ({ state }, { colorsData } = {}) => {
  state.colorsData = colorsData;
};

export const setFontsData = ({ state }, { fontsData } = {}) => {
  state.fontsData = fontsData;
};

export const setContext = ({ state }, { context } = {}) => {
  state.context = context;
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
    fontStyle: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
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
    fontStyle: item.fontId || "",
    fontSize: item.fontSize,
    lineHeight: item.lineHeight,
    fontWeight: item.fontWeight,
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
  const flatItems = toFlatItems(state.typographyData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectItemById = ({ state }, itemId) => {
  const flatItems = toFlatItems(state.typographyData);
  return flatItems.find((item) => item.id === itemId);
};

export const selectColorsData = ({ state }) => state.colorsData;

export const selectFontsData = ({ state }) => state.fontsData;

export const selectTypographyData = ({ state }) => state.typographyData;

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
  const flatItems = toFlatItems(state.typographyData);
  const rawFlatGroups = toFlatGroups(state.typographyData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;

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

  // Apply selection styling and add typography-specific preview data (collapse state is now handled by groupResourcesView)
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    children: (group.children || []).map((item) => {
      const fontData = getFontData(item.fontId);
      return {
        ...item,
        fontStyle: fontData.fontFamily,
        fontFileId: fontData.fileId,
        color: getColorHex(item.colorId),
        previewText: item.previewText || "",
        selectedStyle:
          item.id === state.selectedItemId
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
      };
    }),
  }));

  // Helper function to get color name from ID
  const getColorName = (colorId) => {
    if (!colorId) throw new Error("colorId is required");
    const colorItems = toFlatItems(state.colorsData);
    const color = colorItems.find(
      (item) => item.type === "color" && item.id === colorId,
    );
    if (!color) throw new Error(`Color with ID ${colorId} not found`);
    return color.name;
  };

  // Helper function to get font name from ID
  const getFontName = (fontId) => {
    if (!fontId) throw new Error("fontId is required");
    const fontItems = toFlatItems(state.fontsData);
    const font = fontItems.find(
      (item) => item.type === "font" && item.id === fontId,
    );
    if (!font) throw new Error(`Font with ID ${fontId} not found`);
    return font.fontFamily;
  };

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
      ? "Update typography style"
      : "Create a new typography style",
    fields: [
      {
        name: "name",
        inputType: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "fontColor",
        inputType: "select",
        label: "Color",
        placeholder: "Choose a color",
        options: colorOptions,
        addOption: { label: "Add new color" },
        required: true,
      },
      {
        name: "fontStyle",
        inputType: "select",
        label: "Font Style",
        placeholder: "Choose a font",
        options: fontOptions,
        addOption: { label: "Add new font" },
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
        inputType: "input-text",
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
          fontSize: editingItem.fontSize,
          lineHeight: editingItem.lineHeight,
          fontWeight: editingItem.fontWeight,
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

  let detailFormDefaultValues = {};

  if (selectedItem) {
    try {
      detailFormDefaultValues = {
        name: selectedItem.name,
        fontSize: selectedItem.fontSize || "",
        lineHeight: selectedItem.lineHeight || "",
        colorName: selectedItem.colorId
          ? getColorName(selectedItem.colorId)
          : "",
        fontName: selectedItem.fontId ? getFontName(selectedItem.fontId) : "",
        fontWeight: selectedItem.fontWeight || "",
        previewText: selectedItem.previewText || "",
      };
    } catch (error) {
      console.error("Failed to get detail form values:", error);
      detailFormDefaultValues = {
        name: selectedItem.name || "",
        fontSize: selectedItem.fontSize || "",
        lineHeight: selectedItem.lineHeight || "",
        colorName: "",
        fontName: "",
        fontWeight: selectedItem.fontWeight || "",
        previewText: selectedItem.previewText || "",
      };
    }
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "typography",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "typography",
    title: "Typography",
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    colorsData: state.colorsData,
    fontsData: state.fontsData,
    form,
    context: state.context,
    defaultValues: detailFormDefaultValues,

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
    previewText: state.currentFormValues.previewText ?? "",
    previewFontSize: state.currentFormValues.fontSize,
    previewLineHeight: state.currentFormValues.lineHeight,
    previewFontWeight: state.currentFormValues.fontWeight,
    previewColor: getPreviewColor(),
    previewFontFamily: previewFontData.fontFamily,
    previewFontFileId: previewFontData.fileId,
    searchQuery: state.searchQuery,
    resourceType: "typography",
  };
};
