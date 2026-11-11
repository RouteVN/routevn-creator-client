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

// Below this width two cards a row are too small to read, so a row holds one.
const MIN_TWO_COLUMN_CARD_WIDTH = 120;

// Character and sprite cards keep 16:9 images and fill each row, at least
// `minCardWidth` wide, so wider areas show more of them. An area too narrow
// for two such cards still shows two a row, each half the row less the gap,
// until they would be narrower than MIN_TWO_COLUMN_CARD_WIDTH; then one card
// fills the row.
export const createCharacterSelectorLayout = ({
  isTouchMode,
  minCardWidth = 180,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  gridStyle: `display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, max(${MIN_TWO_COLUMN_CARD_WIDTH}px, min(${minCardWidth}px, calc((100% - var(--spacing-lg)) / 2)))), 1fr));`,
  itemStyle: GRID_CELL_STYLE,
  cardStyle: GRID_CELL_STYLE,
  previewStyle: "width: 100%; aspect-ratio: 16 / 9;",
});
