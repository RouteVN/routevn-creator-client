export const createInitialState = () => ({});

export const selectViewData = ({ i18n, props }) => {
  const copy = i18n?.variablesPage ?? {};
  const operation = props.operation ?? {};

  return {
    operands: operation.operands ?? [],
    operationLabel: copy.computedOperatorAdd ?? "Add",
    operationNeedsOperandsMessage:
      copy.computedOperationNeedsOperandsMessage ??
      "Add at least two operands.",
    addOperandLabel:
      copy.computedAddOperandLabel ?? "Add variable, value, or operation",
    variableLabel: copy.computedNodeVariableSource ?? "Variable",
    valueLabel: copy.computedNodeValueSource ?? "Value",
    removeOperandLabel: copy.computedRemoveOperandLabel ?? "Remove operand",
  };
};
