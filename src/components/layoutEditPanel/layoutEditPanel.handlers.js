import {
  getInteractionActions,
  getInteractionPayload,
} from "../../internal/project/interactionPayload.js";
import {
  buildVisibilityConditionExpression,
  mergeWhenExpressions,
  splitVisibilityConditionFromWhen,
} from "../../internal/layoutConditions.js";
import {
  buildConditionalOverrideSetUpdate,
  deleteConditionalOverrideSetField,
  getAvailableChildInteractionItems,
  getConditionalOverrideAttributeOptions,
} from "./support/layoutEditPanelFeatures.js";
import { getLayoutEditorElementDefinition } from "../../internal/layoutEditorElementRegistry.js";
import { parseSpritesheetAnimationSelectionValue } from "../../internal/spritesheets.js";

const ACTION_INTERACTION_TYPES = ["click", "rightClick"];
const EMPTY_TREE = { items: {}, tree: [] };
const INTEGER_ONLY_FIELDS = new Set(["x", "y", "width", "height"]);
const SIZE_FIELDS = new Set(["width", "height"]);
const WHEEL_INCREMENT_FIELD_CONFIG = {
  x: { step: 1, fastStep: 10 },
  y: { step: 1, fastStep: 10 },
  width: { step: 1, fastStep: 10 },
  height: { step: 1, fastStep: 10 },
  gap: { step: 1, fastStep: 10 },
  opacity: {
    defaultValue: 1,
    step: 0.01,
    fastStep: 0.1,
    min: 0,
    max: 1,
  },
};

const getInteractionPropertyName = (interactionType) => {
  return ACTION_INTERACTION_TYPES.includes(interactionType)
    ? interactionType
    : "click";
};

const getInteractionActionsSnapshot = (store, interactionType) => {
  const interactionKey = getInteractionPropertyName(interactionType);
  return getInteractionActions(store.selectValues()[interactionKey]);
};

const emitPanelUpdate = (
  { dispatchEvent, store },
  { name, value, bubbles = false } = {},
) => {
  dispatchEvent(
    new CustomEvent("update", {
      bubbles,
      detail: {
        formValues: store.selectValues(),
        name,
        value,
      },
    }),
  );
};

const getCurrentAspectRatioLock = (values = {}) => {
  const aspectRatioLock = Number(values?.aspectRatioLock);
  if (Number.isFinite(aspectRatioLock) && aspectRatioLock > 0) {
    return aspectRatioLock;
  }

  return undefined;
};

const syncFixedAspectRatioValue = (store, { name, value } = {}) => {
  if (!SIZE_FIELDS.has(name)) {
    return;
  }

  const values = store.selectValues();
  const aspectRatioLock = getCurrentAspectRatioLock(values);
  if (!Number.isFinite(aspectRatioLock) || aspectRatioLock <= 0) {
    return;
  }

  const currentWidth = Number(values.width);
  const currentHeight = Number(values.height);
  const nextValue = Number(value);

  if (
    !Number.isFinite(currentWidth) ||
    !Number.isFinite(currentHeight) ||
    currentWidth <= 0 ||
    currentHeight <= 0 ||
    !Number.isFinite(nextValue) ||
    nextValue <= 0
  ) {
    return;
  }

  if (name === "width") {
    store.updateValueProperty({
      name: "height",
      value: Math.round(nextValue / aspectRatioLock),
    });
    return;
  }

  store.updateValueProperty({
    name: "width",
    value: Math.round(nextValue * aspectRatioLock),
  });
};

const getMeasuredTextWidth = (metrics = {}) => {
  const measuredWidth = Number(metrics.measuredWidth ?? metrics.width);
  if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
    return Math.round(measuredWidth);
  }

  return undefined;
};

