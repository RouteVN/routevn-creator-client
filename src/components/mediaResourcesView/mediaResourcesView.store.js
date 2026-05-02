import {
  buildTagFilterPopoverViewData,
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  createTagFilterPopoverState,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
} from "../../internal/ui/tagFilterPopover.js";

const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 8;
const DEFAULT_EAGER_IMAGE_CARD_COUNT = 8;
const DEFAULT_ITEMS_PER_ROW = 6;
const MIN_ITEMS_PER_ROW = 1;
const MAX_ITEMS_PER_ROW = 12;

const clampItemsPerRow = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_ITEMS_PER_ROW;
  }

  return Math.min(
    MAX_ITEMS_PER_ROW,
    Math.max(MIN_ITEMS_PER_ROW, Math.round(numericValue)),
  );
};

const toColumnZoomControlValue = (itemsPerRow) => {
  return MIN_ITEMS_PER_ROW + MAX_ITEMS_PER_ROW - clampItemsPerRow(itemsPerRow);
};

export const createInitialState = ({ props } = {}) => ({
  zoomLevel: 1,
  itemsPerRow: clampItemsPerRow(props?.defaultItemsPerRow),
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  hoveredItemId: undefined,
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
  draggingGroupId: undefined,
});

export const setZoomLevel = ({ state }, { zoomLevel } = {}) => {
  state.zoomLevel = zoomLevel;
};

export const selectZoomLevel = ({ state }) => state.zoomLevel;

export const setItemsPerRow = ({ state }, { itemsPerRow } = {}) => {
  state.itemsPerRow = clampItemsPerRow(itemsPerRow);
};

export const selectItemsPerRow = ({ state }) => state.itemsPerRow;

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

export const setDraggingGroupId = ({ state }, { groupId } = {}) => {
  state.draggingGroupId = groupId;
};

export const selectDraggingGroupId = ({ state }) => state.draggingGroupId;

export const setHoveredItemId = ({ state }, { itemId } = {}) => {
  state.hoveredItemId = itemId;
};

export const selectHoveredItemId = ({ state }) => state.hoveredItemId;

export const selectCollapsedIds = ({ state }) => state.collapsedIds;

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

const resolveDefaultBorderColor = () => {
  return "bo";
};

const isColumnZoomControlMode = (props) => props.zoomControlMode === "columns";

const hasImageCards = (groups = []) => {
  return groups.some((group) =>
    (group?.children ?? []).some((item) => item?.cardKind === "image"),
  );
};

const buildAutoFillGridColumns = (cardWidth) => {
  const width = Math.max(1, Math.round(Number(cardWidth) || 1));
  return `repeat(auto-fill, minmax(min(${width}px, 100%), ${width}px))`;
};

