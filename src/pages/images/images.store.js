import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";

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
  canPreview: true,
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
  setItems,
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
  itemType: "image",
  resourceType: "images",
  title: "Images",
  selectedResourceId: "images",
  uploadText: "Upload Image",
  acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp"],
  showZoomControls: true,
  buildDetailFields,
  buildMediaItem,
  createEditForm,
  getSelectedPreviewFileId: (item) => item?.thumbnailFileId ?? item?.fileId,
  extendViewData: ({ state, baseViewData }) => ({
    ...baseViewData,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
  }),
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
});

export {
  setItems,
  setSelectedItemId,
  openEditDialog,
  closeEditDialog,
  setEditUpload,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectImageItemById = selectItemById;

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

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
