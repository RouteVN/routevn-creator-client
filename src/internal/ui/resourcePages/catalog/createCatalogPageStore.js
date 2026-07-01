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
  selectIsMobileFileExplorerOpenState,
  selectIsTouchModeState,
  selectSuppressMobileDetailSheetState,
  setMobileResourceDetailSheetSuppressedState,
  setMobileResourcePageUiConfigState,
} from "../mobileResourcePage.js";

const EMPTY_TREE = { tree: [], items: {} };

const createDefaultCenterItemContextMenuItems = (copy = {}) => [
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

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

export const createCatalogPageStore = ({
  itemType,
  resourceType,
  title,
  selectedResourceId = resourceType,
  resourceCategory = "userInterface",
  addText = "Add",
  searchPlaceholder = "Search...",
  emptyMessage,
  centerItemContextMenuItems = createDefaultCenterItemContextMenuItems,
  matchesSearch = defaultMatchesSearch,
  buildDetailFields = () => [],
  buildCatalogItem = (item) => item,
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
    selectedItemId: undefined,
    selectedFolderId: undefined,
    searchQuery: "",
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

  const setSelectedItemId = (
    { state },
    { itemId, suppressMobileDetailSheet = false } = {},
  ) => {
    state.selectedItemId = itemId;
    setMobileResourceDetailSheetSuppressedState(state, {
      itemId,
      suppressMobileDetailSheet,
    });
    if (itemId !== undefined) {
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

  const selectSelectedItem = ({ state }) => {
    return selectDataItem(state, state.selectedItemId);
  };

  const selectItemById = ({ state }, { itemId } = {}) => {
    return selectDataItem(state, itemId);
  };

  const selectFolderById = ({ state }, { folderId } = {}) => {
    return selectDataFolder(state, folderId);
  };

  const selectIsTouchMode = selectIsTouchModeState;

  const selectIsMobileFileExplorerOpen = selectIsMobileFileExplorerOpenState;

  const selectSuppressMobileDetailSheet = selectSuppressMobileDetailSheetState;

  const setSelectedFolderId = ({ state }, { folderId } = {}) => {
    state.selectedFolderId = folderId;
    if (folderId !== undefined) {
      setMobileResourceDetailSheetSuppressedState(state, {
        itemId: undefined,
      });
    }
    if (folderId !== undefined) {
      state.selectedItemId = undefined;
      if (taggingEnabled) {
        state.isDetailTagSelectOpen = false;
        syncDetailTagIds({
          state,
          item: undefined,
        });
      }
    }
  };

  const selectSelectedItemId = ({ state }) => state.selectedItemId;

  const selectSelectedFolderId = ({ state }) => state.selectedFolderId;

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

  const openFolderNameDialog = (
    { state },
    { folderId, defaultValues } = {},
  ) => {
    state.isFolderNameDialogOpen = true;
    state.folderNameDialogItemId = folderId;
    state.folderNameDialogDefaultValues = createEmptyFolderNameDefaultValues();

    if (defaultValues) {
      Object.assign(state.folderNameDialogDefaultValues, defaultValues);
    }
  };

  const closeFolderNameDialog = ({ state }, _payload = {}) => {
    state.isFolderNameDialogOpen = false;
    state.folderNameDialogItemId = undefined;
    state.folderNameDialogDefaultValues = createEmptyFolderNameDefaultValues();
  };

  const selectViewData = ({ state, i18n }) => {
    const copy = resolveCopy(i18n);
    const resolvedTitle = copy.title ?? title;
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

    const unfilteredCatalogGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children ?? []).filter((item) =>
          matchesSearch(item, searchQuery),
        );
        const groupName = (group.name ?? "").toLowerCase();
        const shouldShowGroup =
          !searchQuery ||
          filteredChildren.length > 0 ||
          groupName.includes(searchQuery);

        return {
          ...group,
          children: filteredChildren.map((item) =>
            buildCatalogItem(item, { copy }),
          ),
          hasChildren: filteredChildren.length > 0,
          shouldDisplay: shouldShowGroup,
        };
      })
      .filter((group) => group.shouldDisplay);

    const selectedItem = selectDataItem(state, state.selectedItemId);
    const selectedFolder = selectDataFolder(state, state.selectedFolderId);
    const selectedDetailId = selectedItem?.id ?? selectedFolder?.id;
    const selectedDetailName = selectedItem?.name ?? selectedFolder?.name ?? "";
    const catalogGroups = taggingEnabled
      ? filterGroupsByActiveTags({
          groups: unfilteredCatalogGroups,
          itemsById: state.data?.items,
          activeTagIds: state.activeTagIds,
        })
      : unfilteredCatalogGroups;
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
    const tagViewData = taggingEnabled
      ? buildTagViewData({
          state,
          selectedItem,
          createTagFormDefinition,
          tagFilterPlaceholder:
            copy.tagFilterPlaceholder ?? tagging?.tagFilterPlaceholder,
          detailTagAddOptionLabel:
            copy.addTagOption ?? tagging?.detailTagAddOptionLabel,
        })
      : undefined;

    const resolvedCenterItemContextMenuItems =
      typeof centerItemContextMenuItems === "function"
        ? centerItemContextMenuItems(copy)
        : centerItemContextMenuItems;

    const baseViewData = {
      flatItems,
      catalogGroups,
      resourceCategory,
      selectedResourceId,
      selectedItemId: state.selectedItemId,
      selectedFolderId: state.selectedFolderId,
      selectedDetailId,
      selectedDetailName,
      selectedItemName: selectedDetailName,
      detailFields,
      searchQuery: state.searchQuery,
      searchPlaceholder: copy.searchPlaceholder ?? searchPlaceholder,
      title: resolvedTitle,
      addText: copy.addText ?? addText,
      emptyMessage: copy.emptyMessage ?? emptyMessage,
      addTagPlaceholder: copy.addTagPlaceholder ?? "Add tag",
      deleteButton: copy.deleteButton ?? "Delete",
      duplicateButton: copy.duplicateButton ?? "Duplicate",
      filesLabel: copy.filesLabel ?? "Files",
      importButton: copy.importButton ?? "Import",
      noSelectionLabel: copy.noSelectionLabel ?? "No selection",
      openButton: copy.openButton ?? "Open",
      previewButton: copy.previewMenuItem ?? "Preview",
      folderContextMenuItems: createFolderContextMenuItems(copy),
      itemContextMenuItems: createItemContextMenuItems(copy),
      emptyContextMenuItems: createEmptyContextMenuItems(copy),
      centerItemContextMenuItems: resolvedCenterItemContextMenuItems,
      isFolderNameDialogOpen: state.isFolderNameDialogOpen,
      folderNameDialogItemId: state.folderNameDialogItemId,
      folderNameForm: createFolderNameForm(copy),
      folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
    };
    Object.assign(baseViewData, mobileViewData);
    if (tagViewData) {
      Object.assign(baseViewData, tagViewData);
    }

    if (!extendViewData) {
      return baseViewData;
    }

    const extendedViewData = extendViewData({
      state,
      flatItems,
      selectedItem,
      catalogGroups,
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
    setSelectedItemId,
    setSelectedFolderId,
    setUiConfig,
    openMobileFileExplorer,
    closeMobileFileExplorer,
    selectSelectedItem,
    selectItemById,
    selectFolderById,
    selectSelectedItemId,
    selectSelectedFolderId,
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
    openFolderNameDialog,
    closeFolderNameDialog,
    selectViewData,
  };
};
