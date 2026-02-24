import { toFlatGroups, toFlatItems } from "#insieme-compat";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      type: "slot",
      slot: "image-file-id",
      label: "Image",
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
    {
      name: "dimensions",
      type: "read-only-text",
      label: "Dimensions",
      content: "${dimensions}",
    },
  ],
};

export const createInitialState = () => ({
  imagesData: { tree: [], items: {} },
  selectedItemId: null,
  context: {
    fileId: {
      src: "",
    },
    fileType: "",
    fileSize: "",
    dimensions: "",
  },
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
});

export const setContext = ({ state }, { context } = {}) => {
  state.context = context;
};

export const setItems = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.imagesData contains the full structure with tree and items
  const flatItems = toFlatItems(state.imagesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value || "";
};

export const showFullImagePreview = ({ state }, { itemId } = {}) => {
  const flatItems = toFlatItems(state.imagesData);
  const item = flatItems.find((item) => item.id === itemId);

  if (item && item.fileId) {
    state.fullImagePreviewVisible = true;
    state.fullImagePreviewFileId = item.fileId;
  }
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.imagesData);
  const rawFlatGroups = toFlatGroups(state.imagesData);
  const searchQuery = (state.searchQuery || "").toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  // Fixed base dimensions - zoom is handled by groupResourcesView
  const baseHeight = 150;
  const baseWidth = 400;
  const imageHeight = baseHeight;
  const maxWidth = baseWidth;

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
          height: imageHeight,
          maxWidth: maxWidth,
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
    dimensions: "",
  };

  if (selectedItem) {
    const formattedFileSize = formatFileSize(selectedItem.fileSize);
    const formattedDimensions = `${selectedItem.width} × ${selectedItem.height}`;
    const fileType = selectedItem.fileType;

    defaultValues = {
      name: selectedItem.name,
      fileType,
      fileSize: formattedFileSize,
      dimensions: formattedDimensions,
    };

    formContext = {
      ...state.context,
      fileType,
      fileSize: formattedFileSize,
      dimensions: formattedDimensions,
    };

    detailFields = [
      {
        type: "image",
        fileId: selectedItem.fileId,
        width: 240,
        editable: true,
        accept: "image/*",
        eventType: "image-file-selected",
      },
      { id: "name", type: "text", value: selectedItem.name, editable: true },
      { type: "text", label: "File Type", value: fileType },
      {
        type: "text",
        label: "File Size",
        value: formattedFileSize,
      },
      {
        type: "text",
        label: "Dimensions",
        value: formattedDimensions,
      },
    ];
  }

  const detailEmptyMessage = "No selection";

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "images",
    selectedItemId: state.selectedItemId,
    detailTitle: undefined,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: "images",
    form,
    context: formContext,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "images",
    title: "Images",
    uploadText: "Upload Image",
    acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp"],
    imageHeight,
    maxWidth,
    selectedImageFileId: selectedItem?.fileId,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
  };
};
