import { generateId } from "../../internal/id.js";
import {
  getRandomVariableType,
  isEditableRandomOperation,
  MAX_RANDOM_VALUES,
  validateRandomDistribution,
  validateUpdateVariableSize,
} from "../../internal/randomActions.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import {
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";

const getVariableItems = (variablesData = {}) => {
  return variablesData?.items ?? {};
};

const DEFAULT_DIVIDE_ROUND_TO = 2;
const MAX_DIVIDE_ROUND_TO = 12;

// A new random range draws like a die.
const DEFAULT_RANDOM_MIN = 1;
const DEFAULT_RANDOM_MAX = 6;
const NEW_RANDOM_VALUE_WEIGHT = 1;

const INVALID_OPERATION_VALUE_MESSAGE = "Variable operation value is invalid.";

// The value a new row of a random list starts with: the first enum value, or
// an empty field.
const getNewRandomValue = (variable) => {
  if (isVariableEnumEnabled(variable)) {
    return normalizeVariableEnumValues(variable.enumValues)[0] ?? "";
  }

  const variableType = getRandomVariableType(variable);
  if (variableType === "boolean") {
    return true;
  }
  return variableType === "number" ? undefined : "";
};

const createRandomValueRow = (value, weight = NEW_RANDOM_VALUE_WEIGHT) => ({
  id: generateId(),
  value,
  weight,
});

// A new random operation: a range from 1 to 6 for a number variable, true and
// false for a boolean one, and one row for the others. A number variable also
// gets a list, for when the user switches to it.
const createDefaultRandomDraft = (variable) => {
  const variableType = getRandomVariableType(variable);
  const values =
    variableType === "boolean"
      ? [createRandomValueRow(true), createRandomValueRow(false)]
      : [createRandomValueRow(getNewRandomValue(variable))];

  return {
    type: variableType === "number" ? "integer" : "weighted",
    min: DEFAULT_RANDOM_MIN,
    max: DEFAULT_RANDOM_MAX,
    values,
  };
};

// The form of a saved random operation that isEditableRandomDistribution
// accepts. Each value gets an id for its row while it is edited.
const toRandomDraft = (distribution, variable) => {
  const draft = createDefaultRandomDraft(variable);
  draft.type = distribution.type;
  if (distribution.type === "integer") {
    draft.min = distribution.min;
    draft.max = distribution.max;
  } else {
    draft.values = distribution.values.map((entry) =>
      createRandomValueRow(entry.value, entry.weight),
    );
  }
  return draft;
};

// The Route Engine distribution of the draft, without the rows' ids.
const toRandomDistribution = (random) => {
  if (random.type === "integer") {
    return { type: "integer", min: random.min, max: random.max };
  }

  return {
    type: "weighted",
    values: random.values.map((entry) => ({
      weight: entry.weight,
      value: entry.value,
    })),
  };
};

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

const normalizeRandomOperationForSave = ({ operation, variable }) => {
  const distribution = toRandomDistribution(operation.random);
  const message = validateRandomDistribution(distribution, variable);
  if (message) {
    return {
      message,
      valid: false,
    };
  }

  return {
    operation: {
      variableId: operation.variableId,
      op: operation.op,
      value: undefined,
      roundTo: undefined,
      distribution,
    },
    valid: true,
  };
};