const applyWidthModeUpdate = (deps, { value } = {}) => {
  const { props, store } = deps;

  if (value === "auto") {
    applyPanelValueUpdate(deps, {
      name: "width",
      value: undefined,
    });
    return;
  }

  if (value !== "fixed") {
    return;
  }

  const measuredWidth = getMeasuredTextWidth(props.selectedElementMetrics);
  const currentWidth = Number(store.selectValues().width);
  const fallbackWidth =
    Number.isFinite(currentWidth) && currentWidth > 0
      ? currentWidth
      : undefined;
  const nextWidth = measuredWidth ?? fallbackWidth;
  if (nextWidth === undefined) {
    return;
  }

  applyPanelValueUpdate(deps, {
    name: "width",
    value: nextWidth,
  });
};

const applyPanelValueUpdate = (
  deps,
  { name, value, closePopover = false, closeImageSelector = false } = {},
) => {
  const { store, render } = deps;
  const normalizedValue =
    INTEGER_ONLY_FIELDS.has(name) && Number.isFinite(Number(value))
      ? Math.round(Number(value))
      : value;

  if (name === "aspectRatioMode") {
    const currentValues = store.selectValues();
    const currentWidth = Number(currentValues.width);
    const currentHeight = Number(currentValues.height);
    const nextAspectRatioLock =
      normalizedValue === "fixed" &&
      Number.isFinite(currentWidth) &&
      Number.isFinite(currentHeight) &&
      currentWidth > 0 &&
      currentHeight > 0
        ? currentWidth / currentHeight
        : undefined;

    store.updateValueProperty({
      name: "aspectRatioLock",
      value: nextAspectRatioLock,
    });
  } else {
    syncFixedAspectRatioValue(store, {
      name,
      value: normalizedValue,
    });

    store.updateValueProperty({
      name,
      value: normalizedValue,
    });
  }

  if (closePopover) {
    store.closePopoverForm();
  }

  if (closeImageSelector) {
    store.closeImageSelectorDialog();
  }

  render();
  emitPanelUpdate(deps, { name, value: normalizedValue });
};

export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  const values = props.values || {};
  store.setValues({
    values,
  });
  store.setImagesData({
    imagesData: props.imagesData || EMPTY_TREE,
  });
  store.setSpritesheetsData({
    spritesheetsData: props.spritesheetsData || EMPTY_TREE,
  });
  store.setParticlesData({
    particlesData: props.particlesData || EMPTY_TREE,
  });
  store.setTextStylesData({
    textStylesData: props.textStylesData || EMPTY_TREE,
  });
  store.setVariablesData({
    variablesData: props.variablesData || EMPTY_TREE,
  });
};

export const handleOnUpdate = (deps, payload) => {
  const { oldProps, newProps } = payload;
  const { store, render } = deps;
  if (
    oldProps?.key === newProps?.key &&
    oldProps?.values === newProps?.values &&
    oldProps?.projectResolution === newProps?.projectResolution &&
    oldProps?.layoutsData === newProps?.layoutsData &&
    oldProps?.imagesData === newProps?.imagesData &&
    oldProps?.spritesheetsData === newProps?.spritesheetsData &&
    oldProps?.particlesData === newProps?.particlesData &&
    oldProps?.variablesData === newProps?.variablesData &&
    oldProps?.textStylesData === newProps?.textStylesData &&
    oldProps?.selectedElementMetrics === newProps?.selectedElementMetrics
  ) {
    return;
  }

  store.setValues({
    values: newProps.values || {},
  });
  store.setImagesData({
    imagesData: newProps.imagesData || EMPTY_TREE,
  });
  store.setSpritesheetsData({
    spritesheetsData: newProps.spritesheetsData || EMPTY_TREE,
  });
  store.setParticlesData({
    particlesData: newProps.particlesData || EMPTY_TREE,
  });
  store.setTextStylesData({
    textStylesData: newProps.textStylesData || EMPTY_TREE,
  });
  store.setVariablesData({
    variablesData: newProps.variablesData || EMPTY_TREE,
  });

  const popover = store.selectPopoverForm();
  if (popover.open) {
    store.updatePopoverFormContext({
      values: popover.defaultValues,
      name: popover.name,
      projectResolution: newProps.projectResolution,
    });
  }

  render();
};

