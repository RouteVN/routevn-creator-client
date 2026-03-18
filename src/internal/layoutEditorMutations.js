import { getLayoutEditorTypeRules } from "./layoutEditorTypes.js";

const cloneWithDeletedValue = (target, key) => {
  if (!target || typeof target !== "object") {
    return target;
  }

  delete target[key];
  return target;
};

const setValueAtPath = (target, path, value) => {
  const segments = path.split(".");
  let current = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!current[segment] || typeof current[segment] !== "object") {
      current[segment] = {};
    }
    current = current[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (value === undefined) {
    delete current[lastSegment];
  } else {
    current[lastSegment] = value;
  }

  return target;
};

const setTopLevelValue = (target, name, value) => {
  if (value === undefined) {
    return cloneWithDeletedValue(target, name);
  }

  target[name] = value;
  return target;
};

export const applyLayoutItemFieldChange = ({
  item,
  name,
  value,
  imagesData,
} = {}) => {
  if (!item || !name) {
    return item;
  }

  const typeRules = getLayoutEditorTypeRules(item.type);
  const normalizedValue =
    typeRules.normalizeFieldValue?.({
      item,
      name,
      value,
    }) ?? value;

  const nextItem = structuredClone(item);

  if (
    name === "anchor" &&
    normalizedValue &&
    typeof normalizedValue === "object"
  ) {
    nextItem.anchorX = normalizedValue.x;
    nextItem.anchorY = normalizedValue.y;
  } else if (name.includes(".")) {
    setValueAtPath(nextItem, name, normalizedValue);
  } else {
    setTopLevelValue(nextItem, name, normalizedValue);
  }

  const nextAfterTypeChange =
    typeRules.applyFieldChange?.({
      currentItem: item,
      nextItem,
      name,
      value: normalizedValue,
      imagesData,
    }) ?? nextItem;

  return (
    typeRules.finalizeFieldChange?.({
      currentItem: item,
      nextItem: nextAfterTypeChange,
      name,
      value: normalizedValue,
      imagesData,
    }) ?? nextAfterTypeChange
  );
};
