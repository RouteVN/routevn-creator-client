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
  selectIsTabletLandscapeState,
  selectIsTouchModeState,
  selectSuppressMobileDetailSheetState,
  setMobileResourceDetailSheetSuppressedState,
  setMobileResourcePageUiConfigState,
  setMobileResourcePageWindowMetricsState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { selectTextStylesPageCopy } from "./support/textStylesPageCopy.js";
import { getFontFaceWeightDescriptor } from "../../internal/fontCapabilities.js";
import { toFontIds } from "../../internal/fontIds.js";
import {
  buildTagFilterOptions,
  matchesTagAwareSearch,
} from "../../internal/resourceTags.js";

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

const createMetadataFormFields = ({ copy, tagOptions }) => [
  {
    name: "name",
    type: "input-text",
    label: copy.nameLabel,
    required: true,
  },
  {
    name: "description",
    type: "input-textarea",
    label: copy.descriptionLabel,
  },
  createTagField({
    label: copy.tagsLabel,
    placeholder: copy.selectTagsPlaceholder,
    addOptionLabel: copy.addTagOption,
    options: tagOptions,
  }),
];

const createMetadataForm = ({ title, submitLabel, copy, tagOptions }) => ({
  title,
  actions: {
    buttons: [
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: submitLabel,
      },
    ],
  },
  fields: createMetadataFormFields({ copy, tagOptions }),
});