export const handleGroupItemClick = (deps, payload) => {
  const { props, render, store } = deps;
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;
  const popoverForm = store.selectFieldPopoverForm({ name });
  store.openPopoverForm({
    x: _event.clientX,
    y: _event.clientY,
    name,
    form: popoverForm,
    projectResolution: props.projectResolution,
  });

  render();
};

export const handleGroupItemWheel = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;
  const fieldConfig = WHEEL_INCREMENT_FIELD_CONFIG[name];

  if (!fieldConfig) {
    return;
  }

  if (_event.deltaY === 0) {
    return;
  }

  const currentValue = Number(
    store.selectValues()?.[name] ?? fieldConfig.defaultValue,
  );
  if (!Number.isFinite(currentValue)) {
    return;
  }

  _event.preventDefault();

  const step =
    _event.shiftKey === true && Number.isFinite(fieldConfig.fastStep)
      ? fieldConfig.fastStep
      : fieldConfig.step;
  const delta = _event.deltaY < 0 ? step : -step;
  const nextValue = currentValue + delta;

  applyPanelValueUpdate(deps, {
    name,
    value:
      name === "opacity"
        ? Math.max(
            fieldConfig.min,
            Math.min(
              fieldConfig.max,
              Number((nextValue + Number.EPSILON).toFixed(2)),
            ),
          )
        : nextValue,
  });
};

export const handleVisibilityConditionItemClick = (deps) => {
  const { render, store } = deps;
  const targetTypeByTarget =
    store.selectVisibilityConditionTargetTypeByTarget();
  const currentVisibilityCondition = splitVisibilityConditionFromWhen(
    store.selectValues()["$when"],
  ).visibilityCondition;
  const target = currentVisibilityCondition?.target;

  store.setVisibilityConditionDialogSelectedVariableType({
    selectedVariableType: target
      ? (targetTypeByTarget?.[target] ?? "string")
      : undefined,
  });
  store.openVisibilityConditionDialog();
  render();
};

