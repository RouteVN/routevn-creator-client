import { createFillSelectorGridStyle } from "../resourcePages/selectorGrid.js";

const MOBILE_RESOURCE_SELECTOR_GRID_STYLE =
  "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));";
// A card that fills its grid cell.
const GRID_CELL_STYLE =
  "width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box;";
const DESKTOP_MIN_CARD_WIDTH = 180;

// Touch layouts show two cards a row. Desktop pickers fill each row with
// cards at least DESKTOP_MIN_CARD_WIDTH wide; see createFillSelectorGridStyle
// for how a narrow picker lays them out. `minCardWidth` is for the shared
// selector components, which build their own grid.
export const createCommandLineResourceSelectorLayout = ({
  isTouchMode,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  columns: isTouchMode ? 2 : undefined,
  minCardWidth: isTouchMode ? undefined : DESKTOP_MIN_CARD_WIDTH,
  gridStyle: isTouchMode
    ? MOBILE_RESOURCE_SELECTOR_GRID_STYLE
    : createFillSelectorGridStyle(DESKTOP_MIN_CARD_WIDTH),
  itemStyle: GRID_CELL_STYLE,
  cardStyle: GRID_CELL_STYLE,
  previewStyle: isTouchMode ? "width: 100%;" : "",
});

// Character and sprite cards keep 16:9 images and fill each row on touch
// layouts too, so a tablet's wider panel shows more than two of them.
export const createCharacterSelectorLayout = ({
  isTouchMode,
  minCardWidth = DESKTOP_MIN_CARD_WIDTH,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  gridStyle: createFillSelectorGridStyle(minCardWidth),
  itemStyle: GRID_CELL_STYLE,
  cardStyle: GRID_CELL_STYLE,
  previewStyle: "width: 100%; aspect-ratio: 16 / 9;",
});
