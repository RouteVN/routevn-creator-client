import { toFlatGroups, toFlatItems } from "#tree-state";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      type: "slot",
      slot: "video-thumbnail-file-id",
      label: "Thumbnail",
    },
    { name: "name", type: "popover-input", label: "Name" },
    {
      name: "fileType",
      type: "read-only-text",
      label: "File Type",
      content: "${fileType}",
    },
    {
      name: "fileSize",
      type: "read-only-text",
      label: "File Size",
      content: "${fileSize}",
    },
  ],
};

export const createInitialState = () => ({
  videosData: { tree: [], items: {} },
  selectedItemId: null,
  context: {
    thumbnailFileId: {
      src: "",
    },
    fileType: "",
    fileSize: "",
  },
  searchQuery: "",
  videoVisible: false,
  selectedVideo: undefined,
});

export const setItems = ({ state }, { videosData } = {}) => {
  state.videosData = videosData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setContext = ({ state }, { context } = {}) => {
  state.context = context;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.videosData contains the full structure with tree and items
  const flatItems = toFlatItems(state.videosData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const setVideoVisible = ({ state }, payload = {}) => {
  const video = payload.video || {
    url: payload.url,
    fileType: payload.fileType,
  };

  state.videoVisible = true;
  state.selectedVideo = video?.url ? video : undefined;
};

export const setVideoNotVisible = ({ state }, _payload = {}) => {
  state.videoVisible = false;
  state.selectedVideo = undefined;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.videosData);
  const rawFlatGroups = toFlatGroups(state.videosData);
  const searchQuery = state.searchQuery.toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  // Apply search filtering to flatGroups (collapse state is now handled by groupResourcesView)
  const flatGroups = rawFlatGroups
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        children: filteredChildren.map((item) => ({
          ...item,
          selectedStyle:
            item.id === state.selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into detailPanel props
  let detailFields;
  let defaultValues = {};
  let formContext = {
    ...state.context,
    fileType: "",
    fileSize: "",
  };

  if (selectedItem) {
    const fileType = selectedItem.fileType || "";
    const fileSize = formatFileSize(selectedItem.fileSize);

    defaultValues = {
      name: selectedItem.name,
      fileType,
      fileSize,
    };

    formContext = {
      ...state.context,
      fileType,
      fileSize,
    };

    detailFields = [
      {
        type: "image",
        fileId: selectedItem.thumbnailFileId,
        width: 240,
        height: 135,
        editable: true,
        accept: "video/*",
        eventType: "video-file-selected",
      },
      { id: "name", type: "text", value: selectedItem.name, editable: true },
      { type: "text", label: "File Type", value: selectedItem.fileType },
      {
        type: "text",
        label: "File Size",
        value: formatFileSize(selectedItem.fileSize),
      },
    ];
  }

  const detailEmptyMessage = "No selection";

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "videos",
    selectedItemId: state.selectedItemId,
    detailTitle: undefined,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: "videos",
    title: "Videos",
    form,
    context: formContext,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "videos",
    uploadText: "Upload Video",
    acceptedFileTypes: [".mp4"],
    videoVisible: state.videoVisible,
    selectedVideo: state.selectedVideo,
    selectedVideoThumbnailFileId: selectedItem?.thumbnailFileId,
  };
};