export const handleVisibilityConditionContextMenu = (deps, payload) => {
  const { render, store } = deps;
  payload._event.preventDefault();

  const targetName = payload._event.currentTarget?.dataset?.name;
  if (!targetName) {
    return;
  }

  store.showContextMenu({
    targetName,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleSaveLoadPaginationItemClick = (deps) => {
  const { render, store } = deps;
  store.openSaveLoadPaginationDialog();
  render();
};

export const handleChildInteractionContextMenu = (deps, payload) => {
  const { render, store } = deps;
  payload._event.preventDefault();

  const name = payload._event.currentTarget.dataset.name;
  if (!name) {
    return;
  }

  store.showContextMenu({
    targetName: name,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handlePopverFormClose = (deps) => {
  const { render, store } = deps;
  store.closePopoverForm();
  render();
};

export const handleVisibilityConditionDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeVisibilityConditionDialog();
  render();
};

export const handleSaveLoadPaginationDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeSaveLoadPaginationDialog();
  render();
};

export const handleChildInteractionDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeChildInteractionDialog();
  render();
};

export const handleConditionalOverrideConditionDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeConditionalOverrideConditionDialog();
  render();
};

export const handleConditionalOverrideAttributeDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeConditionalOverrideAttributeDialog();
  render();
};

export const handleCloseContextMenu = (deps) => {
  const { render, store } = deps;
  store.hideContextMenu();
  render();
};

export const handleVisibilityConditionFormChange = (deps, payload) => {
  const { refs, render, store } = deps;
  const values = payload._event.detail?.values ?? {};
  const targetTypeByTarget =
    store.selectVisibilityConditionTargetTypeByTarget();
  const selectedVariableType = values.target
    ? (targetTypeByTarget?.[values.target] ?? "string")
    : undefined;

  if (values.target && values.op === undefined) {
    const nextValues = {
      ...values,
      op: "eq",
    };

    if (
      selectedVariableType === "boolean" &&
      values.booleanValue === undefined
    ) {
      nextValues.booleanValue = true;
    }

    refs.visibilityConditionForm.setValues({
      values: nextValues,
    });
  }

  store.setVisibilityConditionDialogSelectedVariableType({
    selectedVariableType,
  });
  render();
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { render, store } = deps;
  const detail = payload._event.detail || {};
  const item = detail.item || detail;
  const targetName = store.selectDropdownMenu().targetName;

  store.hideContextMenu();

  if (item.value !== "delete" || !targetName) {
    render();
    return;
  }

  if (targetName === "visibilityCondition") {
    const currentWhen = store.selectValues()["$when"];
    const { baseWhen } = splitVisibilityConditionFromWhen(currentWhen);

    applyPanelValueUpdate(deps, {
      name: "$when",
      value: baseWhen,
    });
    return;
  }

  applyPanelValueUpdate(deps, {
    name: targetName,
    value: undefined,
  });
};

export const handleConditionalOverrideConditionFormChange = (deps, payload) => {
  const { render, store } = deps;
  const values = payload._event.detail?.values ?? {};
  const targetTypeByTarget =
    store.selectVisibilityConditionTargetTypeByTarget();

  store.setConditionalOverrideConditionDialogSelectedVariableType({
    selectedVariableType: values.target
      ? (targetTypeByTarget?.[values.target] ?? "string")
      : undefined,
  });
  render();
};

export const handleOptionSelected = (deps, payload) => {
  const { render, store } = deps;
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;
  const value = _event.detail?.item?.value ?? _event.detail?.value;

  if (name === "widthMode") {
    applyWidthModeUpdate(deps, { value });
    return;
  }

  if (name === "spritesheetSelection") {
    const { resourceId, animationName } =
      parseSpritesheetAnimationSelectionValue(value);
    store.updateValueProperty({
      name: "resourceId",
      value: resourceId || undefined,
    });
    store.updateValueProperty({
      name: "animationName",
      value: animationName || undefined,
    });
    render();
    emitPanelUpdate(deps, {
      name,
      value,
    });
    return;
  }

  applyPanelValueUpdate(deps, {
    name,
    value,
    closePopover: true,
  });
};

export const handleSectionActionClick = async (deps, payload) => {
  const { render, store, appService, refs } = deps;
  const { _event } = payload;
  const id = _event.currentTarget.dataset.id;

  if (id === "actions") {
    const result = await appService.showDropdownMenu({
      items: [
        { type: "item", label: "Click", key: "click" },
        { type: "item", label: "Right Click", key: "rightClick" },
      ],
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!result) {
      return;
    }

    const { item } = result;
    const interactionType = getInteractionPropertyName(item.key);
    const snapshotActions = getInteractionActionsSnapshot(
      store,
      interactionType,
    );
    store.setActiveInteractionType({
      interactionType,
    });
    store.syncActionsEditorActions({
      interactionType,
    });
    render();
    const systemActions = refs["systemActions"];
    systemActions.transformedHandlers.open({
      mode: "actions",
      actions: snapshotActions,
    });
  } else if (id === "images") {
    const items = [];
    const { imageId, hoverImageId, clickImageId } = store.selectValues();
    if (!imageId) {
      items.push({ type: "item", label: "Default", key: "imageId" });
    }
    if (!hoverImageId) {
      items.push({ type: "item", label: "Hover", key: "hoverImageId" });
    }
    if (!clickImageId) {
      items.push({ type: "item", label: "Click", key: "clickImageId" });
    }
    const result = await appService.showDropdownMenu({
      items,
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!result) {
      return;
    }
    const { item } = result;

    if (item.key) {
      store.openImageSelectorDialog({
        name: item.key,
      });
      render();
    }
  } else if (id === "textStyles") {
    const variantItems = [];
    const { hoverTextStyleId, clickTextStyleId } = store.selectValues();
    if (!hoverTextStyleId) {
      variantItems.push({
        type: "item",
        label: "Hover",
        key: "hoverTextStyleId",
      });
    }
    if (!clickTextStyleId) {
      variantItems.push({
        type: "item",
        label: "Clicked",
        key: "clickTextStyleId",
      });
    }

    if (variantItems.length === 0) {
      return;
    }

    const variantResult = await appService.showDropdownMenu({
      items: variantItems,
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!variantResult?.item?.key) {
      return;
    }

    const textStyleItems = store.selectTextStyleOptions().map((option) => ({
      type: "item",
      label: option.label,
      key: option.value,
    }));
    if (textStyleItems.length === 0) {
      return;
    }

    const textStyleResult = await appService.showDropdownMenu({
      items: textStyleItems,
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!textStyleResult?.item?.key) {
      return;
    }

    applyPanelValueUpdate(deps, {
      name: variantResult.item.key,
      value: textStyleResult.item.key,
    });
  } else if (id === "conditionalOverrides") {
    store.openConditionalOverrideConditionDialog({
      editingIndex: undefined,
      selectedVariableType: undefined,
    });
    render();
  } else if (id === "visibilityCondition") {
    handleVisibilityConditionItemClick(deps);
  } else if (id === "childInteraction") {
    const items = getAvailableChildInteractionItems(store.selectValues()).map(
      (item) => ({
        type: "item",
        label: item.label,
        key: item.name,
      }),
    );

    if (items.length === 0) {
      return;
    }

    const result = await appService.showDropdownMenu({
      items,
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!result?.item?.key) {
      return;
    }

    applyPanelValueUpdate(deps, {
      name: result.item.key,
      value: true,
    });
  }
};

export const handleFormActions = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  const { name } = store.selectPopoverForm();
  applyPanelValueUpdate(deps, {
    name,
    value: _event.detail.values.value,
    closePopover: true,
  });
};

export const handleVisibilityConditionFormAction = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const { actionId, values = {} } = detail;
  const currentWhen = store.selectValues()["$when"];
  const { baseWhen } = splitVisibilityConditionFromWhen(currentWhen);

  if (actionId === "cancel") {
    store.closeVisibilityConditionDialog();
    render();
    return;
  }

  if (actionId === "clear") {
    applyPanelValueUpdate(deps, {
      name: "$when",
      value: baseWhen,
    });
    store.closeVisibilityConditionDialog();
    render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  const target = values.target;
  if (!target) {
    applyPanelValueUpdate(deps, {
      name: "$when",
      value: baseWhen,
    });
    store.closeVisibilityConditionDialog();
    render();
    return;
  }

  const targetType =
    store.selectVisibilityConditionTargetTypeByTarget()?.[target] || "string";

  let conditionValue = values.stringValue ?? "";
  if (targetType === "boolean") {
    conditionValue = values.booleanValue === true;
  } else if (targetType === "number") {
    const parsedNumber = Number(values.numberValue);
    conditionValue = Number.isFinite(parsedNumber) ? parsedNumber : 0;
  }

  const nextVisibilityWhen = buildVisibilityConditionExpression({
    target,
    op: values.op ?? "eq",
    value: conditionValue,
  });

  applyPanelValueUpdate(deps, {
    name: "$when",
    value: mergeWhenExpressions(baseWhen, nextVisibilityWhen),
  });
  store.closeVisibilityConditionDialog();
  render();
};

export const handleSaveLoadPaginationFormAction = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const { actionId, values = {} } = detail;

  if (actionId === "cancel") {
    store.closeSaveLoadPaginationDialog();
    render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  const paginationMode =
    values.paginationMode === "paginated" ? "paginated" : "continuous";

  applyPanelValueUpdate(deps, {
    name: "paginationMode",
    value: paginationMode,
  });

  if (paginationMode === "paginated") {
    applyPanelValueUpdate(deps, {
      name: "paginationVariableId",
      value: values.paginationVariableId || undefined,
    });

    const parsedPaginationSize = Number(values.paginationSize);
    applyPanelValueUpdate(deps, {
      name: "paginationSize",
      value:
        Number.isFinite(parsedPaginationSize) && parsedPaginationSize > 0
          ? parsedPaginationSize
          : 1,
    });
  } else {
    applyPanelValueUpdate(deps, {
      name: "paginationVariableId",
      value: undefined,
    });
  }

  store.closeSaveLoadPaginationDialog();
  render();
};

export const handleChildInteractionFormAction = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const { actionId, values = {} } = detail;

  if (actionId === "cancel") {
    store.closeChildInteractionDialog();
    render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  applyPanelValueUpdate(deps, {
    name: "hover.inheritToChildren",
    value: values.hover?.inheritToChildren === true ? true : undefined,
  });
  applyPanelValueUpdate(deps, {
    name: "click.inheritToChildren",
    value: values.click?.inheritToChildren === true ? true : undefined,
  });
  applyPanelValueUpdate(deps, {
    name: "rightClick.inheritToChildren",
    value: values.rightClick?.inheritToChildren === true ? true : undefined,
  });

  store.closeChildInteractionDialog();
  render();
};

const getConditionalOverrideRules = (store) => {
  const currentRules = store.selectValues().conditionalOverrides;
  return Array.isArray(currentRules) ? [...currentRules] : [];
};

export const handleConditionalOverrideConditionClick = (deps, payload) => {
  const { render, store } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget?.dataset?.index,
    10,
  );
  const rules = getConditionalOverrideRules(store);
  const rule = Number.isInteger(index) && index >= 0 ? rules[index] : undefined;
  const targetTypeByTarget =
    store.selectVisibilityConditionTargetTypeByTarget();

  store.openConditionalOverrideConditionDialog({
    editingIndex: Number.isInteger(index) && index >= 0 ? index : undefined,
    selectedVariableType: rule?.when?.target
      ? (targetTypeByTarget?.[rule.when.target] ?? "string")
      : undefined,
  });
  render();
};

export const handleConditionalOverrideConditionDeleteClick = (
  deps,
  payload,
) => {
  const { render, store } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget?.dataset?.index,
    10,
  );
  const rules = getConditionalOverrideRules(store);

  if (!Number.isInteger(index) || index < 0 || index >= rules.length) {
    return;
  }

  const nextRules = rules.filter((_rule, ruleIndex) => ruleIndex !== index);
  applyPanelValueUpdate(deps, {
    name: "conditionalOverrides",
    value: nextRules.length > 0 ? nextRules : undefined,
  });
  render();
};

export const handleConditionalOverrideAddAttributeClick = (deps, payload) => {
  const { appService, props, render, store } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget?.dataset?.index,
    10,
  );
  const rules = getConditionalOverrideRules(store);
  const rule = Number.isInteger(index) && index >= 0 ? rules[index] : undefined;

  if (!rule) {
    return;
  }

  const availableAttributeOptions = getConditionalOverrideAttributeOptions({
    rule,
    capabilities:
      getLayoutEditorElementDefinition(props.itemType)?.capabilities ?? {},
  });

  if (availableAttributeOptions.length === 0) {
    appService.showToast("All supported attributes are already added.");
    return;
  }

  store.openConditionalOverrideAttributeDialog({
    editingIndex: index,
    fieldName: undefined,
  });
  render();
};

export const handleConditionalOverrideAttributeClick = (deps, payload) => {
  const { render, store } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget?.dataset?.index,
    10,
  );
  const fieldName = payload._event.currentTarget?.dataset?.fieldName;

  store.openConditionalOverrideAttributeDialog({
    editingIndex: Number.isInteger(index) && index >= 0 ? index : undefined,
    fieldName,
  });
  render();
};

export const handleConditionalOverrideAttributeDeleteClick = (
  deps,
  payload,
) => {
  const { render, store } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget?.dataset?.index,
    10,
  );
  const fieldName = payload._event.currentTarget?.dataset?.fieldName;
  const rules = getConditionalOverrideRules(store);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= rules.length ||
    !fieldName
  ) {
    return;
  }

  const nextRules = [...rules];
  const nextRule = {
    ...nextRules[index],
    set: deleteConditionalOverrideSetField(nextRules[index]?.set, fieldName),
  };
  nextRules[index] = nextRule;

  applyPanelValueUpdate(deps, {
    name: "conditionalOverrides",
    value: nextRules,
  });
  render();
};

