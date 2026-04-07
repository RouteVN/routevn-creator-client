import { getSystemVariableItems } from "../../../internal/systemVariables.js";
import {
  getSpecialLayoutConditionItems,
  parseVariableConditionTarget,
  splitLayoutConditionFromWhen,
  toVariableConditionTarget,
} from "../../../internal/layoutConditions.js";

const VISIBILITY_CONDITION_OP_OPTIONS = [{ label: "Equals", value: "eq" }];
const VISIBILITY_BOOLEAN_OPTIONS = [
  { label: "True", value: true },
  { label: "False", value: false },
];
const SUPPORTED_VISIBILITY_VARIABLE_TYPES = new Set([
  "boolean",
  "number",
  "string",
]);

export const getScalarConditionTargetItems = (
  variablesData = {},
  options = {},
) => {
  const projectVariables = Object.entries(variablesData?.items || {})
    .filter(
      ([, item]) =>
        item?.type !== "folder" &&
        SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
          String(item?.type || "string").toLowerCase(),
        ),
    )
    .map(([variableId, item]) => [toVariableConditionTarget(variableId), item])
    .filter(([target]) => typeof target === "string" && target.length > 0);
  const systemVariables = Object.entries(getSystemVariableItems())
    .filter(([, item]) =>
      SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
        String(item?.type || "string").toLowerCase(),
      ),
    )
    .map(([variableId, item]) => [toVariableConditionTarget(variableId), item])
    .filter(([target]) => typeof target === "string" && target.length > 0);
  const specialTargets = Object.entries(
    getSpecialLayoutConditionItems(options),
  ).filter(([, item]) =>
    SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
      String(item?.type || "string").toLowerCase(),
    ),
  );

  return Object.fromEntries([
    ...projectVariables,
    ...systemVariables,
    ...specialTargets,
  ]);
};

export const toVisibilityConditionTargetOptions = (
  variablesData = {},
  options = {},
) => {
  return Object.entries(getScalarConditionTargetItems(variablesData, options))
    .map(([target, variable]) => ({
      label: `${variable.name} (${String(variable.type || "string").toLowerCase()})`,
      value: target,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

export const toVisibilityConditionTargetTypeByTarget = (
  variablesData = {},
  options = {},
) => {
  return Object.fromEntries(
    Object.entries(getScalarConditionTargetItems(variablesData, options)).map(
      ([target, variable]) => [
        target,
        String(variable.type || "string").toLowerCase(),
      ],
    ),
  );
};

const getVisibilityConditionTargetName = (
  target,
  variablesData = {},
  options = {},
) => {
  const targetItem = getScalarConditionTargetItems(variablesData, options)[
    target
  ];
  if (targetItem?.name) {
    return targetItem.name;
  }

  const variableId = parseVariableConditionTarget(target);
  if (variableId) {
    return variableId;
  }

  return target;
};

export const getVisibilityConditionSummary = (
  visibilityCondition,
  variablesData = {},
  options = {},
) => {
  if (!visibilityCondition?.target || visibilityCondition?.op !== "eq") {
    return "Always visible";
  }

  const targetName = getVisibilityConditionTargetName(
    visibilityCondition.target,
    variablesData,
    options,
  );
  const value =
    typeof visibilityCondition.value === "string"
      ? `"${visibilityCondition.value}"`
      : String(visibilityCondition.value);

  return `${targetName} == ${value}`;
};

export const createVisibilityConditionDialogDefaults = (
  visibilityCondition,
  targetTypeByTarget,
) => {
  const target = visibilityCondition?.target ?? "";
  const selectedVariableType = target
    ? (targetTypeByTarget[target] ?? "string")
    : undefined;
  const rawValue = visibilityCondition?.value;
  const parsedNumberValue = Number(rawValue);

  return {
    target,
    op: visibilityCondition?.op ?? "eq",
    booleanValue: rawValue === true,
    numberValue: Number.isFinite(parsedNumberValue) ? parsedNumberValue : 0,
    stringValue: typeof rawValue === "string" ? rawValue : "",
    selectedVariableType,
  };
};

export const createVisibilityConditionForm = ({ targetOptions } = {}) => {
  return {
    title: "Visibility Condition",
    fields: [
      {
        name: "target",
        type: "select",
        label: "Target",
        required: false,
        options: targetOptions,
      },
      {
        $when: "target",
        name: "op",
        type: "segmented-control",
        label: "Operation",
        required: true,
        clearable: false,
        options: VISIBILITY_CONDITION_OP_OPTIONS,
      },
      {
        $when: "target && selectedVariableType == 'boolean'",
        name: "booleanValue",
        type: "segmented-control",
        label: "Value",
        required: true,
        clearable: false,
        options: VISIBILITY_BOOLEAN_OPTIONS,
      },
      {
        $when: "target && selectedVariableType == 'number'",
        name: "numberValue",
        type: "input-number",
        label: "Value",
        required: true,
      },
      {
        $when: "target && selectedVariableType == 'string'",
        name: "stringValue",
        type: "input-text",
        label: "Value",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };
};

export const splitVisibilityCondition = (expression) => {
  return splitLayoutConditionFromWhen(expression);
};
