import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
  createImagePreviewOverlayViewData,
  isImagePreviewDisplayMode,
} from "../../internal/ui/resourcePages/imagePreviewOverlay.js";
import {
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD,
  shouldStartCollapsedFileExplorer,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { selectImagesPageCopy } from "./support/imagesPageCopy.js";

const AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD =
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD;
const IMAGE_CARD_MAX_WIDTH = 400;
const IMAGE_CARD_HEIGHT = 225;
export const IMAGE_TAG_SCOPE_KEY = "images";

const resolveImageAspectRatio = (item) => {
  const width = Number(item?.width);
  const height = Number(item?.height);

  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return "16 / 9";
  }

  return `${Math.max(1, Math.round(width))} / ${Math.max(1, Math.round(height))}`;
};

const buildDetailFields = (item, { copy } = {}) => {
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
      label: copy.tagsLabel,
    },
    {
      type: "text",
      label: copy.fileTypeLabel,
      value: item.fileType ?? "",
    },
    {
      type: "text",
      label: copy.fileSizeLabel,
      value: formatFileSize(item.fileSize),
    },
    {
      type: "text",
      label: copy.dimensionsLabel,
      value: item.width && item.height ? `${item.width} × ${item.height}` : "",
    },
  ];
};

const buildMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "image",
  previewFileId: item.fileId ?? item.thumbnailFileId,
  previewAspectRatio: resolveImageAspectRatio(item),
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

const selectVisibleImageIds = ({ mediaGroups, items } = {}) => {
  return (mediaGroups ?? []).flatMap((group) =>
    (group.children ?? [])
      .map((child) => child.id)
      .filter((childItemId) => items?.[childItemId]?.type === "image"),
  );
};

const resolveAdjacentImageItemId = ({
  visibleImageIds,
  itemId,
  direction,
  distance = 1,
  clamp = false,
} = {}) => {
  const step =
    direction === "next" ? 1 : direction === "previous" ? -1 : undefined;
  if (!step) {
    return undefined;
  }

  const numericDistance = Number(distance);
  const itemDistance =
    Number.isFinite(numericDistance) && numericDistance > 0
      ? Math.floor(numericDistance)
      : 1;
  const imageIds = visibleImageIds ?? [];

  if (imageIds.length === 0) {
    return undefined;
  }

  const currentIndex = imageIds.indexOf(itemId);
  if (currentIndex === -1) {
    return step > 0 ? imageIds[0] : imageIds[imageIds.length - 1];
  }

  let nextIndex = currentIndex + step * itemDistance;
  if (clamp) {
    nextIndex = Math.max(0, Math.min(nextIndex, imageIds.length - 1));
  }

  return imageIds[nextIndex];
};

