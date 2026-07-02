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
  selectActiveTagIdsState,
  selectCreateTagContextState,
  selectDetailTagIdsState,
  selectTagsDataState,
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
  selectIsMobileFileExplorerOpenState,
  selectIsTouchModeState,
  selectSuppressMobileDetailSheetState,
  setMobileResourceDetailSheetSuppressedState,
  setMobileResourcePageUiConfigState,
} from "../mobileResourcePage.js";

const EMPTY_TREE = { tree: [], items: {} };

const createFolderContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-child-folder",
  },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createItemContextMenuItems = (copy = {}) => [
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createEmptyContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-item",
  },
];

const createMediaCenterItemContextMenuItems = (previewMenuLabel, copy = {}) => {
  const items = [
    { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit-item" },
  ];

  if (previewMenuLabel) {
    items.push({
      label: previewMenuLabel,
      type: "item",
      value: "preview-item",
    });
  }

  items.push({
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  });
  return items;
};

const createFolderNameForm = (copy = {}) => ({
  title: copy.editFolderTitle ?? "Edit Folder",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      required: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.saveButton ?? "Save",
        validate: true,
      },
    ],
  },
});

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
  copy: copySelector,
}) => {
  const resolveCopy = (i18n) => {
    if (typeof copySelector === "function") {
      return copySelector(i18n);
    }

    return copySelector ?? {};
  };
  const taggingEnabled = !!tagging;
  const createEmptyTagsCollection = tagging?.createEmptyTagsCollection;
  const createEmptyEditDefaultValues = () => ({
    name: "",
    description: "",
  });
  const createEmptyFolderNameDefaultValues = () => ({
    name: "",
    description: "",
  });
  const selectDataItem = (state, itemId) => {
    const item = state.data?.items?.[itemId];
    return item?.type === itemType ? item : undefined;
  };
  const selectDataFolder = (state, folderId) => {
    const item = state.data?.items?.[folderId];
    return item?.type === "folder" ? item : undefined;
  };
  const buildFolderDetailFields = (folder) => {
    if (!folder) {
      return [];
    }

    return [
      {
        type: "text",
        label: "Type",
        value: "folder",
      },
      {
        type: "description",
        value: folder.description ?? "",
      },
    ];
  };

  const createInitialState = () => ({
    data: EMPTY_TREE,
    pendingUploads: [],
    selectedItemId: undefined,
    selectedFolderId: undefined,
    searchQuery: "",
    isEditDialogOpen: false,
    editItemId: undefined,
    editDefaultValues: createEmptyEditDefaultValues(),
    editPreviewFileId: undefined,
    editUploadResult: undefined,
    isFolderNameDialogOpen: false,
    folderNameDialogItemId: undefined,
    folderNameDialogDefaultValues: createEmptyFolderNameDefaultValues(),
    ...createMobileResourcePageState(),
    ...(taggingEnabled
      ? createTagState({
          createEmptyTagsCollection,
        })
      : {}),
  });

  const setItems = ({ state }, { data } = {}) => {
    state.data = data ?? EMPTY_TREE;
    if (
      state.selectedFolderId &&
      state.data?.items?.[state.selectedFolderId]?.type !== "folder"
    ) {
      state.selectedFolderId = undefined;
    }
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

  const setSelectedItemId = (
    { state },
    { itemId, suppressMobileDetailSheet = false } = {},
  ) => {
    state.selectedItemId = itemId;
    setMobileResourceDetailSheetSuppressedState(state, {
      itemId,
      suppressMobileDetailSheet,
    });
    if (itemId) {
      state.selectedFolderId = undefined;
    }
    if (taggingEnabled) {
      state.isDetailTagSelectOpen = false;
      syncDetailTagIds({
        state,
        item: selectDataItem(state, itemId),
      });
    }
  };

  const setSelectedFolderId = ({ state }, { folderId } = {}) => {
    state.selectedFolderId = folderId;
    state.selectedItemId = undefined;
    setMobileResourceDetailSheetSuppressedState(state, {
      itemId: undefined,
    });
    if (taggingEnabled) {
      state.isDetailTagSelectOpen = false;
      syncDetailTagIds({
        state,
        item: undefined,
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

  const openFolderNameDialog = (
    { state },
    { folderId, defaultValues } = {},
  ) => {
    state.isFolderNameDialogOpen = true;
    state.folderNameDialogItemId = folderId;
    state.folderNameDialogDefaultValues = {
      ...createEmptyFolderNameDefaultValues(),
    };

    if (defaultValues) {
      Object.assign(state.folderNameDialogDefaultValues, defaultValues);
    }
  };

  const closeFolderNameDialog = ({ state }, _payload = {}) => {
    state.isFolderNameDialogOpen = false;
    state.folderNameDialogItemId = undefined;
    state.folderNameDialogDefaultValues = createEmptyFolderNameDefaultValues();
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

  const selectEditItemId = ({ state }) => state.editItemId;

  const selectEditUploadResult = ({ state }) => state.editUploadResult;

  const selectFolderById = ({ state }, { folderId } = {}) => {
    return selectDataFolder(state, folderId);
  };

  const selectIsTouchMode = selectIsTouchModeState;

  const selectIsMobileFileExplorerOpen = selectIsMobileFileExplorerOpenState;

  const selectSuppressMobileDetailSheet = selectSuppressMobileDetailSheetState;

  const selectSelectedFolderId = ({ state }) => state.selectedFolderId;

  const selectFolderNameDialogItemId = ({ state }) =>
    state.folderNameDialogItemId;

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

  const selectViewData = ({ state, i18n }) => {
    const copy = resolveCopy(i18n);
    const resolvedTitle = copy.title ?? title;
    const resolvedPreviewMenuLabel =
      copy.previewMenuLabel ?? copy.previewMenuItem ?? previewMenuLabel;
    const resolvedCenterItemContextMenuItems =
      centerItemContextMenuItems ??
      createMediaCenterItemContextMenuItems(resolvedPreviewMenuLabel, copy);
    const createTagFormDefinition =
      typeof tagging?.createTagForm === "function"
        ? tagging.createTagForm({ copy })
        : (tagging?.createTagForm ??
          createDefaultTagForm({
            title: copy.createTagTitle,
            submitLabel: copy.createTagButton,
            nameLabel: copy.tagNameLabel,
          }));
    const flatItems = toFlatItems(state.data);
    const rawFlatGroups = prependRootItemsGroup({
      data: state.data,
      groups: toFlatGroups(state.data),
      label: resolvedTitle,
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
    const selectedFolder = selectDataFolder(state, state.selectedFolderId);
    const selectedDetailId = selectedItem?.id ?? selectedFolder?.id;
    const selectedDetailName = selectedItem?.name ?? selectedFolder?.name ?? "";
    const mediaGroups = taggingEnabled
      ? filterGroupsByActiveTags({
          groups: unfilteredMediaGroups,
          itemsById: state.data?.items,
          activeTagIds: state.activeTagIds,
        })
      : unfilteredMediaGroups;
    const detailFields = selectedItem
      ? buildDetailFields(selectedItem, { copy })
      : buildFolderDetailFields(selectedFolder).map((field) => {
          if (field.label === "Type") {
            return {
              ...field,
              label: copy.typeLabel ?? field.label,
              value: copy.folderTypeValue ?? field.value,
            };
          }

          return field;
        });
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
      selectedFolderId: state.selectedFolderId,
      selectedDetailId,
      selectedDetailName,
      selectedItemName: selectedDetailName,
      searchQuery: state.searchQuery,
      searchPlaceholder: copy.searchPlaceholder ?? searchPlaceholder,
      resourceType,
      title: resolvedTitle,
      uploadText: copy.uploadButton ?? uploadText,
      acceptedFileTypes,
      imageHeight,
      maxWidth,
      showZoomControls,
      selectedPreviewFileId: getSelectedPreviewFileId(selectedItem),
      detailFields,
      addTagPlaceholder: copy.addTagPlaceholder ?? "Add tag",
      cancelButton: copy.cancelButton ?? "Cancel",
      clickToUploadLabel: copy.clickToUploadLabel ?? "Click to Upload",
      deleteButton: copy.deleteButton ?? "Delete",
      duplicateButton: copy.duplicateButton ?? "Duplicate",
      filesLabel: copy.filesLabel ?? "Files",
      loadingLabel: copy.loadingLabel ?? "Loading...",
      noSelectionLabel: copy.noSelectionLabel ?? "No selection",
      openButton: copy.openButton ?? "Open",
      previewButton:
        resolvedPreviewMenuLabel ?? copy.previewMenuItem ?? "Preview",
      folderContextMenuItems: createFolderContextMenuItems(copy),
      itemContextMenuItems: createItemContextMenuItems(copy),
      emptyContextMenuItems: createEmptyContextMenuItems(copy),
      centerItemContextMenuItems: resolvedCenterItemContextMenuItems,
      isEditDialogOpen: state.isEditDialogOpen,
      editItemId: state.editItemId,
      editForm: createEditForm({ copy }),
      editDefaultValues: state.editDefaultValues,
      editPreviewFileId: state.editPreviewFileId,
      isFolderNameDialogOpen: state.isFolderNameDialogOpen,
      folderNameDialogItemId: state.folderNameDialogItemId,
      folderNameForm: createFolderNameForm(copy),
      folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
      ...(taggingEnabled
        ? buildTagViewData({
            state,
            selectedItem,
            createTagFormDefinition,
            tagFilterPlaceholder:
              copy.tagFilterPlaceholder ?? tagging?.tagFilterPlaceholder,
            detailTagAddOptionLabel:
              copy.addTagOption ?? tagging?.detailTagAddOptionLabel,
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
      copy,
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
    selectIsTouchMode,
    selectIsMobileFileExplorerOpen,
    selectSuppressMobileDetailSheet,
    setSearchQuery,
    setTagsData,
    setActiveTagIds,
    setDetailTagIds,
    commitDetailTagIds,
    setDetailTagPopoverOpen,
    openCreateTagDialog,
    closeCreateTagDialog,
    selectTagsData: selectTagsDataState,
    selectActiveTagIds: selectActiveTagIdsState,
    selectDetailTagIds: selectDetailTagIdsState,
    selectCreateTagContext: selectCreateTagContextState,
    selectViewData,
  };
};