const createEmptyMetadataValues = () => ({
  name: "",
  description: "",
  tagIds: [],
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

// The explorer and center menus open a text style in the editor; its name,
// description and tags are edited from the detail header.
const createItemContextMenuItems = (copy = {}) => [
  { label: copy.openButton, type: "item", value: "edit-item" },
  { label: copy.renameMenuItem, type: "item", value: "rename-item" },
  { label: copy.duplicateMenuItem, type: "item", value: "duplicate-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
];

const createCenterItemContextMenuItems = (copy = {}) => [
  { label: copy.openButton, type: "item", value: "edit-item" },
  { label: copy.duplicateMenuItem, type: "item", value: "duplicate-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
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
  // A new text style is added with its name, description and tags; how it
  // looks is edited in the text style editor, which opens next.
  isAddDialogOpen: false,
  targetGroupId: undefined,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: createEmptyMetadataValues(),

  folderContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  itemContextMenuItems: [
    { label: "Open", type: "item", value: "edit-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Duplicate", type: "item", value: "duplicate-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  centerItemContextMenuItems: [
    { label: "Open", type: "item", value: "edit-item" },
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

export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  setMobileResourcePageWindowMetricsState(state, { width, height });
};

export const selectIsTabletLandscape = selectIsTabletLandscapeState;

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

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
};

export const openEditDialog = ({ state }, { itemId, defaultValues } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues.name = defaultValues.name;
  state.editDefaultValues.description = defaultValues.description;
  state.editDefaultValues.tagIds = defaultValues.tagIds;
};

export const closeEditDialog = ({ state }) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = createEmptyMetadataValues();
};

export const selectTargetGroupId = ({ state }) => state.targetGroupId;

export const selectEditItemId = ({ state }) => state.editItemId;

// The font and color a new text style starts with: the first of each in
// the project. The editor changes them.
export const selectNewTextStyleResources = ({ state }) => {
  const font = toFlatItems(state.fontsData).find(
    (item) => item.type === "font",
  );
  const color = toFlatItems(state.colorsData).find(
    (item) => item.type === "color",
  );
  return {
    fontId: font?.id,
    colorId: color?.id,
    fontWeight: Number.isFinite(font?.defaultWeight)
      ? String(font.defaultWeight)
      : "400",
  };
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return undefined;
  const flatItems = toFlatItems(state.textStylesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectSelectedFolderId = ({ state }) => state.selectedFolderId;

export const selectFolderNameDialogItemId = ({ state }) =>
  state.folderNameDialogItemId;

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
    const fontIds = toFontIds(fontId);
    if (fontIds.length === 0) {
      return {
        fontFamilies: [],
        fileIds: [],
        fontWeightDescriptors: [],
      };
    }
    const fontItems = toFlatItems(state.fontsData);
    const fonts = fontIds.map((id) =>
      fontItems.find((item) => item.type === "font" && item.id === id),
    );
    const fontsWithFiles = fonts.filter((font) => font?.fileId);
    return {
      fontFamilies: fonts.map((font, index) =>
        font ? font.fontFamily : fontIds[index],
      ),
      fileIds: fontsWithFiles.map((font) => font.fileId),
      fontWeightDescriptors: fontsWithFiles.map(
        (font) => getFontFaceWeightDescriptor(font) ?? "",
      ),
    };
  };

  // Add text style preview data. Collapse state is owned by the center view.
  const flatGroups = tagFilteredGroups.map((group) => {
    const children = (group.children ?? []).map((item) => {
      const fontData = getFontData(item.fontId);
      return {
        ...item,
        fontFamilies: fontData.fontFamilies,
        fontFileIds: fontData.fileIds,
        fontWeightDescriptors: fontData.fontWeightDescriptors,
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
    const fontIds = toFontIds(fontId);
    if (fontIds.length === 0) return "";
    const fontItems = toFlatItems(state.fontsData);
    return fontIds
      .map((id) =>
        fontItems.find((item) => item.type === "font" && item.id === id),
      )
      .filter(Boolean)
      .map((font) => font.fontFamily ?? "")
      .filter(Boolean)
      .join(", ");
  };

  const detailPreviewFontData = selectedItem
    ? getFontData(selectedItem.fontId)
    : { fontFamilies: [], fileIds: [], fontWeightDescriptors: [] };

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

  const tagOptions = buildTagFilterOptions({
    tagsCollection: state.tagsData,
  });

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
    detailPreviewFontFamilies: detailPreviewFontData.fontFamilies,
    detailPreviewFontFileIds: detailPreviewFontData.fileIds,
    detailPreviewFontWeightDescriptors:
      detailPreviewFontData.fontWeightDescriptors,
    title: copy.title ?? "Text Styles",
    addText: copy.addText ?? "Add",
    addTagPlaceholder: copy.addTagPlaceholder ?? "Add tag",
    openButton: copy.openButton,
    deleteButton: copy.deleteButton ?? "Delete",
    duplicateButton: copy.duplicateButton ?? "Duplicate",
    filesLabel: copy.filesLabel ?? "Files",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    folderContextMenuItems: createFolderContextMenuItems(copy),
    itemContextMenuItems: createItemContextMenuItems(copy),
    centerItemContextMenuItems: createCenterItemContextMenuItems(copy),
    emptyContextMenuItems: createEmptyContextMenuItems(copy),
    isFolderNameDialogOpen: state.isFolderNameDialogOpen,
    folderNameDialogItemId: state.folderNameDialogItemId,
    folderNameForm: createFolderNameForm(copy),
    folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
    isAddDialogOpen: state.isAddDialogOpen,
    addForm: createMetadataForm({
      title: copy.addTextStyleTitle,
      submitLabel: copy.addTextStyleButton,
      copy,
      tagOptions,
    }),
    addFormDefaults: createEmptyMetadataValues(),
    isEditDialogOpen: state.isEditDialogOpen,
    editForm: createMetadataForm({
      title: copy.editTextStyleTitle,
      submitLabel: copy.updateTextStyleButton,
      copy,
      tagOptions,
    }),
    editDefaultValues: state.editDefaultValues,
    ...buildTagViewData({
      state,
      selectedItem,
      createTagFormDefinition: createTagDialogForm(copy),
      tagFilterPlaceholder: copy.tagFilterPlaceholder,
      detailTagAddOptionLabel: copy.addTagOption,
    }),
    searchQuery: state.searchQuery,
    resourceType: "textStyles",
  };
};
