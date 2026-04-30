import { getVariableOptions } from "../../internal/project/projection.js";

const CONDITION_KIND_OPTIONS = [
  { value: "variable", label: "Variable" },
  { value: "expression", label: "Expression" },
  { value: "json", label: "Semantic JSON" },
];

const CONDITION_OPERATOR_OPTIONS_BY_TYPE = {
  number: [
    { value: "eq", label: "Equals" },
    { value: "neq", label: "Does Not Equal" },
    { value: "gt", label: "Greater Than" },
    { value: "gte", label: "Greater Or Equal" },
    { value: "lt", label: "Less Than" },
    { value: "lte", label: "Less Or Equal" },
  ],
  boolean: [
    { value: "eq", label: "Equals" },
    { value: "neq", label: "Does Not Equal" },
  ],
  string: [
    { value: "eq", label: "Equals" },
    { value: "neq", label: "Does Not Equal" },
  ],
};

const CONDITION_OPERATOR_LABELS = Object.fromEntries(
  Object.values(CONDITION_OPERATOR_OPTIONS_BY_TYPE)
    .flat()
    .map((option) => [option.value, option.label]),
);

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
  expression: "",
  json: "",
  actions: {},
});

const createDefaultTempBranch = (actions = {}) => ({
  conditionKind: "default",
  variableId: "",
  op: "eq",
  value: "",
  expression: "",
  json: "",
  actions: toPlainObject(actions),
});

const getVariableType = (variable) => {
  return (variable?.type || "string").toLowerCase();
};

const getConditionOperatorOptions = (variableType) => {
  return (
    CONDITION_OPERATOR_OPTIONS_BY_TYPE[variableType] ??
    CONDITION_OPERATOR_OPTIONS_BY_TYPE.string
  );
};

const getSimpleCondition = (when = {}) => {
  if (!when || typeof when !== "object" || Array.isArray(when)) {
    return undefined;
  }

  const operator = Object.keys(when).find((key) =>
    Object.hasOwn(CONDITION_OPERATOR_LABELS, key),
  );
  const operands = operator ? when[operator] : undefined;
  if (!Array.isArray(operands) || operands.length !== 2) {
    return undefined;
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
    value: operands[1],
  };
};

const formatConditionValue = (value) => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
};

const getBranchSummary = (branch, variablesData = {}) => {
  if (!Object.hasOwn(toPlainObject(branch), "when")) {
    return "Default";
  }

  if (typeof branch.when === "string") {
    return branch.when;
  }

  const simpleCondition = getSimpleCondition(branch.when);
  if (simpleCondition) {
    const variable = variablesData.items?.[simpleCondition.variableId];
    const variableName = variable?.name ?? simpleCondition.variableId;
    const operatorLabel =
      CONDITION_OPERATOR_LABELS[simpleCondition.op] ?? simpleCondition.op;
    return `${variableName} ${operatorLabel} ${formatConditionValue(simpleCondition.value)}`;
  }

  return "Semantic JSON condition";
};

const hasBranchCondition = (branch) => {
  return Object.hasOwn(toPlainObject(branch), "when");
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

export const showDropdownMenu = ({ state }, { position, branchId } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.branchId = branchId;
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

export const selectViewData = ({ state, props }) => {
  const variableItems = state.variablesData?.items ?? {};
  const variableOptions = getVariableOptions(state.variablesData, {
    showType: true,
  });
  const selectedVariable = variableItems[state.tempBranch.variableId];
  const selectedType = getVariableType(selectedVariable);
  const operatorOptions = getConditionOperatorOptions(selectedType);
  const showValueField = state.tempBranch.conditionKind === "variable";
  const actionCount = countActions(state.tempBranch.actions);

  const booleanOptions = [
    { value: "true", label: "true" },
    { value: "false", label: "false" },
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
      summary: getBranchSummary(branch, state.variablesData),
      actionsSummary:
        branchActionCount > 0
          ? `${branchActionCount} action${branchActionCount === 1 ? "" : "s"}`
          : "No actions",
    };
  };
  const conditionBranches = state.branches
    .filter((branch) => hasBranchCondition(branch))
    .map(createBranchViewData);
  const defaultBranch = state.branches
    .filter((branch) => !hasBranchCondition(branch))
    .map(createBranchViewData)[0];
  const editBranchLabel =
    state.tempBranch.conditionKind === "default" ? "Default" : "Branch";

  const breadcrumb = [
    { id: "actions", label: "Actions", click: true },
    {
      id: "current",
      label: "Conditional",
      click: state.mode !== "current",
    },
    ...(state.mode === "editBranch"
      ? [{ label: editBranchLabel }]
      : state.mode === "branchActions"
        ? [
            { id: "editBranch", label: editBranchLabel, click: true },
            { label: "Actions" },
          ]
        : []),
  ];

  const canSaveBranch =
    state.tempBranch.conditionKind === "default" ||
    (state.tempBranch.conditionKind === "variable" &&
      state.tempBranch.variableId &&
      state.tempBranch.op) ||
    (state.tempBranch.conditionKind === "expression" &&
      state.tempBranch.expression.trim().length > 0) ||
    (state.tempBranch.conditionKind === "json" &&
      state.tempBranch.json.trim().length > 0);

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb,
    branches: conditionBranches,
    defaultBranch,
    hasDefaultBranch: Boolean(defaultBranch),
    tempBranch: {
      ...state.tempBranch,
      booleanValue,
    },
    conditionKindOptions: CONDITION_KIND_OPTIONS,
    variableOptions,
    operatorOptions,
    booleanOptions,
    showValueField,
    valueInputType: selectedType,
    branchActions: state.tempBranch.actions,
    branchActionsSummary:
      actionCount > 0
        ? `${actionCount} action${actionCount === 1 ? "" : "s"}`
        : "No actions",
    hasBranches: state.branches.length > 0,
    canSaveBranch,
    isEditingDefault: state.tempBranch.conditionKind === "default",
    editBranchTitle:
      state.tempBranch.conditionKind === "default" ? "Default" : "Branch",
    hiddenModes: getHiddenModes(props),
    dropdownMenu: state.dropdownMenu,
  };
};

export const createDefaultBranchDraft = ({ state }, { actions } = {}) => {
  state.tempBranch = createDefaultTempBranch(actions);
};
