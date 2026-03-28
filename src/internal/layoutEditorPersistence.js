import { normalizeInteractionValue } from "./project/interactionPayload.js";

export const getLayoutEditorResourceCollection = (
  repositoryState,
  resourceType,
) => {
  return resourceType === "controls"
    ? repositoryState.controls || { items: {}, tree: [] }
    : repositoryState.layouts || { items: {}, tree: [] };
};

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

export const shouldPersistLayoutEditorFieldImmediately = (name) => {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  return (
    name === "click" ||
    name.startsWith("click.") ||
    name === "rightClick" ||
    name.startsWith("rightClick.") ||
    name === "change" ||
    name.startsWith("change.")
  );
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

  const shouldReplace = replace === true || diff.requiresReplace;
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

export const syncLayoutEditorRepositoryState = ({
  store,
  repositoryState,
  layoutId,
  resourceType = "layouts",
} = {}) => {
  const { images, layouts, textStyles, colors, fonts, variables } =
    repositoryState;
  const resourceCollection = getLayoutEditorResourceCollection(
    repositoryState,
    resourceType,
  );
  const layout = layoutId ? resourceCollection.items?.[layoutId] : undefined;

  store.setProjectResolution({
    projectResolution: repositoryState?.project?.resolution,
  });
  store.setLayout({ id: layoutId, layout, resourceType });
  store.setItems({ layoutData: layout?.elements || { items: {}, tree: [] } });
  store.setImages({ images: images || { items: {}, tree: [] } });
  store.setLayoutsData({ layoutsData: layouts || { items: {}, tree: [] } });
  store.setTextStylesData({
    textStylesData: textStyles || { items: {}, tree: [] },
  });
  store.setColorsData({ colorsData: colors || { items: {}, tree: [] } });
  store.setFontsData({ fontsData: fonts || { items: {}, tree: [] } });
  store.setVariablesData({
    variablesData: variables || { items: {}, tree: [] },
  });
};
