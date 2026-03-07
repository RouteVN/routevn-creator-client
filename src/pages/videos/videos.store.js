import { toFlatGroups, toFlatItems } from "../../domain/treeHelpers.js";
import { formatFileSize } from "../../utils/index.js";

const formatDimensions = (item) => {
  if (!item?.width || !item?.height) {
    return "";
  }

  return `${item.width} × ${item.height}`;
};

export const createInitialState = () => ({
  videosData: { tree: [], items: {} },
  selectedItemId: undefined,
  searchQuery: "",
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
  },
  editThumbnailFileId: undefined,
  editVideoUploadResult: undefined,
  videoVisible: false,
  selectedVideo: undefined,
});

export const setItems = ({ state }, { videosData } = {}) => {
  state.videosData = videosData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const openEditDialog = (
  { state },
  { itemId, defaultValues, thumbnailFileId } = {},
) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
  state.editThumbnailFileId = thumbnailFileId;
  state.editVideoUploadResult = undefined;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
  state.editThumbnailFileId = undefined;
  state.editVideoUploadResult = undefined;
};

export const setEditVideoUpload = ({ state }, { uploadResult } = {}) => {
  state.editVideoUploadResult = uploadResult;
  state.editThumbnailFileId = uploadResult?.thumbnailFileId;
};

export const setVideoVisible = ({ state }, { video } = {}) => {
  state.videoVisible = true;
  state.selectedVideo = video?.url ? video : undefined;
};

export const setVideoNotVisible = ({ state }, _payload = {}) => {
  state.videoVisible = false;
  state.selectedVideo = undefined;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toFlatItems(state.videosData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectVideoItemById = ({ state }, { itemId } = {}) => {
  const item = state.videosData?.items?.[itemId];
  return item?.type === "video" ? item : undefined;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.videosData);
  const rawFlatGroups = toFlatGroups(state.videosData);
  const searchQuery = (state.searchQuery ?? "").toLowerCase();

  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  const flatGroups = rawFlatGroups
    .map((group) => {
      const filteredChildren = (group.children ?? []).filter(matchesSearch);
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        children: filteredChildren,
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;

  const detailFields = selectedItem
    ? [
        {
          type: "slot",
          slot: "video-thumbnail-file-id",
          label: "",
        },
        {
          type: "description",
          value: selectedItem.description ?? "",
        },
        {
          type: "text",
          label: "File Type",
          value: selectedItem.fileType ?? "",
        },
        {
          type: "text",
          label: "File Size",
          value: formatFileSize(selectedItem.fileSize),
        },
        {
          type: "text",
          label: "Dimensions",
          value: formatDimensions(selectedItem),
        },
      ]
    : [];

  const editForm = {
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
  };

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "videos",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields,
    repositoryTarget: "videos",
    title: "Videos",
    searchQuery: state.searchQuery,
    resourceType: "videos",
    uploadText: "Upload Video",
    acceptedFileTypes: [".mp4"],
    selectedVideoThumbnailFileId: selectedItem?.thumbnailFileId,
    isEditDialogOpen: state.isEditDialogOpen,
    editItemId: state.editItemId,
    editForm,
    editDefaultValues: state.editDefaultValues,
    editThumbnailFileId: state.editThumbnailFileId,
    videoVisible: state.videoVisible,
    selectedVideo: state.selectedVideo,
  };
};
