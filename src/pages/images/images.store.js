import { toFlatGroups, toFlatItems } from "../../domain/treeHelpers.js";
import { formatFileSize } from "../../utils/index.js";

export const createInitialState = () => ({
  imagesData: { tree: [], items: {} },
  selectedItemId: null,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
  },
  editImageFileId: undefined,
  editImageUploadResult: undefined,
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
});

export const setItems = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const openEditDialog = (
  { state },
  { itemId, defaultValues, fileId } = {},
) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
  state.editImageFileId = fileId;
  state.editImageUploadResult = undefined;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
  state.editImageFileId = undefined;
  state.editImageUploadResult = undefined;
};

export const setEditImageUpload = ({ state }, { uploadResult } = {}) => {
  state.editImageUploadResult = uploadResult;
  state.editImageFileId = uploadResult?.fileId;
};

const getSelectedItemFromState = (state) => {
  if (!state.selectedItemId) {
    return null;
  }
  const flatItems = toFlatItems(state.imagesData);
  return flatItems.find((item) => item.id === state.selectedItemId) ?? null;
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      fileType: "",
      fileSize: "",
      dimensions: "",
    };
  }

  return {
    fileType: item.fileType ?? "",
    fileSize: formatFileSize(item.fileSize),
    dimensions: `${item.width} × ${item.height}`,
  };
};

export const selectSelectedItem = ({ state }) => {
  return getSelectedItemFromState(state);
};

export const selectImageItemById = ({ state }, { itemId } = {}) => {
  const item = state.imagesData?.items?.[itemId];
  return item?.type === "image" ? item : undefined;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
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
  const searchQuery = (state.searchQuery ?? "").toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();

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
      const filteredChildren = (group.children ?? []).filter(matchesSearch);

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
    : undefined;

  let detailFields = [];
  const selectedItemName = selectedItem?.name ?? "";

  if (selectedItem) {
    const detailFormValues = createDetailFormValues(selectedItem);
    const { fileType, fileSize, dimensions } = detailFormValues;

    detailFields = [
      {
        type: "slot",
        slot: "image-file-id",
        label: "",
      },
      { type: "description", value: selectedItem.description ?? "" },
      { type: "text", label: "File Type", value: fileType },
      { type: "text", label: "File Size", value: fileSize },
      { type: "text", label: "Dimensions", value: dimensions },
    ];
  }

  const editForm = {
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
  };

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "images",
    selectedItemId: state.selectedItemId,
    selectedItemName,
    detailFields,
    repositoryTarget: "images",
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
    isEditDialogOpen: state.isEditDialogOpen,
    editItemId: state.editItemId,
    editForm,
    editDefaultValues: state.editDefaultValues,
    editImageFileId: state.editImageFileId,
  };
};
