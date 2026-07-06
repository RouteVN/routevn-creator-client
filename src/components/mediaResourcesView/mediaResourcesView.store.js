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

const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 8;
const DEFAULT_EAGER_IMAGE_CARD_COUNT = 8;
const DEFAULT_ITEMS_PER_ROW = 6;
const DEFAULT_MOBILE_ITEMS_PER_ROW = 2;
const MIN_ITEMS_PER_ROW = 1;
const MAX_ITEMS_PER_ROW = 12;
const MAX_MOBILE_ITEMS_PER_ROW = 6;
const MENU_BUTTON_LABEL = "Menu";
const BACK_BUTTON_LABEL = "Back";
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

export const createInitialState = ({ props } = {}) => ({
  zoomLevel: 1,
  itemsPerRow: clampItemsPerRow(props?.defaultItemsPerRow, props),
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  zoomPopover: {
    isOpen: false,
    position: { ...DEFAULT_ZOOM_POPOVER_POSITION },
  },
  hoveredItemId: undefined,
  progressiveRenderedItemCount: parseNonNegativeIntegerProp(
    props?.progressiveInitialItemCount,
    DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
  ),
  progressiveRenderSignature: "",
  progressiveFrameId: undefined,
  soundWaveformRenderedItemCount: 0,
  soundWaveformRenderSignature: "",
  soundWaveformFrameId: undefined,
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

export const setSoundWaveformRenderedItemCount = (
  { state },
  { itemCount } = {},
) => {
  state.soundWaveformRenderedItemCount = itemCount ?? 0;
};

export const selectSoundWaveformRenderedItemCount = ({ state }) =>
  state.soundWaveformRenderedItemCount;

export const setSoundWaveformRenderSignature = (
  { state },
  { signature } = {},
) => {
  state.soundWaveformRenderSignature = signature ?? "";
};

export const selectSoundWaveformRenderSignature = ({ state }) =>
  state.soundWaveformRenderSignature;

export const setSoundWaveformFrameId = ({ state }, { frameId } = {}) => {
  state.soundWaveformFrameId = frameId;
};

export const clearSoundWaveformFrameId = ({ state }) => {
  state.soundWaveformFrameId = undefined;
};

export const selectSoundWaveformFrameId = ({ state }) =>
  state.soundWaveformFrameId;

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

export const setGroupCollapsed = ({ state }, { groupId, collapsed } = {}) => {
  if (!groupId) {
    return;
  }

  const index = state.collapsedIds.indexOf(groupId);
  if (collapsed && index === -1) {
    state.collapsedIds.push(groupId);
    return;
  }

  if (!collapsed && index > -1) {
    state.collapsedIds.splice(index, 1);
  }
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

const resolveDefaultBorderColor = () => {
  return "bo";
};

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
  const useColumnZoomControl = isColumnZoomControlMode(props);
  const showZoomControls = parseBooleanProp(props.showZoomControls);
  const shouldShowZoomControls =
    showZoomControls && (!mobileLayout || useColumnZoomControl);
  const columnZoomControlMax = getMaxItemsPerRow(props);
  const imageCardAspectRatio = props.imageCardAspectRatio ?? undefined;
  const itemsPerRow = useColumnZoomControl
    ? clampItemsPerRow(state.itemsPerRow, props)
    : mobileLayout
      ? 1
      : clampItemsPerRow(state.itemsPerRow, props);
  const effectiveZoomLevel =
    mobileLayout || useColumnZoomControl ? 1 : state.zoomLevel;
  const imageHeight = Math.round(baseHeight * effectiveZoomLevel);
  const maxWidth = Math.round(baseWidth * effectiveZoomLevel);
  const mediaWidth = Math.round(baseMediaWidth * effectiveZoomLevel);
  const mediaHeight = Math.round(baseMediaHeight * effectiveZoomLevel);
  const sourceGroups = props.groups ?? [];
  const cardGridColumns =
    (mobileLayout && !useColumnZoomControl) || fullWidthImageCards
      ? "1"
      : useColumnZoomControl
        ? `${itemsPerRow}`
        : buildAutoFillGridColumns(
            hasImageCards(sourceGroups) ? maxWidth : mediaWidth,
          );
  const scrollBottomPadding = resolveResourceScrollBottomPadding({
    mobileLayout,
    scrollBottomPadding: props.scrollBottomPadding,
  });
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;
  const searchQuery = props.searchQuery ?? "";
  const searchInFilterPopover = parseBooleanProp(props.searchInFilterPopover);
  const zoomInPopover =
    props.zoomInPopover === undefined
      ? true
      : parseBooleanProp(props.zoomInPopover);
  const showMenuButton = parseBooleanProp(props.showMenuButton);
  const menuButtonPlacement =
    props.menuButtonPlacement === "trailing" ? "trailing" : "leading";
  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveFilter =
    hasActiveTagFilter || (searchInFilterPopover && hasActiveSearch);
  const hasSelectedItem = Boolean(props.selectedItemId);
  const tagFilterPopoverViewData = buildTagFilterPopoverViewData({
    state,
    props,
  });
  const lazyImageCards = parseBooleanProp(props.lazyImageCards);
  const lazySoundWaveforms = parseBooleanProp(props.lazySoundWaveforms);
  const progressiveRenderEnabled = parseBooleanProp(props.progressiveRender);
  let remainingEagerImageCardCount = lazyImageCards
    ? DEFAULT_EAGER_IMAGE_CARD_COUNT
    : Number.POSITIVE_INFINITY;
  let remainingSoundWaveformCount = lazySoundWaveforms
    ? state.soundWaveformRenderedItemCount
    : Number.POSITIVE_INFINITY;
  let remainingProgressiveItemCount = progressiveRenderEnabled
    ? state.progressiveRenderedItemCount
    : Number.POSITIVE_INFINITY;

  const groups = sourceGroups.map((group) => {
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
        domItemId: "",
        sourceItemId: item.id,
        cardKind: item.cardKind,
        previewAspectRatio: item.previewAspectRatio,
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
      showEmptyUpload: !hasVisibleChildren && !hasChildFolders,
      headerBackgroundColor: group.id === props.selectedFolderId ? "mu" : "bg",
      progressiveContentMinHeight: 0,
      children: progressiveChildren.children.map((item) => {
        const isSelected = item.id === props.selectedItemId;
        const defaultBorderColor = resolveDefaultBorderColor();
        const isInteractive = item.isInteractive !== false;
        const canRenderImagePreview =
          item.cardKind === "image" && Boolean(item.previewFileId);
        const shouldLazyLoadPreview =
          canRenderImagePreview && remainingEagerImageCardCount <= 0;
        const hasSoundWaveform =
          item.cardKind === "sound" && Boolean(item.waveformDataFileId);
        const shouldRenderWaveform =
          hasSoundWaveform && remainingSoundWaveformCount > 0;

        if (canRenderImagePreview) {
          remainingEagerImageCardCount = Math.max(
            0,
            remainingEagerImageCardCount - 1,
          );
        }
        if (
          hasSoundWaveform &&
          remainingSoundWaveformCount !== Number.POSITIVE_INFINITY
        ) {
          remainingSoundWaveformCount = Math.max(
            0,
            remainingSoundWaveformCount - 1,
          );
        }
        const useFullWidthCard =
          mobileLayout ||
          useColumnZoomControl ||
          (fullWidthImageCards && item.cardKind === "image");
        const selectedMediaInsetStyle =
          isSelected &&
          (item.cardKind === "image" ||
            item.cardKind === "video" ||
            item.cardKind === "sound")
            ? " box-shadow: inset 0 0 0 1px var(--color-pr);"
            : "";
        const imageCardStyle = `${
          useFullWidthCard && item.cardKind === "image"
            ? "max-width: 100%; box-sizing: border-box;"
            : "max-width: 100%;"
        }${selectedMediaInsetStyle}`;
        let mediaCardStyle = "max-width: 100%; box-sizing: border-box;";
        if (item.cardKind === "video" || item.cardKind === "sound") {
          mediaCardStyle += selectedMediaInsetStyle;
        }

        return {
          ...item,
          domItemId: isInteractive ? item.id : "",
          cursor: isInteractive ? "pointer" : "default",
          itemContainerStyle: useFullWidthCard
            ? "width: 100%; box-sizing: border-box;"
            : "",
          imageCardWidth:
            useFullWidthCard && item.cardKind === "image" ? "f" : maxWidth,
          imageCardStyle,
          mediaCardStyle,
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
              : hasSelectedItem
                ? defaultBorderColor
                : "ac",
          showPreviewIcon: Boolean(
            isInteractive && item.canPreview && item.id === state.hoveredItemId,
          ),
          shouldLazyLoadPreview,
          shouldRenderWaveform,
          placeholderCardWidth:
            item.cardKind === "image"
              ? useFullWidthCard
                ? "f"
                : maxWidth
              : useFullWidthCard
                ? "f"
                : mediaWidth,
          placeholderTextWidth: useFullWidthCard ? "60%" : mediaWidth * 0.6,
          placeholderPreviewHeight:
            item.cardKind === "image" ? imageHeight : mediaHeight,
          useFullWidthPlaceholder: useFullWidthCard,
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
    hasActiveTagFilter,
    tagFilterButtonVariant: hasActiveFilter ? "pr" : "ol",
    showTagFilter: parseBooleanProp(props.showTagFilter),
    uploadText: props.uploadText ?? "Upload Files",
    uploadIcon: props.uploadIcon ?? "upload",
    emptyMessage:
      props.emptyMessage ??
      (hasActiveSearch
        ? `No items found matching "${searchQuery}"`
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
      ? toColumnZoomControlValue(itemsPerRow, props)
      : state.zoomLevel,
    zoomControlMin: useColumnZoomControl ? MIN_ITEMS_PER_ROW : 0.5,
    zoomControlMax: useColumnZoomControl ? columnZoomControlMax : 2,
    zoomControlStep: useColumnZoomControl ? 1 : 0.1,
    showZoomControls: shouldShowZoomControls,
    showInlineZoomControls: shouldShowZoomControls && !zoomInPopover,
    showZoomPopoverButton: shouldShowZoomControls && zoomInPopover,
    zoomPopover: state.zoomPopover,
    menuButtonLabel: MENU_BUTTON_LABEL,
    backButtonLabel: BACK_BUTTON_LABEL,
    zoomButtonLabel: ZOOM_BUTTON_LABEL,
    filterButtonLabel: FILTER_BUTTON_LABEL,
    showSearch:
      parseBooleanProp(props.showSearch, true) && !searchInFilterPopover,
    showFilterPopoverSearch: searchInFilterPopover,
    showBackButton: parseBooleanProp(props.showBackButton),
    showLeadingMenuButton: showMenuButton && menuButtonPlacement === "leading",
    showTrailingMenuButton:
      showMenuButton && menuButtonPlacement === "trailing",
    fullWidthImageCards,
    mobileLayout,
    canUpload: parseBooleanProp(props.canUpload, true),
    progressiveRender: progressiveRenderEnabled,
    lazyImageCards,
    lazySoundWaveforms,
    showImageCardPreview: parseBooleanProp(props.showImageCardPreview, true),
    scrollBottomPadding,
    draggingGroupId: state.draggingGroupId,
    dropdownMenu: state.dropdownMenu,
  };
};
