export const parseSelectorColumnCount = (value) => {
  const columns = Number(value);
  return Number.isInteger(columns) && columns > 0 ? columns : undefined;
};

// With a minimum column width, `columns` is the most a row holds, and a
// narrower grid drops columns to keep each one at least that wide. The gap
// is the grid's `g=md`.
export const createSelectorGridStyle = (columns, { minColumnWidth } = {}) => {
  if (!columns) {
    return "";
  }

  if (!minColumnWidth) {
    return `display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr));`;
  }

  const widestColumn = `calc((100% - ${columns - 1} * var(--spacing-md)) / ${columns})`;
  return `display: grid; grid-template-columns: repeat(auto-fill, minmax(max(${minColumnWidth}px, ${widestColumn}), 1fr));`;
};
