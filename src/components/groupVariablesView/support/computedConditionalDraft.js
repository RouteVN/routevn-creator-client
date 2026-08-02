import {
  getComputedOperationDefinition,
  isComputedLiteralValue,
  isComputedOperationOperandCountValid,
} from "../../../internal/computedOperations.js";
import {
  buildExpressionFromOperandDraft,
  createOperandDraftFromExpression,
  createOperationDraft,
} from "./computedOperationDraft.js";

export const COMPUTED_CONDITION_OPERATION_TYPES = Object.freeze([
  "add",
  "subtract",
  "equal",
  "notEqual",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "and",
  "or",
  "not",
]);

const CONDITION_OPERATION_KEYS = Object.freeze({
  add: "add",
  subtract: "sub",
  equal: "eq",
  notEqual: "neq",
  greaterThan: "gt",
  greaterOrEqual: "gte",
  lessThan: "lt",
  lessOrEqual: "lte",
  and: "all",
  or: "any",
  not: "not",
});

const CONDITION_OPERATION_TYPES_BY_KEY = Object.freeze(
  Object.fromEntries(
    Object.entries(CONDITION_OPERATION_KEYS).map(
      ([operationType, expressionKey]) => [expressionKey, operationType],
    ),
  ),
);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const cloneDraftValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneDraftValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        cloneDraftValue(child),
      ]),
    );
  }
  return value;
};

const cloneOperandDraft = (operand) => {
  if (operand?.source === "variable") {
    return {
      source: "variable",
      variablePath: operand.variablePath,
    };
  }
  if (operand?.source === "value") {
    const clone = {
      source: "value",
      value: cloneDraftValue(operand.value),
    };
    if (operand.useValueProperty === true) {
      clone.useValueProperty = true;
    }
    return clone;
  }
  if (operand?.source === "operation") {
    return {
      source: "operation",
      operation: {
        type: operand.operation.type,
        operands: operand.operation.operands.map(cloneOperandDraft),
      },
    };
  }
  return undefined;
};

export const cloneConditionalBranchDraft = (branch) => ({
  when: cloneOperandDraft(branch.when),
  result: cloneOperandDraft(branch.result),
});

const createConditionOperandDraft = (expression) => {
  if (
    isRecord(expression) &&
    Object.keys(expression).length === 1 &&
    typeof expression.var === "string"
  ) {
    return {
      source: "variable",
      variablePath: expression.var,
    };
  }

  if (isComputedLiteralValue(expression)) {
    return {
      source: "value",
      value: expression,
    };
  }

  const operation = createConditionOperationDraft(expression);
  if (!operation) {
    return undefined;
  }
  return {
    source: "operation",
    operation,
  };
};

const createConditionOperationDraft = (expression) => {
  if (!isRecord(expression) || Object.keys(expression).length !== 1) {
    return undefined;
  }

  const expressionKey = Object.keys(expression)[0];
  const operationType = CONDITION_OPERATION_TYPES_BY_KEY[expressionKey];
  if (!operationType) {
    return undefined;
  }

  const rawOperands =
    operationType === "not"
      ? [expression[expressionKey]]
      : expression[expressionKey];
  if (
    !Array.isArray(rawOperands) ||
    !isComputedOperationOperandCountValid(operationType, rawOperands.length)
  ) {
    return undefined;
  }

  const operands = rawOperands.map(createConditionOperandDraft);
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }

  return {
    type: operationType,
    operands,
  };
};

const buildConditionExpressionFromOperandDraft = (operand) => {
  if (operand?.source === "variable" && operand.variablePath) {
    return { var: operand.variablePath };
  }
  if (operand?.source === "value" && isComputedLiteralValue(operand.value)) {
    return operand.value;
  }
  if (operand?.source === "operation") {
    return buildConditionOperationExpression(operand.operation);
  }
  return undefined;
};

