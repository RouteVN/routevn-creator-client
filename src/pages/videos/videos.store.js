import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";

const VIDEO_TAG_SCOPE_KEY = "videos";

const formatDimensions = (item) => {
  if (!item?.width || !item?.height) {
    return "";
  }

  return `${item.width} × ${item.height}`;
};

const formatDuration = (duration) => {
  if (!Number.isFinite(duration) || duration < 0) {
    return "Unknown";
  }

  const totalSeconds = Math.floor(duration);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "video-thumbnail-file-id",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "video-tags",
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
      value: formatDimensions(item),
    },
    {
      type: "text",
      label: "Duration",
      value: formatDuration(item.duration),
    },
  ];
};

const buildMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "video",
  thumbnailFileId: item.thumbnailFileId,
  canPreview: false,
});

const buildPendingMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "video",
  isProcessing: true,
  isInteractive: false,
  canPreview: false,
});

const createEditForm = () => ({
  title: "Edit Video",
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
      slot: "video-slot",
      label: "Video",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Video",
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
  itemType: "video",
  resourceType: "videos",
  title: "Videos",
  selectedResourceId: "videos",
  uploadText: "Upload",
  acceptedFileTypes: [".mp4"],
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  getSelectedPreviewFileId: (item) => item?.thumbnailFileId,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, baseViewData }) => {
    return {
      ...baseViewData,
      videoVisible: state.videoVisible,
      isVideoPreviewReady: state.isVideoPreviewReady,
      selectedVideo: state.selectedVideo,
      selectedVideoAutoplay: state.selectedVideo?.autoplay === true,
      selectedVideoMuted: state.selectedVideo?.muted === true,
    };
  },
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  videoVisible: false,
  isVideoPreviewReady: false,
  selectedVideo: undefined,
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

export const selectVideoItemById = selectItemById;

export const setVideoVisible = ({ state }, { video } = {}) => {
  state.videoVisible = true;
  state.isVideoPreviewReady = false;
  state.selectedVideo = video?.url ? video : undefined;
};

export const setVideoNotVisible = ({ state }, _payload = {}) => {
  state.videoVisible = false;
  state.isVideoPreviewReady = false;
  state.selectedVideo = undefined;
};

export const setVideoPreviewReady = (
  { state },
  { isVideoPreviewReady } = {},
) => {
  state.isVideoPreviewReady = isVideoPreviewReady === true;
};

export const selectViewData = (context) => {
  const viewData = selectMediaViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};

export { VIDEO_TAG_SCOPE_KEY };
