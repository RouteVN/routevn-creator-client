const EQUALITY_OPERATOR_OPTIONS = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Does Not Equal" },
];

const NUMBER_ORDERING_OPERATOR_OPTIONS = [
  { value: "gt", label: "Greater Than" },
  { value: "gte", label: "Greater Than or Equal" },
  { value: "lt", label: "Less Than" },
  { value: "lte", label: "Less Than or Equal" },
];

const CONDITION_OPERATOR_OPTIONS = [
  ...EQUALITY_OPERATOR_OPTIONS,
  ...NUMBER_ORDERING_OPERATOR_OPTIONS,
];

export const CONDITION_OPERATOR_LABELS = Object.fromEntries(
  CONDITION_OPERATOR_OPTIONS.map((option) => [option.value, option.label]),
);

export const getConditionOperatorOptions = (variableType) => {
  return variableType === "number"
    ? CONDITION_OPERATOR_OPTIONS
    : EQUALITY_OPERATOR_OPTIONS;
};

export const isConditionOperator = (operator) => {
  return Object.hasOwn(CONDITION_OPERATOR_LABELS, operator);
};

export const isConditionOperatorAllowed = (operator, variableType) => {
  return getConditionOperatorOptions(variableType).some(
    (option) => option.value === operator,
  );
};
