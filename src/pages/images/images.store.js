import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import {
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD,
  shouldStartCollapsedFileExplorer,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";

const AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD =
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD;
const IMAGE_CARD_MAX_WIDTH = 400;
const IMAGE_CARD_HEIGHT = 225;
export const IMAGE_TAG_SCOPE_KEY = "images";

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "image-file-id",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "image-tags",
      label: "Tags",
    },
    {
      type: "text",
      label: "File Type",
      value: item.fileType ?? "",
    },
    {
      type: "text",
      label: "File Size",
      value: formatFileSize(item.fileSize),
    },
    {
      type: "text",
      label: "Dimensions",
      value: item.width && item.height ? `${item.width} × ${item.height}` : "",
    },
  ];
};

const buildMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "image",
  previewFileId: item.thumbnailFileId ?? item.fileId,
  canPreview: false,
});

const buildPendingMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "image",
  isProcessing: true,
  isInteractive: false,
  canPreview: false,
});

const createEditForm = () => ({
  title: "Edit Image",
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
      slot: "image-slot",
      label: "Image",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Image",
      },
    ],
  },
});

const {
  createInitialState: createMediaInitialState,
  setItems: setBaseItems,
  addPendingUploads,
  removePendingUploads,
  updatePendingUpload,
  setSelectedItemId: setBaseSelectedItemId,
  openEditDialog,
  closeEditDialog,
  setEditUpload,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
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
  itemType: "image",
  resourceType: "images",
  title: "Images",
  selectedResourceId: "images",
  uploadText: "Upload",
  acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp"],
  imageHeight: IMAGE_CARD_HEIGHT,
  maxWidth: IMAGE_CARD_MAX_WIDTH,
  showZoomControls: true,
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  getSelectedPreviewFileId: (item) => item?.thumbnailFileId ?? item?.fileId,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, baseViewData }) => {
    return {
      ...baseViewData,
      fullImagePreviewVisible: state.fullImagePreviewVisible,
      fullImagePreviewFileId: state.fullImagePreviewFileId,
    };
  },
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
});

export {
  setBaseItems as setItems,
  addPendingUploads,
  removePendingUploads,
  updatePendingUpload,
  setBaseSelectedItemId as setSelectedItemId,
  openEditDialog,
  closeEditDialog,
  setEditUpload,
  selectSelectedItem,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectImageItemById = selectItemById;

export const selectAdjacentImageItemId = (
  context,
  { itemId, direction } = {},
) => {
  const step =
    direction === "next" ? 1 : direction === "previous" ? -1 : undefined;
  if (!step) {
    return undefined;
  }

  const viewData = selectMediaViewData(context);
  const items = context.state.data?.items ?? {};
  const visibleImageIds = (viewData.mediaGroups ?? []).flatMap((group) =>
    (group.children ?? [])
      .map((child) => child.id)
      .filter((childItemId) => items[childItemId]?.type === "image"),
  );

  if (visibleImageIds.length === 0) {
    return undefined;
  }

  const currentIndex = visibleImageIds.indexOf(itemId);
  if (currentIndex === -1) {
    return step > 0
      ? visibleImageIds[0]
      : visibleImageIds[visibleImageIds.length - 1];
  }

  return visibleImageIds[currentIndex + step];
};

export const showFullImagePreview = ({ state }, { itemId } = {}) => {
  const item = state.data?.items?.[itemId];
  if (!(item?.type === "image") || !item.fileId) {
    return;
  }

  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = item.fileId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const selectViewData = (context) => {
  const viewData = selectMediaViewData(context);
  const flatItems = applyFolderRequiredRootDragOptions(viewData.flatItems);

  return {
    ...viewData,
    flatItems,
    startCollapsedFileExplorer: shouldStartCollapsedFileExplorer({
      flatItems,
      threshold: AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD,
    }),
  };
};
