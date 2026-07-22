import { formatFontFileTypeLabel } from "../../internal/fileTypes.js";
import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectFontsPageCopy } from "./support/fontsPageCopy.js";
import { NEW_FONT_FILE_TYPES } from "../../internal/fontCapabilities.js";

export const FONT_TAG_SCOPE_KEY = "fonts";

const getDetailFileTypeLabel = ({ item, selectedFontInfo } = {}) => {
  const configuredFileType = formatFontFileTypeLabel({
    fileType: item?.fileType,
    fileName: item?.name ?? "",
  });

  if (configuredFileType !== "Unknown") {
    return configuredFileType;
  }

  return formatFontFileTypeLabel({
    fileType: selectedFontInfo?.format,
  });
};

const formatSupportedFontWeights = ({ item, copy = {} } = {}) => {
  const { minWeight, defaultWeight, maxWeight } = item;
  if (
    !Number.isFinite(minWeight) ||
    !Number.isFinite(defaultWeight) ||
    !Number.isFinite(maxWeight) ||
    minWeight > defaultWeight ||
    defaultWeight > maxWeight
  ) {
    return copy.unknownValue ?? "Unknown";
  }

  return minWeight === maxWeight
    ? `${minWeight}`
    : `${minWeight}\u2013${maxWeight}`;
};

const buildDetailFields = ({ item, selectedFontInfo, copy = {} } = {}) => {
  if (!item) {
    return [];
  }

  const activeFontInfo =
    selectedFontInfo?.itemId === item.id ? selectedFontInfo : undefined;
  return [
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "font-tags",
      label: copy.tagsLabel ?? "Tags",
    },
    {
      type: "text",
      label: copy.supportedFontWeightsLabel ?? "Supported Font Weights",
      value: formatSupportedFontWeights({ item, copy }),
    },
    {
      type: "text",
      label: copy.fileTypeLabel ?? "File Type",
      value: getDetailFileTypeLabel({
        item,
        selectedFontInfo: activeFontInfo,
      }),
    },
    {
      type: "text",
      label: copy.fileSizeLabel ?? "File Size",
      value: item.fileSize ? formatFileSize(item.fileSize) : "",
    },
  ];
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

const createEditForm = ({ copy = {} } = {}) => ({
  title: copy.editTitle ?? "Edit Font",
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
    createTagField({
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      addOptionLabel: copy.addTagOption,
    }),
    {
      type: "slot",
      slot: "font-slot",
      label: copy.fontLabel ?? "Font",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.updateButton ?? "Update Font",
      },
    ],
  },
});

const {
  createInitialState: createMediaInitialState,
  setItems,
  addPendingUploads,
  removePendingUploads,
  updatePendingUpload,
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
  selectEditItemId,
  selectEditUploadResult,
  selectFolderById,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectTagsData,
  selectActiveTagIds,
  selectDetailTagIds,
  selectCreateTagContext,
  selectViewData: selectMediaViewData,
} = createMediaPageStore({
  itemType: "font",
  resourceType: "fonts",
  title: "Fonts",
  selectedResourceId: "fonts",
  resourceCategory: "userInterface",
  uploadText: "Upload",
  copy: selectFontsPageCopy,
  acceptedFileTypes: NEW_FONT_FILE_TYPES,
  centerItemContextMenuItems: [
    { label: "Edit", type: "item", value: "edit-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields: (item, { copy }) => buildDetailFields({ item, copy }),
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  getSelectedPreviewFileId: (item) => item?.fileId,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => {
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
      centerItemContextMenuItems: [
        {
          label: copy.editMenuItem ?? "Edit",
          type: "item",
          value: "edit-item",
        },
        {
          label: copy.deleteMenuItem ?? "Delete",
          type: "item",
          value: "delete-item",
        },
      ],
      detailFields: buildDetailFields({
        item: selectedItem,
        selectedFontInfo,
        copy,
      }),
      editPreviewFontFamily:
        state.editUploadResult?.fontName ?? editItem?.fontFamily ?? "",
      editDefaultValues: {
        ...baseViewData.editDefaultValues,
        description: editItem?.description ?? "",
        tagIds: editItem?.tagIds ?? [],
      },
      modalGlyphList: modalFontInfo?.glyphs ?? [],
      clickToUploadLabel: copy.clickToUploadLabel ?? "Click to Upload",
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
  updatePendingUpload,
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
  selectEditItemId,
  selectEditUploadResult,
  selectFolderById,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectTagsData,
  selectActiveTagIds,
  selectDetailTagIds,
  selectCreateTagContext,
};

export const selectFontItemById = selectItemById;

export const selectCachedFontInfo = ({ state }, { itemId } = {}) =>
  itemId ? state.fontInfoById[itemId] : undefined;

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
