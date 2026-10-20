const EQUALITY_OPERATOR_OPTIONS = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Does Not Equal" },
];

const MEMBERSHIP_OPERATOR_OPTIONS = [{ value: "in", label: "One Of" }];

const NUMBER_ORDERING_OPERATOR_OPTIONS = [
  { value: "gt", label: "Greater Than" },
  { value: "gte", label: "Greater Than or Equal" },
  { value: "lt", label: "Less Than" },
  { value: "lte", label: "Less Than or Equal" },
];

const CONDITION_OPERATOR_OPTIONS = [
  ...EQUALITY_OPERATOR_OPTIONS,
  ...MEMBERSHIP_OPERATOR_OPTIONS,
  ...NUMBER_ORDERING_OPERATOR_OPTIONS,
];

const BASE_OPERATOR_OPTIONS = [
  ...EQUALITY_OPERATOR_OPTIONS,
  ...MEMBERSHIP_OPERATOR_OPTIONS,
];

// Branch summaries, such as "score equals 10". Each operator has its own
// template so a language can choose the word order, case, and symbols.
export const CONDITION_SUMMARY_TEMPLATES = {
  eq: "{variable} equals {value}",
  neq: "{variable} does not equal {value}",
  in: "{variable} is one of {value}",
  gt: "{variable} is greater than {value}",
  gte: "{variable} is greater than or equal to {value}",
  lt: "{variable} is less than {value}",
  lte: "{variable} is less than or equal to {value}",
};

export const CONDITION_OPERATOR_LABELS = Object.fromEntries(
  CONDITION_OPERATOR_OPTIONS.map((option) => [option.value, option.label]),
);

export const getConditionOperatorOptions = (variableType) => {
  return variableType === "number"
    ? CONDITION_OPERATOR_OPTIONS
    : BASE_OPERATOR_OPTIONS;
};

export const isConditionOperator = (operator) => {
  return Object.hasOwn(CONDITION_OPERATOR_LABELS, operator);
};

export const isConditionOperatorAllowed = (operator, variableType) => {
  return getConditionOperatorOptions(variableType).some(
    (option) => option.value === operator,
  );
};
