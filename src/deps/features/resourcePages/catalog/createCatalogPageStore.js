import { toFlatGroups, toFlatItems } from "../../../../domain/treeHelpers.js";

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
}) => {
  const selectDataItem = (state, itemId) => {
    const item = state.data?.items?.[itemId];
    return item?.type === itemType ? item : undefined;
  };

  const createInitialState = () => ({
    data: EMPTY_TREE,
    selectedItemId: undefined,
    searchQuery: "",
  });

  const setItems = ({ state }, { data } = {}) => {
    state.data = data ?? EMPTY_TREE;
  };

  const setSelectedItemId = ({ state }, { itemId } = {}) => {
    state.selectedItemId = itemId;
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

    const catalogGroups = rawFlatGroups
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

    const baseViewData = {
      flatItems,
      catalogGroups,
      resourceCategory,
      selectedResourceId,
      selectedItemId: state.selectedItemId,
      selectedItemName: selectedItem?.name ?? "",
      detailFields: buildDetailFields(selectedItem),
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
    selectViewData,
  };
};
