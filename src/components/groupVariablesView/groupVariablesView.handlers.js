import { buildUniqueTagIds } from "../../internal/resourceTags.js";
import { selectI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";
import {
  applyTagFilterPopoverSelection,
  clearTagFilterPopoverSelection,
  closeTagFilterPopoverFromOverlay,
  openTagFilterPopoverFromButton,
  toggleTagFilterPopoverOption,
} from "../../internal/ui/tagFilterPopover.handlers.js";
import { dispatchResourceViewBackgroundClick } from "../../internal/ui/resourcePages/resourceViewBackground.js";
import {
  isComputedLiteralValue,
  isSupportedComputedOperationType,
} from "../../internal/computedOperations.js";

export const handleScrollContainerClick = dispatchResourceViewBackgroundClick;

const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 4;
const PROGRESSIVE_BATCH_ITEM_COUNT = 24;
const PROGRESSIVE_HYDRATION_DELAY_FRAME_COUNT = 1;

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

const parseNonNegativeIntegerProp = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return Math.round(numericValue);
};

const isProgressiveRenderEnabled = (props) => {
  return parseBooleanProp(props?.progressiveRender);
};

const getProgressiveInitialItemCount = (props) => {
  return parseNonNegativeIntegerProp(
    props?.progressiveInitialItemCount,
    DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
  );
};

const getProgressiveHydrationDelayFrameCount = (props) => {
  return parseNonNegativeIntegerProp(
    props?.progressiveHydrationDelayFrameCount,
    PROGRESSIVE_HYDRATION_DELAY_FRAME_COUNT,
  );
};

const getProgressiveGroups = (props) => props?.flatGroups ?? [];

const getProgressiveRenderSignature = (groups = []) => {
  return JSON.stringify(
    groups.map((group) => [
      group?.id ?? "",
      (group?.children ?? []).map((item) => item?.id ?? ""),
    ]),
  );
};

const countProgressiveItems = (groups = []) => {
  return groups.reduce((sum, group) => sum + (group?.children?.length ?? 0), 0);
};

const cancelProgressiveRenderFrame = (store) => {
  const frameId = store.selectProgressiveFrameId();
  if (frameId === undefined) {
    return;
  }

  cancelAnimationFrame(frameId);
  store.clearProgressiveFrameId();
};

const cancelScheduledSyncRender = (store) => {
  const frameId = store.selectSyncRenderFrameId?.();
  if (frameId === undefined) {
    return;
  }

  cancelAnimationFrame(frameId);
  store.clearSyncRenderFrameId?.();
};

const scheduleSyncRender = (deps) => {
  const { render, store } = deps;
  if (typeof store.selectSyncRenderFrameId === "function") {
    const activeFrameId = store.selectSyncRenderFrameId();
    if (activeFrameId !== undefined) {
      return;
    }
  }

  if (typeof globalThis.requestAnimationFrame !== "function") {
    render();
    return;
  }

  const frameId = globalThis.requestAnimationFrame(() => {
    store.clearSyncRenderFrameId?.();
    render();
  });

  store.setSyncRenderFrameId?.({
    frameId,
  });
};

const scheduleProgressiveRender = (deps) => {
  const { props, store, render } = deps;
  if (!isProgressiveRenderEnabled(props)) {
    return;
  }

  if (store.selectProgressiveFrameId() !== undefined) {
    return;
  }

  const totalItemCount = countProgressiveItems(getProgressiveGroups(props));
  if (store.selectProgressiveRenderedItemCount() >= totalItemCount) {
    return;
  }

  const renderNextBatch = () => {
    store.clearProgressiveFrameId();

    const nextTotalItemCount = countProgressiveItems(
      getProgressiveGroups(deps.props),
    );
    const nextRenderedItemCount = Math.min(
      nextTotalItemCount,
      store.selectProgressiveRenderedItemCount() + PROGRESSIVE_BATCH_ITEM_COUNT,
    );

    store.setProgressiveRenderedItemCount({
      itemCount: nextRenderedItemCount,
    });
    render();

    if (nextRenderedItemCount < nextTotalItemCount) {
      scheduleProgressiveRender(deps);
    }
  };

  const scheduleAfterFrames = (remainingFrameCount) => {
    const frameId = requestAnimationFrame(() => {
      if (remainingFrameCount <= 1) {
        renderNextBatch();
        return;
      }

      scheduleAfterFrames(remainingFrameCount - 1);
    });

    store.setProgressiveFrameId({ frameId });
  };

  scheduleAfterFrames(getProgressiveHydrationDelayFrameCount(props));
};