export const selectViewData = ({ state, props }) => {
  const baseHeight = props.imageHeight ?? 150;
  const baseWidth = props.maxWidth ?? 400;
  const baseMediaWidth = 225;
  const baseMediaHeight = 150;
  const fullWidthImageCards = parseBooleanProp(props.fullWidthImageCards);
  const mobileLayout = parseBooleanProp(props.mobileLayout);
  const useColumnZoomControl = !mobileLayout && isColumnZoomControlMode(props);
  const imageCardAspectRatio = props.imageCardAspectRatio ?? undefined;
  const itemsPerRow = mobileLayout ? 1 : clampItemsPerRow(state.itemsPerRow);
  const effectiveZoomLevel =
    mobileLayout || useColumnZoomControl ? 1 : state.zoomLevel;
  const imageHeight = Math.round(baseHeight * effectiveZoomLevel);
  const maxWidth = Math.round(baseWidth * effectiveZoomLevel);
  const mediaWidth = Math.round(baseMediaWidth * effectiveZoomLevel);
  const mediaHeight = Math.round(baseMediaHeight * effectiveZoomLevel);
  const sourceGroups = props.groups ?? [];
  const cardGridColumns =
    mobileLayout || fullWidthImageCards
      ? "1"
      : useColumnZoomControl
        ? `${itemsPerRow}`
        : buildAutoFillGridColumns(
            hasImageCards(sourceGroups) ? maxWidth : mediaWidth,
          );
  const scrollBottomPadding = props.scrollBottomPadding ?? "0px";
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;
  const lazyImageCards = parseBooleanProp(props.lazyImageCards);
  let remainingEagerImageCardCount = lazyImageCards
    ? DEFAULT_EAGER_IMAGE_CARD_COUNT
    : Number.POSITIVE_INFINITY;
  let remainingProgressiveItemCount = parseBooleanProp(props.progressiveRender)
    ? state.progressiveRenderedItemCount
    : Number.POSITIVE_INFINITY;

  const groups = sourceGroups.map((group) => {
    const isCollapsed = state.collapsedIds.includes(group.id);
    const children = isCollapsed ? [] : (group.children ?? []);
    const visibleChildren =
      remainingProgressiveItemCount === Number.POSITIVE_INFINITY
        ? children
        : children.slice(0, Math.max(0, remainingProgressiveItemCount));

    if (remainingProgressiveItemCount !== Number.POSITIVE_INFINITY) {
      remainingProgressiveItemCount = Math.max(
        0,
        remainingProgressiveItemCount - children.length,
      );
    }

    return {
      ...group,
      isCollapsed,
      children: visibleChildren.map((item) => {
        const isSelected = item.id === props.selectedItemId;
        const defaultBorderColor = resolveDefaultBorderColor();
        const isInteractive = item.isInteractive !== false;
        const canRenderImagePreview =
          item.cardKind === "image" && Boolean(item.previewFileId);
        const shouldLazyLoadPreview =
          canRenderImagePreview && remainingEagerImageCardCount <= 0;

        if (canRenderImagePreview) {
          remainingEagerImageCardCount = Math.max(
            0,
            remainingEagerImageCardCount - 1,
          );
        }
        const useFullWidthCard =
          mobileLayout ||
          useColumnZoomControl ||
          (fullWidthImageCards && item.cardKind === "image");

        return {
          ...item,
          domItemId: isInteractive ? item.id : "",
          cursor: isInteractive ? "pointer" : "default",
          itemContainerStyle: useFullWidthCard
            ? "width: 100%; box-sizing: border-box;"
            : "",
          imageCardWidth:
            useFullWidthCard && item.cardKind === "image" ? "f" : maxWidth,
          imageCardStyle:
            useFullWidthCard && item.cardKind === "image"
              ? "max-width: 100%; box-sizing: border-box;"
              : "max-width: 100%;",
          mediaCardWidth: useFullWidthCard ? "f" : mediaWidth,
          mediaTextWidth: useFullWidthCard ? "f" : mediaWidth,
          fontPreviewWidth: useFullWidthCard ? 320 : mediaWidth,
          useFullWidthImageCard: useFullWidthCard && item.cardKind === "image",
          useFullWidthMediaPreview:
            useFullWidthCard &&
            (item.cardKind === "video" || item.cardKind === "sound"),
          useFullWidthFontPreview: useFullWidthCard && item.cardKind === "font",
          previewAspectRatio:
            item.cardKind === "video" ||
            item.cardKind === "sound" ||
            item.cardKind === "font"
              ? "16 / 9"
              : useFullWidthCard && item.cardKind === "image"
                ? (imageCardAspectRatio ?? item.previewAspectRatio ?? "16 / 9")
                : (item.previewAspectRatio ?? "16 / 9"),
          itemBorderColor: isSelected ? "pr" : defaultBorderColor,
          itemHoverBorderColor: isSelected
            ? "pr"
            : !isInteractive
              ? defaultBorderColor
              : "ac",
          showPreviewIcon: Boolean(
            isInteractive && item.canPreview && item.id === state.hoveredItemId,
          ),
          shouldLazyLoadPreview,
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
    hasActiveTagFilter,
    tagFilterButtonBackgroundColor: hasActiveTagFilter ? "ac" : "bg",
    tagFilterButtonBorderColor: hasActiveTagFilter ? "ac" : "bo",
    tagFilterButtonIconColor: hasActiveTagFilter ? "white" : "mu-fg",
    showTagFilter: parseBooleanProp(props.showTagFilter),
    uploadText: props.uploadText ?? "Upload Files",
    uploadIcon: props.uploadIcon ?? "upload",
    emptyMessage:
      props.emptyMessage ??
      ((props.searchQuery ?? "").trim().length > 0
        ? `No items found matching "${props.searchQuery ?? ""}"`
        : hasActiveTagFilter
          ? "No items found for the selected tags"
          : "No items found"),
    acceptedFileTypes: props.acceptedFileTypes ?? [],
    imageHeight,
    maxWidth,
    mediaWidth,
    mediaHeight,
    itemsPerRow,
    cardGridColumns,
    zoomLevel: state.zoomLevel,
    zoomControlValue: useColumnZoomControl
      ? toColumnZoomControlValue(itemsPerRow)
      : state.zoomLevel,
    zoomControlMin: useColumnZoomControl ? MIN_ITEMS_PER_ROW : 0.5,
    zoomControlMax: useColumnZoomControl ? MAX_ITEMS_PER_ROW : 2,
    zoomControlStep: useColumnZoomControl ? 1 : 0.1,
    showZoomControls: !mobileLayout && parseBooleanProp(props.showZoomControls),
    showSearch: parseBooleanProp(props.showSearch, true),
    showBackButton: parseBooleanProp(props.showBackButton),
    showMenuButton: parseBooleanProp(props.showMenuButton),
    fullWidthImageCards,
    mobileLayout,
    canUpload: parseBooleanProp(props.canUpload, true),
    progressiveRender: parseBooleanProp(props.progressiveRender),
    lazyImageCards,
    showImageCardPreview: parseBooleanProp(props.showImageCardPreview, true),
    scrollBottomPadding,
    draggingGroupId: state.draggingGroupId,
    dropdownMenu: state.dropdownMenu,
  };
};
