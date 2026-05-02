import { formatFontFileTypeLabel } from "../../internal/fileTypes.js";
import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";

export const FONT_TAG_SCOPE_KEY = "fonts";

const getDetailFileTypeLabel = ({ item, selectedFontInfo } = {}) => {
  const configuredFileType = formatFontFileTypeLabel({
    fileType: item?.fileType,
    fileName: item?.name ?? "",
  });

  if (configuredFileType !== "Unknown") {
    return configuredFileType;
  }

  return selectedFontInfo?.format ?? "Unknown";
};

const buildDetailFields = ({ item, selectedFontInfo } = {}) => {
  if (!item) {
    return [];
  }

  const activeFontInfo =
    selectedFontInfo?.itemId === item.id ? selectedFontInfo : undefined;
  const detailFields = [
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "font-tags",
      label: "Tags",
    },
    {
      type: "text",
      label: "File Type",
      value: getDetailFileTypeLabel({
        item,
        selectedFontInfo: activeFontInfo,
      }),
    },
    {
      type: "text",
      label: "File Size",
      value: item.fileSize ? formatFileSize(item.fileSize) : "",
    },
  ];

  if (activeFontInfo) {
    detailFields.push({
      type: "section",
      label: "Metadata",
      fields: [
        {
          type: "text",
          label: "Weight",
          value: activeFontInfo.weightClass ?? "",
        },
        {
          type: "text",
          label: "Variable Font",
          value: activeFontInfo.isVariableFont ?? "",
        },
        {
          type: "text",
          label: "Supports Italics",
          value: activeFontInfo.supportsItalics ?? "",
        },
        {
          type: "text",
          label: "Glyph Count",
          value: String(activeFontInfo.glyphCount ?? ""),
        },
        {
          type: "text",
          label: "Supported Scripts",
          value: activeFontInfo.languageSupport ?? "",
        },
      ],
    });

    if (activeFontInfo.previewNote) {
      detailFields.push({
        type: "text",
        label: "Preview Note",
        value: activeFontInfo.previewNote,
      });
    }

    if (activeFontInfo.error) {
      detailFields.push({
        type: "text",
        label: "Metadata Error",
        value: activeFontInfo.error,
      });
    }
  }

  return detailFields;
};

const buildMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "font",
  fontFamily: item.fontFamily ?? "sans-serif",
  previewText: "Aa",
  fontFileId: item.fileId,
});

const buildPendingMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "font",
  isProcessing: true,
  isInteractive: false,
  canPreview: false,
});

const createEditForm = () => ({
  title: "Edit Font",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
    },
    createTagField(),
    {
      type: "slot",
      slot: "font-slot",
      label: "Font",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Font",
      },
    ],
  },
});

const {
  createInitialState: createMediaInitialState,
  setItems,
  addPendingUploads,
  removePendingUploads,
  setSelectedItemId,
  setSelectedFolderId,
  openEditDialog,
  closeEditDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  setEditUpload,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  selectFolderById,
  selectSelectedFolderId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectViewData: selectMediaViewData,
} = createMediaPageStore({
  itemType: "font",
  resourceType: "fonts",
  title: "Fonts",
  selectedResourceId: "fonts",
  resourceCategory: "userInterface",
  uploadText: "Upload",
  acceptedFileTypes: [".ttf", ".otf", ".woff", ".woff2", ".ttc", ".eot"],
  centerItemContextMenuItems: [
    { label: "Edit", type: "item", value: "edit-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields: (item) => buildDetailFields({ item }),
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  getSelectedPreviewFileId: (item) => item?.fileId,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const selectedFontInfo = selectedItem
      ? state.fontInfoById[selectedItem.id]
      : undefined;
    const modalFontInfo = state.previewFontItemId
      ? state.fontInfoById[state.previewFontItemId]
      : undefined;
    const editItem = state.editItemId
      ? selectItemById({ state }, { itemId: state.editItemId })
      : undefined;

    return {
      ...baseViewData,
      isModalOpen: state.isModalOpen,
      selectedFontInfo,
      modalFontInfo,
      detailFields: buildDetailFields({
        item: selectedItem,
        selectedFontInfo,
      }),
      editPreviewFontFamily:
        state.editUploadResult?.fontName ?? editItem?.fontFamily ?? "",
      editDefaultValues: {
        ...baseViewData.editDefaultValues,
        description: editItem?.description ?? "",
        tagIds: editItem?.tagIds ?? [],
      },
      modalPreviewRows: modalFontInfo?.previewRows ?? [],
      modalGlyphList: modalFontInfo?.glyphs ?? [],
    };
  },
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  isModalOpen: false,
  previewFontItemId: undefined,
  fontInfoById: {},
});

export {
  setItems,
  addPendingUploads,
  removePendingUploads,
  setSelectedItemId,
  setSelectedFolderId,
  openEditDialog,
  closeEditDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  setEditUpload,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectSelectedItemId,
  selectFolderById,
  selectSelectedFolderId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
};

export const selectFontItemById = selectItemById;

export const setModalOpen = ({ state }, { isOpen } = {}) => {
  state.isModalOpen = isOpen;
};

export const cacheFontInfo = ({ state }, { itemId, fontInfo } = {}) => {
  if (!itemId || !fontInfo) {
    return;
  }

  state.fontInfoById[itemId] = fontInfo;
};

export const setPreviewFontItemId = ({ state }, { itemId } = {}) => {
  state.previewFontItemId = itemId;
};

export const selectViewData = (context) => {
  const viewData = selectMediaViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
