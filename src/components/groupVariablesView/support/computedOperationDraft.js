const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isAddExpression = (expression) =>
  isRecord(expression) &&
  Object.keys(expression).length === 1 &&
  Array.isArray(expression.add) &&
  expression.add.length === 2;

const toOperandDraft = (expression) => {
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

  if (typeof expression === "number" && Number.isFinite(expression)) {
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

const toOperandExpression = (operand) => {
  if (operand?.source === "variable" && operand.variablePath) {
    return { var: operand.variablePath };
  }

  if (
    operand?.source === "value" &&
    typeof operand.value === "number" &&
    Number.isFinite(operand.value)
  ) {
    return operand.value;
  }

  if (operand?.source === "operation") {
    return buildOperationExpression(operand.operation);
  }

  return undefined;
};

export const createAddOperationDraft = () => ({
  type: "add",
  operands: [],
});

const createOperationDraftFromExpression = (expression) => {
  if (!isAddExpression(expression)) {
    return undefined;
  }

  const flattenLeftAddChain = (addExpression) => {
    const [left, right] = addExpression.add;
    const leftOperands = isAddExpression(left)
      ? flattenLeftAddChain(left)
      : [toOperandDraft(left)];
    return [...leftOperands, toOperandDraft(right)];
  };

  const operands = flattenLeftAddChain(expression);
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }

  return {
    type: "add",
    operands,
  };
};

const buildOperationExpression = (operationDraft) => {
  if (operationDraft?.type !== "add" || operationDraft.operands.length < 2) {
    return undefined;
  }

  const expressions = operationDraft.operands.map(toOperandExpression);
  if (expressions.some((expression) => expression === undefined)) {
    return undefined;
  }

  const expression = expressions.slice(2).reduce(
    (left, right) => ({
      add: [left, right],
    }),
    {
      add: [expressions[0], expressions[1]],
    },
  );

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
