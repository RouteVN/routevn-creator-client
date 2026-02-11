// Operations available per variable type
const OPERATIONS_BY_TYPE = {
  number: [
    { value: "set", label: "Set to" },
    { value: "increment", label: "Increment by" },
    { value: "decrement", label: "Decrement by" },
    { value: "multiply", label: "Multiply by" },
    { value: "divide", label: "Divide by" },
  ],
  boolean: [
    { value: "set", label: "Set to" },
    { value: "toggle", label: "Toggle" },
  ],
  string: [{ value: "set", label: "Set to" }],
};

export const createInitialState = () => ({
  mode: "current",
  initiated: false,
  variablesData: { items: {}, tree: [] },
  actionId: "",
  operations: [],
  currentEditingId: null,
  tempOperation: {
    variableId: "",
    op: "",
    value: "",
  },
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [{ label: "Delete", type: "item", value: "delete" }],
    operationId: null,
  },
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setInitiated = (state) => {
  state.initiated = true;
};

export const setVariablesData = (state, payload) => {
  state.variablesData = payload.variables;
};

export const setActionId = (state, id) => {
  state.actionId = id;
};

export const setOperations = (state, operations) => {
  state.operations = operations;
};

export const addOperation = (state, payload) => {
  state.operations.push({
    id: payload.id,
    variableId: "",
    op: "",
    value: "",
  });
  state.currentEditingId = payload.id;
  state.mode = "edit";
};

export const updateOperation = (state, payload) => {
  const index = state.operations.findIndex((op) => op.id === payload.id);
  if (index !== -1) {
    state.operations[index] = { ...state.operations[index], ...payload };
  }
};

export const deleteOperation = (state, operationId) => {
  state.operations = state.operations.filter((op) => op.id !== operationId);
  if (state.currentEditingId === operationId) {
    state.currentEditingId = null;
    state.mode = "current";
  }
};

export const setCurrentEditingId = (state, payload) => {
  state.currentEditingId = payload.id;
};

export const setTempOperation = (state, payload) => {
  state.tempOperation = { ...state.tempOperation, ...payload };
};

export const resetTempOperation = (state) => {
  state.tempOperation = { variableId: "", op: "", value: "" };
};

export const showDropdownMenu = (state, { position, operationId }) => {
  state.dropdownMenu = {
    ...state.dropdownMenu,
    isOpen: true,
    position,
    operationId,
  };
};

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    ...state.dropdownMenu,
    isOpen: false,
    operationId: null,
  };
};

export const selectDropdownMenuOperationId = ({ state }) => {
  return state.dropdownMenu.operationId;
};

export const selectCurrentEditingOperation = ({ state }) => {
  return state.operations.find((op) => op.id === state.currentEditingId);
};

export const selectOperations = ({ state }) => {
  return state.operations;
};

export const selectViewData = ({ state }) => {
  // Access variables items directly (more reliable than toFlatItems for this structure)
  const variableItems = state.variablesData?.items || {};

  // Build variable options list (filter out folders)
  const variableOptions = Object.entries(variableItems)
    .filter(([_, item]) => item.type !== "folder" && item.itemType !== "folder")
    .map(([id, variable]) => {
      const varType = (variable.type || "string").toLowerCase();
      return {
        value: id,
        label: `${variable.name} (${varType})`,
        variableType: varType,
      };
    });

  // Get selected variable type for filtering operations
  const selectedVariable = variableItems[state.tempOperation.variableId];
  const variableType = (selectedVariable?.type || "string").toLowerCase();
  const operationOptions =
    OPERATIONS_BY_TYPE[variableType] || OPERATIONS_BY_TYPE.string;

  // Determine input type based on variable type and operation
  const showValueField =
    state.tempOperation.op !== "toggle" && state.tempOperation.op !== "";
  const valueInputType = variableType; // already lowercase: "number", "boolean", or "string"

  // Boolean options for boolean variables
  const booleanOptions = [
    { value: "true", label: "true" },
    { value: "false", label: "false" },
  ];

  // Build operations with display data
  const operationsWithData = state.operations.map((op) => {
    const variable = variableItems[op.variableId];
    const varType = (variable?.type || "string").toLowerCase();
    const opDef = OPERATIONS_BY_TYPE[varType]?.find((o) => o.value === op.op);

    // Format display value
    let displayValue = op.value;
    if (op.op === "toggle") {
      displayValue = "";
    } else if (varType === "boolean") {
      displayValue =
        op.value === true || op.value === "true" ? "true" : "false";
    }

    return {
      ...op,
      variableName: variable?.name || "Unknown",
      variableType: varType,
      opLabel: opDef?.label || op.op,
      displayValue,
    };
  });

  const breadcrumb = [
    { id: "actions", label: "Actions" },
    ...(state.mode === "edit"
      ? [
          { id: "current", label: "Update Variable" },
          { label: "Edit Operation" },
        ]
      : [{ label: "Update Variable" }]),
  ];

  // Convert boolean value to string for select
  const booleanValue =
    state.tempOperation.value === true
      ? "true"
      : state.tempOperation.value === false
        ? "false"
        : String(state.tempOperation.value || "false");

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb,
    actionId: state.actionId,
    operations: operationsWithData,
    variableOptions,
    operationOptions,
    booleanOptions,
    showValueField,
    valueInputType,
    tempOperation: {
      ...state.tempOperation,
      booleanValue,
    },
    dropdownMenu: state.dropdownMenu,
    hasOperations: state.operations.length > 0,
    canSaveOperation: state.tempOperation.variableId && state.tempOperation.op,
  };
};
