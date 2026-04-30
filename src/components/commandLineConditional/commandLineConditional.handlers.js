import { generateId } from "../../internal/id.js";

const toPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const mergeActions = (currentActions, nextActions) => {
  return {
    ...toPlainObject(currentActions),
    ...toPlainObject(nextActions),
  };
};

const removeAction = (actions, actionType) => {
  const nextActions = {
    ...toPlainObject(actions),
  };

  if (actionType) {
    delete nextActions[actionType];
  }

  return nextActions;
};

const normalizeBranches = (branches = []) => {
  return Array.isArray(branches)
    ? branches.map((branch) => ({
        id: generateId(),
        ...(Object.hasOwn(toPlainObject(branch), "when")
          ? { when: branch.when }
          : {}),
        actions: toPlainObject(branch?.actions),
      }))
    : [];
};

const getVariableType = (variablesData = {}, variableId) => {
  return (variablesData?.items?.[variableId]?.type || "string").toLowerCase();
};

const getDefaultValueForVariableType = (variableType) => {
  if (variableType === "number") {
    return 0;
  }

  if (variableType === "boolean") {
    return false;
  }

  return "";
};

const getSimpleCondition = (when = {}) => {
  if (!when || typeof when !== "object" || Array.isArray(when)) {
    return undefined;
  }

  const operator = ["eq", "neq", "gt", "gte", "lt", "lte"].find((key) =>
    Object.hasOwn(when, key),
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

const createTempBranchFromBranch = (branch = {}) => {
  const actions = toPlainObject(branch.actions);

  if (!Object.hasOwn(toPlainObject(branch), "when")) {
    return {
      conditionKind: "default",
      variableId: "",
      op: "eq",
      value: "",
      expression: "",
      json: "",
      actions,
    };
  }

  if (typeof branch.when === "string") {
    return {
      conditionKind: "expression",
      variableId: "",
      op: "eq",
      value: "",
      expression: branch.when,
      json: "",
      actions,
    };
  }

  const simpleCondition = getSimpleCondition(branch.when);
  if (simpleCondition) {
    return {
      conditionKind: "variable",
      variableId: simpleCondition.variableId,
      op: simpleCondition.op,
      value: simpleCondition.value,
      expression: "",
      json: "",
      actions,
    };
  }

  return {
    conditionKind: "json",
    variableId: "",
    op: "eq",
    value: "",
    expression: "",
    json: JSON.stringify(branch.when),
    actions,
  };
};

const normalizeComparisonValue = ({ value, variableType }) => {
  if (variableType === "number") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  if (variableType === "boolean") {
    return value === true || value === "true";
  }

  return String(value ?? "");
};

const createBranchFromTemp = ({
  branchId,
  tempBranch,
  variablesData,
  appService,
} = {}) => {
  const branch = {
    id: branchId,
    actions: toPlainObject(tempBranch.actions),
  };

  if (tempBranch.conditionKind === "default") {
    return branch;
  }

  if (tempBranch.conditionKind === "expression") {
    branch.when = tempBranch.expression.trim();
    return branch;
  }

  if (tempBranch.conditionKind === "json") {
    try {
      branch.when = JSON.parse(tempBranch.json);
    } catch {
      appService.showAlert({
        message: "Semantic JSON condition is invalid.",
        title: "Warning",
      });
      return undefined;
    }
    return branch;
  }

  const variableType = getVariableType(variablesData, tempBranch.variableId);
  const value = normalizeComparisonValue({
    value: tempBranch.value,
    variableType,
  });

  if (value === undefined) {
    appService.showAlert({
      message: "Condition comparison value is invalid.",
      title: "Warning",
    });
    return undefined;
  }

  branch.when = {
    [tempBranch.op]: [{ var: `variables.${tempBranch.variableId}` }, value],
  };
  return branch;
};

const syncStateFromProps = async (deps, conditional = {}) => {
  const { projectService, store } = deps;
  const repository = await projectService.getRepository();
  const { variables } = repository.getState();

  store.setVariablesData({
    variables: variables || { items: {}, tree: [] },
  });
  store.setBranches({
    branches: normalizeBranches(conditional?.branches),
  });
  store.setInitiated();
};

export const handleAfterMount = async (deps) => {
  const { render } = deps;
  await syncStateFromProps(deps, deps.props?.conditional);
  render();
};

export const handleAddBranchClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const branchId = generateId();

  store.setCurrentBranchId({ branchId });
  store.resetTempBranch();
  store.setMode({ mode: "editBranch" });
  render();
};

export const handleAddDefaultClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const defaultBranch = store.selectDefaultBranch();
  const branchId = defaultBranch?.id ?? generateId();

  store.setCurrentBranchId({ branchId });
  store.createDefaultBranchDraft({
    actions: defaultBranch?.actions,
  });
  store.setMode({ mode: "editBranch" });
  render();
};

