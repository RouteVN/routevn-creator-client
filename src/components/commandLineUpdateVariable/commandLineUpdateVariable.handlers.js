import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  const repository = await projectService.getRepository();
  const { variables } = repository.getState();

  store.setVariablesData({ variables: variables || { items: {}, tree: [] } });

  const updateVariable = props?.updateVariable;

  if (!updateVariable) {
    // Generate alphanumeric ID (route-engine requires alphanumeric only)
    store.setActionId({ id: nanoid(8).replace(/[^a-zA-Z0-9]/g, "a") });
    store.setOperations({ operations: [] });
    store.setInitiated();
    render();
    return;
  }

  // Initialize from existing data
  store.setActionId({
    id: updateVariable.id || nanoid(8).replace(/[^a-zA-Z0-9]/g, "a"),
  });

  const operations = (updateVariable.operations || []).map((op) => ({
    id: nanoid(),
    variableId: op.variableId,
    op: op.op,
    value: op.value ?? "",
  }));

  store.setOperations({ operations: operations });
  store.setInitiated();
  render();
};

export const handleAddOperationClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;

  const newId = nanoid();
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
  const variableItems = state.variablesData?.items || {};
  const variable = variableItems[value];
  const varType = (variable?.type || "string").toLowerCase();

  // Set default value based on variable type
  const defaultValue =
    varType === "number" ? 1 : varType === "boolean" ? false : "";

  // When variable changes, reset operation and set default value
  store.setTempOperation({
    variableId: value,
    op: "",
    value: defaultValue,
  });
  render();
};

export const handleOperationSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value || payload._event.target?.value;

  // When operation changes, reset value (especially for toggle)
  store.setTempOperation({
    op: value,
    value: value === "toggle" ? "" : store.getState().tempOperation.value,
  });
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

export const handleSaveOperationClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const state = store.getState();
  const { currentEditingId, tempOperation } = state;

  if (currentEditingId && tempOperation.variableId && tempOperation.op) {
    store.updateOperation({
      id: currentEditingId,
      variableId: tempOperation.variableId,
      op: tempOperation.op,
      value: tempOperation.value,
    });
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
  const variableItems = variablesData?.items || {};

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
      const varType = (variable?.type || "string").toLowerCase();
      // Always include value for strings (empty string is valid), otherwise only if set
      if (varType === "string" || (op.value !== "" && op.value !== undefined)) {
        result.value = op.value;
      }
      return result;
    });

  if (validOperations.length === 0) {
    appService.showToast("Please add at least one valid variable operation.", {
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
