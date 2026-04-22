import {
  getRuntimeLayoutConditionItems,
  parseVariableConditionTarget,
  splitLayoutConditionFromWhen,
} from "../../../internal/layoutConditions.js";
import { toRuntimeConditionTarget } from "../../../internal/runtimeFields.js";
import { visitLayoutItemsWithFragments } from "./layoutEditorPreviewFragments.js";

const PREVIEW_VARIABLE_TYPES = new Set(["boolean", "number", "string"]);
const NORMAL_LIKE_LAYOUT_TYPES = new Set([
  "general",
  "save-load",
  "confirmDialog",
]);
const PREVIEW_BOOLEAN_OPTIONS = [
  { label: "True", value: true },
  { label: "False", value: false },
];

const setNestedValue = (object, path, value) => {
  const keys = String(path)
    .split(".")
    .filter((key) => key.length > 0);

  if (keys.length === 0) {
    return;
  }

  if (keys.length === 1) {
    object[keys[0]] = value;
    return;
  }

  let current = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
};

export const toPreviewVariableValue = (variable = {}) => {
  const value = variable.value ?? variable.default;

  if (variable.type === "number") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  if (variable.type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      return value === "true";
    }

    return Boolean(value);
  }

  if (variable.type === "object") {
    return value && typeof value === "object" ? value : {};
  }

  return value ?? "";
};

export const createPreviewVariables = (variablesData = {}) => {
  const variableItems = variablesData.items ?? {};

  return Object.entries(variableItems).reduce(
    (variables, [variableId, variable]) => {
      if (!variableId || variable?.type === "folder") {
        return variables;
      }

      variables[variableId] = toPreviewVariableValue(variable);
      return variables;
    },
    {},
  );
};

export const applyPreviewVariableOverrides = (
  previewVariables,
  variablesData = {},
  previewVariableValues = {},
) => {
  const variableItems = variablesData.items ?? {};
  const nextPreviewVariables = {
    ...previewVariables,
  };

  for (const [target, value] of Object.entries(previewVariableValues)) {
    const variableId = parseVariableConditionTarget(target);
    if (!variableId) {
      continue;
    }

    const variable = variableItems[variableId];

    nextPreviewVariables[variableId] = toPreviewVariableValue({
      ...variable,
      value,
    });
  }

  return nextPreviewVariables;
};

export const collectLayoutPreviewTargets = (layoutParams = {}) => {
  const targets = new Set();

  visitLayoutItemsWithFragments(layoutParams, ({ item }) => {
    const visibilityCondition = splitLayoutConditionFromWhen(
      item?.["$when"],
    ).visibilityCondition;
    if (typeof visibilityCondition?.target === "string") {
      targets.add(visibilityCondition.target);
    }

    const conditionalOverrides = Array.isArray(item?.conditionalOverrides)
      ? item.conditionalOverrides
      : [];
    conditionalOverrides.forEach((rule) => {
      if (
        typeof rule?.when?.target === "string" &&
        rule.when.target.length > 0
      ) {
        targets.add(rule.when.target);
      }
    });

    if (
      item?.type === "container-ref-save-load-slot" &&
      item?.paginationMode === "paginated" &&
      Number(item?.paginationSize) > 0
    ) {
      const paginationTarget = toRuntimeConditionTarget("saveLoadPagination");
      if (paginationTarget) {
        targets.add(paginationTarget);
      }
    }

    return false;
  });

  return Array.from(targets);
};

export const collectLayoutPreviewVariableIds = collectLayoutPreviewTargets;

export const isSupportedPreviewVariableType = (type) => {
  return PREVIEW_VARIABLE_TYPES.has(type);
};

export const getLayoutPreviewVariableItems = ({
  currentLayoutId,
  currentLayoutData,
  currentLayoutType,
  layoutsData,
  variablesData = {},
} = {}) => {
  const availableVariables = variablesData.items ?? {};
  const runtimeItems = getRuntimeLayoutConditionItems();
  const previewVariables = [];
  const addedTargets = new Set();

  const targets = collectLayoutPreviewTargets({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId: currentLayoutId,
  });

  for (const target of targets) {
    if (!target || addedTargets.has(target)) {
      continue;
    }

    const runtimeItem = runtimeItems[target];
    const variableId = parseVariableConditionTarget(target);
    if (!runtimeItem && !variableId) {
      continue;
    }

    const variable = variableId ? availableVariables[variableId] : runtimeItem;
    if (!variable) {
      continue;
    }
    const type = String(variable?.type ?? "string").toLowerCase();

    if (!isSupportedPreviewVariableType(type)) {
      continue;
    }

    addedTargets.add(target);
    previewVariables.push({
      id: target,
      name: variable?.name ?? target,
      type,
      source: variable?.source,
      description: variable?.description,
      defaultValue: toPreviewVariableValue({
        type,
        value: variable?.value ?? variable?.default,
      }),
    });
  }

  return previewVariables.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
};

export const supportsPreviewVariablesForLayoutType = (layoutType) => {
  return NORMAL_LIKE_LAYOUT_TYPES.has(layoutType);
};

export const createPreviewVariablesForm = (previewVariableItems = []) => ({
  title: "Preview",
  description: "Edit visibility conditions to preview conditional elements",
  fields: previewVariableItems.map((variable) => {
    const sourceLabel =
      variable.source === "runtime" ? "Runtime state" : "Variable";
    const descriptionParts = [
      `${sourceLabel} (${variable.type})`,
      variable.description,
    ].filter(Boolean);

    if (variable.type === "boolean") {
      return {
        name: variable.id,
        type: "select",
        label: variable.name,
        clearable: false,
        options: PREVIEW_BOOLEAN_OPTIONS,
        description: descriptionParts.join(" • "),
      };
    }

    return {
      name: variable.id,
      type: variable.type === "number" ? "input-number" : "input-text",
      label: variable.name,
      description: descriptionParts.join(" • "),
    };
  }),
});

export const createPreviewVariableDefaultValues = (
  previewVariableItems = [],
  previewVariableValues = {},
) => {
  const defaultValues = {};

  for (const variable of previewVariableItems) {
    const value = Object.hasOwn(previewVariableValues, variable.id)
      ? previewVariableValues[variable.id]
      : variable.defaultValue;

    setNestedValue(defaultValues, variable.id, value);
  }

  return defaultValues;
};

export const createPreviewVariablesViewData = ({
  layoutType,
  currentLayoutId,
  currentLayoutData,
  layoutsData,
  variablesData,
  previewVariableValues,
} = {}) => {
  const previewVariableItems = supportsPreviewVariablesForLayoutType(layoutType)
    ? getLayoutPreviewVariableItems({
        currentLayoutId,
        currentLayoutData,
        currentLayoutType: layoutType,
        layoutsData,
        variablesData,
      })
    : [];
  const previewVariablesDefaultValues = createPreviewVariableDefaultValues(
    previewVariableItems,
    previewVariableValues,
  );
  const previewVariablesFormKey =
    previewVariableItems.length > 0
      ? previewVariableItems.map((item) => item.id).join("|")
      : "empty";

  return {
    previewVariableItems,
    previewVariablesForm: createPreviewVariablesForm(previewVariableItems),
    previewVariablesDefaultValues,
    previewVariablesFormKey,
    hasPreviewVariables: previewVariableItems.length > 0,
  };
};
