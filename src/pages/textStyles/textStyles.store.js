import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createFolderChildFolderIdSet } from "../../internal/ui/resourcePages/rootGroups.js";
import {
  buildTagViewData,
  closeCreateTagDialogState,
  createTagField,
  createTagForm,
  createTagState,
  filterGroupsByActiveTags,
  openCreateTagDialogState,
  selectActiveTagIdsState,
  selectCreateTagContextState,
  selectDetailTagIdsState,
  selectTagsDataState,
  setActiveTagIdsState,
  setDetailTagIdsState,
  setDetailTagPopoverOpenState,
  setTagsDataState,
  syncDetailTagIds,
  commitDetailTagIdsState,
} from "../../internal/ui/resourcePages/tags.js";
import {
  buildMobileResourcePageViewData,
  closeMobileResourceFileExplorerState,
  createMobileResourcePageState,
  openMobileResourceFileExplorerState,
  selectIsMobileFileExplorerOpenState,
  selectIsTouchModeState,
  selectSuppressMobileDetailSheetState,
  setMobileResourceDetailSheetSuppressedState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectTextStylesPageCopy } from "./support/textStylesPageCopy.js";

export const TEXT_STYLE_TAG_SCOPE_KEY = "textStyles";

const createTagDialogForm = (copy = {}) =>
  createTagForm({
    title: copy.createTagTitle,
    submitLabel: copy.createTagButton,
    nameLabel: copy.tagNameLabel,
  });

const createFolderNameForm = (copy = {}) => ({
  title: copy.editFolderTitle ?? "Edit Folder",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      required: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.saveButton ?? "Save",
        validate: true,
      },
    ],
  },
});

// Helper function to create add color form
const createAddColorForm = (colorFolderOptions, copy = {}) => ({
  title: copy.addNewColorTitle ?? "Add New Color",
  description:
    copy.addNewColorDescription ?? "Create a new color for text styles",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.colorNameLabel ?? "Color Name",
      description: copy.enterColorNameDescription ?? "Enter the color name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      description:
        copy.optionalColorDescription ?? "Optional description for this color",
      required: false,
    },
    {
      name: "hex",
      type: "color-picker",
      label: copy.hexValueLabel ?? "Hex Value",
      description:
        copy.chooseHexDescription ?? "Choose or enter a hex color value",
      required: true,
    },
    {
      name: "folderId",
      type: "select",
      label: copy.folderLabel ?? "Folder",
      description:
        copy.chooseColorFolderDescription ?? "Choose where to save the color",
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
        label: copy.addColorButton ?? "Add Color",
      },
    ],
  },
});

