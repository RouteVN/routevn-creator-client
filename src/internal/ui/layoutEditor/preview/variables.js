import { getSystemVariableItems } from "../../../systemVariables.js";
import {
  getRuntimeLayoutConditionItems,
  splitLayoutConditionFromWhen,
} from "../../../layoutConditions.js";
import { visitLayoutItemsWithFragments } from "./fragments.js";

const PREVIEW_VARIABLE_TYPES = new Set(["boolean", "number", "string"]);
const NORMAL_LIKE_LAYOUT_TYPES = new Set([
  "normal",
  "save",
  "load",
  "confirmDialog",
]);
const PREVIEW_BOOLEAN_OPTIONS = [
  { label: "True", value: true },
  { label: "False", value: false },
];

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
  const variableItems = {
    ...variablesData.items,
    ...getSystemVariableItems(),
  };

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
  const variableItems = {
    ...variablesData.items,
    ...getSystemVariableItems(),
  };
  const nextPreviewVariables = {
    ...previewVariables,
  };

  for (const [variableId, value] of Object.entries(previewVariableValues)) {
    const variable = variableItems[variableId];

    nextPreviewVariables[variableId] = toPreviewVariableValue({
      ...variable,
      value,
    });
  }

  return nextPreviewVariables;
};

export const collectLayoutPreviewVariableIds = (layoutParams = {}) => {
  const variableIds = new Set();

  visitLayoutItemsWithFragments(layoutParams, ({ item }) => {
    const visibilityCondition = splitLayoutConditionFromWhen(
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
  const availableVariables = {
    ...variablesData.items,
    ...getSystemVariableItems(),
    ...getRuntimeLayoutConditionItems(),
  };
  const previewVariables = [];
  const addedVariableIds = new Set();

  const variableIds = collectLayoutPreviewVariableIds({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId: currentLayoutId,
  });

  for (const variableId of variableIds) {
    if (!variableId || addedVariableIds.has(variableId)) {
      continue;
    }

    const variable = availableVariables[variableId];
    const type = String(variable?.type ?? "string").toLowerCase();

    if (!isSupportedPreviewVariableType(type)) {
      continue;
    }

    addedVariableIds.add(variableId);
    previewVariables.push({
      id: variableId,
      name: variable?.name ?? variableId,
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
      variable.source === "system"
        ? "System variable"
        : variable.source === "runtime"
          ? "Runtime state"
          : "Variable";
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
  return Object.fromEntries(
    previewVariableItems.map((variable) => [
      variable.id,
      Object.hasOwn(previewVariableValues, variable.id)
        ? previewVariableValues[variable.id]
        : variable.defaultValue,
    ]),
  );
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
