import { getSystemVariableItems } from "./systemVariables.js";
import { splitVisibilityConditionFromWhen } from "./layoutVisibilityCondition.js";

const PREVIEW_VARIABLE_TYPES = new Set(["boolean", "number", "string"]);

const getLayoutTraversalEntry = ({
  currentLayoutId,
  currentLayoutData,
  currentLayoutType,
  layoutsData,
  layoutId,
} = {}) => {
  if (!layoutId) {
    return undefined;
  }

  const isCurrentLayout = layoutId === currentLayoutId;
  const layoutItem = isCurrentLayout
    ? { id: currentLayoutId, layoutType: currentLayoutType }
    : layoutsData?.items?.[layoutId];
  if (!layoutItem) {
    return undefined;
  }

  return {
    layoutId,
    layoutType: layoutItem.layoutType,
    items: isCurrentLayout
      ? (currentLayoutData?.items ?? {})
      : (layoutItem?.elements?.items ?? {}),
  };
};

export const visitLayoutItemsWithFragments = (
  {
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId,
    visited = new Set(),
  } = {},
  visitor,
) => {
  if (!layoutId || visited.has(layoutId) || typeof visitor !== "function") {
    return false;
  }

  visited.add(layoutId);

  const entry = getLayoutTraversalEntry({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId,
  });
  if (!entry) {
    return false;
  }

  for (const item of Object.values(entry.items)) {
    if (
      visitor({
        item,
        layoutId: entry.layoutId,
        layoutType: entry.layoutType,
      }) === true
    ) {
      return true;
    }

    if (item?.type !== "fragment-ref" || !item.fragmentLayoutId) {
      continue;
    }

    if (
      visitLayoutItemsWithFragments(
        {
          currentLayoutId,
          currentLayoutData,
          currentLayoutType,
          layoutsData,
          layoutId: item.fragmentLayoutId,
          visited,
        },
        visitor,
      )
    ) {
      return true;
    }
  }

  return false;
};

export const collectLayoutPreviewVariableIds = (layoutParams = {}) => {
  const variableIds = new Set();

  visitLayoutItemsWithFragments(layoutParams, ({ item }) => {
    const visibilityCondition = splitVisibilityConditionFromWhen(
      item?.["$when"],
    ).visibilityCondition;
    if (typeof visibilityCondition?.variableId === "string") {
      variableIds.add(visibilityCondition.variableId);
    }

    const conditionalTextStyles = Array.isArray(item?.conditionalTextStyles)
      ? item.conditionalTextStyles
      : [];
    conditionalTextStyles.forEach((rule) => {
      if (typeof rule?.variableId === "string" && rule.variableId.length > 0) {
        variableIds.add(rule.variableId);
      }
    });

    if (
      item?.type === "container-ref-save-load-slot" &&
      item?.paginationMode === "paginated" &&
      typeof item?.paginationVariableId === "string" &&
      item.paginationVariableId.length > 0
    ) {
      variableIds.add(item.paginationVariableId);
    }

    return false;
  });

  return Array.from(variableIds);
};

export const usesSaveLoadPreviewInLayout = (layoutParams = {}) => {
  return visitLayoutItemsWithFragments(layoutParams, ({ item, layoutType }) => {
    if (layoutType === "save" || layoutType === "load") {
      return true;
    }

    return item?.type === "container-ref-save-load-slot";
  });
};

export const findSaveLoadPreviewSettings = (layoutParams = {}) => {
  let settings;

  visitLayoutItemsWithFragments(layoutParams, ({ item }) => {
    if (item?.type !== "container-ref-save-load-slot") {
      return false;
    }

    settings = {
      paginationMode: item.paginationMode ?? "continuous",
      paginationVariableId: item.paginationVariableId,
      paginationSize: item.paginationSize,
    };
    return true;
  });

  return settings;
};

const getPaginationVariableDefaultValue = (variableId, variablesData = {}) => {
  const variable =
    variablesData?.items?.[variableId] ??
    getSystemVariableItems()?.[variableId];

  return variable?.value ?? variable?.default;
};

const toPaginationIndex = (value) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.max(0, Math.trunc(parsedValue));
};

export const getSaveLoadPreviewWindow = ({
  saveLoadDefaultValues,
  saveLoadPreviewSettings,
  previewVariableValues = {},
  variablesData = {},
} = {}) => {
  if (saveLoadPreviewSettings?.paginationMode === "paginated") {
    const paginationSize = Number(saveLoadPreviewSettings.paginationSize);
    const slotsPerPage =
      Number.isFinite(paginationSize) && paginationSize > 0
        ? paginationSize
        : 0;
    const variableId = saveLoadPreviewSettings.paginationVariableId;
    const rawPaginationValue =
      variableId && Object.hasOwn(previewVariableValues, variableId)
        ? previewVariableValues[variableId]
        : getPaginationVariableDefaultValue(variableId, variablesData);
    const pageIndex = toPaginationIndex(rawPaginationValue);

    return {
      startIndex: pageIndex * slotsPerPage,
      slotCount: slotsPerPage,
      pageIndex,
      slotsPerPage,
    };
  }

  const slotsNum = Number(saveLoadDefaultValues?.slotsNum);
  const slotCount = Number.isFinite(slotsNum) && slotsNum > 0 ? slotsNum : 0;

  return {
    startIndex: 0,
    slotCount,
    pageIndex: 0,
    slotsPerPage: slotCount,
  };
};

export const createSaveLoadPreviewSlots = ({
  saveLoadDefaultValues,
  saveLoadPreviewSettings,
  previewVariableValues,
  variablesData,
} = {}) => {
  const { startIndex, slotCount } = getSaveLoadPreviewWindow({
    saveLoadDefaultValues,
    saveLoadPreviewSettings,
    previewVariableValues,
    variablesData,
  });
  const slots = [];

  for (let index = 0; index < slotCount; index += 1) {
    const absoluteIndex = startIndex + index;
    const saveDate = saveLoadDefaultValues?.saveDates?.[absoluteIndex] ?? "";
    const saveImageId = saveLoadDefaultValues?.saveImageIds?.[absoluteIndex];

    slots.push({
      slotId: absoluteIndex + 1,
      image: saveImageId,
      date: saveDate,
      isAvailable: Boolean(saveDate || saveImageId),
    });
  }

  return slots;
};

export const isSupportedPreviewVariableType = (type) => {
  return PREVIEW_VARIABLE_TYPES.has(type);
};
