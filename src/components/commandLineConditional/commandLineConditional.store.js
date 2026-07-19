import { getVariableOptions } from "../../internal/project/projection.js";
import {
  buildVariableEnumOptions,
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineDropdownMenu,
  localizeCommandLineOptions,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import {
  CONDITION_OPERATOR_LABELS,
  getConditionOperatorOptions,
  isConditionOperatorAllowed,
} from "../../internal/ui/sceneEditor/commandLineConditionOperators.js";

const DEFAULT_BRANCH_LABEL = "Default branch";

const BRANCH_ACTION_ALLOWED_MODES = [
  "sectionTransition",
  "resetStoryAtSection",
  "updateVariable",
];

const toPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const countActions = (actions = {}) => {
  return Object.keys(toPlainObject(actions)).length;
};

const createEmptyTempBranch = () => ({
  conditionKind: "variable",
  variableId: "",
  op: "eq",
  value: "",
  actions: {},
});

const createDefaultTempBranch = (actions = {}) => ({
  conditionKind: "default",
  variableId: "",
  op: "eq",
  value: "",
  actions: toPlainObject(actions),
});

const getVariableType = (variable) => {
  return (variable?.variableType || "string").toLowerCase();
};

const normalizeDraftComparisonValue = (value, variableType) => {
  if (variableType === "number") {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  if (variableType === "boolean") {
    if (value === true || value === "true") {
      return true;
    }

    if (value === false || value === "false") {
      return false;
    }

    return undefined;
  }

  return String(value ?? "");
};

const isComparisonDraftValid = ({ tempBranch, variableType, enumValues }) => {
  const values = tempBranch.op === "in" ? tempBranch.value : [tempBranch.value];
  if (!Array.isArray(values) || values.length === 0) {
    return false;
  }

  const normalizedValues = values.map((value) =>
    normalizeDraftComparisonValue(value, variableType),
  );
  if (normalizedValues.some((value) => value === undefined)) {
    return false;
  }

  if (
    tempBranch.op === "in" &&
    new Set(normalizedValues).size !== normalizedValues.length
  ) {
    return false;
  }

  return (
    enumValues.length === 0 ||
    normalizedValues.every((value) => enumValues.includes(value))
  );
};

const getSimpleCondition = (when = {}) => {
  if (!when || typeof when !== "object" || Array.isArray(when)) {
    return undefined;
  }

  const entries = Object.entries(when);
  if (entries.length !== 1) {
    return undefined;
  }

  const [[operator, operands]] = entries;
  if (!Object.hasOwn(CONDITION_OPERATOR_LABELS, operator)) {
    return undefined;
  }

  if (!Array.isArray(operands) || operands.length !== 2) {
    return undefined;
  }

  let value = operands[1];
  if (operator === "in") {
    const literal = toPlainObject(operands[1]);
    if (
      Object.keys(literal).length !== 1 ||
      !Object.hasOwn(literal, "literal") ||
      !Array.isArray(literal.literal)
    ) {
      return undefined;
    }

    value = literal.literal;
  }

  const left = operands[0];
  const variablePath =
    left && typeof left === "object" && !Array.isArray(left)
      ? left.var
      : undefined;
  if (
    typeof variablePath !== "string" ||
    !variablePath.startsWith("variables.")
  ) {
    return undefined;
  }

  return {
    variableId: variablePath.slice("variables.".length),
    op: operator,
    value,
  };
};

const formatConditionValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(formatConditionValue).join(", ");
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
};

const getBranchSummary = (branch, variablesData = {}, copy = {}) => {
  if (!Object.hasOwn(toPlainObject(branch), "when")) {
    return localizeCommandLineText(DEFAULT_BRANCH_LABEL, copy);
  }

  if (typeof branch.when === "string") {
    return localizeCommandLineText("Unsupported expression condition", copy);
  }

  const simpleCondition = getSimpleCondition(branch.when);
  if (simpleCondition) {
    const variable = variablesData.items?.[simpleCondition.variableId];
    const variableType = getVariableType(variable);
    if (!isConditionOperatorAllowed(simpleCondition.op, variableType)) {
      return localizeCommandLineText("Unsupported condition", copy);
    }

    const variableName = variable?.name ?? simpleCondition.variableId;
    const operatorLabel = localizeCommandLineText(
      CONDITION_OPERATOR_LABELS[simpleCondition.op] ?? simpleCondition.op,
      copy,
    );
    return `${variableName} ${operatorLabel} ${formatConditionValue(simpleCondition.value)}`;
  }

  return localizeCommandLineText("Unsupported condition", copy);
};

const hasBranchCondition = (branch) => {
  return Object.hasOwn(toPlainObject(branch), "when");
};

const getBranchDropdownMenuItems = (branches = [], branchId) => {
  const conditionBranches = branches.filter(hasBranchCondition);
  const branchIndex = conditionBranches.findIndex(
    (branch) => branch.id === branchId,
  );
  const items = [];

  if (branchIndex > 0) {
    items.push({ label: "Move Up", type: "item", value: "move-up" });
  }

  if (branchIndex >= 0 && branchIndex < conditionBranches.length - 1) {
    items.push({ label: "Move Down", type: "item", value: "move-down" });
  }

  items.push({ label: "Delete", type: "item", value: "delete" });
  return items;
};

const getHiddenModes = (attrs = {}) => {
  return Array.isArray(attrs.hiddenModes)
    ? attrs.hiddenModes.filter(
        (mode) => typeof mode === "string" && mode.length > 0,
      )
    : [];
};

export const createInitialState = () => ({
  mode: "current",
  initiated: false,
  variablesData: { items: {}, tree: [] },
  branches: [],
  currentBranchId: undefined,
  tempBranch: createEmptyTempBranch(),
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [{ label: "Delete", type: "item", value: "delete" }],
    branchId: undefined,
  },
});