export const handleConditionalOverrideConditionFormAction = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const { actionId, values = {} } = detail;

  if (actionId === "cancel") {
    store.closeConditionalOverrideConditionDialog();
    render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  if (!values.target) {
    return;
  }

  const targetType =
    store.selectVisibilityConditionTargetTypeByTarget()?.[values.target] ||
    "string";

  let conditionValue = values.stringValue ?? "";
  if (targetType === "boolean") {
    conditionValue = values.booleanValue === true;
  } else if (targetType === "number") {
    const parsedNumber = Number(values.numberValue);
    conditionValue = Number.isFinite(parsedNumber) ? parsedNumber : 0;
  }

  const nextRule = {
    when: {
      target: values.target,
      op: values.op ?? "eq",
      value: conditionValue,
    },
    set: {},
  };
  const rules = getConditionalOverrideRules(store);
  const editingIndex =
    store.selectConditionalOverrideConditionDialog().editingIndex;
  const nextRules = [...rules];

  if (
    Number.isInteger(editingIndex) &&
    editingIndex >= 0 &&
    editingIndex < nextRules.length
  ) {
    nextRules[editingIndex] = {
      ...nextRules[editingIndex],
      when: nextRule.when,
    };
  } else {
    nextRules.push(nextRule);
  }

  applyPanelValueUpdate(deps, {
    name: "conditionalOverrides",
    value: nextRules,
  });
  store.closeConditionalOverrideConditionDialog();
  render();
};

