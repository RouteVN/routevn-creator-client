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

const DEFAULT_ITEMS_PER_ROW = 6;
const DEFAULT_MOBILE_ITEMS_PER_ROW = 2;
const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 4;
const MIN_ITEMS_PER_ROW = 1;
const MAX_ITEMS_PER_ROW = 12;
const MAX_MOBILE_ITEMS_PER_ROW = 6;
const DEFAULT_CARD_WIDTH = 360;
const MENU_BUTTON_LABEL = "Menu";
const ZOOM_BUTTON_LABEL = "Zoom";
const FILTER_BUTTON_LABEL = "Filter";
const DEFAULT_ZOOM_POPOVER_POSITION = Object.freeze({
  x: 0,
  y: 0,
});

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

const isColumnZoomControlMode = (props) => props?.zoomControlMode === "columns";

const isMobileColumnZoomControl = (props) =>
  parseBooleanProp(props?.mobileLayout) && isColumnZoomControlMode(props);

const getDefaultItemsPerRow = (props) =>
  isMobileColumnZoomControl(props)
    ? DEFAULT_MOBILE_ITEMS_PER_ROW
    : DEFAULT_ITEMS_PER_ROW;

const getMaxItemsPerRow = (props) =>
  isMobileColumnZoomControl(props)
    ? MAX_MOBILE_ITEMS_PER_ROW
    : MAX_ITEMS_PER_ROW;

const clampItemsPerRow = (value, props) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return getDefaultItemsPerRow(props);
  }

  return Math.min(
    getMaxItemsPerRow(props),
    Math.max(MIN_ITEMS_PER_ROW, Math.round(numericValue)),
  );
};

const toColumnZoomControlValue = (itemsPerRow, props) => {
  return (
    MIN_ITEMS_PER_ROW +
    getMaxItemsPerRow(props) -
    clampItemsPerRow(itemsPerRow, props)
  );
};

const buildAutoFillGridColumns = (cardWidth) => {
  const width = Math.max(1, Math.round(Number(cardWidth) || 1));
  return `repeat(auto-fill, minmax(min(${width}px, 100%), ${width}px))`;
};

export const createInitialState = ({ props } = {}) => ({
  itemsPerRow: clampItemsPerRow(props?.defaultItemsPerRow, props),
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  zoomPopover: {
    isOpen: false,
    position: { ...DEFAULT_ZOOM_POPOVER_POSITION },
  },
  progressiveRenderedItemCount: parseNonNegativeIntegerProp(
    props?.progressiveInitialItemCount,
    DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
  ),
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

export const setItemsPerRow = ({ state, props }, { itemsPerRow } = {}) => {
  state.itemsPerRow = clampItemsPerRow(itemsPerRow, props);
};

export const selectItemsPerRow = ({ state }) => state.itemsPerRow;

export const openZoomPopover = ({ state }, { position } = {}) => {
  state.zoomPopover.isOpen = true;
  state.zoomPopover.position = {
    x: position?.x ?? DEFAULT_ZOOM_POPOVER_POSITION.x,
    y: position?.y ?? DEFAULT_ZOOM_POPOVER_POSITION.y,
  };
};

export const closeZoomPopover = ({ state }, _payload = {}) => {
  state.zoomPopover.isOpen = false;
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

export const selectViewData = ({ state, props }) => {
  const mobileLayout = parseBooleanProp(props.mobileLayout);
  const useColumnZoomControl = isColumnZoomControlMode(props);
  const columnZoomControlMax = getMaxItemsPerRow(props);
  const itemsPerRow = useColumnZoomControl
    ? clampItemsPerRow(state.itemsPerRow, props)
    : mobileLayout
      ? 1
      : clampItemsPerRow(state.itemsPerRow, props);
  const cardGridColumns =
    mobileLayout && !useColumnZoomControl
      ? "1"
      : useColumnZoomControl
        ? `${itemsPerRow}`
        : buildAutoFillGridColumns(DEFAULT_CARD_WIDTH);
  const scrollBottomPadding = resolveResourceScrollBottomPadding({
    mobileLayout,
    scrollBottomPadding: props.scrollBottomPadding,
  });
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;
  const searchQuery = props.searchQuery ?? "";
  const searchInFilterPopover = parseBooleanProp(props.searchInFilterPopover);
  const showMenuButton = parseBooleanProp(props.showMenuButton);
  const menuButtonPlacement =
    props.menuButtonPlacement === "trailing" ? "trailing" : "leading";
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveFilter =
    hasActiveTagFilter || (searchInFilterPopover && hasActiveSearch);
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
          itemWidth:
            mobileLayout || useColumnZoomControl ? "f" : DEFAULT_CARD_WIDTH,
          itemContainerStyle:
            mobileLayout || useColumnZoomControl
              ? "width: 100%; box-sizing: border-box;"
              : "",
          previewWidth: mobileLayout || useColumnZoomControl ? "f" : 328,
          useFullWidthPreview: mobileLayout || useColumnZoomControl,
          previewAspectRatio: "16 / 9",
          itemBorderColor: isSelected ? "pr" : "bo",
          itemHoverBorderColor: isPlaceholder ? "bo" : isSelected ? "pr" : "ac",
          placeholderPreviewHeight: 96,
          placeholderTextWidth:
            mobileLayout || useColumnZoomControl ? "60%" : 216,
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
    itemsPerRow,
    cardGridColumns,
    zoomControlValue: toColumnZoomControlValue(itemsPerRow, props),
    zoomControlMin: MIN_ITEMS_PER_ROW,
    zoomControlMax: columnZoomControlMax,
    zoomControlStep: 1,
    showZoomControls:
      useColumnZoomControl && parseBooleanProp(props.showZoomControls),
    zoomPopover: state.zoomPopover,
    menuButtonLabel: MENU_BUTTON_LABEL,
    zoomButtonLabel: ZOOM_BUTTON_LABEL,
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
        ? `No text styles found matching "${searchQuery}"`
        : hasActiveTagFilter
          ? "No text styles found for the selected tags"
          : `No text styles found matching "${searchQuery}"`),
    addText: props.addText ?? "Add Text Style",
    dropdownMenu: state.dropdownMenu,
    mobileLayout,
    scrollBottomPadding,
  };
};
