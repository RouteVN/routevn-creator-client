import { buildProgressivePlaceholderChildren } from "../../internal/ui/resourcePages/progressivePlaceholders.js";
import {
  buildTagFilterPopoverViewData,
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  createTagFilterPopoverState,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
} from "../../internal/ui/tagFilterPopover.js";
import { resolveResourceScrollBottomPadding } from "../../internal/ui/resourcePages/mobileResourcePage.js";

const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 4;
const MENU_BUTTON_LABEL = "Menu";
const FILTER_BUTTON_LABEL = "Filter";

export const createInitialState = () => ({
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  progressiveRenderedItemCount: DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
  progressiveRenderSignature: "",
  progressiveFrameId: undefined,
  syncRenderFrameId: undefined,
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

const parseNonNegativeIntegerProp = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return Math.round(numericValue);
};

export const setProgressiveRenderedItemCount = (
  { state },
  { itemCount } = {},
) => {
  state.progressiveRenderedItemCount = itemCount ?? 0;
};

export const selectProgressiveRenderedItemCount = ({ state }) =>
  state.progressiveRenderedItemCount;

export const setProgressiveRenderSignature = (
  { state },
  { signature } = {},
) => {
  state.progressiveRenderSignature = signature ?? "";
};

export const selectProgressiveRenderSignature = ({ state }) =>
  state.progressiveRenderSignature;

export const setProgressiveFrameId = ({ state }, { frameId } = {}) => {
  state.progressiveFrameId = frameId;
};

export const clearProgressiveFrameId = ({ state }) => {
  state.progressiveFrameId = undefined;
};

export const selectProgressiveFrameId = ({ state }) => state.progressiveFrameId;

export const setSyncRenderFrameId = ({ state }, { frameId } = {}) => {
  state.syncRenderFrameId = frameId;
};

export const clearSyncRenderFrameId = ({ state }) => {
  state.syncRenderFrameId = undefined;
};

export const selectSyncRenderFrameId = ({ state }) => state.syncRenderFrameId;

export const selectViewData = ({ state, props }) => {
  const mobileLayout = parseBooleanProp(props.mobileLayout);
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;
  const searchQuery = props.searchQuery ?? "";
  const searchInFilterPopover = parseBooleanProp(props.searchInFilterPopover);
  const showMenuButton = parseBooleanProp(props.showMenuButton);
  const menuButtonPlacement =
    props.menuButtonPlacement === "trailing" ? "trailing" : "leading";
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveFilter =
    hasActiveTagFilter || (searchInFilterPopover && hasActiveSearch);
  const scrollBottomPadding = resolveResourceScrollBottomPadding({
    mobileLayout,
    scrollBottomPadding: props.scrollBottomPadding,
  });
  const tagFilterPopoverViewData = buildTagFilterPopoverViewData({
    state,
    props,
  });
  const progressiveRenderEnabled = parseBooleanProp(props.progressiveRender);
  let remainingProgressiveItemCount = progressiveRenderEnabled
    ? state.progressiveRenderedItemCount
    : Number.POSITIVE_INFINITY;
  const groups = (props.groups ?? []).map((group) => {
    const isCollapsed = state.collapsedIds.includes(group.id);
    const children = isCollapsed ? [] : (group.children ?? []);
    const hasVisibleChildren = children.length > 0;
    const hasChildFolders = Boolean(group.hasChildFolders);
    const progressiveChildren = buildProgressivePlaceholderChildren({
      children,
      remainingProgressiveItemCount,
      groupId: group.id,
      placeholderItemCount: children.length,
      createPlaceholder: ({ item, absoluteIndex, groupId }) => ({
        id: `${item.id ?? `${groupId}-${absoluteIndex}`}-placeholder`,
        sourceItemId: item.id,
        isPlaceholder: true,
        isInteractive: false,
      }),
    });

    remainingProgressiveItemCount =
      progressiveChildren.remainingProgressiveItemCount;

    return {
      ...group,
      isCollapsed,
      hasChildren: hasVisibleChildren,
      hasChildFolders,
      showEmptyAdd: !hasVisibleChildren && !hasChildFolders,
      headerBackgroundColor: group.id === props.selectedFolderId ? "mu" : "bg",
      progressiveContentMinHeight: 0,
      children: progressiveChildren.children.map((item) => {
        const isSelected = item.id === props.selectedItemId;
        const isPlaceholder = item.isPlaceholder === true;

        return {
          ...item,
          domItemId: isPlaceholder ? "" : item.id,
          cursor: isPlaceholder ? "default" : "pointer",
          itemBorderColor: isSelected ? "pr" : "bo",
          itemHoverBorderColor: isPlaceholder ? "bo" : isSelected ? "pr" : "ac",
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
    tagFilterButtonVariant: hasActiveFilter ? "pr" : "ol",
    menuButtonLabel: MENU_BUTTON_LABEL,
    filterButtonLabel: FILTER_BUTTON_LABEL,
    showSearch:
      parseBooleanProp(props.showSearch, true) && !searchInFilterPopover,
    showFilterPopoverSearch: searchInFilterPopover,
    showLeadingMenuButton: showMenuButton && menuButtonPlacement === "leading",
    showTrailingMenuButton:
      showMenuButton && menuButtonPlacement === "trailing",
    progressiveRender: progressiveRenderEnabled,
    progressiveInitialItemCount: parseNonNegativeIntegerProp(
      props.progressiveInitialItemCount,
      DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
    ),
    emptyMessage:
      props.emptyMessage ??
      (hasActiveSearch
        ? `No characters found matching "${searchQuery}"`
        : hasActiveTagFilter
          ? "No characters found for the selected tags"
          : `No characters found matching "${searchQuery}"`),
    addText: props.addText ?? "Add Character",
    mobileLayout,
    scrollBottomPadding,
    dropdownMenu: state.dropdownMenu,
  };
};
