import { getLayoutEditorTypeRules } from "./layoutEditorElementRegistry.js";

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

const normalizeCommonFieldValue = ({ name, value } = {}) => {
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

  return (
    typeRules.finalizeFieldChange?.({
      currentItem: item,
      nextItem: nextAfterTypeChange,
      name,
      value: normalizedCommonValue,
      imagesData,
    }) ?? nextAfterTypeChange
  );
};

export const applyLayoutItemKeyboardChange = ({
  item,
  key,
  unit = 1,
  resize = false,
} = {}) => {
  if (!item || typeof key !== "string") {
    return item;
  }

  let change;

  if (key === "ArrowUp") {
    change = resize
      ? { height: Math.round(item.height - unit) }
      : { y: Math.round(item.y - unit) };
  } else if (key === "ArrowDown") {
    change = resize
      ? { height: Math.round(item.height + unit) }
      : { y: Math.round(item.y + unit) };
  } else if (key === "ArrowLeft") {
    change = resize
      ? { width: Math.round(item.width - unit) }
      : { x: Math.round(item.x - unit) };
  } else if (key === "ArrowRight") {
    change = resize
      ? { width: Math.round(item.width + unit) }
      : { x: Math.round(item.x + unit) };
  } else {
    return item;
  }

  return {
    ...item,
    ...change,
  };
};

export const applyLayoutItemDragChange = ({
  item,
  dragStartPosition,
  x,
  y,
} = {}) => {
  if (
    !item ||
    !dragStartPosition ||
    typeof x !== "number" ||
    typeof y !== "number"
  ) {
    return item;
  }

  return {
    ...item,
    x: dragStartPosition.itemStartX + x - dragStartPosition.x,
    y: dragStartPosition.itemStartY + y - dragStartPosition.y,
  };
};