export const handleConditionalOverrideAttributeFormAction = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const { actionId, values = {} } = detail;

  if (actionId === "cancel") {
    store.closeConditionalOverrideAttributeDialog();
    render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  if (!values.fieldName) {
    return;
  }

  const dialog = store.selectConditionalOverrideAttributeDialog();
  const rules = getConditionalOverrideRules(store);
  const editingIndex = dialog.editingIndex;
  if (
    !Number.isInteger(editingIndex) ||
    editingIndex < 0 ||
    editingIndex >= rules.length
  ) {
    return;
  }

  const nextRules = [...rules];
  nextRules[editingIndex] = {
    ...nextRules[editingIndex],
    set: buildConditionalOverrideSetUpdate(
      nextRules[editingIndex]?.set,
      values,
    ),
  };

  applyPanelValueUpdate(deps, {
    name: "conditionalOverrides",
    value: nextRules,
  });
  store.closeConditionalOverrideAttributeDialog();
  render();
};

export const handleActionsChange = (deps, payload) => {
  const { store, render } = deps;
  const interactionType = store.selectActiveInteractionType();
  const interactionKey = getInteractionPropertyName(interactionType);

  const currentActions = getInteractionActions(
    store.selectValues()[interactionKey],
  );
  const newActions = {
    ...currentActions,
    ...payload._event.detail,
  };
  const currentPayload = getInteractionPayload(
    store.selectValues()[interactionKey],
  );

  store.updateValueProperty({
    name: `${interactionKey}.payload`,
    value: {
      ...currentPayload,
      actions: newActions,
    },
  });
  store.setActionsEditorActions({
    actions: newActions,
  });

  render();
  emitPanelUpdate(deps, {
    name: `${interactionKey}.payload.actions`,
    value: newActions,
  });
};

