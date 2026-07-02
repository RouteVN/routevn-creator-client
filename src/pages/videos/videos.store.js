import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectVideosPageCopy } from "./support/videosPageCopy.js";

const VIDEO_TAG_SCOPE_KEY = "videos";

const formatDimensions = (item) => {
  if (!item?.width || !item?.height) {
    return "";
  }

  return `${item.width} × ${item.height}`;
};

const formatDuration = (duration, copy) => {
  if (!Number.isFinite(duration) || duration < 0) {
    return copy.unknownValue;
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

const buildDetailFields = (item, { copy } = {}) => {
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
      value: formatDimensions(item),
    },
    {
      type: "text",
      label: copy.durationLabel,
      value: formatDuration(item.duration, copy),
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
      slot: "video-slot",
      label: copy.videoLabel,
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
  itemType: "video",
  resourceType: "videos",
  title: "",
  selectedResourceId: "videos",
  uploadText: "",
  acceptedFileTypes: [".mp4"],
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  copy: selectVideosPageCopy,
  getSelectedPreviewFileId: (item) => item?.thumbnailFileId,
  tagging: {
    tagFilterPlaceholder: "",
  },
  hiddenMobileDetailSlots: ["video-thumbnail-file-id"],
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
