import {
  buildTagFilterPopoverViewData,
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  createTagFilterPopoverState,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
} from "../../internal/ui/tagFilterPopover.js";

const DEFAULT_ITEMS_PER_ROW = 6;
const MIN_ITEMS_PER_ROW = 1;
const MAX_ITEMS_PER_ROW = 12;
const DEFAULT_CARD_WIDTH = 360;
const DEFAULT_ZOOM_POPOVER_POSITION = Object.freeze({
  x: 0,
  y: 0,
});

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

const buildAutoFillGridColumns = (cardWidth) => {
  const width = Math.max(1, Math.round(Number(cardWidth) || 1));
  return `repeat(auto-fill, minmax(min(${width}px, 100%), ${width}px))`;
};

export const createInitialState = ({ props } = {}) => ({
  itemsPerRow: clampItemsPerRow(props?.defaultItemsPerRow),
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  zoomPopover: {
    isOpen: false,
    position: { ...DEFAULT_ZOOM_POPOVER_POSITION },
  },
  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetItemId: undefined,
    items: [],
  },
});

export const setItemsPerRow = ({ state }, { itemsPerRow } = {}) => {
  state.itemsPerRow = clampItemsPerRow(itemsPerRow);
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

const isColumnZoomControlMode = (props) => props.zoomControlMode === "columns";

export const selectViewData = ({ state, props }) => {
  const mobileLayout = parseBooleanProp(props.mobileLayout);
  const useColumnZoomControl = !mobileLayout && isColumnZoomControlMode(props);
  const itemsPerRow = mobileLayout ? 1 : clampItemsPerRow(state.itemsPerRow);
  const cardGridColumns = useColumnZoomControl
    ? `${itemsPerRow}`
    : buildAutoFillGridColumns(DEFAULT_CARD_WIDTH);
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
    itemsPerRow,
    cardGridColumns,
    zoomControlValue: toColumnZoomControlValue(itemsPerRow),
    zoomControlMin: MIN_ITEMS_PER_ROW,
    zoomControlMax: MAX_ITEMS_PER_ROW,
    zoomControlStep: 1,
    showZoomControls:
      useColumnZoomControl && parseBooleanProp(props.showZoomControls),
    zoomPopover: state.zoomPopover,
    showSearch:
      parseBooleanProp(props.showSearch, true) && !searchInFilterPopover,
    showFilterPopoverSearch: searchInFilterPopover,
    showMenuButton: parseBooleanProp(props.showMenuButton),
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
  };
};