const createEditForm = ({ copy } = {}) => ({
  title: copy.editTitle,
  fields: [
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
      required: false,
    },
    createTagField({
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      addOptionLabel: copy.addTagOption,
    }),
    {
      type: "slot",
      slot: "image-slot",
      label: copy.imageLabel,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.updateButton,
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
  setSelectedFolderId,
  openEditDialog,
  closeEditDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  setEditUpload,
  setUiConfig,
  selectItemById,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectSelectedItemId,
  selectEditItemId,
  selectEditUploadResult,
  selectFolderById,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  selectIsTouchMode,
  selectIsMobileFileExplorerOpen,
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
  itemType: "image",
  resourceType: "images",
  title: "",
  selectedResourceId: "images",
  uploadText: "",
  acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp"],
  imageHeight: IMAGE_CARD_HEIGHT,
  maxWidth: IMAGE_CARD_MAX_WIDTH,
  showZoomControls: true,
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  copy: selectImagesPageCopy,
  getSelectedPreviewFileId: (item) => item?.thumbnailFileId ?? item?.fileId,
  tagging: {
    tagFilterPlaceholder: "",
  },
  hiddenMobileDetailSlots: ["image-file-id"],
  extendViewData: ({ state, baseViewData, copy }) => {
    const previewItemId = state.fullImagePreviewItemId ?? state.selectedItemId;
    const previewImage = state.data?.items?.[previewItemId];
    const previewFlatItem = baseViewData.flatItems.find(
      (item) => item.id === previewItemId,
    );
    const projectResolution = requireProjectResolution(
      state.projectResolution,
      copy.projectResolutionLabel,
    );
    const visibleImageIds = selectVisibleImageIds({
      mediaGroups: baseViewData.mediaGroups,
      items: state.data?.items,
    });
    const previousItemId = previewItemId
      ? resolveAdjacentImageItemId({
          visibleImageIds,
          itemId: previewItemId,
          direction: "previous",
        })
      : undefined;
    const nextItemId = previewItemId
      ? resolveAdjacentImageItemId({
          visibleImageIds,
          itemId: previewItemId,
          direction: "next",
        })
      : undefined;
    const viewData = { ...baseViewData };

    Object.assign(
      viewData,
      createImagePreviewOverlayViewData({
        state,
        image: previewImage,
        projectResolution,
        previousItemId,
        nextItemId,
        breadcrumb: previewFlatItem?.fullLabel ?? previewImage?.name,
        copy,
      }),
    );
    const deleteDialogItem = state.mobileDeleteDialogItemId
      ? state.data?.items?.[state.mobileDeleteDialogItemId]
      : undefined;
    const deleteDialogItemName = deleteDialogItem?.name
      ? `"${deleteDialogItem.name}"`
      : copy.deleteTargetFallback;
    viewData.mobileDeleteDialogOpen = state.mobileDeleteDialogOpen;
    viewData.mobileDeleteDialogTitle = copy.deleteTitle;
    viewData.mobileDeleteDialogMessage = copy.deleteMessage.replace(
      "{itemName}",
      deleteDialogItemName,
    );
    viewData.mobileDeleteDialogConfirmLabel = copy.deleteButton;

    return viewData;
  },
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  fullImagePreviewVisible: false,
  fullImagePreviewItemId: undefined,
  fullImagePreviewFileId: undefined,
  fullImagePreviewDisplayMode: IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
  fullImagePreviewTouchStartPoint: undefined,
  fullImagePreviewSuppressNextClick: false,
  mobileDeleteDialogOpen: false,
  mobileDeleteDialogItemId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
});

export {
  setBaseItems as setItems,
  addPendingUploads,
  removePendingUploads,
  updatePendingUpload,
  setBaseSelectedItemId as setSelectedItemId,
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
  selectFolderById,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  selectEditItemId,
  selectEditUploadResult,
  selectIsTouchMode,
  selectIsMobileFileExplorerOpen,
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
  selectSelectedItemId,
  setSearchQuery,
};

export const selectImageItemById = selectItemById;

export const selectAdjacentImageItemId = (
  context,
  { itemId, direction, distance = 1, clamp = false } = {},
) => {
  const viewData = selectMediaViewData(context);
  return resolveAdjacentImageItemId({
    visibleImageIds: selectVisibleImageIds({
      mediaGroups: viewData.mediaGroups,
      items: context.state.data?.items,
    }),
    itemId,
    direction,
    distance,
    clamp,
  });
};

export const showFullImagePreview = ({ state }, { itemId } = {}) => {
  const item = state.data?.items?.[itemId];
  if (!(item?.type === "image") || !item.fileId) {
    return;
  }

  if (!state.fullImagePreviewVisible) {
    state.fullImagePreviewDisplayMode = IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;
  }
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewItemId = itemId;
  state.fullImagePreviewFileId = item.fileId;
  state.fullImagePreviewTouchStartPoint = undefined;
  state.fullImagePreviewSuppressNextClick = false;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewItemId = undefined;
  state.fullImagePreviewFileId = undefined;
  state.fullImagePreviewTouchStartPoint = undefined;
  state.fullImagePreviewSuppressNextClick = false;
};

export const setFullImagePreviewTouchStartPoint = (
  { state },
  { x, y } = {},
) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    state.fullImagePreviewTouchStartPoint = undefined;
    return;
  }

  state.fullImagePreviewTouchStartPoint = { x, y };
};

export const clearFullImagePreviewTouchStartPoint = ({ state }) => {
  state.fullImagePreviewTouchStartPoint = undefined;
};

export const suppressNextFullImagePreviewClick = ({ state }) => {
  state.fullImagePreviewSuppressNextClick = true;
};

export const clearFullImagePreviewSuppressNextClick = ({ state }) => {
  state.fullImagePreviewSuppressNextClick = false;
};

export const setFullImagePreviewDisplayMode = (
  { state },
  { displayMode } = {},
) => {
  if (!isImagePreviewDisplayMode(displayMode)) {
    return;
  }

  state.fullImagePreviewDisplayMode = displayMode;
};

export const openMobileDeleteDialog = ({ state }, { itemId } = {}) => {
  if (!itemId) {
    return;
  }

  state.mobileDeleteDialogOpen = true;
  state.mobileDeleteDialogItemId = itemId;
};

export const closeMobileDeleteDialog = ({ state }) => {
  state.mobileDeleteDialogOpen = false;
  state.mobileDeleteDialogItemId = undefined;
};

export const selectMobileDeleteDialogItemId = ({ state }) =>
  state.mobileDeleteDialogItemId;

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution ?? DEFAULT_PROJECT_RESOLUTION,
    "Project resolution",
  );
};

export const selectFullImagePreviewVisible = ({ state }) =>
  state.fullImagePreviewVisible;

export const selectFullImagePreviewTouchStartPoint = ({ state }) =>
  state.fullImagePreviewTouchStartPoint;

export const selectFullImagePreviewSuppressNextClick = ({ state }) =>
  state.fullImagePreviewSuppressNextClick;

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
