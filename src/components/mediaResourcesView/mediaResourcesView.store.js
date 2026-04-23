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

export const createInitialState = () => ({
  zoomLevel: 1,
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  hoveredItemId: undefined,
  progressiveRenderedItemCount: DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
  progressiveRenderSignature: "",
  progressiveFrameId: undefined,
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

export const selectViewData = ({ state, props, props: attrs }) => {
  const baseHeight = props.imageHeight ?? 150;
  const baseWidth = props.maxWidth ?? 400;
  const baseMediaWidth = 225;
  const baseMediaHeight = 150;
  const imageHeight = Math.round(baseHeight * state.zoomLevel);
  const maxWidth = Math.round(baseWidth * state.zoomLevel);
  const mediaWidth = Math.round(baseMediaWidth * state.zoomLevel);
  const mediaHeight = Math.round(baseMediaHeight * state.zoomLevel);
  const showZoomControlsAttr =
    attrs.showZoomControls ?? attrs["show-zoom-controls"];
  const showBackButtonAttr = attrs.showBackButton ?? attrs["show-back-button"];
  const canUploadAttr = attrs.canUpload ?? attrs["can-upload"];
  const progressiveRenderAttr =
    attrs.progressiveRender ?? attrs["progressive-render"];
  const lazyImageCardsAttr = attrs.lazyImageCards ?? attrs["lazy-image-cards"];
  const showImageCardPreviewAttr =
    attrs.showImageCardPreview ?? attrs["show-image-card-preview"];
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;
  const lazyImageCards = parseBooleanProp(lazyImageCardsAttr);
  let remainingEagerImageCardCount = lazyImageCards
    ? DEFAULT_EAGER_IMAGE_CARD_COUNT
    : Number.POSITIVE_INFINITY;
  let remainingProgressiveItemCount = parseBooleanProp(progressiveRenderAttr)
    ? state.progressiveRenderedItemCount
    : Number.POSITIVE_INFINITY;

  const groups = (props.groups ?? []).map((group) => {
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

        return {
          ...item,
          domItemId: isInteractive ? item.id : "",
          cursor: isInteractive ? "pointer" : "default",
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
    showTagFilter: parseBooleanProp(
      props.showTagFilter ?? props["show-tag-filter"],
    ),
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
    zoomLevel: state.zoomLevel,
    showZoomControls: parseBooleanProp(showZoomControlsAttr),
    showBackButton: parseBooleanProp(showBackButtonAttr),
    canUpload: parseBooleanProp(canUploadAttr, true),
    progressiveRender: parseBooleanProp(progressiveRenderAttr),
    lazyImageCards,
    showImageCardPreview: parseBooleanProp(showImageCardPreviewAttr, true),
    draggingGroupId: state.draggingGroupId,
    dropdownMenu: state.dropdownMenu,
  };
};
