import { generateId } from "../../internal/id.js";
import {
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";

const getVariableItems = (variablesData = {}) => {
  return variablesData?.items ?? {};
};

const DEFAULT_DIVIDE_ROUND_TO = 2;
const MAX_DIVIDE_ROUND_TO = 12;

const getDefaultValueForVariable = (variable = {}) => {
  if (isVariableEnumEnabled(variable)) {
    return normalizeVariableEnumValues(variable.enumValues)[0] ?? "";
  }

  const variableType = (variable?.variableType || "string").toLowerCase();
  return variableType === "number"
    ? 1
    : variableType === "boolean"
      ? false
      : "";
};

const getOperationValue = ({ variable, operation, currentValue } = {}) => {
  if (operation === "toggle") {
    return "";
  }

  if (operation === "set" && isVariableEnumEnabled(variable)) {
    const enumValues = normalizeVariableEnumValues(variable.enumValues);
    return enumValues.includes(currentValue)
      ? currentValue
      : (enumValues[0] ?? "");
  }

  return currentValue;
};

const normalizeOperationValue = ({ operation, variableType, value } = {}) => {
  if (variableType !== "number") {
    return {
      includeValue: true,
      valid: true,
      value,
    };
  }

  if (
    (operation === "increment" || operation === "decrement") &&
    (value === "" || value === undefined || value === null)
  ) {
    return {
      includeValue: false,
      valid: true,
    };
  }

  if (value === "" || value === undefined || value === null) {
    return {
      valid: false,
    };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return {
      valid: false,
    };
  }

  return {
    includeValue: true,
    valid: true,
    value: numericValue,
  };
};

const normalizeRoundToValue = (value) => {
  const roundTo = value ?? DEFAULT_DIVIDE_ROUND_TO;
  const numericRoundTo = Number(roundTo);

  if (
    !Number.isInteger(numericRoundTo) ||
    numericRoundTo < 0 ||
    numericRoundTo > MAX_DIVIDE_ROUND_TO
  ) {
    return {
      valid: false,
    };
  }

  return {
    valid: true,
    value: numericRoundTo,
  };
};

const normalizeOperationForSave = ({ operation, variableItems } = {}) => {
  const variable = variableItems[operation.variableId];
  const variableType = (variable?.variableType || "string").toLowerCase();
  const normalized = normalizeOperationValue({
    operation: operation.op,
    variableType,
    value: operation.value,
  });

  if (!normalized.valid) {
    return {
      valid: false,
    };
  }

  const result = {
    variableId: operation.variableId,
    op: operation.op,
  };

  if (normalized.includeValue) {
    result.value = normalized.value;
  } else {
    result.value = undefined;
  }

  if (operation.op === "divide") {
    const normalizedRoundTo = normalizeRoundToValue(operation.roundTo);
    if (!normalizedRoundTo.valid) {
      return {
        valid: false,
      };
    }
    result.roundTo = normalizedRoundTo.value;
  } else {
    result.roundTo = undefined;
  }

  return {
    operation: result,
    valid: true,
  };
};

const showInvalidOperationValueAlert = (appService) => {
  appService.showAlert({
    message: "Variable operation value is invalid.",
    title: "Warning",
  });
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  const repository = await projectService.getRepository();
  const { variables } = repository.getState();

  store.setVariablesData({ variables: variables || { items: {}, tree: [] } });

  const updateVariable = props?.updateVariable;

  if (!updateVariable) {
    // Generate alphanumeric ID (route-engine requires alphanumeric only)
    store.setActionId({ id: generateId() });
    store.setOperations({ operations: [] });
    store.setInitiated();
    render();
    return;
  }

  // Initialize from existing data
  store.setActionId({
    id: updateVariable.id || generateId(),
  });

  const operations = (updateVariable.operations || []).map((op) => {
    const operation = {
      id: generateId(),
      variableId: op.variableId,
      op: op.op,
      value: op.value ?? "",
    };
    if (op.op === "divide") {
      operation.roundTo = op.roundTo ?? DEFAULT_DIVIDE_ROUND_TO;
    }
    return operation;
  });

  store.setOperations({ operations: operations });
  store.setInitiated();
  render();
};

export const handleAddOperationClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;

  const newId = generateId();
  store.addOperation({ id: newId });
  store.resetTempOperation();
  render();
};

export const handleOperationClick = (deps, payload) => {
  const { store, render } = deps;
  const target = payload._event.currentTarget;
  const id =
    target?.dataset?.operationId || target?.id?.replace("operation", "") || "";

  const operations = store.selectOperations();
  const operation = operations.find((op) => op.id === id);

  if (operation) {
    store.setCurrentEditingId({ id });
    store.setTempOperation({
      variableId: operation.variableId,
      op: operation.op,
      value: operation.value,
      roundTo: operation.roundTo,
    });
    store.setMode({ mode: "edit" });
    render();
  }
};

