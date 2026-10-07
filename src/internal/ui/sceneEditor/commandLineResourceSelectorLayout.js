const MOBILE_RESOURCE_SELECTOR_GRID_STYLE =
  "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));";
// A card that fills its grid cell.
const GRID_CELL_STYLE =
  "width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box;";
const MOBILE_RESOURCE_SELECTOR_ITEM_STYLE = GRID_CELL_STYLE;

export const createCommandLineResourceSelectorLayout = ({
  isTouchMode,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  columns: isTouchMode ? 2 : undefined,
  gridStyle: isTouchMode ? MOBILE_RESOURCE_SELECTOR_GRID_STYLE : "",
  itemStyle: isTouchMode ? MOBILE_RESOURCE_SELECTOR_ITEM_STYLE : "",
  cardStyle: isTouchMode ? MOBILE_RESOURCE_SELECTOR_ITEM_STYLE : "",
  previewStyle: isTouchMode ? "width: 100%;" : "",
});

// Character and sprite cards keep 16:9 images and fill each row, at least
// `minCardWidth` wide, so wider areas show more of them.
export const createCharacterSelectorLayout = ({
  isTouchMode,
  minCardWidth = 180,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  gridStyle: `display: grid; grid-template-columns: repeat(auto-fill, minmax(${minCardWidth}px, 1fr));`,
  itemStyle: GRID_CELL_STYLE,
  cardStyle: GRID_CELL_STYLE,
  previewStyle: "width: 100%; aspect-ratio: 16 / 9;",
});