const syncProgressiveRenderState = (deps) => {
  const { props, store } = deps;
  const progressiveRenderEnabled = isProgressiveRenderEnabled(props);
  const groups = getProgressiveGroups(props);
  const totalItemCount = countProgressiveItems(groups);

  if (!progressiveRenderEnabled) {
    cancelProgressiveRenderFrame(store);
    store.setProgressiveRenderSignature({ signature: "" });
    store.setProgressiveRenderedItemCount({ itemCount: totalItemCount });
    return true;
  }

  const nextSignature = getProgressiveRenderSignature(groups);
  const currentSignature = store.selectProgressiveRenderSignature();
  const currentRenderedItemCount = store.selectProgressiveRenderedItemCount();

  if (nextSignature === currentSignature) {
    if (store.selectProgressiveRenderedItemCount() < totalItemCount) {
      scheduleProgressiveRender(deps);
    }
    return false;
  }

  cancelProgressiveRenderFrame(store);
  store.setProgressiveRenderSignature({ signature: nextSignature });
  const progressiveInitialItemCount = getProgressiveInitialItemCount(props);
  const nextRenderedItemCount = currentSignature
    ? Math.min(
        totalItemCount,
        Math.max(currentRenderedItemCount, progressiveInitialItemCount),
      )
    : Math.min(totalItemCount, progressiveInitialItemCount);
  store.setProgressiveRenderedItemCount({
    itemCount: nextRenderedItemCount,
  });

  if (nextRenderedItemCount < totalItemCount) {
    scheduleProgressiveRender(deps);
  }

  return true;
};

export const handleBeforeMount = (deps) => {
  syncProgressiveRenderState(deps);

  return () => {
    cancelProgressiveRenderFrame(deps.store);
    cancelScheduledSyncRender(deps.store);
  };
};

export const handleOnUpdate = (deps) => {
  if (syncProgressiveRenderState(deps)) {
    scheduleSyncRender(deps);
  }
};

export const handleTagFilterButtonClick = openTagFilterPopoverFromButton;
export const handleTagFilterPopoverClose = closeTagFilterPopoverFromOverlay;
export const handleTagFilterOptionClick = toggleTagFilterPopoverOption;
export const handleTagFilterClearClick = (deps, payload) => {
  const { props, store, render } = deps;
  clearTagFilterPopoverSelection(deps, payload);

  if (!parseBooleanProp(props.searchInFilterPopover)) {
    return;
  }

  store.setSearchQuery({ query: "" });
  render();
};
export const handleTagFilterApplyClick = applyTagFilterPopoverSelection;

