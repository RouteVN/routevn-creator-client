import { parseAndRender } from "jempl";
import {
  getRuntimeFieldItem,
  toRuntimeConditionTarget,
} from "../../../internal/runtimeFields.js";
import { visitLayoutItemsWithFragments } from "./layoutEditorPreviewFragments.js";

export const usesSaveLoadPreviewInLayout = (layoutParams = {}) => {
  return visitLayoutItemsWithFragments(layoutParams, ({ item, layoutType }) => {
    if (layoutType === "save-load") {
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
      paginationSize: item.paginationSize,
    };
    return true;
  });

  return settings;
};

const getDefaultSaveLoadPagination = () => {
  const runtimeField = getRuntimeFieldItem("saveLoadPagination");
  return runtimeField?.value ?? runtimeField?.default ?? 1;
};

const toPaginationIndex = (value) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return 1;
  }

  return Math.max(1, Math.trunc(parsedValue));
};

export const getSaveLoadPreviewWindow = ({
  saveLoadDefaultValues,
  saveLoadPreviewSettings,
  previewVariableValues = {},
} = {}) => {
  if (saveLoadPreviewSettings?.paginationMode === "paginated") {
    const paginationSize = Number(saveLoadPreviewSettings.paginationSize);
    const slotsPerPage =
      Number.isFinite(paginationSize) && paginationSize > 0
        ? paginationSize
        : 0;
    const paginationTarget = toRuntimeConditionTarget("saveLoadPagination");
    const rawPaginationValue =
      paginationTarget && Object.hasOwn(previewVariableValues, paginationTarget)
        ? previewVariableValues[paginationTarget]
        : getDefaultSaveLoadPagination();
    const pageNumber = toPaginationIndex(rawPaginationValue);

    return {
      startIndex: (pageNumber - 1) * slotsPerPage,
      slotCount: slotsPerPage,
      pageIndex: pageNumber,
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
} = {}) => {
  const { startIndex, slotCount } = getSaveLoadPreviewWindow({
    saveLoadDefaultValues,
    saveLoadPreviewSettings,
    previewVariableValues,
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

export const createSaveLoadImageOptions = (images = {}) => {
  return Object.entries(images.items ?? {})
    .filter(([_imageId, item]) => item?.type === "image")
    .map(([imageId, item]) => ({
      label: item?.name ?? imageId,
      value: imageId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

export const createSaveLoadFormDefaultValues = (
  saveLoadDefaultValues = {},
  slotCount = 0,
) => {
  const defaultValues = {
    slotsNum:
      Number.isFinite(Number(saveLoadDefaultValues.slotsNum)) &&
      Number(saveLoadDefaultValues.slotsNum) > 0
        ? Number(saveLoadDefaultValues.slotsNum)
        : 0,
  };

  for (let index = 0; index < slotCount; index += 1) {
    defaultValues[`saveImageId${index}`] =
      saveLoadDefaultValues.saveImageIds?.[index];
    defaultValues[`saveDate${index}`] =
      saveLoadDefaultValues.saveDates?.[index] ?? "";
  }

  return defaultValues;
};

const hashFormKey = (value = "") => {
  let hash = 0;

  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36);
};

export const createSaveLoadPreviewViewData = ({
  currentLayoutId,
  currentLayoutData,
  currentLayoutType,
  layoutsData,
  saveLoadDefaultValues,
  previewVariableValues,
  images,
  saveLoadForm,
} = {}) => {
  const hasSaveLoadPreview = usesSaveLoadPreviewInLayout({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId: currentLayoutId,
  });
  const saveLoadPreviewSettings = findSaveLoadPreviewSettings({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId: currentLayoutId,
  });
  const visibleSaveLoadSlots = createSaveLoadPreviewSlots({
    saveLoadDefaultValues,
    saveLoadPreviewSettings,
    previewVariableValues,
  });
  const saveLoadSlotCount = visibleSaveLoadSlots.length;
  const showSaveLoadSlotsNum =
    saveLoadPreviewSettings?.paginationMode !== "paginated";
  const saveLoadSlots = visibleSaveLoadSlots.map((slot) => ({
    id: `slot-${slot.slotId}`,
    slotId: slot.slotId,
  }));
  const formKey = `save-load-${hashFormKey(
    JSON.stringify({
      hasSaveLoadPreview,
      slotsNum: saveLoadDefaultValues?.slotsNum,
      saveLoadSlotCount,
      visibleSlotIds: visibleSaveLoadSlots.map((slot) => slot.slotId),
      paginationMode: saveLoadPreviewSettings?.paginationMode ?? "continuous",
      paginationSize: saveLoadPreviewSettings?.paginationSize,
      saveImageIds: saveLoadDefaultValues?.saveImageIds,
      saveDates: saveLoadDefaultValues?.saveDates,
    }),
  )}`;
  const imageOptions = createSaveLoadImageOptions(images);
  let parsedSaveLoadForm;

  if (saveLoadForm) {
    parsedSaveLoadForm = parseAndRender(saveLoadForm, {
      imageOptions,
      slots: saveLoadSlots,
      showSlotsNum: showSaveLoadSlotsNum,
    });
  }

  return {
    hasSaveLoadPreview,
    saveLoadPreviewSettings,
    visibleSaveLoadSlots,
    saveLoadForm: parsedSaveLoadForm,
    saveLoadDefaultValues: createSaveLoadFormDefaultValues(
      {
        ...saveLoadDefaultValues,
        saveImageIds: visibleSaveLoadSlots.map((slot) => slot.image),
        saveDates: visibleSaveLoadSlots.map((slot) => slot.date),
      },
      saveLoadSlotCount,
    ),
    saveLoadContext: {
      slots: saveLoadSlots,
      showSlotsNum: showSaveLoadSlotsNum,
    },
    saveLoadFormKey: formKey,
  };
};

export const createRuntimeSaveSlots = (saveLoadData = {}) => {
  const slots = Array.isArray(saveLoadData.slots) ? saveLoadData.slots : [];

  return slots.map((slot, index) => {
    const slotId =
      Number.isFinite(Number(slot?.slotId)) && Number(slot?.slotId) > 0
        ? Number(slot.slotId)
        : index + 1;
    const rawSavedAt =
      typeof slot?.savedAt === "number"
        ? slot.savedAt
        : typeof slot?.date === "number"
          ? slot.date
          : typeof slot?.saveDate === "number"
            ? slot.saveDate
            : typeof slot?.date === "string" && slot.date.length > 0
              ? Date.parse(slot.date)
              : typeof slot?.saveDate === "string" && slot.saveDate.length > 0
                ? Date.parse(slot.saveDate)
                : undefined;
    const savedAt = Number.isFinite(rawSavedAt) ? rawSavedAt : undefined;

    return {
      slotId,
      image: slot?.image ?? slot?.saveImageId,
      savedAt,
      state: slot?.state,
      isAvailable:
        slot?.isAvailable === true ||
        Boolean(slot?.image ?? slot?.saveImageId ?? savedAt),
    };
  });
};
