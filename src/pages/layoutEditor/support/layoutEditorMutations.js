import { getLayoutEditorTypeRules } from "../../../internal/layoutEditorElementRegistry.js";

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
  const parents = [];

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!current[segment] || typeof current[segment] !== "object") {
      current[segment] = {};
    }
    parents.push({
      parent: current,
      key: segment,
    });
    current = current[segment];
  }

  const lastSegment = segments[segments.length - 1];
  if (value === undefined) {
    delete current[lastSegment];

    for (let index = parents.length - 1; index >= 0; index -= 1) {
      const { parent, key } = parents[index];
      const nestedValue = parent[key];

      if (
        nestedValue &&
        typeof nestedValue === "object" &&
        !Array.isArray(nestedValue) &&
        Object.keys(nestedValue).length === 0
      ) {
        delete parent[key];
        continue;
      }

      break;
    }
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

const normalizeCommonFieldValue = ({ name, value } = {}) => {
  if (
    (name === "x" || name === "y" || name === "width" || name === "height") &&
    value !== undefined &&
    value !== null &&
    value !== ""
  ) {
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) {
      return Math.round(parsedValue);
    }
  }

  if (name !== "opacity") {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, parsedValue));
};

const roundAspectSyncedValue = (value) => {
  return Math.round(value);
};

const getLockedAspectRatio = (item = {}) => {
  const aspectRatioLock = Number(item?.aspectRatioLock);
  if (Number.isFinite(aspectRatioLock) && aspectRatioLock > 0) {
    return aspectRatioLock;
  }

  return undefined;
};

const applyFixedAspectRatioFieldChange = ({
  currentItem,
  nextItem,
  name,
} = {}) => {
  if (!currentItem || !nextItem) {
    return nextItem;
  }

  if (name !== "width" && name !== "height") {
    return nextItem;
  }

  const aspectRatioLock =
    getLockedAspectRatio(nextItem) ?? getLockedAspectRatio(currentItem);
  if (!Number.isFinite(aspectRatioLock) || aspectRatioLock <= 0) {
    return nextItem;
  }

  if (name === "width") {
    const nextWidth = Number(nextItem.width);
    if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
      return nextItem;
    }

    nextItem.height = roundAspectSyncedValue(nextWidth / aspectRatioLock);
    return nextItem;
  }

  const nextHeight = Number(nextItem.height);
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
    return nextItem;
  }

  nextItem.width = roundAspectSyncedValue(nextHeight * aspectRatioLock);
  return nextItem;
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
  const normalizedValue = typeRules.normalizeFieldValue
    ? typeRules.normalizeFieldValue({
        item,
        name,
        value,
      })
    : value;
  const normalizedCommonValue = normalizeCommonFieldValue({
    name,
    value: normalizedValue,
  });

  const nextItem = structuredClone(item);

  if (
    name === "anchor" &&
    normalizedCommonValue &&
    typeof normalizedCommonValue === "object"
  ) {
    nextItem.anchorX = normalizedCommonValue.x;
    nextItem.anchorY = normalizedCommonValue.y;
  } else if (name.includes(".")) {
    setValueAtPath(nextItem, name, normalizedCommonValue);
  } else {
    setTopLevelValue(nextItem, name, normalizedCommonValue);
  }

  const nextAfterTypeChange =
    typeRules.applyFieldChange?.({
      currentItem: item,
      nextItem,
      name,
      value: normalizedCommonValue,
      imagesData,
    }) ?? nextItem;

  const nextAfterAspectRatioChange = applyFixedAspectRatioFieldChange({
    currentItem: item,
    nextItem: nextAfterTypeChange,
    name,
  });

  return (
    typeRules.finalizeFieldChange?.({
      currentItem: item,
      nextItem: nextAfterAspectRatioChange,
      name,
      value: normalizedCommonValue,
      imagesData,
    }) ?? nextAfterAspectRatioChange
  );
};
