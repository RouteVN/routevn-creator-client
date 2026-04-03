import { normalizeInteractionValue } from "../../../internal/project/interactionPayload.js";
import { getLayoutEditorElementDefinition } from "../../../internal/layoutEditorElementRegistry.js";
import { getLayoutEditorResourceCollection } from "./layoutEditorRepositoryState.js";

const getLayoutEditorElementOwnerKey = (resourceType) => {
  return resourceType === "controls" ? "controlId" : "layoutId";
};

const isPlainObject = (value) => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const areValuesEqual = (left, right) => {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => areValuesEqual(value, right[index]))
    );
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) && areValuesEqual(left[key], right[key]),
      )
    );
  }

  return false;
};

const createObjectPatch = (previousValue, nextValue) => {
  const previousObject = isPlainObject(previousValue) ? previousValue : {};
  const nextObject = isPlainObject(nextValue) ? nextValue : {};
  const patch = {};
  let hasChanges = false;
  let requiresReplace = false;
  let hasNestedChanges = false;

  for (const key of Object.keys(previousObject)) {
    if (!Object.hasOwn(nextObject, key)) {
      requiresReplace = true;
      break;
    }
  }

  for (const [key, value] of Object.entries(nextObject)) {
    if (!Object.hasOwn(previousObject, key)) {
      patch[key] = structuredClone(value);
      hasChanges = true;
      continue;
    }

    const previousEntry = previousObject[key];

    if (areValuesEqual(previousEntry, value)) {
      continue;
    }

    if (isPlainObject(previousEntry) && isPlainObject(value)) {
      const nestedResult = createObjectPatch(previousEntry, value);
      if (nestedResult.requiresReplace) {
        requiresReplace = true;
      } else if (nestedResult.hasChanges) {
        patch[key] = nestedResult.patch;
        hasChanges = true;
        hasNestedChanges = true;
      }
      continue;
    }

    patch[key] = structuredClone(value);
    hasChanges = true;
  }

  return {
    patch,
    hasChanges,
    requiresReplace,
    hasNestedChanges,
  };
};

const normalizeLayoutElementInteractions = (item = {}) => {
  if (!item || typeof item !== "object") {
    return item;
  }

  const nextItem = structuredClone(item);

  for (const key of ["click", "rightClick", "change"]) {
    if (nextItem[key] !== undefined) {
      nextItem[key] = normalizeInteractionValue(nextItem[key]);
    }
  }

  return nextItem;
};

export const shouldPersistLayoutEditorFieldImmediately = ({
  name,
  itemType,
} = {}) => {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  const immediatePersistFields =
    getLayoutEditorElementDefinition(itemType).immediatePersistFields;

  return immediatePersistFields.some((fieldName) => {
    if (!fieldName.endsWith(".")) {
      return name === fieldName;
    }

    return name.startsWith(fieldName);
  });
};

export const createLayoutEditorElementPersistPayload = ({
  currentItem,
  updatedItem,
  replace = false,
} = {}) => {
  if (!currentItem || !updatedItem) {
    return {
      hasChanges: false,
      replace: false,
      data: undefined,
    };
  }

  const previousItem = normalizeLayoutElementInteractions(currentItem);
  const normalizedUpdatedItem = normalizeLayoutElementInteractions(updatedItem);
  const diff = createObjectPatch(previousItem, normalizedUpdatedItem);

  if (!diff.hasChanges && !diff.requiresReplace) {
    return {
      hasChanges: false,
      replace: false,
      data: undefined,
    };
  }

  const shouldReplace =
    replace === true || diff.requiresReplace || diff.hasNestedChanges;
  const { id: _ignoredItemId, ...nextReplaceData } = normalizedUpdatedItem;

  return {
    hasChanges: true,
    replace: shouldReplace,
    data: shouldReplace ? nextReplaceData : diff.patch,
  };
};

export const persistLayoutEditorElementUpdate = async ({
  projectService,
  layoutId,
  resourceType,
  selectedItemId,
  updatedItem,
  replace,
} = {}) => {
  const ownerCollection = getLayoutEditorResourceCollection(
    projectService.getRepositoryState(),
    resourceType,
  );
  const currentItem =
    ownerCollection?.items?.[layoutId]?.elements?.items?.[selectedItemId];

  if (!currentItem || !updatedItem) {
    return {
      didPersist: false,
    };
  }

  const payload = createLayoutEditorElementPersistPayload({
    currentItem: {
      id: selectedItemId,
      ...currentItem,
    },
    updatedItem,
    replace,
  });

  if (!payload.hasChanges) {
    return {
      didPersist: false,
    };
  }

  const ownerPayloadKey = getLayoutEditorElementOwnerKey(resourceType);
  const updateElement =
    resourceType === "controls"
      ? projectService.updateControlElement.bind(projectService)
      : projectService.updateLayoutElement.bind(projectService);

  await updateElement({
    [ownerPayloadKey]: layoutId,
    elementId: selectedItemId,
    data: payload.data,
    replace: payload.replace,
  });

  return {
    didPersist: true,
    payload,
  };
};