export const handleListBarItemClick = async (deps, payload) => {
  const { render, store } = deps;
  const { _event: event } = payload;
  const { name } = event.currentTarget.dataset;
  store.openImageSelectorDialog({
    name,
  });
  render();
};

export const handlePopoverFormChange = async (deps, payload) => {
  const { props, store, render } = deps;
  const { _event } = payload;
  const { name } = store.selectPopoverForm();

  store.updatePopoverFormContext({
    values: _event.detail.values,
    name,
    projectResolution: props.projectResolution,
  });
  render();
};

export const handlePopoverPresetClick = (deps, payload) => {
  const { props, render, store } = deps;
  const { _event } = payload;
  const popover = store.selectPopoverForm();
  const { name } = popover;
  const value = Number(_event.currentTarget.dataset.value);

  if (!name || !Number.isFinite(value)) {
    return;
  }

  store.updatePopoverFormContext({
    values: {
      ...popover.defaultValues,
      value,
    },
    name,
    projectResolution: props.projectResolution,
  });
  render();
};

export const handleListBarItemRightClick = async (deps, payload) => {
  const { render, store, appService } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const { name } = event.currentTarget.dataset;

  // Prevent removing bar idle image - it's required for slider
  if (name === "barImageId") {
    return;
  }

  const result = await appService.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (!result) {
    return;
  }
  const { item } = result;
  if (item.key === "remove") {
    store.updateValueProperty({
      name,
      value: undefined,
    });

    // Cascade delete for slider images
    // If bar is deleted, also delete thumb and hover images
    if (name === "barImageId") {
      store.updateValueProperty({ name: "thumbImageId", value: undefined });
      store.updateValueProperty({
        name: "hoverBarImageId",
        value: undefined,
      });
      store.updateValueProperty({
        name: "hoverThumbImageId",
        value: undefined,
      });
    }
    // If thumb is deleted, also delete hover thumb
    if (name === "thumbImageId") {
      store.updateValueProperty({
        name: "hoverThumbImageId",
        value: undefined,
      });
    }
  }
  render();
  emitPanelUpdate(deps, {
    name,
    value: undefined,
  });
};

