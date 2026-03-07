export const deepClone = (value) => structuredClone(value);

export const assertFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export const assertNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const insertAtIndex = (array, value, index) => {
  if (!Array.isArray(array)) throw new Error("insertAtIndex expects array");
  if (index === undefined || index === null || index >= array.length) {
    array.push(value);
    return;
  }
  if (index <= 0) {
    array.unshift(value);
    return;
  }
  array.splice(index, 0, value);
};

export const removeFromArray = (array, value) => {
  const idx = array.indexOf(value);
  if (idx >= 0) array.splice(idx, 1);
};

export const upsertNoDuplicate = (array, value, index) => {
  removeFromArray(array, value);
  insertAtIndex(array, value, index);
};

export const normalizeIndex = (index) => {
  if (!Number.isInteger(index)) return undefined;
  return Math.max(0, index);
};