const buildConditionOperationExpression = (operationDraft) => {
  const operationType = operationDraft?.type;
  const expressionKey = CONDITION_OPERATION_KEYS[operationType];
  if (
    !expressionKey ||
    !isComputedOperationOperandCountValid(
      operationType,
      operationDraft.operands.length,
    )
  ) {
    return undefined;
  }

  const expressions = operationDraft.operands.map(
    buildConditionExpressionFromOperandDraft,
  );
  if (expressions.some((expression) => expression === undefined)) {
    return undefined;
  }

  if (operationType === "not") {
    return { not: expressions[0] };
  }
  if (operationType === "add" || operationType === "subtract") {
    return expressions.slice(2).reduce(
      (left, right) => ({
        [expressionKey]: [left, right],
      }),
      {
        [expressionKey]: [expressions[0], expressions[1]],
      },
    );
  }
  return {
    [expressionKey]: expressions,
  };
};

const createResultDraft = (result) => {
  if (!isRecord(result)) {
    return undefined;
  }
  if (Object.hasOwn(result, "expr") && !Object.hasOwn(result, "value")) {
    return createOperandDraftFromExpression(result.expr);
  }
  if (Object.hasOwn(result, "value") && !Object.hasOwn(result, "expr")) {
    return {
      source: "value",
      value: structuredClone(result.value),
      useValueProperty: true,
    };
  }
  return undefined;
};

const buildConditionalResult = (resultDraft) => {
  if (
    resultDraft?.source === "value" &&
    resultDraft.useValueProperty === true
  ) {
    return {
      value: structuredClone(resultDraft.value),
    };
  }

  const expression = buildExpressionFromOperandDraft(resultDraft);
  if (expression === undefined) {
    return undefined;
  }
  return { expr: expression };
};

export const createConditionalBranchDraft = () => ({
  when: undefined,
  result: undefined,
});

export const createConditionalDraft = () => ({
  branches: [createConditionalBranchDraft()],
  defaultResult: undefined,
});

export const createConditionalDraftFromComputed = (computed) => {
  if (
    !isRecord(computed) ||
    !Array.isArray(computed.branches) ||
    computed.branches.length === 0 ||
    !isRecord(computed.default)
  ) {
    return undefined;
  }

  const branches = computed.branches.map((branch) => {
    if (!isRecord(branch) || !Object.hasOwn(branch, "when")) {
      return undefined;
    }
    const when = createConditionOperandDraft(branch.when);
    const result = createResultDraft(branch);
    if (!when || !result) {
      return undefined;
    }
    return { when, result };
  });
  const defaultResult = createResultDraft(computed.default);
  if (!defaultResult || branches.some((branch) => branch === undefined)) {
    return undefined;
  }

  return {
    branches,
    defaultResult,
  };
};

export const buildComputedFromConditionalDraft = (conditionalDraft) => {
  if (
    !Array.isArray(conditionalDraft?.branches) ||
    conditionalDraft.branches.length === 0
  ) {
    return undefined;
  }

  const branches = conditionalDraft.branches.map((branch) => {
    const when = buildConditionExpressionFromOperandDraft(branch.when);
    const result = buildConditionalResult(branch.result);
    if (when === undefined || result === undefined) {
      return undefined;
    }
    return {
      when,
      ...result,
    };
  });
  const defaultResult = buildConditionalResult(conditionalDraft.defaultResult);
  if (
    defaultResult === undefined ||
    branches.some((branch) => branch === undefined)
  ) {
    return undefined;
  }

  return {
    branches,
    default: defaultResult,
  };
};

export const createConditionalOperationDraft = (operationType) => {
  if (!COMPUTED_CONDITION_OPERATION_TYPES.includes(operationType)) {
    return undefined;
  }
  return createOperationDraft(operationType);
};

export const isComputedConditionOperationType = (operationType) =>
  COMPUTED_CONDITION_OPERATION_TYPES.includes(operationType) &&
  getComputedOperationDefinition(operationType) !== undefined;
