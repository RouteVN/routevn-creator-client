import { createFillSelectorGridStyle } from "../resourcePages/selectorGrid.js";

// A card that fills its grid cell.
const GRID_CELL_STYLE =
  "width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box;";
const MIN_CARD_WIDTH = 180;

// Pickers fill each row with cards at least MIN_CARD_WIDTH wide, on desktop
// and touch layouts alike; see createFillSelectorGridStyle for how a narrow
// picker lays them out. Touch layouts drop the folder list. `minCardWidth` is
// for the shared selector components, which build their own grid.
export const createCommandLineResourceSelectorLayout = ({
  isTouchMode,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  minCardWidth: MIN_CARD_WIDTH,
  gridStyle: createFillSelectorGridStyle(MIN_CARD_WIDTH),
  itemStyle: GRID_CELL_STYLE,
  cardStyle: GRID_CELL_STYLE,
});

// Character and sprite cards also keep 16:9 images.
export const createCharacterSelectorLayout = ({
  isTouchMode,
  minCardWidth = MIN_CARD_WIDTH,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  gridStyle: createFillSelectorGridStyle(minCardWidth),
  itemStyle: GRID_CELL_STYLE,
  cardStyle: GRID_CELL_STYLE,
  previewStyle: "width: 100%; aspect-ratio: 16 / 9;",
});
