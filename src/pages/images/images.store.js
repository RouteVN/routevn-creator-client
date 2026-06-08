import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD,
  shouldStartCollapsedFileExplorer,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";

const AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD =
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD;
const IMAGE_CARD_MAX_WIDTH = 400;
const IMAGE_CARD_HEIGHT = 225;
const FULL_IMAGE_PREVIEW_DISPLAY_MODE_FIT = "fit";
const FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS = "canvas";
export const IMAGE_TAG_SCOPE_KEY = "images";

const resolveImageAspectRatio = (item) => {
  const width = Number(item?.width);
  const height = Number(item?.height);

  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return "16 / 9";
  }

  return `${Math.max(1, Math.round(width))} / ${Math.max(1, Math.round(height))}`;
};

const createPreviewFrameStyle = (projectResolution) => {
  const aspectRatio = formatProjectResolutionAspectRatio(projectResolution);

  return [
    `width: min(92vw, calc(92vh * (${aspectRatio})))`,
    `aspect-ratio: ${aspectRatio}`,
    "max-width: 92vw",
    "max-height: 92vh",
  ].join("; ");
};

const resolvePositiveNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : undefined;
};

const createPreviewImageWrapperStyle = ({
  image,
  displayMode,
  projectResolution,
} = {}) => {
  if (displayMode !== FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS) {
    return "position: absolute; inset: 0;";
  }

  const imageWidth = resolvePositiveNumber(image?.width);
  const imageHeight = resolvePositiveNumber(image?.height);
  if (!imageWidth || !imageHeight) {
    return "position: absolute; inset: 0;";
  }

  const widthPercent = (imageWidth / projectResolution.width) * 100;
  const heightPercent = (imageHeight / projectResolution.height) * 100;

  return [
    "position: absolute",
    "left: 50%",
    "top: 50%",
    `width: ${widthPercent}%`,
    `height: ${heightPercent}%`,
    "transform: translate(-50%, -50%)",
  ].join("; ");
};

const createPreviewModeButtonViewData = ({ displayMode, mode } = {}) => {
  const selected = displayMode === mode;

  return {
    backgroundColor: selected ? "ac" : "bg",
    borderColor: selected ? "ac" : "bo",
    iconColor: selected ? "white" : "mu-fg",
    selected,
  };
};

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
  hiddenMobileDetailSlots: ["image-file-id"],
  extendViewData: ({ state, baseViewData }) => {
    const selectedItemId = state.selectedItemId;
    const previewImage = state.data?.items?.[selectedItemId];
    const projectResolution = requireProjectResolution(
      state.projectResolution,
      "Project resolution",
    );
    const visibleImageIds = selectVisibleImageIds({
      mediaGroups: baseViewData.mediaGroups,
      items: state.data?.items,
    });
    const previousItemId = selectedItemId
      ? resolveAdjacentImageItemId({
          visibleImageIds,
          itemId: selectedItemId,
          direction: "previous",
        })
      : undefined;
    const nextItemId = selectedItemId
      ? resolveAdjacentImageItemId({
          visibleImageIds,
          itemId: selectedItemId,
          direction: "next",
        })
      : undefined;
    const viewData = { ...baseViewData };

    viewData.fullImagePreviewVisible = state.fullImagePreviewVisible;
    viewData.fullImagePreviewFileId = state.fullImagePreviewFileId;
    viewData.fullImagePreviewFrameStyle =
      createPreviewFrameStyle(projectResolution);
    viewData.fullImagePreviewImageWrapperStyle = createPreviewImageWrapperStyle(
      {
        image: previewImage,
        displayMode: state.fullImagePreviewDisplayMode,
        projectResolution,
      },
    );
    viewData.fullImagePreviewDisplayMode = state.fullImagePreviewDisplayMode;
    viewData.fullImagePreviewFitModeButton = createPreviewModeButtonViewData({
      displayMode: state.fullImagePreviewDisplayMode,
      mode: FULL_IMAGE_PREVIEW_DISPLAY_MODE_FIT,
    });
    viewData.fullImagePreviewCanvasModeButton = createPreviewModeButtonViewData(
      {
        displayMode: state.fullImagePreviewDisplayMode,
        mode: FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
      },
    );
    viewData.fullImagePreviewPreviousVisible = Boolean(previousItemId);
    viewData.fullImagePreviewNextVisible = Boolean(nextItemId);

    return viewData;
  },
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  fullImagePreviewDisplayMode: FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
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
    state.fullImagePreviewDisplayMode = FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;
  }
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = item.fileId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const setFullImagePreviewDisplayMode = (
  { state },
  { displayMode } = {},
) => {
  if (
    displayMode !== FULL_IMAGE_PREVIEW_DISPLAY_MODE_FIT &&
    displayMode !== FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS
  ) {
    return;
  }

  state.fullImagePreviewDisplayMode = displayMode;
};

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution ?? DEFAULT_PROJECT_RESOLUTION,
    "Project resolution",
  );
};

export const selectFullImagePreviewVisible = ({ state }) =>
  state.fullImagePreviewVisible;

export const toggleFullImagePreviewDisplayMode = ({ state }) => {
  state.fullImagePreviewDisplayMode =
    state.fullImagePreviewDisplayMode === FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS
      ? FULL_IMAGE_PREVIEW_DISPLAY_MODE_FIT
      : FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;
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
