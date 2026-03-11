import { toFlatGroups, toFlatItems } from "../../../../internal/project/tree.js";

const EMPTY_TREE = { tree: [], items: {} };

const folderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const itemContextMenuItems = [
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const emptyContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
];

const createCenterItemContextMenuItems = (previewMenuLabel) => {
  const items = [{ label: "Edit", type: "item", value: "edit-item" }];

  if (previewMenuLabel) {
    items.push({
      label: previewMenuLabel,
      type: "item",
      value: "preview-item",
    });
  }

  items.push({ label: "Delete", type: "item", value: "delete-item" });
  return items;
};

const defaultMatchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();

  return name.includes(searchQuery) || description.includes(searchQuery);
};

export const createMediaPageStore = ({
  itemType,
  resourceType,
  title,
  selectedResourceId = resourceType,
  resourceCategory = "assets",
  uploadText,
  acceptedFileTypes,
  imageHeight = 150,
  maxWidth = 400,
  showZoomControls = false,
  searchPlaceholder = "Search...",
  previewMenuLabel = "Preview",
  centerItemContextMenuItems,
  matchesSearch = defaultMatchesSearch,
  buildDetailFields = () => [],
  buildMediaItem = (item) => item,
  createEditForm = () => undefined,
  getSelectedPreviewFileId = () => undefined,
  extendViewData,
}) => {
  const editForm = createEditForm();
  const resolvedCenterItemContextMenuItems =
    centerItemContextMenuItems ??
    createCenterItemContextMenuItems(previewMenuLabel);
  const selectDataItem = (state, itemId) => {
    const item = state.data?.items?.[itemId];
    return item?.type === itemType ? item : undefined;
  };

  const createInitialState = () => ({
    data: EMPTY_TREE,
    selectedItemId: undefined,
    searchQuery: "",
    isEditDialogOpen: false,
    editItemId: undefined,
    editDefaultValues: {
      name: "",
      description: "",
    },
    editPreviewFileId: undefined,
    editUploadResult: undefined,
  });

  const setItems = ({ state }, { data } = {}) => {
    state.data = data ?? EMPTY_TREE;
  };

  const setSelectedItemId = ({ state }, { itemId } = {}) => {
    state.selectedItemId = itemId;
  };

  const openEditDialog = (
    { state },
    { itemId, defaultValues, previewFileId } = {},
  ) => {
    state.isEditDialogOpen = true;
    state.editItemId = itemId;
    state.editDefaultValues = {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
    };
    state.editPreviewFileId = previewFileId;
    state.editUploadResult = undefined;
  };

  const closeEditDialog = ({ state }, _payload = {}) => {
    state.isEditDialogOpen = false;
    state.editItemId = undefined;
    state.editDefaultValues = {
      name: "",
      description: "",
    };
    state.editPreviewFileId = undefined;
    state.editUploadResult = undefined;
  };

  const setEditUpload = ({ state }, { uploadResult, previewFileId } = {}) => {
    state.editUploadResult = uploadResult;
    state.editPreviewFileId = previewFileId;
  };

  const selectSelectedItem = ({ state }) => {
    return selectDataItem(state, state.selectedItemId);
  };

  const selectItemById = ({ state }, { itemId } = {}) => {
    return selectDataItem(state, itemId);
  };

  const selectSelectedItemId = ({ state }) => state.selectedItemId;

  const setSearchQuery = ({ state }, { value } = {}) => {
    state.searchQuery = value ?? "";
  };

  const selectViewData = ({ state }) => {
    const flatItems = toFlatItems(state.data);
    const rawFlatGroups = toFlatGroups(state.data);
    const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();

    const mediaGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children ?? []).filter((item) =>
          matchesSearch(item, searchQuery),
        );
        const shouldShowGroup = !searchQuery || filteredChildren.length > 0;

        return {
          ...group,
          children: filteredChildren.map(buildMediaItem),
          hasChildren: filteredChildren.length > 0,
          shouldDisplay: shouldShowGroup,
        };
      })
      .filter((group) => group.shouldDisplay);

    const selectedItem = selectDataItem(state, state.selectedItemId);

    const baseViewData = {
      flatItems,
      mediaGroups,
      resourceCategory,
      selectedResourceId,
      selectedItemId: state.selectedItemId,
      selectedItemName: selectedItem?.name ?? "",
      detailFields: buildDetailFields(selectedItem),
      searchQuery: state.searchQuery,
      searchPlaceholder,
      resourceType,
      title,
      uploadText,
      acceptedFileTypes,
      imageHeight,
      maxWidth,
      showZoomControls,
      selectedPreviewFileId: getSelectedPreviewFileId(selectedItem),
      folderContextMenuItems,
      itemContextMenuItems,
      emptyContextMenuItems,
      centerItemContextMenuItems: resolvedCenterItemContextMenuItems,
      isEditDialogOpen: state.isEditDialogOpen,
      editItemId: state.editItemId,
      editForm,
      editDefaultValues: state.editDefaultValues,
      editPreviewFileId: state.editPreviewFileId,
    };

    if (!extendViewData) {
      return baseViewData;
    }

    return extendViewData({
      state,
      flatItems,
      selectedItem,
      mediaGroups,
      baseViewData,
    });
  };

  return {
    createInitialState,
    setItems,
    setSelectedItemId,
    openEditDialog,
    closeEditDialog,
    setEditUpload,
    selectSelectedItem,
    selectItemById,
    selectSelectedItemId,
    setSearchQuery,
    selectViewData,
  };
};
