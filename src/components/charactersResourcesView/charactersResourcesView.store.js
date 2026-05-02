import {
  buildTagFilterPopoverViewData,
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  createTagFilterPopoverState,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
} from "../../internal/ui/tagFilterPopover.js";

export const createInitialState = () => ({
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetItemId: undefined,
    items: [],
  },
});

export const toggleGroupCollapse = ({ state }, { groupId } = {}) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
    return;
  }

  state.collapsedIds.push(groupId);
};

export const showContextMenu = ({ state }, { itemId, x, y } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetItemId = itemId;
  state.dropdownMenu.items = [
    { label: "Delete", type: "item", value: "delete-item" },
  ];
};

export const hideContextMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetItemId = undefined;
  state.dropdownMenu.items = [];
};

export const selectDropdownMenu = ({ state }) => state.dropdownMenu;

export {
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
};

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

export const selectViewData = ({ state, props }) => {
  const mobileLayout = parseBooleanProp(props.mobileLayout);
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;
  const searchQuery = props.searchQuery ?? "";
  const searchInFilterPopover = parseBooleanProp(props.searchInFilterPopover);
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveFilter =
    hasActiveTagFilter || (searchInFilterPopover && hasActiveSearch);
  const tagFilterPopoverViewData = buildTagFilterPopoverViewData({
    state,
    props,
  });
  const groups = (props.groups ?? []).map((group) => {
    const isCollapsed = state.collapsedIds.includes(group.id);
    const children = isCollapsed ? [] : (group.children ?? []);

    return {
      ...group,
      isCollapsed,
      headerBackgroundColor: group.id === props.selectedFolderId ? "mu" : "bg",
      children: children.map((item) => {
        const isSelected = item.id === props.selectedItemId;

        return {
          ...item,
          itemBorderColor: isSelected ? "pr" : "bo",
          itemHoverBorderColor: isSelected ? "pr" : "ac",
        };
      }),
    };
  });

  return {
    navTitle: props.navTitle,
    groups,
    selectedItemId: props.selectedItemId,
    searchQuery,
    searchPlaceholder: props.searchPlaceholder ?? "Search...",
    tagFilterOptions: props.tagFilterOptions ?? [],
    selectedTagFilterValues: props.selectedTagFilterValues ?? [],
    tagFilterPlaceholder: props.tagFilterPlaceholder ?? "Filter tags",
    tagFilterPopover: {
      ...tagFilterPopoverViewData.tagFilterPopover,
      clearDisabled:
        tagFilterPopoverViewData.tagFilterPopover.clearDisabled &&
        !(searchInFilterPopover && hasActiveSearch),
    },
    showTagFilter: parseBooleanProp(props.showTagFilter),
    hasActiveTagFilter,
    tagFilterButtonBackgroundColor: hasActiveFilter ? "ac" : "bg",
    tagFilterButtonBorderColor: hasActiveFilter ? "ac" : "bo",
    tagFilterButtonIconColor: hasActiveFilter ? "white" : "mu-fg",
    showSearch:
      parseBooleanProp(props.showSearch, true) && !searchInFilterPopover,
    showFilterPopoverSearch: searchInFilterPopover,
    showMenuButton: parseBooleanProp(props.showMenuButton),
    emptyMessage:
      props.emptyMessage ??
      (hasActiveSearch
        ? `No characters found matching "${searchQuery}"`
        : hasActiveTagFilter
          ? "No characters found for the selected tags"
          : `No characters found matching "${searchQuery}"`),
    addText: props.addText ?? "Add Character",
    mobileLayout,
    dropdownMenu: state.dropdownMenu,
  };
};
