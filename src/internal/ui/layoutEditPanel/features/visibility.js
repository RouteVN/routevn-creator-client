import { getSystemVariableItems } from "../../../systemVariables.js";
import {
  getSpecialLayoutConditionItems,
  splitLayoutConditionFromWhen,
} from "../../../layoutConditions.js";

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

export const getScalarConditionVariableItems = (
  variablesData = {},
  options = {},
) => {
  const projectVariables = Object.entries(variablesData?.items || {}).filter(
    ([, item]) =>
      item?.type !== "folder" &&
      SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
        String(item?.type || "string").toLowerCase(),
      ),
  );
  const systemVariables = Object.entries(getSystemVariableItems()).filter(
    ([, item]) =>
      SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
        String(item?.type || "string").toLowerCase(),
      ),
  );
  const specialVariables = Object.entries(
    getSpecialLayoutConditionItems(options),
  ).filter(([, item]) =>
    SUPPORTED_VISIBILITY_VARIABLE_TYPES.has(
      String(item?.type || "string").toLowerCase(),
    ),
  );

  return Object.fromEntries([
    ...projectVariables,
    ...systemVariables,
    ...specialVariables,
  ]);
};

export const toVisibilityConditionVariableOptions = (
  variablesData = {},
  options = {},
) => {
  return Object.entries(getScalarConditionVariableItems(variablesData, options))
    .map(([id, variable]) => ({
      label: `${variable.name} (${String(variable.type || "string").toLowerCase()})`,
      value: id,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

export const toVisibilityConditionVariableTypeById = (
  variablesData = {},
  options = {},
) => {
  return Object.fromEntries(
    Object.entries(getScalarConditionVariableItems(variablesData, options)).map(
      ([id, variable]) => [id, String(variable.type || "string").toLowerCase()],
    ),
  );
};

export const getVisibilityConditionSummary = (
  visibilityCondition,
  variablesData = {},
  options = {},
) => {
  if (!visibilityCondition?.variableId || visibilityCondition?.op !== "eq") {
    return "Always visible";
  }

  const variable = getScalarConditionVariableItems(variablesData, options)[
    visibilityCondition.variableId
  ];
  const variableName = variable?.name ?? visibilityCondition.variableId;
  const value =
    typeof visibilityCondition.value === "string"
      ? `"${visibilityCondition.value}"`
      : String(visibilityCondition.value);

  return `${variableName} == ${value}`;
};

export const createVisibilityConditionDialogDefaults = (
  visibilityCondition,
  variableTypeById,
) => {
  const variableId = visibilityCondition?.variableId ?? "";
  const selectedVariableType = variableId
    ? (variableTypeById[variableId] ?? "string")
    : undefined;
  const rawValue = visibilityCondition?.value;
  const parsedNumberValue = Number(rawValue);

  return {
    variableId,
    op: visibilityCondition?.op ?? "eq",
    booleanValue: rawValue === true,
    numberValue: Number.isFinite(parsedNumberValue) ? parsedNumberValue : 0,
    stringValue: typeof rawValue === "string" ? rawValue : "",
    selectedVariableType,
  };
};

export const createVisibilityConditionForm = ({
  hasCondition,
  variableOptions,
} = {}) => {
  return {
    title: "Visibility Condition",
    fields: [
      {
        name: "variableId",
        type: "select",
        label: "Variable",
        required: false,
        options: variableOptions,
      },
      {
        $when: "variableId",
        name: "op",
        type: "select",
        label: "Operation",
        required: true,
        clearable: false,
        options: VISIBILITY_CONDITION_OP_OPTIONS,
      },
      {
        $when: "variableId && selectedVariableType == 'boolean'",
        name: "booleanValue",
        type: "select",
        label: "Value",
        required: true,
        clearable: false,
        options: VISIBILITY_BOOLEAN_OPTIONS,
      },
      {
        $when: "variableId && selectedVariableType == 'number'",
        name: "numberValue",
        type: "input-number",
        label: "Value",
        required: true,
      },
      {
        $when: "variableId && selectedVariableType == 'string'",
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
          id: "clear",
          align: "left",
          variant: "se",
          label: "Clear",
          disabled: !hasCondition,
        },
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
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
