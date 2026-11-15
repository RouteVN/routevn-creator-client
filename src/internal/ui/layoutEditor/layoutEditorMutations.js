import { getLayoutEditorTypeRules } from "../../layoutEditorElementRegistry.js";
import { normalizeLayoutRotation } from "../../project/layout.js";
import { parseSpritesheetAnimationSelectionValue } from "../../spritesheets.js";

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
  if (name === "rotation" && Number.isFinite(Number(value))) {
    return normalizeLayoutRotation(Number(value));
  }

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

const INTERACTION_SOUND_VOLUME_CONFIG_BY_ID_FIELD = {
  hoverSoundId: {
    interactionName: "hover",
    volumeName: "hover.soundVolume",
  },
  clickSoundId: {
    interactionName: "click",
    volumeName: "click.soundVolume",
  },
};

// The selected item with an edit panel value applied, for saving it or for
// previewing it on the canvas. `detail` is the edit panel's update event.
export const buildLayoutEditPanelUpdatedItem = ({
  detail,
  currentItem,
  imagesData,
}) => {
  const nextAspectRatioLock =
    Number.isFinite(detail.formValues?.aspectRatioLock) &&
    detail.formValues.aspectRatioLock > 0
      ? detail.formValues.aspectRatioLock
      : currentItem.aspectRatioLock;
  const currentItemWithEditorFlags = {
    ...currentItem,
    aspectRatioLock: nextAspectRatioLock,
  };
  let updatedItem;

  if (detail.name === "aspectRatioMode") {
    updatedItem = structuredClone(currentItem);
    if (detail.value === "fixed") {
      const currentWidth = Number(
        detail.formValues?.width ?? currentItem.width,
      );
      const currentHeight = Number(
        detail.formValues?.height ?? currentItem.height,
      );
      updatedItem.aspectRatioLock =
        Number.isFinite(currentWidth) &&
        Number.isFinite(currentHeight) &&
        currentWidth > 0 &&
        currentHeight > 0
          ? currentWidth / currentHeight
          : undefined;
    } else {
      delete updatedItem.aspectRatioLock;
    }
    delete updatedItem.aspectRatioMode;
  } else {
    if (detail.name === "spritesheetSelection") {
      const { resourceId, animationName } =
        parseSpritesheetAnimationSelectionValue(detail.value);
      updatedItem = {
        ...structuredClone(currentItemWithEditorFlags),
        resourceId,
        animationName,
      };
    } else {
      updatedItem = applyLayoutItemFieldChange({
        item: currentItemWithEditorFlags,
        name: detail.name,
        value: detail.value,
        imagesData,
      });

      const soundVolumeConfig =
        INTERACTION_SOUND_VOLUME_CONFIG_BY_ID_FIELD[detail.name];
      if (soundVolumeConfig) {
        updatedItem = applyLayoutItemFieldChange({
          item: updatedItem,
          name: soundVolumeConfig.volumeName,
          value:
            detail.formValues?.[soundVolumeConfig.interactionName]?.soundVolume,
          imagesData,
        });
      }
    }
  }

  // Other fields the change moves with it, such as the other scale while
  // the aspect ratio is kept.
  for (const [linkedName, linkedValue] of Object.entries(
    detail.linkedValues ?? {},
  )) {
    updatedItem = applyLayoutItemFieldChange({
      item: updatedItem,
      name: linkedName,
      value: linkedValue,
      imagesData,
    });
  }

  if (
    (detail.name === "width" || detail.name === "height") &&
    Number.isFinite(detail.formValues?.aspectRatioLock) &&
    detail.formValues.aspectRatioLock > 0
  ) {
    const nextWidth = Number(detail.formValues.width);
    const nextHeight = Number(detail.formValues.height);

    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      updatedItem.width = Math.round(nextWidth);
    }

    if (Number.isFinite(nextHeight) && nextHeight > 0) {
      updatedItem.height = Math.round(nextHeight);
    }
  }

  return updatedItem;
};