export const handleBranchClick = (deps, payload) => {
  const { store, render } = deps;
  const branchId = payload._event.currentTarget?.dataset?.branchId;
  const branch = store
    .selectBranches()
    .find((candidate) => candidate.id === branchId);

  if (!branch) {
    return;
  }

  store.setCurrentBranchId({ branchId });
  store.setTempBranch(createTempBranchFromBranch(branch));
  store.setMode({ mode: "editBranch" });
  render();
};

export const handleBranchContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;
  const branchId = payload._event.currentTarget?.dataset?.branchId;

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    branchId,
  });
  render();
};

export const handleConditionKindChange = (deps, payload) => {
  const { store, render } = deps;
  const conditionKind =
    payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempBranch({ conditionKind });
  render();
};

export const handleVariableSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const variableId =
    payload._event.detail?.value ?? payload._event.target?.value;
  const variablesData = store.getState().variablesData;
  const variableType = getVariableType(variablesData, variableId);

  store.setTempBranch({
    variableId,
    op: "eq",
    value: getDefaultValueForVariableType(variableType),
  });
  render();
};

export const handleOperatorSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const op = payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempBranch({ op });
  render();
};

export const handleValueInputChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempBranch({ value });
  render();
};

export const handleBooleanSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const rawValue = payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempBranch({
    value: rawValue === true || rawValue === "true",
  });
  render();
};

export const handleExpressionInputChange = (deps, payload) => {
  const { store, render } = deps;
  const expression =
    payload._event.detail?.value ?? payload._event.target?.value ?? "";

  store.setTempBranch({ expression });
  render();
};

export const handleJsonInputChange = (deps, payload) => {
  const { store, render } = deps;
  const json =
    payload._event.detail?.value ?? payload._event.target?.value ?? "";

  store.setTempBranch({ json });
  render();
};

export const handleBranchActionsClick = (deps) => {
  const { store, render } = deps;
  store.setMode({ mode: "branchActions" });
  render();
};

export const handleBranchActionsChange = (deps, payload) => {
  const { store, render } = deps;
  const state = store.getState();

  store.setTempBranch({
    actions: mergeActions(state.tempBranch.actions, payload._event.detail),
  });
  render();
};

export const handleBranchActionsDelete = (deps, payload) => {
  const { store, render } = deps;
  const actionType = payload._event.detail?.actionType;
  const state = store.getState();

  store.setTempBranch({
    actions: removeAction(state.tempBranch.actions, actionType),
  });
  render();
};

export const handleNestedActionsClose = (deps) => {
  const { store, render } = deps;
  store.setMode({ mode: "editBranch" });
  render();
};

export const handleSaveBranchClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { appService, store, render } = deps;
  const state = store.getState();
  const branchId = state.currentBranchId ?? generateId();
  const branch = createBranchFromTemp({
    branchId,
    tempBranch: state.tempBranch,
    variablesData: state.variablesData,
    appService,
  });

  if (!branch) {
    return;
  }

  store.updateBranch({ branch });
  store.setCurrentBranchId({ branchId: undefined });
  store.resetTempBranch();
  store.setMode({ mode: "current" });
  render();
};

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { appService, dispatchEvent, store } = deps;
  const branches = store.selectBranches();

  if (branches.length === 0) {
    appService.showAlert({
      message: "Please add at least one branch.",
      title: "Warning",
    });
    return;
  }

  const invalidElseIndex = branches.findIndex(
    (branch, index) =>
      !Object.hasOwn(toPlainObject(branch), "when") &&
      index !== branches.length - 1,
  );

  if (invalidElseIndex >= 0) {
    appService.showAlert({
      message: "The default branch must be the last branch.",
      title: "Warning",
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        conditional: {
          branches: branches.map((branch) => ({
            ...(Object.hasOwn(toPlainObject(branch), "when")
              ? { when: branch.when }
              : {}),
            actions: toPlainObject(branch.actions),
          })),
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const itemId = payload._event.detail.id;

  if (itemId === "actions") {
    dispatchEvent(new CustomEvent("back-to-actions", { detail: {} }));
    return;
  }

  if (itemId === "current") {
    store.setMode({ mode: "current" });
    store.setCurrentBranchId({ branchId: undefined });
    store.resetTempBranch();
    render();
    return;
  }

  if (itemId === "editBranch") {
    store.setMode({ mode: "editBranch" });
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
  const item = payload._event.detail.item || payload._event.detail;
  const branchId = store.selectDropdownMenuBranchId();

  store.hideDropdownMenu();

  if (item.value === "delete" && branchId) {
    store.deleteBranch({ branchId });
  }

  render();
};
