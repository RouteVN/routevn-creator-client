import { generateId } from "../../internal/id.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import {
  isConditionOperator,
  isConditionOperatorAllowed,
} from "../../internal/ui/sceneEditor/commandLineConditionOperators.js";
import {
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";

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
  return (
    variablesData?.items?.[variableId]?.variableType || "string"
  ).toLowerCase();
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

const getDefaultValueForVariable = (variable = {}) => {
  if (isVariableEnumEnabled(variable)) {
    return normalizeVariableEnumValues(variable.enumValues)[0] ?? "";
  }

  return getDefaultValueForVariableType(
    (variable?.variableType || "string").toLowerCase(),
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
  if (!isConditionOperator(operator)) {
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

const createTempBranchFromBranch = (branch = {}, variablesData = {}) => {
  const actions = toPlainObject(branch.actions);
  const hasCondition = Object.hasOwn(toPlainObject(branch), "when");

  if (!hasCondition) {
    return {
      conditionKind: "default",
      variableId: "",
      op: "eq",
      value: "",
      actions,
    };
  }

  if (typeof branch.when === "string") {
    return {
      conditionKind: "unsupported",
      when: branch.when,
      variableId: "",
      op: "eq",
      value: "",
      actions,
    };
  }

  const simpleCondition = getSimpleCondition(branch.when);
  if (
    simpleCondition &&
    isConditionOperatorAllowed(
      simpleCondition.op,
      getVariableType(variablesData, simpleCondition.variableId),
    )
  ) {
    return {
      conditionKind: "variable",
      variableId: simpleCondition.variableId,
      op: simpleCondition.op,
      value: simpleCondition.value,
      actions,
    };
  }

  return {
    conditionKind: "unsupported",
    when: branch.when,
    variableId: "",
    op: "eq",
    value: "",
    actions,
  };
};

const normalizeComparisonValue = ({ value, variableType }) => {
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

const normalizeComparisonValues = ({ values, variableType }) => {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const normalizedValues = values.map((value) =>
    normalizeComparisonValue({ value, variableType }),
  );
  if (
    normalizedValues.some((value) => value === undefined) ||
    new Set(normalizedValues).size !== normalizedValues.length
  ) {
    return undefined;
  }

  return normalizedValues;
};

const createBranchFromTemp = ({
  branchId,
  tempBranch,
  variablesData,
  appService,
  copy,
} = {}) => {
  const branch = {
    id: branchId,
    actions: toPlainObject(tempBranch.actions),
  };

  if (tempBranch.conditionKind === "default") {
    return branch;
  }

  if (tempBranch.conditionKind === "unsupported") {
    if (!Object.hasOwn(toPlainObject(tempBranch), "when")) {
      appService.showAlert({
        message: localizeCommandLineText("Condition is unsupported.", copy),
        title: localizeCommandLineText("Warning", copy),
      });
      return undefined;
    }

    branch.when = tempBranch.when;
    return branch;
  }

  if (tempBranch.conditionKind !== "variable") {
    appService.showAlert({
      message: localizeCommandLineText("Condition type is unsupported.", copy),
      title: localizeCommandLineText("Warning", copy),
    });
    return undefined;
  }

  const variableType = getVariableType(variablesData, tempBranch.variableId);
  if (!isConditionOperatorAllowed(tempBranch.op, variableType)) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Condition operator is unsupported.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return undefined;
  }

  const variable = variablesData?.items?.[tempBranch.variableId];
  if (isVariableEnumEnabled(variable)) {
    const enumValues = normalizeVariableEnumValues(variable.enumValues);
    const comparisonValues =
      tempBranch.op === "in" ? tempBranch.value : [tempBranch.value];
    if (
      !Array.isArray(comparisonValues) ||
      comparisonValues.some((value) => !enumValues.includes(value))
    ) {
      appService.showAlert({
        message: localizeCommandLineText(
          "Condition enum value is invalid.",
          copy,
        ),
        title: localizeCommandLineText("Warning", copy),
      });
      return undefined;
    }
  }

  const value =
    tempBranch.op === "in"
      ? normalizeComparisonValues({
          values: tempBranch.value,
          variableType,
        })
      : normalizeComparisonValue({
          value: tempBranch.value,
          variableType,
        });

  if (value === undefined) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Condition comparison value is invalid.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return undefined;
  }

  const rightOperand = tempBranch.op === "in" ? { literal: value } : value;
  branch.when = {
    [tempBranch.op]: [
      { var: `variables.${tempBranch.variableId}` },
      rightOperand,
    ],
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
  store.setTempBranch(
    createTempBranchFromBranch(branch, store.selectVariablesData()),
  );
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

export const handleBranchMenuButtonClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const branchId = payload._event.currentTarget.dataset.branchId;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showDropdownMenu({
    position: { x: rect.right, y: rect.bottom },
    branchId,
  });
  render();
};

export const handleBranchMenuButtonKeyDown = (deps, payload) => {
  const directionByKey = {
    ArrowUp: "up",
    ArrowDown: "down",
  };
  const direction = directionByKey[payload._event.key];
  if (!direction) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();
  const { store, render } = deps;
  const branchId = payload._event.currentTarget.dataset.branchId;

  store.moveBranch({ branchId, direction });
  render();
};

export const handleVariableSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const variableId =
    payload._event.detail?.value ?? payload._event.target?.value;
  const variable = store.selectVariableItemById({ variableId });

  store.setTempBranch({
    variableId,
    op: "eq",
    value: getDefaultValueForVariable(variable),
  });
  render();
};

export const handleOperatorSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const op = payload._event.detail?.value ?? payload._event.target?.value;
  const { tempBranch, variablesData } = store.selectSaveBranchDraft();
  const variable = variablesData?.items?.[tempBranch.variableId];
  let value = tempBranch.value;

  if (op === "in" && !Array.isArray(value)) {
    value = [value];
  } else if (op !== "in" && Array.isArray(value)) {
    value = value[0] ?? getDefaultValueForVariable(variable);
  }

  store.setTempBranch({ op, value });
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

export const handleEnumValueSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail?.value ?? payload._event.target?.value;

  store.setTempBranch({ value });
  render();
};

export const handleAddOneOfValueClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const { tempBranch, variablesData } = store.selectSaveBranchDraft();
  const variable = variablesData?.items?.[tempBranch.variableId];
  const values = Array.isArray(tempBranch.value) ? tempBranch.value : [];

  store.setTempBranch({
    value: [...values, getDefaultValueForVariable(variable)],
  });
  render();
};

export const handleOneOfValueChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number(payload._event.currentTarget.dataset.index);
  const { tempBranch, variablesData } = store.selectSaveBranchDraft();
  const values = Array.isArray(tempBranch.value) ? [...tempBranch.value] : [];

  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    return;
  }

  const variableType = getVariableType(variablesData, tempBranch.variableId);
  const rawValue = payload._event.detail?.value ?? payload._event.target?.value;
  values[index] =
    variableType === "boolean"
      ? rawValue === true || rawValue === "true"
      : rawValue;

  store.setTempBranch({ value: values });
  render();
};

export const handleRemoveOneOfValueClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const index = Number(payload._event.currentTarget.dataset.index);
  const { tempBranch } = store.selectSaveBranchDraft();
  const values = Array.isArray(tempBranch.value) ? tempBranch.value : [];

  if (
    values.length <= 1 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= values.length
  ) {
    return;
  }

  store.setTempBranch({
    value: values.filter((_, valueIndex) => valueIndex !== index),
  });
  render();
};

export const handleBranchActionsChange = (deps, payload) => {
  const { store, render } = deps;

  store.setTempBranch({
    actions: mergeActions(
      store.selectTempBranchActions(),
      payload._event.detail,
    ),
  });
  render();
};

export const handleBranchActionsDelete = (deps, payload) => {
  const { store, render } = deps;
  const actionType = payload._event.detail?.actionType;

  store.setTempBranch({
    actions: removeAction(store.selectTempBranchActions(), actionType),
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
  const { appService, store, render, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const { currentBranchId, tempBranch, variablesData } =
    store.selectSaveBranchDraft();
  const branchId = currentBranchId ?? generateId();
  const branch = createBranchFromTemp({
    branchId,
    tempBranch,
    variablesData,
    appService,
    copy,
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
  const { appService, dispatchEvent, store, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const branches = store.selectBranches();

  if (branches.length === 0) {
    appService.showAlert({
      message: localizeCommandLineText("Please add at least one branch.", copy),
      title: localizeCommandLineText("Warning", copy),
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
      message: localizeCommandLineText(
        "The default branch must be the last branch.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
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

  if (item.value === "move-up" && branchId) {
    store.moveBranch({ branchId, direction: "up" });
  } else if (item.value === "move-down" && branchId) {
    store.moveBranch({ branchId, direction: "down" });
  } else if (item.value === "delete" && branchId) {
    store.deleteBranch({ branchId });
  }

  render();
};