export const handleOperationContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;

  const target = payload._event.currentTarget;
  const id =
    target?.dataset?.operationId || target?.id?.replace("operation", "") || "";
  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    operationId: id,
  });
  render();
};

export const handleVariableSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value || payload._event.target?.value;

  // Get variable type to set appropriate default value
  const state = store.getState();
  const variableItems = getVariableItems(state.variablesData);
  const variable = variableItems[value];
  // When variable changes, reset operation and set default value
  store.setTempOperation({
    variableId: value,
    op: "",
    value: getDefaultValueForVariable(variable),
    roundTo: undefined,
  });
  render();
};

export const handleOperationSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value || payload._event.target?.value;

  // When operation changes, reset value (especially for toggle)
  const state = store.getState();
  const variableItems = getVariableItems(state.variablesData);
  const variable = variableItems[state.tempOperation.variableId];

  const tempOperation = {
    op: value,
    value: getOperationValue({
      variable,
      operation: value,
      currentValue: state.tempOperation.value,
    }),
    roundTo:
      value === "divide"
        ? (state.tempOperation.roundTo ?? DEFAULT_DIVIDE_ROUND_TO)
        : undefined,
  };

  store.setTempOperation(tempOperation);
  render();
};

export const handleValueInputChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempOperation({ value });
  render();
};

export const handleBooleanSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const rawValue = payload._event.detail?.value || payload._event.target?.value;
  const value = rawValue === "true" || rawValue === true;

  store.setTempOperation({ value });
  render();
};

export const handleEnumValueSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempOperation({ value });
  render();
};

export const handleRoundToInputChange = (deps, payload) => {
  const { store, render } = deps;
  const roundTo = payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempOperation({ roundTo });
  render();
};

export const handleSaveOperationClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { appService, store, render } = deps;
  const state = store.getState();
  const { currentEditingId, tempOperation, variablesData } = state;

  if (currentEditingId && tempOperation.variableId && tempOperation.op) {
    const normalized = normalizeOperationForSave({
      operation: tempOperation,
      variableItems: getVariableItems(variablesData),
    });

    if (!normalized.valid) {
      showInvalidOperationValueAlert(appService);
      return;
    }

    const operationUpdate = {
      id: currentEditingId,
      variableId: normalized.operation.variableId,
      op: normalized.operation.op,
      value: normalized.operation.value,
      roundTo: normalized.operation.roundTo,
    };
    store.updateOperation(operationUpdate);
    store.setMode({ mode: "current" });
    store.setCurrentEditingId({ id: null });
    render();
  }
};

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { dispatchEvent, store, appService } = deps;
  const state = store.getState();
  const { actionId, operations, variablesData } = state;
  const variableItems = getVariableItems(variablesData);
  let hasInvalidOperationValue = false;

  const validOperations = operations
    .filter((op) => op.variableId && op.op)
    .map((op) => {
      const result = {
        variableId: op.variableId,
        op: op.op,
      };
      // Skip value for toggle operation
      if (op.op === "toggle") {
        return result;
      }
      // Get variable type to determine if we should include empty string
      const variable = variableItems[op.variableId];
      const varType = (variable?.variableType || "string").toLowerCase();
      if (varType === "string") {
        result.value = op.value;
        return result;
      }

      if (varType === "number") {
        const normalized = normalizeOperationValue({
          operation: op.op,
          variableType: varType,
          value: op.value,
        });
        if (!normalized.valid) {
          hasInvalidOperationValue = true;
          return undefined;
        }

        if (normalized.includeValue) {
          result.value = normalized.value;
        }

        if (op.op === "divide") {
          const normalizedRoundTo = normalizeRoundToValue(op.roundTo);
          if (!normalizedRoundTo.valid) {
            hasInvalidOperationValue = true;
            return undefined;
          }
          result.roundTo = normalizedRoundTo.value;
        }
        return result;
      }

      if (op.value !== "" && op.value !== undefined) {
        result.value = op.value;
      }
      return result;
    })
    .filter(Boolean);

  if (hasInvalidOperationValue) {
    showInvalidOperationValueAlert(appService);
    return;
  }

  if (validOperations.length === 0) {
    appService.showAlert({
      message: "Please add at least one valid variable operation.",
      title: "Warning",
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        updateVariable: {
          id: actionId,
          operations: validOperations,
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(new CustomEvent("back-to-actions", { detail: {} }));
  } else if (payload._event.detail.id === "current") {
    store.setMode({ mode: "current" });
    store.setCurrentEditingId({ id: null });
    render();
  }
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { detail } = payload._event;

  const item = detail.item || detail;
  const operationId = store.selectDropdownMenuOperationId();

  store.hideDropdownMenu();

  if (item.value === "delete" && operationId) {
    store.deleteOperation({ operationId: operationId });
  }

  render();
};
