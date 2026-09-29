export const parseSelectorColumnCount = (value) => {
  const columns = Number(value);
  return Number.isInteger(columns) && columns > 0 ? columns : undefined;
};

export const createSelectorGridStyle = (columns) =>
  columns
    ? `display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr));`
    : "";