export const setInitiated = ({ state }, _payload = {}) => {
  state.initiated = true;
};

export const setVariablesData = ({ state }, { variables } = {}) => {
  state.variablesData = variables || { items: {}, tree: [] };
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setBranches = ({ state }, { branches } = {}) => {
  state.branches = Array.isArray(branches) ? branches : [];
};

export const setCurrentBranchId = ({ state }, { branchId } = {}) => {
  state.currentBranchId = branchId;
};

export const setTempBranch = ({ state }, branch = {}) => {
  Object.entries(branch).forEach(([key, value]) => {
    if (key === "actions") {
      state.tempBranch.actions = toPlainObject(value);
      return;
    }

    state.tempBranch[key] = value;
  });
};

export const resetTempBranch = ({ state }, _payload = {}) => {
  state.tempBranch = createEmptyTempBranch();
};

export const addBranch = ({ state }, { branch } = {}) => {
  if (!branch) {
    return;
  }

  state.branches.push(branch);
};

export const updateBranch = ({ state }, { branch } = {}) => {
  if (!branch?.id) {
    return;
  }

  const index = state.branches.findIndex((item) => item.id === branch.id);
  const branchHasCondition = hasBranchCondition(branch);

  if (index >= 0) {
    state.branches.splice(index, 1);
  }

  if (!branchHasCondition) {
    state.branches = state.branches.filter((item) => hasBranchCondition(item));
    state.branches.push(branch);
    return;
  }

  const defaultIndex = state.branches.findIndex(
    (item) => !hasBranchCondition(item),
  );
  if (defaultIndex >= 0 && (index < 0 || index > defaultIndex)) {
    state.branches.splice(defaultIndex, 0, branch);
    return;
  }

  if (index >= 0) {
    state.branches.splice(Math.min(index, state.branches.length), 0, branch);
    return;
  }

  state.branches.push(branch);
};

export const deleteBranch = ({ state }, { branchId } = {}) => {
  if (!branchId) {
    return;
  }

  state.branches = state.branches.filter((branch) => branch.id !== branchId);
  if (state.currentBranchId === branchId) {
    state.currentBranchId = undefined;
    state.tempBranch = createEmptyTempBranch();
    state.mode = "current";
  }
};

export const moveBranch = ({ state }, { branchId, direction } = {}) => {
  const conditionBranchIndexes = state.branches
    .map((branch, index) => (hasBranchCondition(branch) ? index : undefined))
    .filter((index) => index !== undefined);
  const branchIndex = state.branches.findIndex(
    (branch) => branch.id === branchId && hasBranchCondition(branch),
  );
  const conditionBranchIndex = conditionBranchIndexes.indexOf(branchIndex);
  const offset = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const targetConditionBranchIndex = conditionBranchIndex + offset;

  if (
    conditionBranchIndex < 0 ||
    offset === 0 ||
    targetConditionBranchIndex < 0 ||
    targetConditionBranchIndex >= conditionBranchIndexes.length
  ) {
    return;
  }

  const targetBranchIndex = conditionBranchIndexes[targetConditionBranchIndex];
  const branch = state.branches[branchIndex];
  state.branches[branchIndex] = state.branches[targetBranchIndex];
  state.branches[targetBranchIndex] = branch;
};

export const showDropdownMenu = ({ state }, { position, branchId } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.branchId = branchId;
  state.dropdownMenu.items = getBranchDropdownMenuItems(
    state.branches,
    branchId,
  );
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.branchId = undefined;
};

export const selectBranches = ({ state }) => {
  return state.branches;
};

export const selectDefaultBranch = ({ state }) => {
  return state.branches.find((branch) => !hasBranchCondition(branch));
};

export const selectCurrentBranch = ({ state }) => {
  return state.branches.find((branch) => branch.id === state.currentBranchId);
};

export const selectDropdownMenuBranchId = ({ state }) => {
  return state.dropdownMenu.branchId;
};

export const selectVariableItemById = ({ state }, { variableId } = {}) => {
  return state.variablesData?.items?.[variableId];
};

export const selectVariablesData = ({ state }) => state.variablesData;

export const selectTempBranchActions = ({ state }) => state.tempBranch.actions;

export const selectSaveBranchDraft = ({ state }) => ({
  currentBranchId: state.currentBranchId,
  tempBranch: state.tempBranch,
  variablesData: state.variablesData,
});

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const variableItems = state.variablesData?.items ?? {};
  const variableOptions = getVariableOptions(state.variablesData).map(
    (option) => {
      const variable = variableItems[option.value];
      const variableType = getVariableType(variable);
      return {
        ...option,
        suffixText: localizeCommandLineText(variableType, copy),
      };
    },
  );
  const selectedVariable = variableItems[state.tempBranch.variableId];
  const selectedType = getVariableType(selectedVariable);
  const selectedEnumValues = isVariableEnumEnabled(selectedVariable)
    ? normalizeVariableEnumValues(selectedVariable.enumValues)
    : [];
  const showEnumValueSelect =
    selectedType === "string" &&
    selectedEnumValues.length > 0 &&
    state.tempBranch.conditionKind === "variable";
  const operatorOptions = getConditionOperatorOptions(selectedType);
  const showValueField =
    state.tempBranch.conditionKind === "variable" &&
    Boolean(state.tempBranch.variableId) &&
    state.tempBranch.op !== "in";
  const showOneOfValueFields =
    state.tempBranch.conditionKind === "variable" &&
    Boolean(state.tempBranch.variableId) &&
    state.tempBranch.op === "in";
  const oneOfValues = Array.isArray(state.tempBranch.value)
    ? state.tempBranch.value
    : [];
  const oneOfRemoveButtonStyle =
    oneOfValues.length === 1 ? "visibility: hidden;" : "";
  const isEditingUnsupportedCondition =
    state.tempBranch.conditionKind === "unsupported";
  const actionCount = countActions(state.tempBranch.actions);

  const booleanOptions = [
    { value: "true", label: "true" },
    { value: "false", label: "false" },
  ];
  const booleanOneOfOptions = [
    { value: true, label: "true" },
    { value: false, label: "false" },
  ];
  const booleanValue =
    state.tempBranch.value === true
      ? "true"
      : state.tempBranch.value === false
        ? "false"
        : String(state.tempBranch.value || "false");

  const createBranchViewData = (branch, index) => {
    const branchActionCount = countActions(branch.actions);
    return {
      ...branch,
      index,
      menuKeyShortcuts: "Delete",
      summary: getBranchSummary(branch, state.variablesData, copy),
      actionsSummary:
        branchActionCount > 0
          ? `${branchActionCount} ${localizeCommandLineText(
              branchActionCount === 1 ? "action" : "actions",
              copy,
            )}`
          : localizeCommandLineText("No actions", copy),
    };
  };
  const conditionBranchItems = state.branches.filter((branch) =>
    hasBranchCondition(branch),
  );
  const conditionBranches = conditionBranchItems.map((branch, index) => {
    const menuKeyShortcuts = [];
    if (index > 0) {
      menuKeyShortcuts.push("ArrowUp");
    }
    if (index < conditionBranchItems.length - 1) {
      menuKeyShortcuts.push("ArrowDown");
    }
    menuKeyShortcuts.push("Delete");

    return {
      ...createBranchViewData(branch, index),
      menuKeyShortcuts: menuKeyShortcuts.join(" "),
    };
  });
  const defaultBranch = state.branches
    .filter((branch) => !hasBranchCondition(branch))
    .map(createBranchViewData)[0];
  const editBranchLabel =
    state.tempBranch.conditionKind === "default"
      ? localizeCommandLineText(DEFAULT_BRANCH_LABEL, copy)
      : localizeCommandLineText("Branch", copy);

  const breadcrumb = [
    { id: "actions", label: "Actions", click: true },
    {
      id: "current",
      label: "Conditional",
      click: state.mode !== "current",
    },
    ...(state.mode === "editBranch" ? [{ label: editBranchLabel }] : []),
  ];

  const canSaveBranch =
    state.tempBranch.conditionKind === "default" ||
    (isEditingUnsupportedCondition &&
      Object.hasOwn(toPlainObject(state.tempBranch), "when")) ||
    (state.tempBranch.conditionKind === "variable" &&
      state.tempBranch.variableId &&
      isConditionOperatorAllowed(state.tempBranch.op, selectedType) &&
      isComparisonDraftValid({
        tempBranch: state.tempBranch,
        variableType: selectedType,
        enumValues: selectedEnumValues,
      }));

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    branches: conditionBranches,
    defaultBranch,
    hasDefaultBranch: Boolean(defaultBranch),
    tempBranch: {
      ...state.tempBranch,
      booleanValue,
    },
    variableOptions,
    operatorOptions: localizeCommandLineOptions(operatorOptions, copy),
    booleanOptions: localizeCommandLineOptions(booleanOptions, copy),
    booleanOneOfOptions: localizeCommandLineOptions(booleanOneOfOptions, copy),
    enumValueOptions: buildVariableEnumOptions(selectedEnumValues),
    showEnumValueSelect,
    showValueField,
    showOneOfValueFields,
    oneOfValues,
    oneOfRemoveButtonStyle,
    valueInputType: selectedType,
    branchActions: state.tempBranch.actions,
    branchActionsSummary:
      actionCount > 0
        ? `${actionCount} ${localizeCommandLineText(
            actionCount === 1 ? "action" : "actions",
            copy,
          )}`
        : localizeCommandLineText("No actions", copy),
    branchActionAllowedModes: BRANCH_ACTION_ALLOWED_MODES,
    hasBranches: state.branches.length > 0,
    canSaveBranch,
    isEditingDefault: state.tempBranch.conditionKind === "default",
    isEditingUnsupportedCondition,
    editBranchTitle:
      state.tempBranch.conditionKind === "default"
        ? localizeCommandLineText(DEFAULT_BRANCH_LABEL, copy)
        : localizeCommandLineText("Branch", copy),
    hiddenModes: getHiddenModes(props),
    dropdownMenu: localizeCommandLineDropdownMenu(state.dropdownMenu, copy),
    actionsLabel: localizeCommandLineText("Actions", copy),
    addBranchButton: localizeCommandLineText("+ Add Branch", copy),
    addValueButton: localizeCommandLineText("Add Value", copy),
    addDefaultBranchButton: localizeCommandLineText(
      "+ Add Default Branch",
      copy,
    ),
    branchesLabel: localizeCommandLineText("Branches", copy),
    branchMenuButtonLabel: localizeCommandLineText("Branch Menu", copy),
    conditionLabel: localizeCommandLineText("Condition", copy),
    defaultBranchLabel: localizeCommandLineText(DEFAULT_BRANCH_LABEL, copy),
    operatorLabel: localizeCommandLineText("Operator", copy),
    removeValueButton: localizeCommandLineText("Remove Value", copy),
    saveButtonPrefix: localizeCommandLineText("Save", copy),
    submitButton: localizeCommandLineText("Submit", copy),
    unsupportedConditionLabel: localizeCommandLineText(
      "Unsupported condition",
      copy,
    ),
    valueLabel: localizeCommandLineText("Value", copy),
    valueNumberPlaceholder: localizeCommandLineText("Enter number...", copy),
    valueSelectPlaceholder: localizeCommandLineText("Choose a value...", copy),
    valueTextPlaceholder: localizeCommandLineText("Enter text...", copy),
    variableLabel: localizeCommandLineText("Variable", copy),
    variablePlaceholder: localizeCommandLineText("Choose a variable...", copy),
  };
};

export const createDefaultBranchDraft = ({ state }, { actions } = {}) => {
  state.tempBranch = createDefaultTempBranch(actions);
};