export const handleMenuClick = ({ dispatchEvent }) => {
  dispatchEvent(
    new CustomEvent("menu-click", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleTagFilterChange = (deps, payload) => {
  const { dispatchEvent } = deps;
  const detail = payload._event.detail ?? {};

  dispatchEvent(
    new CustomEvent("tag-filter-change", {
      detail: {
        tagIds: Array.isArray(detail.tagIds)
          ? detail.tagIds
          : Array.isArray(detail.value)
            ? detail.value
            : [],
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const getDataId = (event, attrName, fallbackPrefix = "") => {
  const value = event?.currentTarget?.getAttribute?.(attrName);
  if (value !== undefined && value !== null) {
    return value;
  }
  if (!fallbackPrefix) {
    return "";
  }
  return event?.currentTarget?.id?.replace(fallbackPrefix, "") || "";
};

const getDefaultValueByType = (type) => {
  if (type === "number") {
    return 0;
  }
  if (type === "boolean") {
    return false;
  }
  return "";
};

const mergeVariableFormValues = ({
  storedValues = {},
  formValues = {},
} = {}) => {
  const hasFormEnumValues = Object.prototype.hasOwnProperty.call(
    formValues,
    "enumValues",
  );
  const enumValues = hasFormEnumValues
    ? formValues.enumValues
    : (storedValues.enumValues ?? []);
  const shouldPreserveEnum =
    !hasFormEnumValues &&
    storedValues.isEnum === true &&
    normalizeVariableEnumValues(storedValues.enumValues).length > 0;

  const values = {
    ...storedValues,
    ...formValues,
    isEnum: shouldPreserveEnum
      ? true
      : (formValues.isEnum ?? storedValues.isEnum),
    enumValues,
  };
  values.computed = storedValues.computed;
  return values;
};

const getActiveVariableForm = ({ refs, store } = {}) => {
  const values = store.selectDefaultValues();
  return values.valueSource === "computed"
    ? refs?.computedForm
    : refs?.variableForm;
};

const getVariableFormValues = ({ refs, store } = {}) => {
  return mergeVariableFormValues({
    storedValues: store.selectDefaultValues(),
    formValues: getActiveVariableForm({ refs, store })?.getValues?.(),
  });
};

const selectCopy = (i18n = {}) =>
  selectI18nCopy(i18n, ["resourcePages", "variablesPage"]);

const setVariableFormValues = ({ refs, render, store }, values = {}) => {
  getActiveVariableForm({ refs, store })?.setValues?.({
    values,
  });
  store.updateFormValues(values);
  render();
};

const shouldSyncVariableFormValues = ({
  formValues = {},
  nextValues = {},
} = {}) => {
  const syncFieldNames = ["valueSource", "variableType", "isEnum", "default"];
  return syncFieldNames.some(
    (fieldName) =>
      Object.prototype.hasOwnProperty.call(formValues, fieldName) &&
      formValues[fieldName] !== nextValues[fieldName],
  );
};

const getFormFieldNameFromEvent = (event) => {
  const directFieldName = event?.target?.dataset?.fieldName;
  if (directFieldName) {
    return directFieldName;
  }

  const path =
    typeof event?.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    const fieldName = node?.dataset?.fieldName;
    if (fieldName) {
      return fieldName;
    }
  }

  return event?.detail?.fieldName ?? event?.detail?.name ?? "";
};

const resolveVariableFormValues = ({
  prevValues = {},
  newValues = {},
  isEditMode = false,
} = {}) => {
  const nextValues = {
    ...prevValues,
    ...newValues,
  };
  const valueSource = nextValues.valueSource ?? "variable";
  let variableType = nextValues.variableType ?? "string";
  if (valueSource !== "computed" && variableType === "object") {
    variableType = "string";
  }
  const variableTypeChanged = variableType !== prevValues.variableType;
  let isEnum =
    valueSource !== "computed" &&
    variableType === "string" &&
    nextValues.isEnum === true;
  let enumValues = isEnum
    ? normalizeVariableEnumValues(nextValues.enumValues)
    : [];
  let defaultValue = nextValues.default;

  if (!isEditMode && variableTypeChanged) {
    defaultValue = getDefaultValueByType(variableType);
    if (variableType === "string") {
      isEnum = false;
      enumValues = [];
    }
  }

  if (variableType !== "string") {
    isEnum = false;
    enumValues = [];
  }

  if (isEnum && !enumValues.includes(defaultValue)) {
    defaultValue = enumValues[0] ?? "";
  }

  const values = {
    ...nextValues,
    valueSource,
    variableType,
    isEnum,
    enumValues,
    default: defaultValue,
  };
  values.computed = prevValues.computed;
  return values;
};

const findVariableWithGroup = (flatGroups = [], itemId) => {
  for (const group of flatGroups) {
    for (const item of group.children || []) {
      if (item.id === itemId) {
        return { group, item };
      }
    }
  }
  return null;
};

const openEditDialogForItem = ({ deps, itemId } = {}) => {
  const { store, render, dispatchEvent, props } = deps;
  if (!itemId) {
    return;
  }

  const found = findVariableWithGroup(props.flatGroups, itemId);
  if (!found) {
    return;
  }

  const { group, item } = found;
  const variableType = item.variableType || "string";
  const valueSource = item.computed === undefined ? "variable" : "computed";
  const defaultValue =
    item.default === undefined ||
    (variableType === "number" && item.default === "")
      ? getDefaultValueByType(variableType)
      : item.default;

  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );

  store.openEditDialog({
    groupId: group.id,
    itemId,
    defaultValues: {
      name: item.name || "",
      description: item.description || "",
      tagIds: item.tagIds ?? [],
      scope: item.scope || "context",
      valueSource,
      variableType,
      isEnum: isVariableEnumEnabled(item),
      enumValues: normalizeVariableEnumValues(item.enumValues),
      default: defaultValue,
      computed:
        item.computed === undefined
          ? undefined
          : structuredClone(item.computed),
    },
  });
  render();
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = getDataId(payload._event, "data-group-id", "group");
  if (!groupId) {
    return;
  }

  // Handle group collapse internally
  store.toggleGroupCollapse({ groupId: groupId });
  render();
};

export const handleVariableItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.id.replace("variableItem", "");

  // Forward variable item selection to parent
  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDialogFormChange = (deps, payload) => {
  const { refs, store, render } = deps;
  const prevValues = store.selectDefaultValues();
  const newValues = payload._event.detail.values;
  const isEditMode = store.selectIsEditMode();
  const nextValues = resolveVariableFormValues({
    prevValues,
    newValues,
    isEditMode,
  });

  store.updateFormValues(nextValues);
  if (
    shouldSyncVariableFormValues({
      formValues: newValues,
      nextValues,
    })
  ) {
    getActiveVariableForm({ refs, store })?.setValues?.({
      values: nextValues,
    });
  }
  render();
};

export const handleAddOperationClick = (deps, payload) => {
  const { render, store } = deps;
  payload._event.stopPropagation();
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showOperationChoiceMenu({
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleAddOperationOperandClick = (deps, payload) => {
  const { render, store } = deps;
  const { operationPath, target, x, y } = payload._event.detail;

  store.showOperandSourceMenu({
    operationPath,
    target,
    x,
    y,
  });
  render();
};

export const handleOperationChoiceMenuClose = (deps) => {
  const { refs, render, store } = deps;
  refs.operationChoiceMenu.open = false;
  store.hideOperationChoiceMenu();
  render();
};

export const handleOperationChoiceMenuClick = (deps, payload) => {
  const { refs, render, store } = deps;
  const value = payload._event.detail.item?.value;

  refs.operationChoiceMenu.open = false;
  store.hideOperationChoiceMenu();

  if (value === "if") {
    store.createConditional();
    const values = store.selectDefaultValues();
    render();
    refs.computedForm.setValues({ values });
    return;
  }

  if (isSupportedComputedOperationType(value)) {
    store.createOperation({ operationType: value });
    const values = store.selectDefaultValues();
    render();
    refs.computedForm.setValues({ values });
    return;
  }

  render();
};

export const handleOperationBlockContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const { operationPath, target, x, y } = payload._event.detail;

  store.showOperationBlockMenu({
    operationPath,
    target,
    x,
    y,
  });
  render();
};

export const handleOperationBlockMenuClose = (deps) => {
  const { refs, render, store } = deps;
  refs.operationBlockMenu.open = false;
  store.hideOperationBlockMenu();
  render();
};

export const handleOperationBlockMenuClick = (deps, payload) => {
  const { refs, render, store } = deps;
  const value = payload._event.detail.item?.value;
  const position = store.selectOperationBlockMenuPosition();

  refs.operationBlockMenu.open = false;
  store.hideOperationBlockMenu();
  if (value === "remove") {
    if (position.purpose === "node") {
      store.removeConditionalNode({ target: position.target });
    } else if (position.purpose === "operand") {
      store.removeOperationOperand({
        operationPath: position.operationPath,
        target: position.target,
        index: position.operandIndex,
      });
    } else {
      store.removeOperation(position);
    }
    const values = store.selectDefaultValues();
    render();
    refs.computedForm.setValues({ values });
    return;
  }

  render();
};

const closeOperandSourceMenuOverlay = (operandSourceMenu) => {
  const popover = operandSourceMenu.shadowRoot.querySelector("rtgl-popover");
  popover.removeAttribute("open");
  operandSourceMenu.open = false;
};

export const handleOperandSourceMenuClose = (deps) => {
  const { refs, render, store } = deps;
  closeOperandSourceMenuOverlay(refs.operandSourceMenu);
  store.hideOperandSourceMenu();
  render();
};

export const handleOperandSourceMenuClick = (deps, payload) => {
  const { appService, i18n, refs, render, store } = deps;
  const source = payload._event.detail.item?.value;

  closeOperandSourceMenuOverlay(refs.operandSourceMenu);
  store.hideOperandSourceMenu();

  const position = store.selectOperandSourceMenuPosition();
  const setNode =
    position.purpose === "node" || position.purpose === "node-variable";
  if (source?.startsWith("variables.") || source?.startsWith("variables[")) {
    if (setNode) {
      store.setConditionalNode({
        source: "variable",
        variablePath: source,
        target: position.target,
      });
    } else if (position.purpose === "operation-variable") {
      store.updateOperationVariableOperand({
        variablePath: source,
        operationPath: position.operationPath,
        target: position.target,
        index: position.operandIndex,
      });
    } else {
      store.addOperationOperand({
        source: "variable",
        variablePath: source,
        operationPath: position.operationPath,
        target: position.target,
      });
    }
    render();
    return;
  }

  if (isSupportedComputedOperationType(source)) {
    if (setNode) {
      store.setConditionalNode({
        source: "operation",
        operationType: source,
        target: position.target,
      });
    } else {
      store.addOperationOperand({
        source: "operation",
        operationType: source,
        operationPath: position.operationPath,
        target: position.target,
      });
    }
    render();
    return;
  }

  if (source === "value") {
    store.showOperationValuePopover(position);
    render();
    return;
  }

  if (source !== "variable") {
    render();
    return;
  }

  render();
  const copy = selectCopy(i18n);
  appService.showToast({
    message:
      copy.computedVariableOperandUnavailable ??
      "Create a compatible variable before adding a Variable operand.",
  });
};

export const handleOperationValuePopoverClose = (deps) => {
  const { render, store } = deps;
  store.hideOperationValuePopover();
  render();
};

export const handleEditOperationValueClick = (deps, payload) => {
  const { render, store } = deps;
  const { operationPath, target, index, value, x, y } = payload._event.detail;
  store.showOperationValuePopover({
    operationPath,
    target,
    purpose: "edit",
    operandIndex: index,
    initialValue: { value },
    x,
    y,
  });
  render();
};

export const handleEditOperationVariableClick = (deps, payload) => {
  const { render, store } = deps;
  const { operationPath, target, index, x, y } = payload._event.detail;
  store.showOperandSourceMenu({
    operationPath,
    target,
    purpose: "operation-variable",
    operandIndex: index,
    x,
    y,
  });
  render();
};

export const handleOperationOperandContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const { operationPath, target, index, x, y } = payload._event.detail;
  store.showOperationBlockMenu({
    operationPath,
    target,
    purpose: "operand",
    operandIndex: index,
    x,
    y,
  });
  render();
};

export const handleOperationValueSubmit = (deps, payload) => {
  const { render, store } = deps;
  const { value } = payload._event.detail;
  if (!isComputedLiteralValue(value)) {
    return;
  }

  const position = store.selectOperationValuePopoverPosition();
  if (position.purpose === "edit") {
    store.updateOperationValueOperand({
      value,
      operationPath: position.operationPath,
      target: position.target,
      index: position.operandIndex,
    });
  } else if (position.purpose === "node") {
    store.setConditionalNode({
      source: "value",
      value,
      target: position.target,
    });
  } else {
    store.addOperationOperand({
      source: "value",
      value,
      operationPath: position.operationPath,
      target: position.target,
    });
  }
  store.hideOperationValuePopover();
  render();
};

export const handleRemoveOperationOperandClick = (deps, payload) => {
  const { render, store } = deps;
  const { operationPath, target, index } = payload._event.detail;
  store.removeOperationOperand({
    operationPath,
    target,
    index,
  });
  render();
};

const getConditionalTargetFromElement = (element) => {
  const target = {
    kind: element.dataset.targetKind,
  };
  if (element.dataset.branchIndex !== undefined) {
    target.branchIndex = Number(element.dataset.branchIndex);
  }
  return target;
};

export const handleAddConditionalNodeClick = (deps, payload) => {
  const { render, store } = deps;
  payload._event.stopPropagation();
  const element = payload._event.currentTarget;
  const rect = element.getBoundingClientRect();
  store.showOperandSourceMenu({
    purpose: "node",
    target: getConditionalTargetFromElement(element),
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleConditionalVariableClick = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  event.stopPropagation();
  const element = event.currentTarget;
  const target = getConditionalTargetFromElement(element);
  const rect = element.getBoundingClientRect();
  store.showOperandSourceMenu({
    purpose: target.kind === "condition" ? "node" : "node-variable",
    target,
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleConditionalValueClick = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  event.stopPropagation();
  const element = event.currentTarget;
  const target = getConditionalTargetFromElement(element);
  if (target.kind === "condition") {
    return;
  }

  const value = store.selectConditionalNodeValue({ target });
  if (!isComputedLiteralValue(value)) {
    return;
  }

  const rect = element.getBoundingClientRect();
  store.showOperationValuePopover({
    purpose: "node",
    target,
    initialValue: { value },
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleConditionalNodeContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();
  store.showOperationBlockMenu({
    purpose: "node",
    target: getConditionalTargetFromElement(event.currentTarget),
    x: event.clientX,
    y: event.clientY,
  });
  render();
};

export const handleAddConditionalBranchClick = (deps) => {
  const { render, store } = deps;
  store.addConditionalBranch();
  render();
};

export const handleDuplicateConditionalBranchClick = (deps, payload) => {
  const { render, store } = deps;
  store.duplicateConditionalBranch({
    branchIndex: Number(payload._event.currentTarget.dataset.branchIndex),
  });
  render();
};

export const handleMoveConditionalBranchClick = (deps, payload) => {
  const { render, store } = deps;
  const element = payload._event.currentTarget;
  store.moveConditionalBranch({
    branchIndex: Number(element.dataset.branchIndex),
    offset: Number(element.dataset.offset),
  });
  render();
};

export const handleRemoveConditionalBranchClick = (deps, payload) => {
  const { render, store } = deps;
  store.removeConditionalBranch({
    branchIndex: Number(payload._event.currentTarget.dataset.branchIndex),
  });
  render();
};

export const handleAddVariableClick = async (deps, payload) => {
  if (deps.props.readonly === true) {
    return;
  }

  const { appService, i18n, store, render } = deps;
  payload._event.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button (handles both button and empty state)
  const groupId =
    getDataId(payload._event, "data-group-id") ||
    payload._event.currentTarget.id
      .replace("addVariableButton", "")
      .replace("addVariableEmpty", "");
  if (!groupId) {
    return;
  }

  const copy = selectCopy(i18n);
  const rect = payload._event.currentTarget.getBoundingClientRect();
  const result = await appService.showDropdownMenu({
    items: [
      {
        type: "item",
        label: copy.variableSourceLabel ?? "Variable",
        key: "variable",
      },
      {
        type: "item",
        label: copy.computedSourceLabel ?? "Computed",
        key: "computed",
      },
    ],
    x: rect.left,
    y: rect.bottom,
    place: "bs",
  });
  const valueSource = result?.item?.key;
  if (valueSource !== "variable" && valueSource !== "computed") {
    return;
  }

  store.openAddDialog({ groupId, valueSource });
  render();
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;

  store.closeDialog();
  render();
};

export const handleFormAddOptionClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const fieldName = getFormFieldNameFromEvent(payload?._event);

  dispatchEvent(
    new CustomEvent("form-add-option-click", {
      detail: {
        ...payload?._event?.detail,
        fieldName,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleEnumAddValueClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation();

  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openEnumValuePopover({
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleEnumValuePopoverClose = (deps) => {
  const { store, render } = deps;
  store.closeEnumValuePopover();
  render();
};

export const handleEnumValueFormAction = (deps, payload) => {
  const { appService, i18n, store } = deps;
  const copy = selectCopy(i18n);
  const actionId = payload._event.detail.actionId;
  if (actionId !== "submit") {
    return;
  }

  const currentValues = getVariableFormValues(deps);
  const value = String(payload._event.detail.values?.value ?? "").trim();

  if (!value) {
    appService.showAlert({
      message: copy.enumValueRequired ?? "Enum value is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const enumValues = normalizeVariableEnumValues(currentValues.enumValues);
  if (enumValues.includes(value)) {
    appService.showAlert({
      message: copy.enumValueUnique ?? "Enum value must be unique.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const nextEnumValues = [...enumValues, value];
  const nextValues = {
    ...currentValues,
    isEnum: true,
    enumValues: nextEnumValues,
    default: nextEnumValues.includes(currentValues.default)
      ? currentValues.default
      : value,
  };

  store.closeEnumValuePopover();
  setVariableFormValues(deps, nextValues);
};

export const handleEnumValueContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const index = Number(payload._event.currentTarget.dataset.index);
  if (Number.isNaN(index)) {
    return;
  }

  store.showEnumValueMenu({
    index,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleEnumValueMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideEnumValueMenu();
  render();
};

export const handleEnumValueMenuClick = (deps, payload) => {
  const { render, store } = deps;
  const item = payload._event.detail.item || payload._event.detail;
  if (item?.value !== "remove") {
    store.hideEnumValueMenu();
    render();
    return;
  }

  const targetIndex = store.selectEnumValueMenuTargetIndex();
  const currentValues = getVariableFormValues(deps);
  const enumValues = normalizeVariableEnumValues(currentValues.enumValues);
  const nextEnumValues = enumValues.filter((_, index) => index !== targetIndex);
  const nextDefault = nextEnumValues.includes(currentValues.default)
    ? currentValues.default
    : (nextEnumValues[0] ?? "");
  const nextValues = {
    ...currentValues,
    enumValues: nextEnumValues,
    default: nextDefault,
  };

  store.hideEnumValueMenu();
  setVariableFormValues(deps, nextValues);
};

export const handleRowClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleRowDoubleClick = (deps, payload) => {
  if (
    deps.props.readonly === true ||
    parseBooleanProp(deps.props.mobileLayout)
  ) {
    return;
  }

  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }

  openEditDialogForItem({ deps, itemId });
};

export const handleOpenEditDialog = (deps, payload) => {
  const itemId = payload?.itemId ?? "";
  openEditDialogForItem({ deps, itemId });
};

export const handleRowContextMenu = (deps, payload) => {
  if (deps.props.readonly === true) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();

  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }

  if (parseBooleanProp(deps.props.mobileLayout)) {
    openEditDialogForItem({ deps, itemId });
    return;
  }

  const { store, render } = deps;
  const x = payload._event.clientX;
  const y = payload._event.clientY;

  store.showContextMenu({ itemId, x, y });
  render();
  handleRowClick(deps, payload);
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const item = payload._event.detail.item;
  const itemId = store.selectTargetItemId();

  store.hideContextMenu();

  if (item && item.value === "edit-item") {
    openEditDialogForItem({ deps, itemId });
    return;
  }

  if (item && item.value === "delete-item") {
    dispatchEvent(
      new CustomEvent("variable-delete", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render();
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleAppendTagIdToForm = (deps, payload = {}) => {
  const { refs, render, store } = deps;
  const tagId = payload?.tagId;
  if (!tagId) {
    return;
  }

  const currentValues = getVariableFormValues(deps);
  const nextValues = {
    ...currentValues,
    tagIds: buildUniqueTagIds(currentValues?.tagIds ?? [], [tagId]),
  };

  getActiveVariableForm({ refs, store })?.setValues?.({
    values: nextValues,
  });
  store.updateFormValues(nextValues);
  render();
};

export const handleFormActionClick = (deps, payload) => {
  if (deps.props.readonly === true) {
    return;
  }

  const { store, render, dispatchEvent, props, appService, i18n } = deps;
  const copy = selectCopy(i18n);
  const submitContext = store.selectSubmitContext();

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    const formData = mergeVariableFormValues({
      storedValues: submitContext.defaultValues,
      formValues: payload._event.detail.values,
    });
    const name = formData.name?.trim();

    // Don't submit if name is not set
    if (!name) {
      appService.showAlert({
        message: copy.variableNameRequired ?? "Variable name is required.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    const targetGroupId = submitContext.targetGroupId;
    const isEditMode = submitContext.dialogMode === "edit";
    const editingItemId = submitContext.editingItemId;
    const scope =
      formData.scope ?? submitContext.defaultValues?.scope ?? "context";
    const variableType =
      formData.variableType ??
      submitContext.defaultValues?.variableType ??
      "string";
    const isComputed = formData.valueSource === "computed";
    const isEnum =
      !isComputed && variableType === "string" && formData.isEnum === true;
    const enumValues = isEnum
      ? normalizeVariableEnumValues(formData.enumValues)
      : [];
    if (isEditMode && !editingItemId) {
      appService.showAlert({
        message:
          copy.unableUpdateVariableReopen ??
          "Unable to update variable. Please reopen the editor and try again.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }
    if (!isEditMode && !targetGroupId) {
      appService.showAlert({
        message:
          copy.unableAddVariableSelectGroup ??
          "Unable to add variable. Please select a group and try again.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }
    if (isEnum && enumValues.length === 0) {
      appService.showAlert({
        message:
          copy.enumVariableNeedsValue ??
          "Enum variables need at least one value.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }
    if (isEnum && !enumValues.includes(formData.default)) {
      appService.showAlert({
        message:
          copy.chooseDefaultEnumValue ??
          "Choose a default value from the enum list.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }
    if (isComputed && formData.computed === undefined) {
      appService.showAlert({
        message:
          submitContext.computedMode === "conditional"
            ? (copy.computedConditionalIncomplete ??
              "Complete every condition and result, including Otherwise.")
            : (copy.computedOperationIncomplete ??
              "Complete the operation by adding its required operands."),
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }
    // Don't submit if name already exists
    const isDuplicateName = (props.flatGroups || [])
      .flatMap((group) => group.children || [])
      .some(
        (item) =>
          item.name === name && (!isEditMode || item.id !== editingItemId),
      );
    if (isDuplicateName) {
      appService.showAlert({
        message: copy.variableNameUnique ?? "Variable name must be unique.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }

    // Set default value based on type if not provided
    let defaultValue = formData.default;
    if (defaultValue === undefined || defaultValue === "") {
      defaultValue = getDefaultValueByType(variableType);
    }
    if (isEnum) {
      defaultValue = formData.default;
    }

    if (isEditMode) {
      const detail = {
        itemId: editingItemId,
        name,
        description: formData.description ?? "",
        tagIds: Array.isArray(formData.tagIds) ? formData.tagIds : [],
        variableType,
        isEnum,
        enumValues,
      };
      if (isComputed) {
        detail.computed = structuredClone(formData.computed);
      } else {
        detail.scope = scope;
        detail.default = defaultValue;
      }
      dispatchEvent(
        new CustomEvent("variable-updated", {
          detail,
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      const detail = {
        groupId: targetGroupId,
        name,
        description: formData.description ?? "",
        tagIds: Array.isArray(formData.tagIds) ? formData.tagIds : [],
        variableType,
        isEnum,
        enumValues,
      };
      if (isComputed) {
        detail.computed = structuredClone(formData.computed);
      } else {
        detail.scope = scope;
        detail.default = defaultValue;
      }
      // Forward variable creation to parent
      dispatchEvent(
        new CustomEvent("variable-created", {
          detail,
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog
    store.closeDialog();
    render();
  }
};
