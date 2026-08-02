const createOperationDefinition = ({
  expressionKey,
  labelKey,
  fallbackLabel,
  resultType = "number",
  operandTypes = ["number"],
  minimumOperandCount = 2,
  maximumOperandCount = Number.POSITIVE_INFINITY,
  expressionShape = "left-fold",
}) =>
  Object.freeze({
    expressionKey,
    labelKey,
    fallbackLabel,
    resultType,
    operandTypes: Object.freeze([...operandTypes]),
    minimumOperandCount,
    maximumOperandCount,
    expressionShape,
  });

export const COMPUTED_LITERAL_TYPES = Object.freeze([
  "number",
  "string",
  "boolean",
]);

export const COMPUTED_OPERATION_DEFINITIONS = Object.freeze({
  add: createOperationDefinition({
    expressionKey: "add",
    labelKey: "computedOperatorAdd",
    fallbackLabel: "Add",
  }),
  subtract: createOperationDefinition({
    expressionKey: "sub",
    labelKey: "computedOperatorSubtract",
    fallbackLabel: "Subtract",
  }),
  multiply: createOperationDefinition({
    expressionKey: "mul",
    labelKey: "computedOperatorMultiply",
    fallbackLabel: "Multiply",
  }),
  divide: createOperationDefinition({
    expressionKey: "div",
    labelKey: "computedOperatorDivide",
    fallbackLabel: "Divide",
  }),
  minimum: createOperationDefinition({
    expressionKey: "min",
    labelKey: "computedOperatorMinimum",
    fallbackLabel: "Minimum",
  }),
  maximum: createOperationDefinition({
    expressionKey: "max",
    labelKey: "computedOperatorMaximum",
    fallbackLabel: "Maximum",
  }),
  equal: createOperationDefinition({
    expressionKey: "eq",
    labelKey: "computedOperatorEqual",
    fallbackLabel: "Equal",
    resultType: "boolean",
    operandTypes: ["string", "number", "boolean", "object"],
    maximumOperandCount: 2,
    expressionShape: "fixed",
  }),
  notEqual: createOperationDefinition({
    expressionKey: "neq",
    labelKey: "computedOperatorNotEqual",
    fallbackLabel: "Not equal",
    resultType: "boolean",
    operandTypes: ["string", "number", "boolean", "object"],
    maximumOperandCount: 2,
    expressionShape: "fixed",
  }),
  greaterThan: createOperationDefinition({
    expressionKey: "gt",
    labelKey: "computedOperatorGreaterThan",
    fallbackLabel: "Greater than",
    resultType: "boolean",
    operandTypes: ["number", "string"],
    maximumOperandCount: 2,
    expressionShape: "fixed",
  }),
  greaterOrEqual: createOperationDefinition({
    expressionKey: "gte",
    labelKey: "computedOperatorGreaterOrEqual",
    fallbackLabel: "Greater or equal",
    resultType: "boolean",
    operandTypes: ["number", "string"],
    maximumOperandCount: 2,
    expressionShape: "fixed",
  }),
  lessThan: createOperationDefinition({
    expressionKey: "lt",
    labelKey: "computedOperatorLessThan",
    fallbackLabel: "Less than",
    resultType: "boolean",
    operandTypes: ["number", "string"],
    maximumOperandCount: 2,
    expressionShape: "fixed",
  }),
  lessOrEqual: createOperationDefinition({
    expressionKey: "lte",
    labelKey: "computedOperatorLessOrEqual",
    fallbackLabel: "Less or equal",
    resultType: "boolean",
    operandTypes: ["number", "string"],
    maximumOperandCount: 2,
    expressionShape: "fixed",
  }),
  and: createOperationDefinition({
    expressionKey: "and",
    labelKey: "computedOperatorAnd",
    fallbackLabel: "And",
    resultType: "boolean",
    operandTypes: ["boolean"],
    minimumOperandCount: 1,
    expressionShape: "variadic",
  }),
  or: createOperationDefinition({
    expressionKey: "or",
    labelKey: "computedOperatorOr",
    fallbackLabel: "Or",
    resultType: "boolean",
    operandTypes: ["boolean"],
    minimumOperandCount: 1,
    expressionShape: "variadic",
  }),
  not: createOperationDefinition({
    expressionKey: "not",
    labelKey: "computedOperatorNot",
    fallbackLabel: "Not",
    resultType: "boolean",
    operandTypes: ["boolean"],
    minimumOperandCount: 1,
    maximumOperandCount: 1,
    expressionShape: "fixed",
  }),
});

export const COMPUTED_OPERATION_TYPES = Object.freeze(
  Object.keys(COMPUTED_OPERATION_DEFINITIONS),
);

const COMPUTED_LOGICAL_OPERATION_TYPES = new Set(["and", "or", "not"]);

export const getComputedOperationDefinition = (operationType) =>
  COMPUTED_OPERATION_DEFINITIONS[operationType];

export const isSupportedComputedOperationType = (operationType) =>
  getComputedOperationDefinition(operationType) !== undefined;

export const isComputedLogicalOperationType = (operationType) =>
  COMPUTED_LOGICAL_OPERATION_TYPES.has(operationType);

export const isComputedLiteralValue = (value) =>
  (typeof value === "number" && Number.isFinite(value)) ||
  typeof value === "string" ||
  typeof value === "boolean";

export const isComputedOperationOperandCountValid = (
  operationType,
  operandCount,
) => {
  const definition = getComputedOperationDefinition(operationType);
  return (
    definition !== undefined &&
    operandCount >= definition.minimumOperandCount &&
    operandCount <= definition.maximumOperandCount
  );
};

export const canAddComputedOperationOperand = (operationType, operandCount) => {
  const definition = getComputedOperationDefinition(operationType);
  return (
    definition !== undefined && operandCount < definition.maximumOperandCount
  );
};

export const getComputedExpressionOperationType = (expression) => {
  if (
    expression === null ||
    typeof expression !== "object" ||
    Array.isArray(expression) ||
    Object.keys(expression).length !== 1
  ) {
    return undefined;
  }

  return COMPUTED_OPERATION_TYPES.find((operationType) => {
    const definition = COMPUTED_OPERATION_DEFINITIONS[operationType];
    const operands = expression[definition.expressionKey];
    if (!Array.isArray(operands)) {
      return false;
    }
    if (definition.expressionShape === "left-fold") {
      return operands.length === 2;
    }
    return isComputedOperationOperandCountValid(operationType, operands.length);
  });
};

export const getComputedOperationLabel = (operationType, copy = {}) => {
  const definition = getComputedOperationDefinition(operationType);
  if (!definition) {
    return copy.computedUnknownReference ?? "Unknown";
  }

  return copy[definition.labelKey] ?? definition.fallbackLabel;
};
