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

export const showContextMenu = ({ state, props }, { itemId, x, y } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetItemId = itemId;
  state.dropdownMenu.items = props.itemContextMenuItems ?? [
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

export const selectViewData = ({ state, props, props: attrs }) => {
  const showTagFilterAttr = attrs.showTagFilter ?? attrs["show-tag-filter"];
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;
  const groups = (props.groups ?? []).map((group) => {
    const isCollapsed = state.collapsedIds.includes(group.id);
    const children = isCollapsed ? [] : (group.children ?? []);

    return {
      ...group,
      isCollapsed,
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
    searchQuery: props.searchQuery ?? "",
    searchPlaceholder: props.searchPlaceholder ?? "Search...",
    tagFilterOptions: props.tagFilterOptions ?? [],
    selectedTagFilterValues: props.selectedTagFilterValues ?? [],
    tagFilterPlaceholder: props.tagFilterPlaceholder ?? "Filter tags",
    ...buildTagFilterPopoverViewData({
      state,
      props,
    }),
    showTagFilter: parseBooleanProp(showTagFilterAttr),
    hasActiveTagFilter,
    tagFilterButtonBackgroundColor: hasActiveTagFilter ? "ac" : "bg",
    tagFilterButtonBorderColor: hasActiveTagFilter ? "ac" : "bo",
    tagFilterButtonIconColor: hasActiveTagFilter ? "white" : "mu-fg",
    emptyMessage:
      props.emptyMessage ??
      (hasActiveTagFilter
        ? "No text styles found for the selected tags"
        : `No text styles found matching "${props.searchQuery ?? ""}"`),
    addText: props.addText ?? "Add Text Style",
    dropdownMenu: state.dropdownMenu,
    previewWidth: 328,
  };
};
