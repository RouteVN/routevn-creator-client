export const parseSelectorColumnCount = (value) => {
  const columns = Number(value);
  return Number.isInteger(columns) && columns > 0 ? columns : undefined;
};

// Below this width two cards a row are too small to read, so a row holds one.
const MIN_TWO_COLUMN_CARD_WIDTH = 120;

// Cards fill each row, at least `minCardWidth` wide, so wider grids show more
// of them. A grid too narrow for two such cards still shows two a row, each
// half the row less the gap, until they would be narrower than
// MIN_TWO_COLUMN_CARD_WIDTH; then one card fills the row. The gap allowed for
// is `g=lg`, which also fits a grid with a smaller gap.
export const createFillSelectorGridStyle = (minCardWidth) =>
  `display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, max(${MIN_TWO_COLUMN_CARD_WIDTH}px, min(${minCardWidth}px, calc((100% - var(--spacing-lg)) / 2)))), 1fr));`;

// Without `columns`, `minCardWidth` lays the cards out as
// createFillSelectorGridStyle does.
// With a minimum column width, `columns` is the most a row holds, and a
// narrower grid drops columns to keep each one at least that wide. The gap
// is the grid's `g=md`.
export const createSelectorGridStyle = (
  columns,
  { minColumnWidth, minCardWidth } = {},
) => {
  if (!columns) {
    return minCardWidth ? createFillSelectorGridStyle(minCardWidth) : "";
  }

  if (!minColumnWidth) {
    return `display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr));`;
  }

  const widestColumn = `calc((100% - ${columns - 1} * var(--spacing-md)) / ${columns})`;
  return `display: grid; grid-template-columns: repeat(auto-fill, minmax(max(${minColumnWidth}px, ${widestColumn}), 1fr));`;
};
