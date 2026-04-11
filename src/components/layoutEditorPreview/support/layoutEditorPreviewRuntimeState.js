import {
  AUTO_MODE_CONDITION_TARGET,
  LINE_COMPLETED_CONDITION_TARGET,
  SKIP_MODE_CONDITION_TARGET,
} from "../../../internal/layoutConditions.js";
import {
  getRuntimeFieldItems,
  toRuntimeConditionTarget,
} from "../../../internal/runtimeFields.js";

const toPreviewRuntimeValue = (field = {}, value) => {
  if (field.type === "number") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue)
      ? parsedValue
      : Number(field.default ?? 0);
  }

  if (field.type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      return value === "true";
    }

    return Boolean(value ?? field.default);
  }

  return value ?? field.default ?? "";
};

const getPreviewRuntimeOverrideValue = (
  previewVariableValues = {},
  runtimeId,
  fallbackValue,
) => {
  const target = toRuntimeConditionTarget(runtimeId);

  if (target && Object.hasOwn(previewVariableValues, target)) {
    return previewVariableValues[target];
  }

  return fallbackValue;
};

export const createPreviewRuntimeValues = (
  previewVariableValues = {},
  dialogueDefaultValues = {},
) => {
  const runtimeFields = getRuntimeFieldItems();
  const runtime = Object.fromEntries(
    Object.entries(runtimeFields).map(([runtimeId, field]) => [
      runtimeId,
      toPreviewRuntimeValue(
        field,
        getPreviewRuntimeOverrideValue(
          previewVariableValues,
          runtimeId,
          field.value ?? field.default,
        ),
      ),
    ]),
  );

  runtime.isLineCompleted = toPreviewRuntimeValue(
    runtimeFields.isLineCompleted,
    getPreviewRuntimeOverrideValue(
      previewVariableValues,
      "isLineCompleted",
      dialogueDefaultValues?.["dialogue-is-line-completed"] ??
        runtime.isLineCompleted,
    ),
  );
  runtime.autoMode = toPreviewRuntimeValue(
    runtimeFields.autoMode,
    getPreviewRuntimeOverrideValue(
      previewVariableValues,
      "autoMode",
      dialogueDefaultValues?.["dialogue-auto-mode"] ?? runtime.autoMode,
    ),
  );
  runtime.skipMode = toPreviewRuntimeValue(
    runtimeFields.skipMode,
    getPreviewRuntimeOverrideValue(
      previewVariableValues,
      "skipMode",
      dialogueDefaultValues?.["dialogue-skip-mode"] ?? runtime.skipMode,
    ),
  );

  return runtime;
};

export const getPreviewRuntimeConditionTargets = () => {
  return [
    LINE_COMPLETED_CONDITION_TARGET,
    AUTO_MODE_CONDITION_TARGET,
    SKIP_MODE_CONDITION_TARGET,
  ];
};
