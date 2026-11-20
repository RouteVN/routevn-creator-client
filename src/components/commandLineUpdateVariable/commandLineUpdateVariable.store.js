import { getVariableOptions } from "../../internal/project/projection.js";
import { getOutcomeChancePercents } from "../../internal/randomActions.js";
import {
  buildVariableEnumOptions,
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";
import {
  formatCommandLineCopy,
  localizeCommandLineBreadcrumb,
  localizeCommandLineDropdownMenu,
  localizeCommandLineOptions,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import {
  formatRandomChance,
  formatRandomDistributionSummary,
} from "../../internal/ui/sceneEditor/randomCopy.js";

// Operations available per variable type
const OPERATIONS_BY_TYPE = {
  number: [
    { value: "set", label: "Set to" },
    { value: "increment", label: "Increment by" },
    { value: "decrement", label: "Decrement by" },
    { value: "multiply", label: "Multiply by" },
    { value: "divide", label: "Divide by" },
    { value: "random", label: "Set to random" },
  ],
  boolean: [
    { value: "set", label: "Set to" },
    { value: "toggle", label: "Toggle" },
    { value: "random", label: "Set to random" },
  ],
  string: [
    { value: "set", label: "Set to" },
    { value: "random", label: "Set to random" },
  ],
  // Route Engine draws only numbers, booleans and text.
  object: [{ value: "set", label: "Set to" }],
};

// The label of each operation, also for one saved on a variable whose type
// does not offer it.
const OPERATION_LABELS = Object.fromEntries(
  Object.values(OPERATIONS_BY_TYPE)
    .flat()
    .map((operation) => [operation.value, operation.label]),
);

// A number variable draws from a range or a list; other variables from a list.
const RANDOM_TYPE_OPTIONS = [
  { value: "integer", label: "Range" },
  { value: "weighted", label: "List" },
];

const DEFAULT_DIVIDE_ROUND_TO = 2;
const MAX_DIVIDE_ROUND_TO = 12;

const isValidRoundToValue = (value) => {
  const numericValue = Number(value);
  return (
    Number.isInteger(numericValue) &&
    numericValue >= 0 &&
    numericValue <= MAX_DIVIDE_ROUND_TO
  );
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
    roundTo: undefined,
  },
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [{ label: "Delete", type: "item", value: "delete" }],
    operationId: null,
  },
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setInitiated = ({ state }, _payload = {}) => {
  state.initiated = true;
};

export const setVariablesData = ({ state }, { variables } = {}) => {
  state.variablesData = variables;
};

export const setActionId = ({ state }, { id } = {}) => {
  state.actionId = id;
};

export const setOperations = ({ state }, { operations } = {}) => {
  state.operations = operations;
};

export const addOperation = ({ state }, { id } = {}) => {
  state.operations.push({
    id: id,
    variableId: "",
    op: "",
    value: "",
    roundTo: undefined,
  });
  state.currentEditingId = id;
  state.mode = "edit";
};

export const updateOperation = ({ state }, params = {}) => {
  const index = state.operations.findIndex((op) => op.id === params.id);
  if (index !== -1) {
    state.operations[index] = { ...state.operations[index], ...params };
  }
};

export const deleteOperation = ({ state }, { operationId } = {}) => {
  state.operations = state.operations.filter((op) => op.id !== operationId);
  if (state.currentEditingId === operationId) {
    state.currentEditingId = null;
    state.mode = "current";
  }
};

export const setCurrentEditingId = ({ state }, { id } = {}) => {
  state.currentEditingId = id;
};

export const setTempOperation = ({ state }, params = {}) => {
  state.tempOperation = { ...state.tempOperation, ...params };
};

// The random draft of the operation being edited: `type` is "integer" for a
// range or "weighted" for a list, and a number variable keeps both a range
// and a list so that switching between them loses neither.
export const setTempRandomType = ({ state }, { type } = {}) => {
  state.tempOperation.random.type = type;
};

export const setTempRandomMin = ({ state }, { min } = {}) => {
  state.tempOperation.random.min = min;
};

export const setTempRandomMax = ({ state }, { max } = {}) => {
  state.tempOperation.random.max = max;
};

export const addTempRandomValue = ({ state }, { id, value, weight } = {}) => {
  state.tempOperation.random.values.push({ id, value, weight });
};

export const setTempRandomValue = ({ state }, { id, value } = {}) => {
  const entry = state.tempOperation.random.values.find(
    (item) => item.id === id,
  );
  entry.value = value;
};

export const setTempRandomValueWeight = ({ state }, { id, weight } = {}) => {
  const entry = state.tempOperation.random.values.find(
    (item) => item.id === id,
  );
  entry.weight = weight;
};

export const removeTempRandomValue = ({ state }, { id } = {}) => {
  state.tempOperation.random.values = state.tempOperation.random.values.filter(
    (item) => item.id !== id,
  );
};

export const resetTempOperation = ({ state }, _payload = {}) => {
  state.tempOperation = {
    variableId: "",
    op: "",
    value: "",
    roundTo: undefined,
  };
};

export const showDropdownMenu = ({ state }, { position, operationId } = {}) => {
  state.dropdownMenu = {
    ...state.dropdownMenu,
    isOpen: true,
    position,
    operationId,
  };
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
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

export const selectVariableItemById = ({ state }, { variableId } = {}) => {
  return state.variablesData?.items?.[variableId];
};

export const selectOperationChangeData = ({ state }) => ({
  tempOperation: state.tempOperation,
  variable: state.variablesData?.items?.[state.tempOperation.variableId],
});

export const selectRandomDraftData = ({ state }) => ({
  random: state.tempOperation.random,
  variable: state.variablesData?.items?.[state.tempOperation.variableId],
});

export const selectOperationSaveData = ({ state }) => ({
  currentEditingId: state.currentEditingId,
  tempOperation: state.tempOperation,
  variablesData: state.variablesData,
});

export const selectSubmitData = ({ state }) => ({
  actionId: state.actionId,
  operations: state.operations,
  variablesData: state.variablesData,
});

// The kind of control each value of a random list uses, as the Set operation
// does for the variable.
const getRandomValueInputType = (variable, variableType) => {
  if (variableType === "number" || variableType === "boolean") {
    return variableType;
  }
  return isVariableEnumEnabled(variable) ? "enum" : "text";
};

const selectTempRandomViewData = (random, dateTime) => {
  const chancePercents = getOutcomeChancePercents(
    random.values.map((entry) => entry.weight),
  );
  return {
    type: random.type,
    min: random.min ?? "",
    max: random.max ?? "",
    values: random.values.map((entry, index) => ({
      id: entry.id,
      value: entry.value ?? "",
      booleanValue: String(entry.value),
      weight: entry.weight ?? "",
      chance: formatRandomChance(chancePercents[index], dateTime),
    })),
  };
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const { dateTime } = i18n;
  const variableItems = state.variablesData?.items ?? {};

  const variableOptions = getVariableOptions(state.variablesData, {
    includeComputed: false,
  }).map((option) => {
    const variable = variableItems[option.value];
    const variableType = (variable?.variableType || "string").toLowerCase();
    return {
      ...option,
      suffixText: localizeCommandLineText(variableType, copy),
    };
  });

  const selectedVariable = variableItems[state.tempOperation.variableId];
  const selectedType = (
    selectedVariable?.variableType || "string"
  ).toLowerCase();
  const selectedEnumValues = isVariableEnumEnabled(selectedVariable)
    ? normalizeVariableEnumValues(selectedVariable.enumValues)
    : [];
  const showEnumValueSelect =
    selectedType === "string" &&
    selectedEnumValues.length > 0 &&
    state.tempOperation.op === "set";
  const operationOptions =
    OPERATIONS_BY_TYPE[selectedType] || OPERATIONS_BY_TYPE.string;

  const isRandomOperation = state.tempOperation.op === "random";
  const showValueField =
    state.tempOperation.op !== "toggle" &&
    state.tempOperation.op !== "" &&
    !isRandomOperation;
  // A random operation saved in a format the editor cannot edit shows only a
  // notice, so it stays as it is.
  const isEditingUnsupportedRandom =
    state.operations.find((op) => op.id === state.currentEditingId)
      ?.unsupportedOperation !== undefined;
  const showRandomFields = isRandomOperation && !isEditingUnsupportedRandom;
  const valueInputType = selectedType;
  const showRoundToField =
    selectedType === "number" && state.tempOperation.op === "divide";
  const roundToValue = state.tempOperation.roundTo ?? DEFAULT_DIVIDE_ROUND_TO;

  const booleanOptions = [
    { value: "true", label: "True" },
    { value: "false", label: "False" },
  ];

  const operationsWithData = state.operations.map((op) => {
    const variable = variableItems[op.variableId];
    const varType = (variable?.variableType || "string").toLowerCase();

    // Format display value; a boolean uses its label from the value select.
    let displayValue = op.value;
    if (op.op === "toggle") {
      displayValue = "";
    } else if (op.op === "random") {
      displayValue =
        op.unsupportedOperation === undefined
          ? formatRandomDistributionSummary(op.distribution, copy, dateTime)
          : "";
    } else if (varType === "boolean") {
      displayValue = localizeCommandLineText(
        op.value === true || op.value === "true" ? "True" : "False",
        copy,
      );
    }

    return {
      ...op,
      variableName: variable?.name || localizeCommandLineText("Unknown", copy),
      variableLabel: formatCommandLineCopy(
        "{variable}:",
        {
          variable: variable?.name || localizeCommandLineText("Unknown", copy),
        },
        copy,
      ),
      type: varType,
      opLabel: localizeCommandLineText(OPERATION_LABELS[op.op] ?? op.op, copy),
      displayValue,
    };
  });

  const breadcrumb = [
    { id: "actions", label: "Actions", click: true },
    ...(state.mode === "edit"
      ? [
          { id: "current", label: "Update Variable", click: true },
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
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    actionId: state.actionId,
    operations: operationsWithData,
    variableOptions,
    operationOptions: localizeCommandLineOptions(operationOptions, copy),
    booleanOptions: localizeCommandLineOptions(booleanOptions, copy),
    enumValueOptions: buildVariableEnumOptions(selectedEnumValues),
    showEnumValueSelect,
    showRoundToField,
    showValueField,
    valueInputType,
    isEditingUnsupportedRandom,
    showRandomFields,
    showRandomTypeControl: showRandomFields && selectedType === "number",
    randomTypeOptions: localizeCommandLineOptions(RANDOM_TYPE_OPTIONS, copy),
    randomValueInputType: getRandomValueInputType(
      selectedVariable,
      selectedType,
    ),
    tempRandom: showRandomFields
      ? selectTempRandomViewData(state.tempOperation.random, dateTime)
      : undefined,
    tempOperation: {
      ...state.tempOperation,
      booleanValue,
      roundToValue,
    },
    dropdownMenu: localizeCommandLineDropdownMenu(state.dropdownMenu, copy),
    addOperationButton: localizeCommandLineText("+ Add Operation", copy),
    addRandomValueButton: localizeCommandLineText("+ Add Value", copy),
    chanceLabel: localizeCommandLineText("Chance", copy),
    maximumLabel: localizeCommandLineText("Maximum", copy),
    minimumLabel: localizeCommandLineText("Minimum", copy),
    removeRandomValueLabel: localizeCommandLineText("Remove Value", copy),
    unsupportedRandomLabel: localizeCommandLineText(
      "This random operation is saved in a format that RouteVN Creator can't edit.",
      copy,
    ),
    valuesLabel: localizeCommandLineText("Values", copy),
    weightLabel: localizeCommandLineText("Weight", copy),
    decimalPlacesLabel: localizeCommandLineText("Decimal Places", copy),
    operationLabel: localizeCommandLineText("Operation", copy),
    operationPlaceholder: localizeCommandLineText(
      "Choose an operation...",
      copy,
    ),
    saveOperationButton: localizeCommandLineText("Save Operation", copy),
    submitButton: localizeCommandLineText("Submit", copy),
    valueLabel: localizeCommandLineText("Value", copy),
    valueNumberPlaceholder: localizeCommandLineText("Enter number...", copy),
    valueSelectPlaceholder: localizeCommandLineText("Choose a value...", copy),
    valueTextPlaceholder: localizeCommandLineText("Enter text...", copy),
    variableLabel: localizeCommandLineText("Variable", copy),
    variablePlaceholder: localizeCommandLineText("Choose a variable...", copy),
    hasOperations: state.operations.length > 0,
    canSaveOperation:
      state.tempOperation.variableId &&
      state.tempOperation.op &&
      (!showRoundToField || isValidRoundToValue(roundToValue)) &&
      (!showEnumValueSelect ||
        selectedEnumValues.includes(state.tempOperation.value)),
  };
};
