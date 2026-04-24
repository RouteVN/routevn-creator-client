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

const defaultCenterItemContextMenuItems = [
  { label: "Delete", type: "item", value: "delete-item" },
];

const defaultMatchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  return name.includes(searchQuery);
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
  centerItemContextMenuItems = defaultCenterItemContextMenuItems,
  matchesSearch = defaultMatchesSearch,
  buildDetailFields = () => [],
  buildCatalogItem = (item) => item,
  extendViewData,
  tagging,
}) => {
  const taggingEnabled = !!tagging;
  const createEmptyTagsCollection = tagging?.createEmptyTagsCollection;
  const createTagFormDefinition =
    tagging?.createTagForm ?? createDefaultTagForm();
  const selectDataItem = (state, itemId) => {
    const item = state.data?.items?.[itemId];
    return item?.type === itemType ? item : undefined;
  };

  const createInitialState = () => ({
    data: EMPTY_TREE,
    selectedItemId: undefined,
    searchQuery: "",
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
          children: filteredChildren.map(buildCatalogItem),
          hasChildren: filteredChildren.length > 0,
          shouldDisplay: shouldShowGroup,
        };
      })
      .filter((group) => group.shouldDisplay);

    const selectedItem = selectDataItem(state, state.selectedItemId);
    const catalogGroups = taggingEnabled
      ? filterGroupsByActiveTags({
          groups: unfilteredCatalogGroups,
          itemsById: state.data?.items,
          activeTagIds: state.activeTagIds,
        })
      : unfilteredCatalogGroups;
    const detailFields = buildDetailFields(selectedItem);
    const tagViewData = taggingEnabled
      ? buildTagViewData({
          state,
          selectedItem,
          createTagFormDefinition,
          tagFilterPlaceholder: tagging?.tagFilterPlaceholder,
          detailTagAddOptionLabel: tagging?.detailTagAddOptionLabel,
        })
      : undefined;

    const baseViewData = {
      flatItems,
      catalogGroups,
      resourceCategory,
      selectedResourceId,
      selectedItemId: state.selectedItemId,
      selectedItemName: selectedItem?.name ?? "",
      detailFields,
      searchQuery: state.searchQuery,
      searchPlaceholder,
      title,
      addText,
      emptyMessage,
      folderContextMenuItems,
      itemContextMenuItems,
      emptyContextMenuItems,
      centerItemContextMenuItems,
    };
    if (tagViewData) {
      Object.assign(baseViewData, tagViewData);
    }

    if (!extendViewData) {
      return baseViewData;
    }

    return extendViewData({
      state,
      flatItems,
      selectedItem,
      catalogGroups,
      baseViewData,
    });
  };

  return {
    createInitialState,
    setItems,
    setSelectedItemId,
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