// Helper function to create add font form
const createAddFontForm = (fontFolderOptions, copy = {}) => ({
  title: copy.addNewFontTitle ?? "Add New Font",
  description:
    copy.addNewFontDescription ?? "Upload a new font for text styles",
  fields: [
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      description:
        copy.optionalFontDescription ?? "Optional description for this font",
      required: false,
    },
    {
      name: "folderId",
      type: "select",
      label: copy.folderLabel ?? "Folder",
      description:
        copy.chooseFontFolderDescription ?? "Choose where to save the font",
      options: fontFolderOptions,
      required: true,
    },
    {
      slot: "font-upload",
      type: "slot",
      label: copy.fontFileLabel ?? "Font File",
      description:
        copy.fontFileDescription ?? "Click or drag and drop a font file here",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.addFontButton ?? "Add Font",
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

const createFolderContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-item",
  },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createItemContextMenuItems = (copy = {}) => [
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createCenterItemContextMenuItems = (copy = {}) => [
  {
    label: copy.editMenuItem ?? "Edit",
    type: "item",
    value: "edit-item",
  },
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createEmptyContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-item",
  },
];

export const createInitialState = () => ({
  textStylesData: { tree: [], items: {} },
  colorsData: { tree: [], items: {} },
  fontsData: { tree: [], items: {} },
  selectedItemId: undefined,
  selectedFolderId: undefined,
  searchQuery: "",
  isFolderNameDialogOpen: false,
  folderNameDialogItemId: undefined,
  folderNameDialogDefaultValues: {
    name: "",
    description: "",
  },
  ...createMobileResourcePageState(),
  ...createTagState(),

  // Dialog state
  isDialogOpen: false,
  targetGroupId: undefined,
  editMode: false,
  editingItemId: undefined,

  // Add color dialog state
  isAddColorDialogOpen: false,
  newColorData: {
    name: "",
    description: "",
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
    description: "",
    folderId: "_root",
  },

  // Form values for preview
  currentFormValues: {
    name: "",
    description: "",
    tagIds: [],
    fontColor: "",
    strokeColor: "",
    shadowColor: "",
    fontId: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    strokeWidth: 0,
    shadowAlpha: 1,
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    previewText: "",
  },

  defaultValues: {
    name: "",
    description: "",
    tagIds: [],
    fontColor: "",
    strokeColor: "",
    shadowColor: "",
    fontId: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    strokeWidth: 0,
    shadowAlpha: 1,
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
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
    { label: "Edit", type: "item", value: "edit-item" },
    { label: "Duplicate", type: "item", value: "duplicate-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
  ],
});

export const setItems = ({ state }, { textStylesData } = {}) => {
  state.textStylesData = textStylesData;
  if (
    state.selectedFolderId &&
    state.textStylesData?.items?.[state.selectedFolderId]?.type !== "folder"
  ) {
    state.selectedFolderId = undefined;
  }
  syncDetailTagIds({
    state,
    item: state.selectedItemId
      ? state.textStylesData?.items?.[state.selectedItemId]
      : undefined,
    preserveDirty: true,
  });
};

export const setColorsData = ({ state }, { colorsData } = {}) => {
  state.colorsData = colorsData;
};

export const setFontsData = ({ state }, { fontsData } = {}) => {
  state.fontsData = fontsData;
};

export const setSelectedItemId = (
  { state },
  { itemId, suppressMobileDetailSheet = false } = {},
) => {
  state.selectedItemId = itemId;
  setMobileResourceDetailSheetSuppressedState(state, {
    itemId,
    suppressMobileDetailSheet,
  });
  if (itemId !== undefined) {
    state.selectedFolderId = undefined;
  }
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds({
    state,
    item: itemId ? state.textStylesData?.items?.[itemId] : undefined,
  });
};

export const selectIsTouchMode = selectIsTouchModeState;

export const selectIsMobileFileExplorerOpen =
  selectIsMobileFileExplorerOpenState;

export const selectSuppressMobileDetailSheet =
  selectSuppressMobileDetailSheetState;

export const setSelectedFolderId = ({ state }, { folderId } = {}) => {
  state.selectedFolderId = folderId;
  if (folderId !== undefined) {
    state.selectedItemId = undefined;
    setMobileResourceDetailSheetSuppressedState(state, {
      itemId: undefined,
    });
    state.isDetailTagSelectOpen = false;
    syncDetailTagIds({
      state,
      item: undefined,
    });
  }
};

export const openFolderNameDialog = (
  { state },
  { folderId, defaultValues } = {},
) => {
  state.isFolderNameDialogOpen = true;
  state.folderNameDialogItemId = folderId;
  state.folderNameDialogDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
};

export const closeFolderNameDialog = ({ state }, _payload = {}) => {
  state.isFolderNameDialogOpen = false;
  state.folderNameDialogItemId = undefined;
  state.folderNameDialogDefaultValues = {
    name: "",
    description: "",
  };
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  setMobileResourcePageUiConfigState(state, {
    uiConfig,
  });
};

export const openMobileFileExplorer = ({ state }, _payload = {}) => {
  openMobileResourceFileExplorerState(state);
};

export const closeMobileFileExplorer = ({ state }, _payload = {}) => {
  closeMobileResourceFileExplorerState(state);
};

export const setTagsData = ({ state }, { tagsData } = {}) => {
  setTagsDataState({
    state,
    tagsData,
  });
};

export const setActiveTagIds = ({ state }, { tagIds } = {}) => {
  setActiveTagIdsState({
    state,
    tagIds,
  });
};

export const setDetailTagIds = ({ state }, { tagIds } = {}) => {
  setDetailTagIdsState({
    state,
    tagIds,
  });
};

export const commitDetailTagIds = ({ state }, { tagIds } = {}) => {
  commitDetailTagIdsState({
    state,
    tagIds,
  });
};

export const setDetailTagPopoverOpen = ({ state }, { open, item } = {}) => {
  setDetailTagPopoverOpenState({
    state,
    open,
    item,
  });
};

export const openCreateTagDialog = (
  { state },
  { mode, itemId, draftTagIds } = {},
) => {
  openCreateTagDialogState({
    state,
    mode,
    itemId,
    draftTagIds,
  });
};

export const closeCreateTagDialog = ({ state }) => {
  closeCreateTagDialogState({
    state,
  });
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
    description: "",
    tagIds: [],
    fontColor: "",
    strokeColor: "",
    shadowColor: "",
    fontId: "",
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
    strokeWidth: 0,
    shadowAlpha: 1,
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    previewText: "",
  };
};

export const setFormValuesFromItem = ({ state }, { item } = {}) => {
  if (!item) {
    throw new Error("Item is required for setFormValuesFromItem");
  }
  state.currentFormValues = {
    name: item.name ?? "",
    description: item.description ?? "",
    tagIds: item.tagIds ?? [],
    fontColor: item.colorId ?? "",
    strokeColor: item.strokeColorId ?? "",
    shadowColor: item.shadow?.colorId ?? "",
    fontId: item.fontId ?? "",
    fontSize: item.fontSize,
    lineHeight: item.lineHeight,
    fontWeight: item.fontWeight,
    strokeWidth: item.strokeWidth ?? 0,
    shadowAlpha: item.shadow?.alpha ?? 1,
    shadowBlur: item.shadow?.blur ?? 0,
    shadowOffsetX: item.shadow?.offsetX ?? 2,
    shadowOffsetY: item.shadow?.offsetY ?? 2,
    previewText: item.previewText ?? "",
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
    description: "",
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
    description: "",
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

export const selectSelectedFolderId = ({ state }) => state.selectedFolderId;

export const selectIsDialogOpen = ({ state }) => state.isDialogOpen;

export const selectFolderNameDialogItemId = ({ state }) =>
  state.folderNameDialogItemId;

export const selectCurrentPreviewText = ({ state }) =>
  state.currentFormValues.previewText ?? "";

export const selectTagsData = selectTagsDataState;

export const selectActiveTagIds = selectActiveTagIdsState;

export const selectDetailTagIds = selectDetailTagIdsState;

export const selectCreateTagContext = selectCreateTagContextState;

export const selectItemById = ({ state }, itemId) => {
  const flatItems = toFlatItems(state.textStylesData);
  return flatItems.find((item) => item.id === itemId);
};

export const selectFolderById = ({ state }, { folderId } = {}) => {
  const item = state.textStylesData?.items?.[folderId];
  return item?.type === "folder" ? item : undefined;
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

export const selectViewData = ({ state, i18n }) => {
  const copy = selectTextStylesPageCopy(i18n);
  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.textStylesData),
  );
  const rawFlatGroups = toFlatGroups(state.textStylesData);
  const folderIdsWithChildFolders = createFolderChildFolderIdSet(flatItems);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;
  const selectedFolder = state.selectedFolderId
    ? state.textStylesData?.items?.[state.selectedFolderId]
    : undefined;
  const selectedDetailId = selectedItem?.id ?? selectedFolder?.id;
  const selectedDetailName = selectedItem?.name ?? selectedFolder?.name ?? "";

  // Apply search filter
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  let filteredGroups = rawFlatGroups;

  if (searchQuery) {
    filteredGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children ?? []).filter((item) =>
          matchesTagAwareSearch(item, searchQuery),
        );

        const groupName = (group.name ?? "").toLowerCase();
        const shouldIncludeGroup =
          filteredChildren.length > 0 || groupName.includes(searchQuery);

        return shouldIncludeGroup
          ? {
              ...group,
              children: filteredChildren,
              hasChildFolders: folderIdsWithChildFolders.has(group.id),
              hasChildren: filteredChildren.length > 0,
            }
          : undefined;
      })
      .filter(Boolean);
  }

  const tagFilteredGroups = filterGroupsByActiveTags({
    groups: filteredGroups,
    itemsById: state.textStylesData?.items,
    activeTagIds: state.activeTagIds,
  });

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
  const flatGroups = tagFilteredGroups.map((group) => {
    const children = (group.children ?? []).map((item) => {
      const fontData = getFontData(item.fontId);
      return {
        ...item,
        fontFamily: fontData.fontFamily,
        fontFileId: fontData.fileId,
        color: getColorHex(item.colorId),
        strokeColor: item.strokeColorId ? getColorHex(item.strokeColorId) : "",
        strokeWidth: item.strokeColorId ? (item.strokeWidth ?? 0) : 0,
        shadowColor: item.shadow?.colorId
          ? getColorHex(item.shadow.colorId)
          : "",
        shadowAlpha: item.shadow?.alpha ?? 1,
        shadowBlur: item.shadow?.blur ?? 0,
        shadowOffsetX: item.shadow?.offsetX ?? 2,
        shadowOffsetY: item.shadow?.offsetY ?? 2,
        previewText: getPreviewTextValue(item),
        selectedStyle:
          item.id === state.selectedItemId
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
      };
    });

    return {
      ...group,
      hasChildFolders: folderIdsWithChildFolders.has(group.id),
      hasChildren: children.length > 0,
      children,
    };
  });

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

  let detailFields = [];
  if (selectedItem) {
    detailFields = [
      {
        type: "slot",
        slot: "text-style-preview",
        label: "",
      },
      {
        type: "description",
        value: selectedItem.description ?? "",
      },
      {
        type: "slot",
        slot: "text-style-tags",
        label: copy.tagsLabel ?? "Tags",
      },
      {
        type: "text",
        label: copy.colorLabel ?? "Color",
        value: selectedItem.colorId ? getColorName(selectedItem.colorId) : "",
      },
      {
        type: "text",
        label: copy.outlineColorLabel ?? "Outline Color",
        value: selectedItem.strokeColorId
          ? getColorName(selectedItem.strokeColorId)
          : "",
      },
      {
        type: "text",
        label: copy.outlineThicknessLabel ?? "Outline Thickness",
        value: String(
          selectedItem.strokeColorId ? (selectedItem.strokeWidth ?? 0) : 0,
        ),
      },
      {
        type: "text",
        label: copy.fontLabel ?? "Font",
        value: selectedItem.fontId ? getFontName(selectedItem.fontId) : "",
      },
      {
        type: "text",
        label: copy.fontSizeLabel ?? "Font Size",
        value: String(selectedItem.fontSize ?? ""),
      },
      {
        type: "text",
        label: copy.lineHeightLabel ?? "Line Height",
        value: String(selectedItem.lineHeight ?? ""),
      },
      {
        type: "text",
        label: copy.fontWeightLabel ?? "Font Weight",
        value: String(selectedItem.fontWeight ?? ""),
      },
    ];
    if (selectedItem.shadow) {
      detailFields.push(
        {
          type: "text",
          label: copy.shadowColorLabel ?? "Shadow Color",
          value: getColorName(selectedItem.shadow.colorId),
        },
        {
          type: "text",
          label: copy.shadowOpacityLabel ?? "Shadow Opacity",
          value: String(selectedItem.shadow.alpha ?? 1),
        },
        {
          type: "text",
          label: copy.shadowBlurLabel ?? "Shadow Blur",
          value: String(selectedItem.shadow.blur ?? 0),
        },
        {
          type: "text",
          label: copy.shadowOffsetXLabel ?? "Shadow Offset X",
          value: String(selectedItem.shadow.offsetX ?? 2),
        },
        {
          type: "text",
          label: copy.shadowOffsetYLabel ?? "Shadow Offset Y",
          value: String(selectedItem.shadow.offsetY ?? 2),
        },
      );
    }
  } else if (selectedFolder?.type === "folder") {
    detailFields = [
      {
        type: "text",
        label: copy.typeLabel ?? "Type",
        value: copy.folderTypeValue ?? "folder",
      },
      {
        type: "description",
        value: selectedFolder.description ?? "",
      },
    ];
  }

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
    { value: "_root", label: copy.rootFolderLabel ?? "Root Folder" },
    ...toFlatItems(state.colorsData)
      .filter((item) => item.type === "folder")
      .map((folder) => ({
        value: folder.id,
        label: folder.name || folder.id,
      })),
  ];

  // Generate folder options for add font dialog
  const fontFolderOptions = [
    { value: "_root", label: copy.rootFolderLabel ?? "Root Folder" },
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
      ? flatItems.find(
          (item) =>
            item.id === state.editingItemId && item.type === "textStyle",
        )
      : undefined;

  const dialogFields = [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      required: false,
    },
    createTagField({
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      addOptionLabel: copy.addTagOption,
    }),
    {
      name: "fontId",
      type: "select",
      label: copy.fontLabel ?? "Font",
      placeholder: copy.chooseFontPlaceholder ?? "Choose a font",
      options: fontOptions,
      addOption: { label: copy.addNewFontOption ?? "Add new font" },
      required: true,
    },
    {
      name: "fontSize",
      type: "slider-with-input",
      label: copy.fontSizeLabel ?? "Font Size",
      min: 8,
      max: 72,
      step: 1,
      unit: "px",
      required: true,
    },
    {
      name: "lineHeight",
      type: "slider-with-input",
      label: copy.lineHeightLabel ?? "Line Height",
      min: 0.8,
      max: 3.0,
      step: 0.1,
      required: true,
    },
    {
      name: "fontWeight",
      type: "select",
      label: copy.fontWeightLabel ?? "Font Weight",
      placeholder: copy.chooseFontWeightPlaceholder ?? "Choose font weight",
      options: [
        { label: copy.weight100Thin ?? "100 - Thin", value: "100" },
        {
          label: copy.weight200ExtraLight ?? "200 - Extra Light",
          value: "200",
        },
        { label: copy.weight300Light ?? "300 - Light", value: "300" },
        { label: copy.weight400Normal ?? "400 - Normal", value: "400" },
        { label: copy.weight500Medium ?? "500 - Medium", value: "500" },
        { label: copy.weight600SemiBold ?? "600 - Semi Bold", value: "600" },
        { label: copy.weight700Bold ?? "700 - Bold", value: "700" },
        {
          label: copy.weight800ExtraBold ?? "800 - Extra Bold",
          value: "800",
        },
        { label: copy.weight900Black ?? "900 - Black", value: "900" },
      ],
      required: true,
    },
    {
      name: "fontColor",
      type: "select",
      label: copy.colorLabel ?? "Color",
      placeholder: copy.chooseColorPlaceholder ?? "Choose a color",
      options: colorOptions,
      addOption: { label: copy.addNewColorOption ?? "Add new color" },
      required: true,
    },
    {
      name: "strokeColor",
      type: "select",
      label: copy.outlineColorLabel ?? "Outline Color",
      placeholder:
        copy.chooseOutlineColorPlaceholder ?? "Choose an outline color",
      options: colorOptions,
      addOption: { label: copy.addNewColorOption ?? "Add new color" },
      required: false,
    },
  ];

  if (state.currentFormValues.strokeColor) {
    dialogFields.push({
      name: "strokeWidth",
      type: "slider-with-input",
      label: copy.outlineThicknessLabel ?? "Outline Thickness",
      min: 0,
      max: 12,
      step: 0.5,
      unit: "px",
      required: false,
    });
  }

  dialogFields.push({
    name: "shadowColor",
    type: "select",
    label: copy.shadowColorLabel ?? "Shadow Color",
    placeholder: copy.chooseShadowColorPlaceholder ?? "Choose a shadow color",
    options: colorOptions,
    addOption: { label: copy.addNewColorOption ?? "Add new color" },
    required: false,
  });

  if (state.currentFormValues.shadowColor) {
    dialogFields.push(
      {
        name: "shadowAlpha",
        type: "slider-with-input",
        label: copy.shadowOpacityLabel ?? "Shadow Opacity",
        min: 0,
        max: 1,
        step: 0.05,
        required: false,
      },
      {
        name: "shadowBlur",
        type: "slider-with-input",
        label: copy.shadowBlurLabel ?? "Shadow Blur",
        min: 0,
        max: 32,
        step: 1,
        unit: "px",
        required: false,
      },
      {
        name: "shadowOffsetX",
        type: "slider-with-input",
        label: copy.shadowOffsetXLabel ?? "Shadow Offset X",
        min: -32,
        max: 32,
        step: 1,
        unit: "px",
        required: false,
      },
      {
        name: "shadowOffsetY",
        type: "slider-with-input",
        label: copy.shadowOffsetYLabel ?? "Shadow Offset Y",
        min: -32,
        max: 32,
        step: 1,
        unit: "px",
        required: false,
      },
    );
  }

  // Generate dynamic dialog form with dropdown options
  const dialogSubmitButton = {
    id: "submit",
    variant: "pr",
    label: state.editMode
      ? (copy.updateTextStyleButton ?? "Update Text Style")
      : (copy.addTextStyleButton ?? "Add Text Style"),
  };
  const dialogForm = {
    title: state.editMode
      ? (copy.editTextStyleTitle ?? "Edit Text Style")
      : (copy.addTextStyleTitle ?? "Add Text Style"),
    fields: dialogFields,
    actions: {
      layout: "",
      buttons: [dialogSubmitButton],
    },
  };
  const desktopDialogForm = {
    title: dialogForm.title,
    fields: dialogForm.fields,
    actions: {
      layout: "",
      buttons: [],
    },
  };

  // Set default values based on edit mode for dialog
  const dialogDefaultValues =
    state.editMode && editingItem
      ? {
          name: editingItem.name || "",
          description: editingItem.description || "",
          tagIds: editingItem.tagIds ?? [],
          fontColor: editingItem.colorId || "",
          strokeColor: editingItem.strokeColorId || "",
          shadowColor: editingItem.shadow?.colorId ?? "",
          fontId: editingItem.fontId || "",
          fontSize: editingItem.fontSize,
          lineHeight: editingItem.lineHeight,
          fontWeight: editingItem.fontWeight,
          strokeWidth: editingItem.strokeWidth ?? 0,
          shadowAlpha: editingItem.shadow?.alpha ?? 1,
          shadowBlur: editingItem.shadow?.blur ?? 0,
          shadowOffsetX: editingItem.shadow?.offsetX ?? 2,
          shadowOffsetY: editingItem.shadow?.offsetY ?? 2,
          previewText: editingItem.previewText ?? "",
        }
      : state.defaultValues;

  // Add color dialog form
  const addColorForm = createAddColorForm(colorFolderOptions, copy);

  // Add font dialog form
  const addFontForm = createAddFontForm(fontFolderOptions, copy);

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
    const fontId = state.currentFormValues.fontId;
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
    ...buildMobileResourcePageViewData({
      state,
      detailFields,
      hiddenMobileDetailSlots: ["text-style-preview"],
    }),
    resourceCategory: "userInterface",
    selectedResourceId: "textStyles",
    selectedItemId: state.selectedItemId,
    selectedFolderId: state.selectedFolderId,
    selectedDetailId,
    selectedDetailName,
    selectedItemName: selectedDetailName,
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
    detailPreviewShadowColor: selectedItem?.shadow?.colorId
      ? getColorHex(selectedItem.shadow.colorId)
      : undefined,
    detailPreviewShadowAlpha: selectedItem?.shadow?.alpha ?? 1,
    detailPreviewShadowBlur: selectedItem?.shadow?.blur ?? 0,
    detailPreviewShadowOffsetX: selectedItem?.shadow?.offsetX ?? 2,
    detailPreviewShadowOffsetY: selectedItem?.shadow?.offsetY ?? 2,
    detailPreviewFontFamily: detailPreviewFontData.fontFamily,
    detailPreviewFontFileId: detailPreviewFontData.fileId,
    title: copy.title ?? "Text Styles",
    addText: copy.addText ?? "Add",
    addTagPlaceholder: copy.addTagPlaceholder ?? "Add tag",
    editButton: copy.editMenuItem ?? "Edit",
    deleteButton: copy.deleteButton ?? "Delete",
    duplicateButton: copy.duplicateButton ?? "Duplicate",
    filesLabel: copy.filesLabel ?? "Files",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    previewLabel: copy.previewLabel ?? "Preview",
    previewTextLabel: copy.previewTextLabel ?? "Preview Text",
    fontSelectedLabel: copy.fontSelectedLabel ?? "Font selected:",
    folderContextMenuItems: createFolderContextMenuItems(copy),
    itemContextMenuItems: createItemContextMenuItems(copy),
    centerItemContextMenuItems: createCenterItemContextMenuItems(copy),
    emptyContextMenuItems: createEmptyContextMenuItems(copy),
    colorsData: state.colorsData,
    fontsData: state.fontsData,
    isFolderNameDialogOpen: state.isFolderNameDialogOpen,
    folderNameDialogItemId: state.folderNameDialogItemId,
    folderNameForm: createFolderNameForm(copy),
    folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,

    // Dialog-related data
    isDialogOpen: state.isDialogOpen,
    dialogForm: dialogForm,
    desktopDialogForm,
    dialogSubmitButton,
    dialogDefaultValues,
    showDialogPreviewCanvas: !state.isTouchMode,
    formKey: `${state.selectedItemId}-${state.isDialogOpen || state.isAddFontDialogOpen}`,
    ...buildTagViewData({
      state,
      selectedItem,
      createTagFormDefinition: createTagDialogForm(copy),
      tagFilterPlaceholder: copy.tagFilterPlaceholder,
      detailTagAddOptionLabel: copy.addTagOption,
    }),

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
    dragDropText: state.hasSelectedFont
      ? (copy.dragDropReplace ?? "Replace font file")
      : (copy.dragDropClick ?? "Click or drag font file here"),
    fontFileTypes: [".ttf", ".otf", ".woff", ".woff2"],

    // Preview values for dialog
    previewText: getPreviewTextValue(state.currentFormValues),
    previewTextInputValue: state.currentFormValues.previewText ?? "",
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
    previewShadowColor: state.currentFormValues.shadowColor
      ? getColorHex(state.currentFormValues.shadowColor)
      : undefined,
    previewShadowAlpha: state.currentFormValues.shadowAlpha ?? 1,
    previewShadowBlur: state.currentFormValues.shadowBlur ?? 0,
    previewShadowOffsetX: state.currentFormValues.shadowOffsetX ?? 2,
    previewShadowOffsetY: state.currentFormValues.shadowOffsetY ?? 2,
    previewFontFamily: previewFontData.fontFamily,
    previewFontFileId: previewFontData.fileId,
    searchQuery: state.searchQuery,
    resourceType: "textStyles",
  };
};
