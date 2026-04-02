const VISIBILITY_CONDITION_OP_OPTIONS = [{ label: "Equals", value: "eq" }];
const VISIBILITY_BOOLEAN_OPTIONS = [
  { label: "True", value: true },
  { label: "False", value: false },
];

export const normalizeConditionalTextStyleRules = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (rule) =>
      rule &&
      typeof rule === "object" &&
      typeof rule.target === "string" &&
      rule.target.length > 0 &&
      rule.op === "eq" &&
      typeof rule.textStyleId === "string" &&
      rule.textStyleId.length > 0,
  );
};

export const getConditionalTextStyleRuleSummary = (
  rule,
  textStylesData = {},
  variablesData = {},
  options = {},
  getVisibilityConditionSummary,
) => {
  const conditionSummary = getVisibilityConditionSummary(
    rule,
    variablesData,
    options,
  );
  const textStyleName =
    textStylesData?.items?.[rule?.textStyleId]?.name ?? rule?.textStyleId;

  return `${conditionSummary} -> ${textStyleName}`;
};

export const getConditionalTextStylesSummary = (rules = []) => {
  if (rules.length === 0) {
    return "No conditional styles";
  }

  if (rules.length === 1) {
    return "1 conditional style";
  }

  return `${rules.length} conditional styles`;
};

export const createConditionalTextStyleRuleDefaults = (
  rule,
  targetTypeByTarget,
) => {
  const target = rule?.target ?? "";
  const selectedVariableType = target
    ? (targetTypeByTarget[target] ?? "string")
    : undefined;
  const rawValue = rule?.value;
  const parsedNumberValue = Number(rawValue);

  return {
    target,
    op: rule?.op ?? "eq",
    textStyleId: rule?.textStyleId ?? "",
    booleanValue: rawValue === true,
    numberValue: Number.isFinite(parsedNumberValue) ? parsedNumberValue : 0,
    stringValue: typeof rawValue === "string" ? rawValue : "",
    selectedVariableType,
  };
};

export const createConditionalTextStyleRuleForm = ({
  targetOptions,
  textStyleOptions,
} = {}) => {
  return {
    title: "Conditional Text Style",
    fields: [
      {
        name: "target",
        type: "select",
        label: "Target",
        required: true,
        clearable: false,
        options: targetOptions,
      },
      {
        $when: "target",
        name: "op",
        type: "select",
        label: "Operation",
        required: true,
        clearable: false,
        options: VISIBILITY_CONDITION_OP_OPTIONS,
      },
      {
        $when: "target && selectedVariableType == 'boolean'",
        name: "booleanValue",
        type: "select",
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
      {
        name: "textStyleId",
        type: "select",
        label: "Text Style",
        required: true,
        clearable: false,
        options: textStyleOptions,
      },
    ],
    actions: {
      layout: "",
      buttons: [
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
