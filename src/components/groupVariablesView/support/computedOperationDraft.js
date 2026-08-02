import {
  getComputedExpressionOperationType,
  getComputedOperationDefinition,
  isComputedLiteralValue,
  isComputedOperationOperandCountValid,
  isSupportedComputedOperationType,
} from "../../../internal/computedOperations.js";

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const createOperandDraftFromExpression = (expression) => {
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

  const operation = createOperationDraftFromExpression(expression);
  if (operation) {
    return {
      source: "operation",
      operation,
    };
  }

  return undefined;
};

export const buildExpressionFromOperandDraft = (operand) => {
  if (operand?.source === "variable" && operand.variablePath) {
    return { var: operand.variablePath };
  }

  if (operand?.source === "value" && isComputedLiteralValue(operand.value)) {
    return operand.value;
  }

  if (operand?.source === "operation") {
    return buildOperationExpression(operand.operation);
  }

  return undefined;
};

export const createOperationDraft = (operationType) => {
  if (!isSupportedComputedOperationType(operationType)) {
    return undefined;
  }

  return {
    type: operationType,
    operands: [],
  };
};

export const createOperationDraftFromExpression = (expression) => {
  const operationType = getComputedExpressionOperationType(expression);
  if (!operationType) {
    return undefined;
  }
  const { expressionKey, expressionShape } =
    getComputedOperationDefinition(operationType);

  let operands;
  if (expressionShape === "left-fold") {
    const flattenLeftOperationChain = (operationExpression) => {
      const [left, right] = operationExpression[expressionKey];
      const leftOperands =
        getComputedExpressionOperationType(left) === operationType
          ? flattenLeftOperationChain(left)
          : [createOperandDraftFromExpression(left)];
      return [...leftOperands, createOperandDraftFromExpression(right)];
    };
    operands = flattenLeftOperationChain(expression);
  } else {
    operands = expression[expressionKey].map(createOperandDraftFromExpression);
  }
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }

  return {
    type: operationType,
    operands,
  };
};

export const buildOperationExpression = (operationDraft) => {
  const definition = getComputedOperationDefinition(operationDraft?.type);
  if (
    !definition ||
    !isComputedOperationOperandCountValid(
      operationDraft.type,
      operationDraft.operands.length,
    )
  ) {
    return undefined;
  }
  const { expressionKey, expressionShape } = definition;

  const expressions = operationDraft.operands.map(
    buildExpressionFromOperandDraft,
  );
  if (expressions.some((expression) => expression === undefined)) {
    return undefined;
  }

  let expression;
  if (expressionShape === "left-fold") {
    expression = expressions.slice(2).reduce(
      (left, right) => ({
        [expressionKey]: [left, right],
      }),
      {
        [expressionKey]: [expressions[0], expressions[1]],
      },
    );
  } else {
    expression = {
      [expressionKey]: expressions,
    };
  }

  return expression;
};

export const createOperationDraftFromComputed = (computed) => {
  return createOperationDraftFromExpression(computed?.expr);
};

export const buildComputedFromOperationDraft = (operationDraft) => {
  const expression = buildOperationExpression(operationDraft);
  if (expression === undefined) {
    return undefined;
  }

  return { expr: expression };
};

export const toVariablePath = (variableId) => {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(variableId)) {
    return `variables.${variableId}`;
  }
  return `variables[${JSON.stringify(variableId)}]`;
};

export const resolveExcludedOperationVariableId = ({
  dialogMode,
  editingItemId,
  selectedItemId,
} = {}) => {
  if (dialogMode !== "edit") {
    return undefined;
  }

  return editingItemId ?? selectedItemId;
};
