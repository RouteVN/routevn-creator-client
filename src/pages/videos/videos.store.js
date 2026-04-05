import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";

const formatDimensions = (item) => {
  if (!item?.width || !item?.height) {
    return "";
  }

  return `${item.width} × ${item.height}`;
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
  setItems,
  addPendingUploads,
  removePendingUploads,
  setSelectedItemId,
  openEditDialog,
  closeEditDialog,
  setEditUpload,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  selectViewData: selectMediaViewData,
} = createMediaPageStore({
  itemType: "video",
  resourceType: "videos",
  title: "Videos",
  selectedResourceId: "videos",
  uploadText: "Upload",
  acceptedFileTypes: [".mp4"],
  buildDetailFields,
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  getSelectedPreviewFileId: (item) => item?.thumbnailFileId,
  extendViewData: ({ state, baseViewData }) => ({
    ...baseViewData,
    videoVisible: state.videoVisible,
    selectedVideo: state.selectedVideo,
  }),
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  videoVisible: false,
  selectedVideo: undefined,
});

export {
  setItems,
  addPendingUploads,
  removePendingUploads,
  setSelectedItemId,
  openEditDialog,
  closeEditDialog,
  setEditUpload,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectVideoItemById = selectItemById;

export const setVideoVisible = ({ state }, { video } = {}) => {
  state.videoVisible = true;
  state.selectedVideo = video?.url ? video : undefined;
};

export const setVideoNotVisible = ({ state }, _payload = {}) => {
  state.videoVisible = false;
  state.selectedVideo = undefined;
};

export const selectViewData = (context) => {
  const viewData = selectMediaViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
