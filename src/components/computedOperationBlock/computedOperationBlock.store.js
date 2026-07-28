import {
  canAddComputedOperationOperand,
  getComputedOperationDefinition,
  getComputedOperationLabel,
  isComputedOperationOperandCountValid,
} from "../../internal/computedOperations.js";

export const createInitialState = () => ({});

export const selectViewData = ({ i18n, props }) => {
  const copy = i18n?.variablesPage ?? {};
  const operation = props.operation ?? {};
  const definition = getComputedOperationDefinition(operation.type);
  let operationNeedsOperandsMessage =
    copy.computedOperationNeedsOperandsMessage ?? "Add at least two operands.";
  if (definition?.minimumOperandCount === 1) {
    operationNeedsOperandsMessage =
      definition.maximumOperandCount === 1
        ? (copy.computedOperationNeedsOneOperandMessage ?? "Add one operand.")
        : (copy.computedOperationNeedsAtLeastOneOperandMessage ??
          "Add at least one operand.");
  } else if (definition?.maximumOperandCount === 2) {
    operationNeedsOperandsMessage =
      copy.computedOperationNeedsTwoOperandsMessage ?? "Add two operands.";
  }

  return {
    operands: operation.operands ?? [],
    canAddOperand:
      operation.canAddOperand ??
      canAddComputedOperationOperand(
        operation.type,
        operation.operands?.length ?? 0,
      ),
    operationComplete: isComputedOperationOperandCountValid(
      operation.type,
      operation.operands?.length ?? 0,
    ),
    operationLabel: getComputedOperationLabel(operation.type, copy),
    operationNeedsOperandsMessage,
    addOperandLabel:
      copy.computedAddOperandLabel ?? "Add variable, value, or operation",
    variableLabel: copy.computedNodeVariableSource ?? "Variable",
    valueLabel: copy.computedNodeValueSource ?? "Value",
    removeOperandLabel: copy.computedRemoveOperandLabel ?? "Remove operand",
  };
};
