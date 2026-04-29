import {
  toFlatGroups,
  toFlatItems,
} from "../../../../internal/project/tree.js";
import { prependRootItemsGroup } from "../rootGroups.js";
import {
  buildTagViewData,
  closeCreateTagDialogState,
  commitDetailTagIdsState,
  createTagForm as createDefaultTagForm,
  createTagState,
  filterGroupsByActiveTags,
  openCreateTagDialogState,
  setActiveTagIdsState,
  setDetailTagIdsState,
  setDetailTagPopoverOpenState,
  setTagsDataState,
  syncDetailTagIds,
} from "../tags.js";
import {
  buildMobileResourcePageViewData,
  closeMobileResourceFileExplorerState,
  createMobileResourcePageState,
  openMobileResourceFileExplorerState,
  setMobileResourcePageUiConfigState,
} from "../mobileResourcePage.js";

const EMPTY_TREE = { tree: [], items: {} };

const folderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const itemContextMenuItems = [
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
  buildPendingMediaItem,
  createEditForm = () => undefined,
  getSelectedPreviewFileId = () => undefined,
  hiddenMobileDetailSlots = [],
  extendViewData,
  tagging,
}) => {
  const taggingEnabled = !!tagging;
  const createEmptyTagsCollection = tagging?.createEmptyTagsCollection;
  const createTagFormDefinition =
    tagging?.createTagForm ?? createDefaultTagForm();
  const editForm = createEditForm();
  const createEmptyEditDefaultValues = () => ({
    name: "",
    description: "",
  });
  const resolvedCenterItemContextMenuItems =
    centerItemContextMenuItems ??
    createCenterItemContextMenuItems(previewMenuLabel);
  const selectDataItem = (state, itemId) => {
    const item = state.data?.items?.[itemId];
    return item?.type === itemType ? item : undefined;
  };

  const createInitialState = () => ({
    data: EMPTY_TREE,
    pendingUploads: [],
    selectedItemId: undefined,
    searchQuery: "",
    isEditDialogOpen: false,
    editItemId: undefined,
    editDefaultValues: createEmptyEditDefaultValues(),
    editPreviewFileId: undefined,
    editUploadResult: undefined,
    ...createMobileResourcePageState(),
    ...(taggingEnabled
      ? createTagState({
          createEmptyTagsCollection,
        })
      : {}),
  });

  const setItems = ({ state }, { data } = {}) => {
    state.data = data ?? EMPTY_TREE;
    if (taggingEnabled) {
      syncDetailTagIds({
        state,
        item: selectDataItem(state, state.selectedItemId),
        preserveDirty: true,
      });
    }
  };

  const addPendingUploads = ({ state }, { items } = {}) => {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    state.pendingUploads.push(...items);
  };

  const removePendingUploads = ({ state }, { itemIds } = {}) => {
    const idSet = new Set(Array.isArray(itemIds) ? itemIds : []);
    if (idSet.size === 0) {
      return;
    }

    state.pendingUploads = state.pendingUploads.filter(
      (item) => !idSet.has(item.id),
    );
  };

  const updatePendingUpload = ({ state }, { itemId, updates } = {}) => {
    if (!itemId || !updates) {
      return;
    }

    const pendingUpload = state.pendingUploads.find(
      (item) => item.id === itemId,
    );
    if (!pendingUpload) {
      return;
    }

    for (const [key, value] of Object.entries(updates)) {
      pendingUpload[key] = value;
    }
  };

  const setSelectedItemId = ({ state }, { itemId } = {}) => {
    state.selectedItemId = itemId;
    if (taggingEnabled) {
      state.isDetailTagSelectOpen = false;
      syncDetailTagIds({
        state,
        item: selectDataItem(state, itemId),
      });
    }
  };

  const openEditDialog = (
    { state },
    { itemId, defaultValues, previewFileId } = {},
  ) => {
    state.isEditDialogOpen = true;
    state.editItemId = itemId;
    state.editDefaultValues = {
      ...createEmptyEditDefaultValues(),
    };

    if (defaultValues) {
      Object.assign(state.editDefaultValues, defaultValues);
    }

    state.editPreviewFileId = previewFileId;
    state.editUploadResult = undefined;
  };

  const closeEditDialog = ({ state }, _payload = {}) => {
    state.isEditDialogOpen = false;
    state.editItemId = undefined;
    state.editDefaultValues = createEmptyEditDefaultValues();
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

  const setUiConfig = ({ state }, { uiConfig } = {}) => {
    setMobileResourcePageUiConfigState(state, {
      uiConfig,
    });
  };

  const openMobileFileExplorer = ({ state }, _payload = {}) => {
    openMobileResourceFileExplorerState(state);
  };

  const closeMobileFileExplorer = ({ state }, _payload = {}) => {
    closeMobileResourceFileExplorerState(state);
  };

  const setTagsData = ({ state }, { tagsData } = {}) => {
    setTagsDataState({
      state,
      tagsData,
      createEmptyTagsCollection,
    });
  };

  const setActiveTagIds = ({ state }, { tagIds } = {}) => {
    setActiveTagIdsState({
      state,
      tagIds,
    });
  };

  const setDetailTagIds = ({ state }, { tagIds } = {}) => {
    setDetailTagIdsState({
      state,
      tagIds,
    });
  };

  const commitDetailTagIds = ({ state }, { tagIds } = {}) => {
    commitDetailTagIdsState({
      state,
      tagIds,
    });
  };

  const setDetailTagPopoverOpen = ({ state }, { open, item } = {}) => {
    setDetailTagPopoverOpenState({
      state,
      open,
      item,
    });
  };

  const openCreateTagDialog = (
    { state },
    { mode, itemId, draftTagIds } = {},
  ) => {
    openCreateTagDialogState({
      state,
      mode,
      itemId,
      draftTagIds,
    });
  };

  const closeCreateTagDialog = ({ state }, _payload = {}) => {
    closeCreateTagDialogState({
      state,
    });
  };

  const selectViewData = ({ state }) => {
    const flatItems = toFlatItems(state.data);
    const rawFlatGroups = prependRootItemsGroup({
      data: state.data,
      groups: toFlatGroups(state.data),
      label: title,
    });
    const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
    const pendingByGroupId = new Map();
    const hiddenItemIdsByGroupId = new Map();

    if (typeof buildPendingMediaItem === "function") {
      for (const pendingUpload of state.pendingUploads ?? []) {
        const groupId = pendingUpload?.parentId;
        if (!groupId) {
          continue;
        }

        const existing = pendingByGroupId.get(groupId) ?? [];
        existing.push(buildPendingMediaItem(pendingUpload));
        pendingByGroupId.set(groupId, existing);

        if (typeof pendingUpload.resolvedItemId === "string") {
          const hiddenItemIds =
            hiddenItemIdsByGroupId.get(groupId) ?? new Set();
          hiddenItemIds.add(pendingUpload.resolvedItemId);
          hiddenItemIdsByGroupId.set(groupId, hiddenItemIds);
        }
      }
    }

    const unfilteredMediaGroups = rawFlatGroups
      .map((group) => {
        const hiddenItemIds = hiddenItemIdsByGroupId.get(group.id);
        const filteredChildren = (group.children ?? [])
          .filter((item) => !hiddenItemIds?.has(item.id))
          .filter((item) => matchesSearch(item, searchQuery))
          .map(buildMediaItem);
        const filteredPendingChildren = (
          pendingByGroupId.get(group.id) ?? []
        ).filter((item) => matchesSearch(item, searchQuery));
        const shouldShowGroup =
          !searchQuery ||
          filteredChildren.length > 0 ||
          filteredPendingChildren.length > 0;

        return {
          ...group,
          children: [...filteredChildren, ...filteredPendingChildren],
          hasChildren:
            filteredChildren.length > 0 || filteredPendingChildren.length > 0,
          shouldDisplay: shouldShowGroup,
        };
      })
      .filter((group) => group.shouldDisplay);

    const selectedItem = selectDataItem(state, state.selectedItemId);
    const mediaGroups = taggingEnabled
      ? filterGroupsByActiveTags({
          groups: unfilteredMediaGroups,
          itemsById: state.data?.items,
          activeTagIds: state.activeTagIds,
        })
      : unfilteredMediaGroups;
    const detailFields = buildDetailFields(selectedItem);
    const mobileViewData = buildMobileResourcePageViewData({
      state,
      detailFields,
      hiddenMobileDetailSlots,
    });

    const baseViewData = {
      flatItems,
      mediaGroups,
      resourceCategory,
      selectedResourceId,
      selectedItemId: state.selectedItemId,
      selectedItemName: selectedItem?.name ?? "",
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
      detailFields,
      folderContextMenuItems,
      itemContextMenuItems,
      emptyContextMenuItems,
      centerItemContextMenuItems: resolvedCenterItemContextMenuItems,
      isEditDialogOpen: state.isEditDialogOpen,
      editItemId: state.editItemId,
      editForm,
      editDefaultValues: state.editDefaultValues,
      editPreviewFileId: state.editPreviewFileId,
      ...(taggingEnabled
        ? buildTagViewData({
            state,
            selectedItem,
            createTagFormDefinition,
            tagFilterPlaceholder: tagging?.tagFilterPlaceholder,
            detailTagAddOptionLabel: tagging?.detailTagAddOptionLabel,
          })
        : {}),
    };
    Object.assign(baseViewData, mobileViewData);

    if (!extendViewData) {
      return baseViewData;
    }

    const extendedViewData = extendViewData({
      state,
      flatItems,
      selectedItem,
      mediaGroups,
      baseViewData,
    });

    if (extendedViewData.detailFields !== baseViewData.detailFields) {
      Object.assign(
        extendedViewData,
        buildMobileResourcePageViewData({
          state,
          detailFields: extendedViewData.detailFields,
          hiddenMobileDetailSlots,
        }),
      );
    }

    return extendedViewData;
  };

  return {
    createInitialState,
    setItems,
    addPendingUploads,
    removePendingUploads,
    updatePendingUpload,
    setSelectedItemId,
    openEditDialog,
    closeEditDialog,
    setEditUpload,
    setUiConfig,
    openMobileFileExplorer,
    closeMobileFileExplorer,
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
    selectViewData,
  };
};