// --- List Item ---
export const handleListItemClick = async (deps, payload) => {
  const { render, refs, store } = deps;
  const { _event: event } = payload;
  const systemActions = refs["systemActions"];
  const { id, interaction } = event.currentTarget.dataset;
  const interactionType = getInteractionPropertyName(interaction);
  const snapshotActions = getInteractionActionsSnapshot(store, interactionType);
  store.setActiveInteractionType({
    interactionType,
  });
  store.syncActionsEditorActions({
    interactionType,
  });
  render();
  systemActions.transformedHandlers.open({
    mode: id,
    actions: snapshotActions,
  });
};

export const handleListItemRightClick = async (deps, payload) => {
  const { render, store, appService } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const { id, interaction } = event.currentTarget.dataset;
  const interactionKey = getInteractionPropertyName(interaction);
  const result = await appService.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (!result) {
    return;
  }
  const { item } = result;
  if (item.key === "remove") {
    const currentActions = getInteractionActions(
      store.selectValues()[interactionKey],
    );
    const actions = structuredClone(currentActions);
    const currentPayload = getInteractionPayload(
      store.selectValues()[interactionKey],
    );
    delete actions[id];
    store.updateValueProperty({
      name: `${interactionKey}.payload`,
      value: {
        ...currentPayload,
        actions,
      },
    });
    if (store.selectActiveInteractionType() === interactionKey) {
      store.setActionsEditorActions({
        actions,
      });
    }
    emitPanelUpdate(deps, {
      name: `${interactionKey}.payload.actions`,
      value: actions,
      bubbles: true,
    });
  }
  render();
};

// --- Image Selector ---
export const handleImageSelectorImageSelected = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  store.setTempSelectedImageId({
    imageId: _event.detail.imageId,
  });
};

export const handleImageSelectorImageDoubleClick = (deps, payload) => {
  const imageId = payload?._event?.detail?.imageId;
  if (!imageId) {
    return;
  }

  deps.store.showFullImagePreview({ imageId });
  deps.render();
};

export const handleImageSelectorFileExplorerClickItem = (deps, payload) => {
  const itemId = payload?._event?.detail?.itemId;
  if (!itemId) {
    return;
  }

  deps.refs.imageSelector?.transformedHandlers?.handleScrollToItem?.({
    itemId,
  });
};

export const handleImageSelectorCancel = (deps) => {
  const { store, render } = deps;
  store.closeImageSelectorDialog();
  render();
};

export const handleImageSelectorSubmit = (deps) => {
  const { store } = deps;
  const imageId = store.selectTempSelectedImageId();
  const { name } = store.selectImageSelectorDialog();
  applyPanelValueUpdate(deps, {
    name,
    value: imageId,
    closeImageSelector: true,
  });
};

export const handlePreviewOverlayClick = (deps) => {
  deps.store.hideFullImagePreview();
  deps.render();
};
