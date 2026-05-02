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
const DEFAULT_CARD_WIDTH = 225;

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
  const fixedItemsPerRow = Number(props.fixedItemsPerRow);
  const hasFixedItemsPerRow =
    !mobileLayout && Number.isFinite(fixedItemsPerRow) && fixedItemsPerRow > 0;
  const fixedColumnCount = hasFixedItemsPerRow
    ? clampItemsPerRow(fixedItemsPerRow)
    : undefined;
  const itemsPerRow = mobileLayout ? 1 : clampItemsPerRow(state.itemsPerRow);
  const cardGridColumns = useColumnZoomControl
    ? `${itemsPerRow}`
    : hasFixedItemsPerRow
      ? `${fixedColumnCount}`
      : buildAutoFillGridColumns(DEFAULT_CARD_WIDTH);
  const hasActiveTagFilter = (props.selectedTagFilterValues?.length ?? 0) > 0;

  const groups = (props.groups ?? []).map((group) => {
    const isCollapsed = state.collapsedIds.includes(group.id);
    const children = isCollapsed ? [] : (group.children ?? []);

    return {
      ...group,
      isCollapsed,
      children: children.map((item) => {
        const isSelected = item.id === props.selectedItemId;
        const useFullWidthCard =
          mobileLayout || useColumnZoomControl || hasFixedItemsPerRow;

        return {
          ...item,
          itemWidth: useFullWidthCard
            ? "f"
            : (item.itemWidth ?? DEFAULT_CARD_WIDTH),
          itemContainerStyle: useFullWidthCard
            ? "width: 100%; box-sizing: border-box;"
            : "",
          layoutPreviewWidth: useFullWidthCard ? "f" : 225,
          transformPreviewWidth: useFullWidthCard ? "f" : 193,
          catalogTextWidth: useFullWidthCard
            ? "f"
            : (item.itemWidth ?? DEFAULT_CARD_WIDTH),
          useFullWidthCatalogPreview:
            (mobileLayout || useColumnZoomControl) &&
            (item.cardKind === "color" ||
              item.cardKind === "transform" ||
              item.cardKind === "layout"),
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
    searchQuery: props.searchQuery ?? "",
    searchPlaceholder: props.searchPlaceholder ?? "Search...",
    tagFilterOptions: props.tagFilterOptions ?? [],
    selectedTagFilterValues: props.selectedTagFilterValues ?? [],
    tagFilterPlaceholder: props.tagFilterPlaceholder ?? "Filter tags",
    ...buildTagFilterPopoverViewData({
      state,
      props,
    }),
    showTagFilter: parseBooleanProp(props.showTagFilter),
    hasActiveTagFilter,
    tagFilterButtonBackgroundColor: hasActiveTagFilter ? "ac" : "bg",
    tagFilterButtonBorderColor: hasActiveTagFilter ? "ac" : "bo",
    tagFilterButtonIconColor: hasActiveTagFilter ? "white" : "mu-fg",
    itemsPerRow,
    cardGridColumns,
    zoomControlValue: toColumnZoomControlValue(itemsPerRow),
    zoomControlMin: MIN_ITEMS_PER_ROW,
    zoomControlMax: MAX_ITEMS_PER_ROW,
    zoomControlStep: 1,
    showZoomControls:
      useColumnZoomControl && parseBooleanProp(props.showZoomControls),
    showSearch: parseBooleanProp(props.showSearch, true),
    showMenuButton: parseBooleanProp(props.showMenuButton),
    emptyMessage:
      props.emptyMessage ??
      (hasActiveTagFilter
        ? "No items found for the selected tags"
        : `No items found matching "${props.searchQuery ?? ""}"`),
    addText: props.addText ?? "Add",
    canAdd: parseBooleanProp(props.canAdd, true),
    mobileLayout,
    dropdownMenu: state.dropdownMenu,
  };
};