const normalizeOperationForSave = ({ operation, variableItems } = {}) => {
  const variable = variableItems[operation.variableId];
  if (operation.op === "random") {
    return normalizeRandomOperationForSave({ operation, variable });
  }

  const variableType = (variable?.variableType || "string").toLowerCase();
  const normalized = normalizeOperationValue({
    operation: operation.op,
    variableType,
    value: operation.value,
  });

  if (!normalized.valid) {
    return {
      message: INVALID_OPERATION_VALUE_MESSAGE,
      valid: false,
    };
  }

  const result = {
    variableId: operation.variableId,
    op: operation.op,
    distribution: undefined,
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
        message: INVALID_OPERATION_VALUE_MESSAGE,
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

const showWarning = (appService, copy, message) => {
  appService.showAlert({
    message: localizeCommandLineText(message, copy),
    title: localizeCommandLineText("Warning", copy),
  });
};

const showInvalidOperationValueAlert = (appService, copy) => {
  showWarning(appService, copy, INVALID_OPERATION_VALUE_MESSAGE);
};

const showComputedVariableReadOnlyAlert = (appService, copy) => {
  appService.showAlert({
    message:
      copy.computedVariableReadOnly ?? "Computed variables cannot be updated.",
    title: localizeCommandLineText("Warning", copy),
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

  const variableItems = getVariableItems(variables);
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
    if (op.op === "random") {
      operation.distribution = op.distribution;
      // Submit writes a random operation the editor cannot edit back as it
      // was saved.
      if (!isEditableRandomOperation(op, variableItems[op.variableId])) {
        operation.unsupportedOperation = op;
      }
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
    const variable = store.selectVariableItemById({
      variableId: operation.variableId,
    });
    store.setCurrentEditingId({ id });
    store.setTempOperation({
      variableId: operation.variableId,
      op: operation.op,
      value: operation.value,
      roundTo: operation.roundTo,
      random:
        operation.op === "random" &&
        operation.unsupportedOperation === undefined
          ? toRandomDraft(operation.distribution, variable)
          : undefined,
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
  const variable = store.selectVariableItemById({ variableId: value });
  // When variable changes, default to setting its type-appropriate value
  store.setTempOperation({
    variableId: value,
    op: "set",
    value: getDefaultValueForVariable(variable),
    roundTo: undefined,
    random: undefined,
  });
  render();
};

export const handleOperationSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value || payload._event.target?.value;

  // When operation changes, reset value (especially for toggle)
  const { tempOperation: currentTempOperation, variable } =
    store.selectOperationChangeData();

  const tempOperation = {
    op: value,
    value: getOperationValue({
      variable,
      operation: value,
      currentValue: currentTempOperation.value,
    }),
    roundTo:
      value === "divide"
        ? (currentTempOperation.roundTo ?? DEFAULT_DIVIDE_ROUND_TO)
        : undefined,
    // Picking Set to random again keeps the values being edited.
    random:
      value === "random"
        ? (currentTempOperation.random ?? createDefaultRandomDraft(variable))
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

export const handleRandomTypeChange = (deps, payload) => {
  const { store, render } = deps;
  const { value } = payload._event.detail;

  store.setTempRandomType({ type: value });
  render();
};

// rtgl-input-number sends null for an empty field.
export const handleRandomMinInputChange = (deps, payload) => {
  const { store, render } = deps;
  const { value } = payload._event.detail;

  store.setTempRandomMin({ min: value ?? undefined });
  render();
};

export const handleRandomMaxInputChange = (deps, payload) => {
  const { store, render } = deps;
  const { value } = payload._event.detail;

  store.setTempRandomMax({ max: value ?? undefined });
  render();
};

export const handleRandomNumberValueChange = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget, detail } = payload._event;

  store.setTempRandomValue({
    id: currentTarget.dataset.valueId,
    value: detail.value ?? undefined,
  });
  render();
};

export const handleRandomTextValueChange = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget, detail } = payload._event;

  store.setTempRandomValue({
    id: currentTarget.dataset.valueId,
    value: detail.value,
  });
  render();
};

export const handleRandomBooleanValueChange = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget, detail } = payload._event;

  store.setTempRandomValue({
    id: currentTarget.dataset.valueId,
    value: detail.value === "true",
  });
  render();
};

export const handleRandomEnumValueChange = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget, detail } = payload._event;

  store.setTempRandomValue({
    id: currentTarget.dataset.valueId,
    value: detail.value,
  });
  render();
};

export const handleRandomWeightSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const { currentTarget, detail } = payload._event;

  store.setTempRandomValueWeight({
    id: currentTarget.dataset.valueId,
    weight: detail.value,
  });
  render();
};

export const handleRemoveRandomValueClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;

  store.removeTempRandomValue({
    id: payload._event.currentTarget.dataset.valueId,
  });
  render();
};

export const handleAddRandomValueClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { appService, store, render, i18n } = deps;
  const { random, variable } = store.selectRandomDraftData();

  if (random.values.length >= MAX_RANDOM_VALUES) {
    showWarning(
      appService,
      selectCommandLineCopy(i18n),
      "A random operation can have at most 100 values.",
    );
    return;
  }

  store.addTempRandomValue(createRandomValueRow(getNewRandomValue(variable)));
  render();
};

export const handleSaveOperationClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { appService, store, render, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const { currentEditingId, tempOperation, variablesData } =
    store.selectOperationSaveData();

  if (currentEditingId && tempOperation.variableId && tempOperation.op) {
    if (
      variablesData.items?.[tempOperation.variableId]?.computed !== undefined
    ) {
      showComputedVariableReadOnlyAlert(appService, copy);
      return;
    }
    const normalized = normalizeOperationForSave({
      operation: tempOperation,
      variableItems: getVariableItems(variablesData),
    });

    if (!normalized.valid) {
      showWarning(appService, copy, normalized.message);
      return;
    }

    const operationUpdate = {
      id: currentEditingId,
      variableId: normalized.operation.variableId,
      op: normalized.operation.op,
      value: normalized.operation.value,
      roundTo: normalized.operation.roundTo,
      distribution: normalized.operation.distribution,
    };
    store.updateOperation(operationUpdate);
    store.setMode({ mode: "current" });
    store.setCurrentEditingId({ id: null });
    render();
  }
};

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { dispatchEvent, store, appService, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const { actionId, operations, variablesData } = store.selectSubmitData();
  const variableItems = getVariableItems(variablesData);
  let hasInvalidOperationValue = false;
  let randomOperationProblem;

  if (
    operations.some(
      (operation) =>
        variableItems[operation.variableId]?.computed !== undefined,
    )
  ) {
    showComputedVariableReadOnlyAlert(appService, copy);
    return;
  }

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
      if (op.op === "random") {
        if (op.unsupportedOperation !== undefined) {
          return op.unsupportedOperation;
        }
        randomOperationProblem ??= validateRandomDistribution(
          op.distribution,
          variableItems[op.variableId],
        );
        result.distribution = op.distribution;
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
    showInvalidOperationValueAlert(appService, copy);
    return;
  }

  if (randomOperationProblem) {
    showWarning(appService, copy, randomOperationProblem);
    return;
  }

  const updateVariable = {
    id: actionId,
    operations: validOperations,
  };
  const sizeProblem = validateUpdateVariableSize(updateVariable);
  if (sizeProblem) {
    showWarning(appService, copy, sizeProblem);
    return;
  }

  if (validOperations.length === 0) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Please add at least one valid variable operation.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        updateVariable,
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
