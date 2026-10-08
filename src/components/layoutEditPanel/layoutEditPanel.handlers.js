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
  getRuntimeFieldItem,
  toRuntimeTemplateValue,
} from "../../internal/runtimeFields.js";
import {
  buildConditionalOverrideSetUpdate,
  createConditionalOverrideRuleLocator,
  deleteConditionalOverrideSetField,
  findConditionalOverrideRuleIndex,
  getAvailableChildInteractionItems,
  getConditionalOverrideAttributeOptions,
} from "./support/layoutEditPanelFeatures.js";
import { createSpriteBlurFromDialogValues } from "./support/layoutEditPanelBlur.js";
import {
  createTextRevealIndicatorAddItems,
  createTextRevealIndicatorVisualFromDialogValues,
  getImageDimensions,
  getSpritesheetAnimationDimensions,
  getTextRevealIndicatorStateNameFromItemName,
  isTextRevealIndicatorItemName,
} from "./support/layoutEditPanelTextRevealIndicator.js";
import { getLayoutEditorElementDefinition } from "../../internal/layoutEditorElementRegistry.js";
import {
  parseSpritesheetAnimationSelectionValue,
  toSpritesheetAnimationSelectionValue,
} from "../../internal/spritesheets.js";
import { selectLayoutEditPanelCopy } from "./support/layoutEditPanelCopy.js";
import {
  getLinkedScaleValues,
  getSliderPopoverField,
  hasAspectRatioToggle,
  stepSliderPopoverValue,
} from "./support/layoutEditPanelSliderPopovers.js";
import { toSliderPresetMenuItems } from "../../internal/ui/sliderPopover.js";
import { normalizeLayoutRotation } from "../../internal/project/layout.js";

const ACTION_INTERACTION_TYPES = [
  "click",
  "rightClick",
  "scrollUp",
  "scrollDown",
  "change",
];
const DEFAULT_TEXT_FIXED_WIDTH = 300;
const EMPTY_TREE = { items: {}, tree: [] };
const INTEGER_ONLY_FIELDS = new Set([
  "x",
  "y",
  "width",
  "height",
  "gapX",
  "gapY",
  "indicator.revealing.width",
  "indicator.revealing.height",
  "indicator.revealing.offsetX",
  "indicator.revealing.offsetY",
  "indicator.complete.width",
  "indicator.complete.height",
  "indicator.complete.offsetX",
  "indicator.complete.offsetY",
]);
const SOUND_ID_FIELDS = new Set([
  "hoverSoundId",
  "clickSoundId",
  "revealSoundId",
]);
const SOUND_FORM_CONFIG_BY_ID_FIELD = {
  hoverSoundId: {
    volumeName: "hover.soundVolume",
  },
  clickSoundId: {
    volumeName: "click.soundVolume",
  },
  revealSoundId: {
    stopTimingName: "revealSoundStopTiming",
  },
};
const SIZE_FIELDS = new Set(["width", "height"]);
const CONDITIONAL_OVERRIDE_IMAGE_FIELDS = new Set([
  "imageId",
  "hoverImageId",
  "clickImageId",
]);
const WHEEL_INCREMENT_FIELD_CONFIG = {
  x: getSliderPopoverField("x"),
  y: getSliderPopoverField("y"),
  width: { step: 1, fastStep: 10 },
  height: { step: 1, fastStep: 10 },
  gapX: { step: 1, fastStep: 10 },
  gapY: { step: 1, fastStep: 10 },
  rotation: getSliderPopoverField("rotation"),
  scaleX: getSliderPopoverField("scaleX"),
  scaleY: getSliderPopoverField("scaleY"),
  opacity: getSliderPopoverField("opacity"),
};
const TEXT_REVEAL_INDICATOR_VISUAL_SOURCE_TARGET =
  "textRevealIndicatorVisualSource";
const selectCopy = (deps = {}) => selectLayoutEditPanelCopy(deps.i18n);
const createTextRevealIndicatorVisualSourceItems = (copy = {}) => [
  { label: copy.imageLabel ?? "Image", type: "item", value: "image" },
  {
    label: copy.spritesheetLabel ?? "Spritesheet",
    type: "item",
    value: "spritesheet",
  },
];

const arePlainObjectsShallowEqual = (left = {}, right = {}) => {
  if (left === right) {
    return true;
  }

  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
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

const getAvailableActionInteractionItems = (itemType, copy = {}) => {
  if (itemType === "slider") {
    return [
      { type: "item", label: copy.changeLabel ?? "Change", key: "change" },
    ];
  }

  return [
    { type: "item", label: copy.clickLabel ?? "Click", key: "click" },
    {
      type: "item",
      label: copy.rightClickLabel ?? "Right Click",
      key: "rightClick",
    },
    {
      type: "item",
      label: copy.scrollUpLabel ?? "Scroll Up",
      key: "scrollUp",
    },
    {
      type: "item",
      label: copy.scrollDownLabel ?? "Scroll Down",
      key: "scrollDown",
    },
  ];
};

// `linkedValues` are other fields the change moves with it, such as the
// other scale while the aspect ratio is kept; owners apply them too.
const emitPanelUpdate = (
  { dispatchEvent, store },
  { name, value, linkedValues, bubbles = false } = {},
) => {
  const detail = {
    formValues: store.selectValues(),
    name,
    value,
  };
  if (linkedValues) {
    detail.linkedValues = linkedValues;
  }
  dispatchEvent(new CustomEvent("update", { bubbles, detail }));
};

// The other scale a popover's scale change moves while the aspect ratio is
// kept.
const selectPopoverLinkedValues = (store, { name, value } = {}) =>
  hasAspectRatioToggle(name) && store.selectScaleAspectRatioLocked()
    ? getLinkedScaleValues({ name, value, values: store.selectValues() })
    : undefined;

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

const getCurrentTextRevealIndicatorFormValues = (refs) => {
  return Object.assign({}, refs.textRevealIndicatorForm?.getValues?.() ?? {});
};

const createTextRevealIndicatorFormValuesForImage = (
  { store },
  { currentValues = {}, imageId } = {},
) => {
  const imageItem = store.selectImageItemById({
    imageId,
  });
  const dimensions = getImageDimensions(imageItem);
  const nextValues = {
    ...currentValues,
    imageId,
  };

  if (dimensions.width !== undefined) {
    nextValues.width = dimensions.width;
  }
  if (dimensions.height !== undefined) {
    nextValues.height = dimensions.height;
  }

  return nextValues;
};

const createTextRevealIndicatorFormValuesForSpritesheet = (
  { store },
  { currentValues = {}, resourceId, animationName } = {},
) => {
  const spritesheetItem = store.selectSpritesheetItemById({
    resourceId,
  });
  const dimensions = getSpritesheetAnimationDimensions(
    spritesheetItem,
    animationName,
  );
  const nextValues = {
    ...currentValues,
    kind: "spritesheet",
    resourceId,
    animationName,
    imageId: undefined,
  };

  if (dimensions.width !== undefined) {
    nextValues.width = dimensions.width;
  }
  if (dimensions.height !== undefined) {
    nextValues.height = dimensions.height;
  }

  return nextValues;
};

// The size the picked visual fills in can be past the sliders' range, which
// bounds a typed value, so the range reaches it in a render first.
const setTextRevealIndicatorDialogImage = (deps, { imageId } = {}) => {
  const { refs, render, store } = deps;
  const nextValues = createTextRevealIndicatorFormValuesForImage(
    { store },
    {
      currentValues: getCurrentTextRevealIndicatorFormValues(refs),
      imageId,
    },
  );

  store.setTextRevealIndicatorDialogImage({
    imageId,
  });
  render();
  refs.textRevealIndicatorForm?.setValues?.({
    values: nextValues,
  });
};

const setTextRevealIndicatorDialogSpritesheet = (
  deps,
  { resourceId, animationName } = {},
) => {
  const { refs, render, store } = deps;
  const nextValues = createTextRevealIndicatorFormValuesForSpritesheet(
    { store },
    {
      currentValues: getCurrentTextRevealIndicatorFormValues(refs),
      resourceId,
      animationName,
    },
  );

  store.setTextRevealIndicatorDialogSpritesheet({
    resourceId,
    animationName,
  });
  render();
  refs.textRevealIndicatorForm?.setValues?.({
    values: nextValues,
  });
};

const createNextTextRevealIndicatorValue = (
  indicator,
  { stateName, visual } = {},
) => {
  const nextIndicator =
    indicator && typeof indicator === "object" && !Array.isArray(indicator)
      ? structuredClone(indicator)
      : {};

  if (visual === undefined) {
    delete nextIndicator[stateName];
  } else {
    nextIndicator[stateName] = visual;
  }

  if (!nextIndicator.revealing && !nextIndicator.complete) {
    return undefined;
  }

  return nextIndicator;
};

const getMeasuredTextWidth = (metrics = {}) => {
  const measuredWidth = Number(metrics.measuredWidth);
  if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
    return Math.round(measuredWidth);
  }

  const width = Number(metrics.width);
  if (Number.isFinite(width) && width > 0) {
    return Math.round(width);
  }

  return undefined;
};

const getPositiveRoundedNumber = (value) => {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    return Math.round(number);
  }

  return undefined;
};

const getTextFixedWidthFallback = ({ props, values } = {}) => {
  const wordWrapWidth = getPositiveRoundedNumber(
    values?.textStyle?.wordWrapWidth,
  );
  if (wordWrapWidth !== undefined) {
    return wordWrapWidth;
  }

  const projectWidth = getPositiveRoundedNumber(
    props?.projectResolution?.width,
  );
  if (projectWidth !== undefined) {
    return Math.min(projectWidth, DEFAULT_TEXT_FIXED_WIDTH);
  }

  return DEFAULT_TEXT_FIXED_WIDTH;
};

const getMeasuredDimension = (metrics = {}, name) => {
  const measuredValue = Number(metrics?.[name]);
  if (Number.isFinite(measuredValue) && measuredValue > 0) {
    return Math.round(measuredValue);
  }

  return undefined;
};

const isDirectedContainerSizeMode = (deps) => {
  const capabilities =
    getLayoutEditorElementDefinition(deps.props.itemType)?.capabilities ?? {};
  const values = deps.store.selectValues();

  return (
    capabilities.supportsDirection === true &&
    (values.direction === "horizontal" || values.direction === "vertical")
  );
};

const applySizeModeUpdate = (deps, { name, value } = {}) => {
  const { props, store } = deps;
  const fieldName = name === "heightMode" ? "height" : "width";
  const isTextWidthMode =
    fieldName === "width" && props.itemType?.startsWith("text") === true;
  const usesDirectedContainerAutoSize = isDirectedContainerSizeMode(deps);
  const selectedElementMetrics =
    store.selectSelectedElementMetrics?.() ?? props.selectedElementMetrics;

  if (!isTextWidthMode && !usesDirectedContainerAutoSize) {
    return;
  }

  if (value === "auto") {
    applyPanelValueUpdate(deps, {
      name: fieldName,
      value: isTextWidthMode ? undefined : 0,
    });
    return;
  }

  if (value !== "fixed") {
    return;
  }

  const values = store.selectValues();
  const currentSize = Number(values[fieldName]);
  const nextSize = isTextWidthMode
    ? (getMeasuredTextWidth(selectedElementMetrics) ??
      (Number.isFinite(currentSize) && currentSize > 0
        ? currentSize
        : undefined) ??
      getTextFixedWidthFallback({ props, values }))
    : (getMeasuredDimension(selectedElementMetrics, fieldName) ??
      (Number.isFinite(currentSize) && currentSize > 0
        ? currentSize
        : undefined) ??
      100);

  applyPanelValueUpdate(deps, {
    name: fieldName,
    value: nextSize,
  });
};

const normalizePanelValue = (name, value) => {
  const normalizedValue =
    INTEGER_ONLY_FIELDS.has(name) && Number.isFinite(Number(value))
      ? Math.round(Number(value))
      : value;

  if (name === "rotation" && Number.isFinite(Number(normalizedValue))) {
    return normalizeLayoutRotation(Number(normalizedValue));
  }
  return normalizedValue;
};

// Show a popover value on the canvas while it is chosen. The owner keeps it
// out of the saved layout until an update arrives, and drops it on
// preview-cancel. Only plain numbers preview; a variable is applied on save.
const emitPanelPreview = (deps, { name, value } = {}) => {
  const { dispatchEvent, store } = deps;
  if (!name || value === "" || !Number.isFinite(Number(value))) {
    return;
  }

  const detail = {
    formValues: store.selectValues(),
    name,
    value: normalizePanelValue(name, Number(value)),
  };
  const linkedValues = selectPopoverLinkedValues(store, { name, value });
  if (linkedValues) {
    detail.linkedValues = linkedValues;
  }
  dispatchEvent(new CustomEvent("preview", { detail }));
};

const applyPanelValueUpdate = (
  deps,
  {
    name,
    value,
    linkedValues,
    closePopover = false,
    closeImageSelector = false,
  } = {},
) => {
  const { store, render } = deps;
  let normalizedValue = normalizePanelValue(name, value);

  if (
    SOUND_ID_FIELDS.has(name) &&
    (normalizedValue === "" || normalizedValue === null)
  ) {
    normalizedValue = undefined;
  }

  if (name === "sliderRuntimeValueId") {
    const runtimeId =
      typeof normalizedValue === "string" ? normalizedValue : "";
    const currentValues = store.selectValues();
    const manualInitialValue = Number(currentValues.sliderManualInitialValue);
    const runtimeField = getRuntimeFieldItem(runtimeId);
    const runtimeDefaultValue = Number(runtimeField?.default);
    const nextMin = Number(currentValues.min);
    const nextMax = Number(currentValues.max);
    const pendingUpdates = [];
    const nextInitialValue = runtimeId
      ? toRuntimeTemplateValue(runtimeId)
      : Number.isFinite(manualInitialValue)
        ? manualInitialValue
        : 0;

    if (runtimeId && Number.isFinite(runtimeDefaultValue)) {
      const normalizedMin = Number.isFinite(nextMin) ? nextMin : 0;
      const normalizedMax = Number.isFinite(nextMax) ? nextMax : 100;
      const widenedMin = Math.min(normalizedMin, runtimeDefaultValue);
      const widenedMax = Math.max(normalizedMax, runtimeDefaultValue);

      if (widenedMin !== normalizedMin) {
        store.updateValueProperty({
          name: "min",
          value: widenedMin,
        });
        pendingUpdates.push({
          name: "min",
          value: widenedMin,
        });
      }

      if (widenedMax !== normalizedMax) {
        store.updateValueProperty({
          name: "max",
          value: widenedMax,
        });
        pendingUpdates.push({
          name: "max",
          value: widenedMax,
        });
      }
    }

    store.updateValueProperty({
      name: "sliderRuntimeValueId",
      value: runtimeId,
    });
    store.updateValueProperty({
      name: "initialValue",
      value: nextInitialValue,
    });

    render();
    pendingUpdates.forEach((update) => {
      emitPanelUpdate(deps, update);
    });
    emitPanelUpdate(deps, {
      name: "initialValue",
      value: nextInitialValue,
    });
    return;
  }

  if (name === "sliderManualInitialValue") {
    const nextInitialValue = Number(normalizedValue);

    store.updateValueProperty({
      name: "sliderManualInitialValue",
      value: nextInitialValue,
    });
    store.updateValueProperty({
      name: "initialValue",
      value: nextInitialValue,
    });

    if (closePopover) {
      store.closePopoverForm();
    }

    render();
    emitPanelUpdate(deps, {
      name: "initialValue",
      value: nextInitialValue,
    });
    return;
  }

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
    for (const [linkedName, linkedValue] of Object.entries(
      linkedValues ?? {},
    )) {
      store.updateValueProperty({ name: linkedName, value: linkedValue });
    }
  }

  if (closePopover) {
    store.closePopoverForm();
  }

  if (closeImageSelector) {
    store.closeImageSelectorDialog();
  }

  render();
  emitPanelUpdate(deps, { name, value: normalizedValue, linkedValues });
};

const openSoundForm = (deps, { name } = {}) => {
  const { render, store } = deps;
  const config = SOUND_FORM_CONFIG_BY_ID_FIELD[name];
  if (!config) {
    return;
  }

  store.openSoundFormDialog({
    name,
    volumeName: config.volumeName,
    stopTimingName: config.stopTimingName,
  });
  render();
};

const removeSoundVariant = (deps, { name } = {}) => {
  const { render, store } = deps;
  const config = SOUND_FORM_CONFIG_BY_ID_FIELD[name];
  if (!config) {
    return false;
  }

  store.updateValueProperty({
    name,
    value: undefined,
  });
  for (const optionName of [config.volumeName, config.stopTimingName]) {
    if (optionName) {
      store.updateValueProperty({
        name: optionName,
        value: undefined,
      });
    }
  }
  render();
  emitPanelUpdate(deps, {
    name,
    value: undefined,
  });
  if (config.stopTimingName) {
    emitPanelUpdate(deps, { name: config.stopTimingName, value: undefined });
  }
  return true;
};

export const handleBeforeMount = (deps) => {
  const { props, store, uiConfig } = deps;
  const values = props.values || {};
  store.setUiConfig({
    uiConfig,
  });
  store.setValues({
    values,
  });
  store.setImagesData({
    imagesData: props.imagesData || EMPTY_TREE,
  });
  store.setSoundsData({
    soundsData: props.soundsData || EMPTY_TREE,
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
  store.setSelectedElementMetrics?.({
    metrics: props.selectedElementMetrics,
  });
};

export const handleAfterMount = () => {};

export const setSelectedElementMetrics = (deps, { metrics } = {}) => {
  deps.store.setSelectedElementMetrics?.({
    metrics,
  });
};

export const getSelectedElementMetrics = (deps) => {
  return deps.store.selectSelectedElementMetrics?.();
};

export const setTransientValues = (deps, { values = {} } = {}) => {
  const { store, render } = deps;

  for (const [name, value] of Object.entries(values)) {
    const normalizedValue =
      name === "rotation" && Number.isFinite(Number(value))
        ? normalizeLayoutRotation(Number(value))
        : value;

    store.updateValueProperty({
      name,
      value: normalizedValue,
    });
  }
  render();
};

export const handleOnUpdate = (deps, payload) => {
  const { oldProps, newProps } = payload;
  const { store, render } = deps;
  const valuesEquivalent = arePlainObjectsShallowEqual(
    oldProps?.values || {},
    newProps?.values || {},
  );

  if (
    oldProps?.key === newProps?.key &&
    oldProps?.mode === newProps?.mode &&
    valuesEquivalent &&
    oldProps?.projectResolution === newProps?.projectResolution &&
    oldProps?.layoutsData === newProps?.layoutsData &&
    oldProps?.imagesData === newProps?.imagesData &&
    oldProps?.soundsData === newProps?.soundsData &&
    oldProps?.spritesheetsData === newProps?.spritesheetsData &&
    oldProps?.particlesData === newProps?.particlesData &&
    oldProps?.variablesData === newProps?.variablesData &&
    oldProps?.textStylesData === newProps?.textStylesData &&
    oldProps?.selectedElementMetrics === newProps?.selectedElementMetrics
  ) {
    return;
  }

  if (oldProps?.values?.id !== newProps?.values?.id) {
    store.resetForSelectionChange?.();
  }

  store.setValues({
    values: newProps.values || {},
  });
  store.setImagesData({
    imagesData: newProps.imagesData || EMPTY_TREE,
  });
  store.setSoundsData({
    soundsData: newProps.soundsData || EMPTY_TREE,
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
  store.setSelectedElementMetrics?.({
    metrics: newProps.selectedElementMetrics,
  });

  // An open popover's form depends on the values and the resolution only.
  // Rebuilding it remounts the form, which ends a slider drag, so other
  // props must not: the element's metrics change on every move while a
  // popover previews on the canvas.
  const popover = store.selectPopoverForm();
  if (
    popover.open &&
    (!valuesEquivalent ||
      oldProps?.projectResolution !== newProps?.projectResolution)
  ) {
    store.updatePopoverFormContext({
      values: popover.defaultValues,
      name: popover.name,
      projectResolution: newProps.projectResolution,
      copy: selectCopy(deps),
    });
  }

  render();
};

export const handleGroupItemClick = (deps, payload) => {
  const { props, render, store } = deps;
  const copy = selectCopy(deps);
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;
  const popoverForm = store.selectFieldPopoverForm({ name });
  const bounds = _event.currentTarget.getBoundingClientRect?.();
  const x = Number.isFinite(_event.clientX)
    ? _event.clientX
    : (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2;
  const y = Number.isFinite(_event.clientY)
    ? _event.clientY
    : (bounds?.bottom ?? 0);
  store.openPopoverForm({
    x,
    y,
    name,
    form: popoverForm,
    projectResolution: props.projectResolution,
    copy,
  });

  render();
};

export const handleGroupItemKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  handleGroupItemClick(deps, payload);
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
  const targetValueKindByTarget =
    store.selectVisibilityConditionTargetValueKindByTarget();
  const currentVisibilityCondition = splitVisibilityConditionFromWhen(
    store.selectValues()["$when"],
  ).visibilityCondition;
  const target = currentVisibilityCondition?.target;

  store.setVisibilityConditionDialogSelectedVariableType({
    selectedVariableType: target
      ? (targetTypeByTarget?.[target] ?? "string")
      : undefined,
    selectedValueKind: target
      ? (targetValueKindByTarget?.[target] ??
        targetTypeByTarget?.[target] ??
        "string")
      : undefined,
  });
  store.openVisibilityConditionDialog();
  render();
};

export const handleVisibilityConditionContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const copy = selectCopy(deps);
  payload._event.preventDefault();

  const targetName = payload._event.currentTarget?.dataset?.name;
  if (!targetName) {
    return;
  }

  store.showContextMenu({
    targetName,
    x: payload._event.clientX,
    y: payload._event.clientY,
    copy,
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
  const copy = selectCopy(deps);
  payload._event.preventDefault();

  const name = payload._event.currentTarget.dataset.name;
  if (!name) {
    return;
  }

  store.showContextMenu({
    targetName: name,
    x: payload._event.clientX,
    y: payload._event.clientY,
    copy,
  });
  render();
};

export const handleBlurItemClick = (deps) => {
  const { render, store } = deps;
  store.openSpriteBlurDialog();
  render();
};

export const handleTextContentItemClick = (deps) => {
  const { render, store } = deps;
  store.openTextContentDialog();
  render();
};

export const handleBlurItemRightClick = async (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const { _event: event } = payload;
  event.preventDefault();

  const result = await appService.showDropdownMenu({
    items: [
      { type: "item", label: copy.removeMenuItem ?? "Remove", key: "remove" },
    ],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });

  if (result?.item?.key !== "remove") {
    return;
  }

  applyPanelValueUpdate(deps, {
    name: "blur",
    value: undefined,
  });
};

// Closing the popover without submitting it drops its canvas preview.
export const handlePopverFormClose = (deps) => {
  const { dispatchEvent, render, store } = deps;
  store.closePopoverForm();
  render();
  dispatchEvent(new CustomEvent("preview-cancel"));
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

export const handleSpriteBlurDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeSpriteBlurDialog();
  render();
};

export const handleTextRevealIndicatorDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeTextRevealIndicatorDialog();
  render();
};

export const handleTextContentDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeTextContentDialog();
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

// The type and value kind of a condition form's target, which pick the value
// field it shows.
const selectConditionTargetKinds = (store, target) => {
  if (!target) {
    return { selectedVariableType: undefined, selectedValueKind: undefined };
  }

  const selectedVariableType =
    store.selectVisibilityConditionTargetTypeByTarget()?.[target] ?? "string";
  const selectedValueKind =
    store.selectVisibilityConditionTargetValueKindByTarget()?.[target] ??
    selectedVariableType;
  return { selectedVariableType, selectedValueKind };
};

// A picked target starts at Equals, and a Boolean target at True, whichever
// target came before. Undefined when the form already has them.
const getConditionTargetDefaults = (values, selectedVariableType) => {
  if (!values.target) {
    return undefined;
  }

  const nextValues = { ...values };
  let hasDefaults = false;
  if (values.op === undefined) {
    nextValues.op = "eq";
    hasDefaults = true;
  }
  if (selectedVariableType === "boolean" && values.booleanValue === undefined) {
    nextValues.booleanValue = true;
    hasDefaults = true;
  }
  return hasDefaults ? nextValues : undefined;
};

// The form fills a field only once it shows, so a target's defaults go in
// after the render that shows its value field.
export const handleVisibilityConditionFormChange = (deps, payload) => {
  const { refs, render, store } = deps;
  const values = payload._event.detail?.values ?? {};
  const kinds = selectConditionTargetKinds(store, values.target);

  store.setVisibilityConditionDialogSelectedVariableType(kinds);
  render();

  const defaults = getConditionTargetDefaults(
    values,
    kinds.selectedVariableType,
  );
  if (defaults) {
    refs.visibilityConditionForm.setValues({ values: defaults });
  }
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { render, store } = deps;
  const detail = payload._event.detail || {};
  const item = detail.item || detail;
  const targetName = store.selectDropdownMenu().targetName;

  store.hideContextMenu();

  if (targetName === TEXT_REVEAL_INDICATOR_VISUAL_SOURCE_TARGET) {
    const dialog = store.selectTextRevealIndicatorDialog();
    if (item.value === "image") {
      store.openImageSelectorDialog({
        source: "textRevealIndicator",
        selectedImageId: dialog.imageId,
      });
    } else if (item.value === "spritesheet") {
      store.openSpritesheetSelectorDialog({
        source: "textRevealIndicator",
        selectedSpritesheetValue: toSpritesheetAnimationSelectionValue(
          dialog.resourceId,
          dialog.animationName,
        ),
      });
    }
    render();
    return;
  }

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
  const { refs, render, store } = deps;
  const values = payload._event.detail?.values ?? {};
  const kinds = selectConditionTargetKinds(store, values.target);

  store.setConditionalOverrideConditionDialogSelectedVariableType(kinds);
  render();

  const defaults = getConditionTargetDefaults(
    values,
    kinds.selectedVariableType,
  );
  if (defaults) {
    refs.conditionalOverrideConditionForm.setValues({ values: defaults });
  }
};

export const handleOptionSelected = (deps, payload) => {
  const { render, store } = deps;
  const { _event } = payload;
  const name = _event.currentTarget.dataset.name;
  const value = _event.detail?.item?.value ?? _event.detail?.value;

  if (name === "widthMode" || name === "heightMode") {
    applySizeModeUpdate(deps, { name, value });
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

  if (
    SOUND_FORM_CONFIG_BY_ID_FIELD[name] &&
    (value === "" || value === null || value === undefined)
  ) {
    removeSoundVariant(deps, { name });
    return;
  }

  applyPanelValueUpdate(deps, {
    name,
    value,
    closePopover: true,
  });
};

export const handleSectionActionClick = async (deps, payload) => {
  const { render, store, appService, refs, props } = deps;
  const copy = selectCopy(deps);
  const { _event } = payload;
  const id = _event.currentTarget.dataset.id;

  if (id === "actions") {
    const result = await appService.showDropdownMenu({
      items: getAvailableActionInteractionItems(props.itemType, copy),
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
      items.push({
        type: "item",
        label: copy.defaultLabel ?? "Default",
        key: "imageId",
      });
    }
    if (!hoverImageId) {
      items.push({
        type: "item",
        label: copy.hoverLabel ?? "Hover",
        key: "hoverImageId",
      });
    }
    if (!clickImageId) {
      items.push({
        type: "item",
        label: copy.clickLabel ?? "Click",
        key: "clickImageId",
      });
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
        label: copy.hoverLabel ?? "Hover",
        key: "hoverTextStyleId",
      });
    }
    if (!clickTextStyleId) {
      variantItems.push({
        type: "item",
        label: copy.clickedLabel ?? "Clicked",
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
  } else if (id === "sounds") {
    const variantItems = [];
    const { hoverSoundId, clickSoundId } = store.selectValues();
    if (!hoverSoundId) {
      variantItems.push({
        type: "item",
        label: copy.hoverLabel ?? "Hover",
        key: "hoverSoundId",
      });
    }
    if (!clickSoundId) {
      variantItems.push({
        type: "item",
        label: copy.clickLabel ?? "Click",
        key: "clickSoundId",
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

    openSoundForm(deps, {
      name: variantResult.item.key,
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
    const items = getAvailableChildInteractionItems(
      store.selectValues(),
      copy,
    ).map((item) => ({
      type: "item",
      label: item.label,
      key: item.name,
    }));

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
  } else if (id === "blur") {
    store.openSpriteBlurDialog();
    render();
  } else if (id === "textRevealing") {
    const result = await appService.showDropdownMenu({
      items: [
        {
          type: "item",
          label: copy.revealingSoundLabel ?? "Revealing Sound",
          key: "revealSoundId",
        },
      ],
      x: _event.clientX,
      y: _event.clientY,
      place: "bs",
    });
    if (!result?.item?.key) {
      return;
    }

    openSoundForm(deps, {
      name: result.item.key,
    });
  } else if (id === "textRevealIndicator") {
    const currentValues = store.selectValues();
    const items = createTextRevealIndicatorAddItems(currentValues.indicator, {
      copy,
    });
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

    store.openTextRevealIndicatorDialog({
      stateName: result.item.key,
    });
    render();
  }
};

export const handleSectionTooltipMouseEnter = (deps, payload) => {
  const { render, store } = deps;
  const target = payload._event.currentTarget;
  const rect = target.getBoundingClientRect();

  store.showSectionTooltip({
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    content: target.dataset.tooltip,
  });
  render();
};

export const handleSectionTooltipMouseLeave = (deps) => {
  const { render, store } = deps;
  store.hideSectionTooltip();
  render();
};

export const handleFormActions = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  const { name } = store.selectPopoverForm();
  const { value } = _event.detail.values;
  applyPanelValueUpdate(deps, {
    name,
    value,
    linkedValues: selectPopoverLinkedValues(store, { name, value }),
    closePopover: true,
  });
};

// Turning the aspect ratio on or off shows the popover's value on the
// canvas again, with or without the other scale.
export const handleScaleAspectRatioChange = (deps, payload) => {
  const { render, store } = deps;
  store.setScaleAspectRatioLocked({ locked: payload._event.detail.value });
  render();
  const { name, defaultValues } = store.selectPopoverForm();
  emitPanelPreview(deps, { name, value: defaultValues.value });
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
  const targetValueKind =
    store.selectVisibilityConditionTargetValueKindByTarget()?.[target] ||
    targetType;

  let conditionValue = values.stringValue ?? "";
  if (targetType === "boolean") {
    conditionValue = values.booleanValue === true;
  } else if (targetType === "number") {
    const parsedNumber = Number(values.numberValue);
    conditionValue = Number.isFinite(parsedNumber) ? parsedNumber : 0;
  } else if (targetValueKind === "character") {
    conditionValue = values.characterValue ?? "";
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
    const parsedPaginationSize = Number(values.paginationSize);
    applyPanelValueUpdate(deps, {
      name: "paginationSize",
      value:
        Number.isFinite(parsedPaginationSize) && parsedPaginationSize > 0
          ? parsedPaginationSize
          : 1,
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
  applyPanelValueUpdate(deps, {
    name: "scrollUp.inheritToChildren",
    value: values.scrollUp?.inheritToChildren === true ? true : undefined,
  });
  applyPanelValueUpdate(deps, {
    name: "scrollDown.inheritToChildren",
    value: values.scrollDown?.inheritToChildren === true ? true : undefined,
  });

  store.closeChildInteractionDialog();
  render();
};

export const handleSpriteBlurFormAction = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const { actionId, values = {} } = detail;

  if (actionId === "cancel") {
    store.closeSpriteBlurDialog();
    render();
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  store.closeSpriteBlurDialog();
  applyPanelValueUpdate(deps, {
    name: "blur",
    value: createSpriteBlurFromDialogValues(values),
  });
};

export const handleTextRevealIndicatorImageFieldClick = (deps, payload) => {
  const { render, store } = deps;
  const dialog = store.selectTextRevealIndicatorDialog();

  if (!dialog.open) {
    return;
  }

  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.showContextMenu({
    targetName: TEXT_REVEAL_INDICATOR_VISUAL_SOURCE_TARGET,
    x: rect.left,
    y: rect.bottom,
    items: createTextRevealIndicatorVisualSourceItems(selectCopy(deps)),
  });
  render();
};

// The image field is a button: Enter or Space opens its menu too.
export const handleTextRevealIndicatorImageFieldKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") {
    return;
  }

  _event.preventDefault();
  handleTextRevealIndicatorImageFieldClick(deps, payload);
};

export const handleTextRevealIndicatorFormAction = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const dialog = store.selectTextRevealIndicatorDialog();
  const stateName = dialog.stateName;
  const kind = dialog.kind === "spritesheet" ? "spritesheet" : "image";
  const hasVisual =
    kind === "spritesheet"
      ? dialog.resourceId && dialog.animationName
      : dialog.imageId;

  if (detail.actionId === "cancel") {
    store.closeTextRevealIndicatorDialog();
    render();
    return;
  }

  if (detail.actionId !== "submit" || !stateName) {
    return;
  }

  if (!hasVisual) {
    const copy = selectCopy(deps);
    store.setTextRevealIndicatorDialogValidationErrors({
      errors: {
        imageId: copy.visualRequired ?? "Visual is required.",
      },
    });
    render();
    return;
  }

  const visual = createTextRevealIndicatorVisualFromDialogValues({
    ...detail.values,
    kind,
    imageId: dialog.imageId,
    resourceId: dialog.resourceId,
    animationName: dialog.animationName,
  });
  const indicator = createNextTextRevealIndicatorValue(
    store.selectValues().indicator,
    {
      stateName,
      visual,
    },
  );

  store.closeTextRevealIndicatorDialog();
  applyPanelValueUpdate(deps, {
    name: "indicator",
    value: indicator,
  });
};

export const handleTextContentFormAction = (deps, payload) => {
  const { refs, render, store } = deps;
  const detail = payload._event.detail || {};
  const editor =
    refs.textContentEditor ??
    payload._event.currentTarget?.querySelector?.(
      "rvn-lexical-layout-text-editor",
    );

  if (detail.actionId === "cancel") {
    store.closeTextContentDialog();
    render();
    return;
  }

  if (detail.actionId !== "submit") {
    return;
  }

  const content = editor?.getContent?.();
  store.closeTextContentDialog();
  applyPanelValueUpdate(deps, {
    name: "content",
    value: content,
  });
};

const getConditionalOverrideRules = (store) => {
  const currentRules = store.selectValues().conditionalOverrides;
  return Array.isArray(currentRules) ? [...currentRules] : [];
};

const confirmConditionalOverrideDelete = async (deps, ruleLocator) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  const confirmed = await appService.showDialog({
    title: copy.deleteConditionTitle ?? "Delete Condition?",
    message:
      copy.deleteConditionMessage ??
      "Delete this condition? This cannot be undone.",
    confirmText: copy.deleteButton ?? "Delete",
    cancelText: copy.cancelButton ?? "Cancel",
  });
  if (!confirmed) {
    return;
  }

  const currentRules = getConditionalOverrideRules(store);
  const matchingIndex = findConditionalOverrideRuleIndex({
    rules: currentRules,
    locator: ruleLocator,
  });
  if (!Number.isInteger(matchingIndex)) {
    return;
  }

  const nextRules = currentRules.filter(
    (_rule, ruleIndex) => ruleIndex !== matchingIndex,
  );
  applyPanelValueUpdate(deps, {
    name: "conditionalOverrides",
    value: nextRules.length > 0 ? nextRules : undefined,
  });
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
  const targetValueKindByTarget =
    store.selectVisibilityConditionTargetValueKindByTarget();

  store.openConditionalOverrideConditionDialog({
    editingIndex: Number.isInteger(index) && index >= 0 ? index : undefined,
    draftSet: rule?.set,
    selectedVariableType: rule?.when?.target
      ? (targetTypeByTarget?.[rule.when.target] ?? "string")
      : undefined,
    selectedValueKind: rule?.when?.target
      ? (targetValueKindByTarget?.[rule.when.target] ??
        targetTypeByTarget?.[rule.when.target] ??
        "string")
      : undefined,
  });
  render();
};

export const handleConditionalOverrideContextMenu = async (deps, payload) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  const event = payload._event;
  event.preventDefault();
  const index = Number.parseInt(event.currentTarget.dataset.index, 10);
  const rules = getConditionalOverrideRules(store);

  if (!Number.isInteger(index) || index < 0 || index >= rules.length) {
    return;
  }

  const ruleLocator = createConditionalOverrideRuleLocator({ rules, index });

  const result = await appService.showDropdownMenu({
    items: [
      {
        type: "item",
        label: copy.deleteMenuItem ?? "Delete",
        key: "delete",
      },
    ],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (result?.item?.key !== "delete") {
    return;
  }

  await confirmConditionalOverrideDelete(deps, ruleLocator);
};

// The condition dialog's Add Attribute edits a new attribute of its draft.
export const handleConditionalOverrideAddAttributeClick = (deps) => {
  const { appService, props, render, store } = deps;
  const availableAttributeOptions = getConditionalOverrideAttributeOptions({
    rule: { set: store.selectConditionalOverrideDraftSet() },
    capabilities:
      getLayoutEditorElementDefinition(props.itemType)?.capabilities ?? {},
  });

  if (availableAttributeOptions.length === 0) {
    const copy = selectCopy(deps);
    appService.showAlert({
      message:
        copy.allSupportedAttributesAdded ??
        "All supported attributes are already added.",
    });
    return;
  }

  store.openConditionalOverrideAttributeDialog({
    fieldName: undefined,
    selectedAnchor: { x: 0, y: 0 },
  });
  render();
};

// An attribute in the condition dialog opens to edit it in the draft.
export const handleConditionalOverrideAttributeClick = (deps, payload) => {
  const { render, store } = deps;
  const { fieldName } = payload._event.currentTarget.dataset;
  const draftSet = store.selectConditionalOverrideDraftSet();
  const selectedImageId = CONDITIONAL_OVERRIDE_IMAGE_FIELDS.has(fieldName)
    ? draftSet[fieldName]
    : undefined;
  const selectedAnchor = {
    x: Number.isFinite(draftSet.anchorX) ? draftSet.anchorX : 0,
    y: Number.isFinite(draftSet.anchorY) ? draftSet.anchorY : 0,
  };

  store.openConditionalOverrideAttributeDialog({
    fieldName,
    selectedImageId,
    selectedAnchor,
  });
  render();
};

// An attribute in the condition dialog is removed from the draft from its
// right-click menu.
export const handleConditionalOverrideDraftAttributeContextMenu = async (
  deps,
  payload,
) => {
  const { appService, render, store } = deps;
  const copy = selectCopy(deps);
  const event = payload._event;
  event.preventDefault();
  const { fieldName } = event.currentTarget.dataset;

  const result = await appService.showDropdownMenu({
    items: [
      { type: "item", label: copy.removeButton ?? "Remove", key: "remove" },
    ],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (result?.item?.key !== "remove") {
    return;
  }

  store.setConditionalOverrideConditionDialogDraftSet({
    draftSet: deleteConditionalOverrideSetField(
      store.selectConditionalOverrideDraftSet(),
      fieldName,
    ),
  });
  render();
};

export const handleConditionalOverrideAnchorChange = (deps, payload) => {
  const { render, store } = deps;
  const { value } = payload._event.detail;

  store.setConditionalOverrideAttributeDialogAnchor({ anchor: value });
  render();
};

export const handleConditionalOverrideAttributeImageClick = (deps) => {
  const { render, store } = deps;
  const dialog = store.selectConditionalOverrideAttributeDialog();

  store.openImageSelectorDialog({
    selectedImageId: dialog.selectedImageId,
    source: "conditionalOverrideAttribute",
  });
  render();
};

export const handleConditionalOverrideAttributeImageKeyDown = (
  deps,
  payload,
) => {
  if (payload._event.key !== "Enter" && payload._event.key !== " ") {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();
  handleConditionalOverrideAttributeImageClick(deps);
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
  const targetValueKind =
    store.selectVisibilityConditionTargetValueKindByTarget()?.[values.target] ||
    targetType;

  let conditionValue = values.stringValue ?? "";
  if (targetType === "boolean") {
    conditionValue = values.booleanValue === true;
  } else if (targetType === "number") {
    const parsedNumber = Number(values.numberValue);
    conditionValue = Number.isFinite(parsedNumber) ? parsedNumber : 0;
  } else if (targetValueKind === "character") {
    conditionValue = values.characterValue ?? "";
  }

  const nextRule = {
    when: {
      target: values.target,
      op: values.op ?? "eq",
      value: conditionValue,
    },
    set: store.selectConditionalOverrideDraftSet(),
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
      set: nextRule.set,
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
  const isImageAttribute = CONDITIONAL_OVERRIDE_IMAGE_FIELDS.has(
    values.fieldName,
  );
  if (isImageAttribute && !dialog.selectedImageId) {
    const copy = selectCopy(deps);
    store.setConditionalOverrideAttributeDialogValidationErrors({
      errors: {
        selectedImageId: copy.imageRequired ?? "Image is required.",
      },
    });
    render();
    return;
  }

  const attributeValues = { ...values };
  attributeValues.selectedImageId = dialog.selectedImageId;
  if (values.fieldName === "anchor") {
    attributeValues.anchor = dialog.selectedAnchor;
  }

  // The attribute goes into the condition dialog's draft, which its Save
  // saves.
  store.setConditionalOverrideConditionDialogDraftSet({
    draftSet: buildConditionalOverrideSetUpdate(
      store.selectConditionalOverrideDraftSet(),
      attributeValues,
    ),
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

  if (isTextRevealIndicatorItemName(name)) {
    store.openTextRevealIndicatorDialog({
      stateName: getTextRevealIndicatorStateNameFromItemName(name),
    });
    render();
    return;
  }

  if (SOUND_FORM_CONFIG_BY_ID_FIELD[name]) {
    openSoundForm(deps, { name });
    return;
  }

  store.openImageSelectorDialog({
    name,
  });
  render();
};

// Live while a slider moves or a value is typed. It must not rebuild the
// popover form, which would end the slider drag.
export const handlePopoverFormInput = (deps, payload) => {
  const { store } = deps;
  const { name } = store.selectPopoverForm();
  const { value } = payload._event.detail.values;
  // A rebuild while the slider moves starts from where it is, not from the
  // value the popover opened with.
  store.setPopoverFormValue({ value });
  emitPanelPreview(deps, { name, value });
};

export const handlePopoverFormChange = async (deps, payload) => {
  const { props, store, render } = deps;
  const { _event } = payload;
  const { name } = store.selectPopoverForm();

  store.updatePopoverFormContext({
    values: _event.detail.values,
    name,
    projectResolution: props.projectResolution,
    copy: selectCopy(deps),
  });
  render();
  emitPanelPreview(deps, { name, value: _event.detail.values.value });
};

// Presets open a menu of the field's presets, each with its value beside it
// where the label is not the value itself.
export const handlePopoverPresetsButtonClick = async (deps, payload) => {
  const { appService, store } = deps;
  const { presetItems } = store.selectPopoverForm().context;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  const result = await appService.showDropdownMenu({
    items: toSliderPresetMenuItems(presetItems),
    x: rect.left,
    y: rect.bottom,
    place: "bs",
  });

  const value = Number(result?.item?.key);
  if (result?.item === undefined || !Number.isFinite(value)) {
    return;
  }
  applyPopoverValue(deps, value);
};

// The step buttons move the value by the wheel's steps: the field's step,
// or Shift's. Held, a button keeps stepping, so the form takes the value in
// place: rebuilding it would replace the held button.
export const handlePopoverStepPress = (deps, payload) => {
  const { refs, store } = deps;
  const delta = Number(payload._event.currentTarget.dataset.delta);
  const { name, defaultValues } = store.selectPopoverForm();
  const value = Number(defaultValues.value);
  if (!Number.isFinite(value) || !Number.isFinite(delta)) {
    return;
  }

  const nextValue = stepSliderPopoverValue({ name, value, delta });
  store.setPopoverFormValue({ value: nextValue });
  refs.form.setValues({ values: { value: nextValue } });
  emitPanelPreview(deps, { name, value: nextValue });
};

// Shows a value picked in the popover in its form, and previews it.
const applyPopoverValue = (deps, value) => {
  const { props, render, store } = deps;
  const popover = store.selectPopoverForm();
  const { name } = popover;
  if (!name) {
    return;
  }

  store.updatePopoverFormContext({
    values: {
      ...popover.defaultValues,
      value,
    },
    name,
    projectResolution: props.projectResolution,
    copy: selectCopy(deps),
  });
  render();
  emitPanelPreview(deps, { name, value });
};

export const handleListBarItemRightClick = async (deps, payload) => {
  const { render, store, appService } = deps;
  const copy = selectCopy(deps);
  const { _event: event } = payload;
  event.preventDefault();
  const { name } = event.currentTarget.dataset;

  // Prevent removing bar idle image - it's required for slider
  if (name === "barImageId") {
    return;
  }

  const result = await appService.showDropdownMenu({
    items: [
      { type: "item", label: copy.removeMenuItem ?? "Remove", key: "remove" },
    ],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (!result) {
    return;
  }
  const { item } = result;
  if (item.key === "remove") {
    if (isTextRevealIndicatorItemName(name)) {
      const stateName = getTextRevealIndicatorStateNameFromItemName(name);
      const indicator = createNextTextRevealIndicatorValue(
        store.selectValues().indicator,
        {
          stateName,
          visual: undefined,
        },
      );

      store.updateValueProperty({
        name: "indicator",
        value: indicator,
      });
      render();
      emitPanelUpdate(deps, {
        name: "indicator",
        value: indicator,
      });
      return;
    }

    if (removeSoundVariant(deps, { name })) {
      return;
    }

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
  const copy = selectCopy(deps);
  const { _event: event } = payload;
  event.preventDefault();
  const { id, interaction } = event.currentTarget.dataset;
  const interactionKey = getInteractionPropertyName(interaction);
  const result = await appService.showDropdownMenu({
    items: [
      { type: "item", label: copy.removeMenuItem ?? "Remove", key: "remove" },
    ],
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
  const { render, store } = deps;
  const imageId = store.selectTempSelectedImageId();
  const { name, source } = store.selectImageSelectorDialog();

  if (source === "textRevealIndicator") {
    setTextRevealIndicatorDialogImage(deps, {
      imageId,
    });
    store.closeImageSelectorDialog();
    render();
    return;
  }

  if (source === "conditionalOverrideAttribute") {
    store.setConditionalOverrideAttributeDialogImage({ imageId });
    store.closeImageSelectorDialog();
    render();
    return;
  }

  applyPanelValueUpdate(deps, {
    name,
    value: imageId,
    closeImageSelector: true,
  });
};

// --- Sound Selector ---
export const handleSoundFormDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeSoundFormDialog();
  render();
};

export const handleSoundFormSoundFieldClick = (deps) => {
  const { appService, render, store } = deps;
  const copy = selectCopy(deps);
  const dialog = store.selectSoundFormDialog();

  if (!dialog.open) {
    return;
  }

  if (store.selectSoundOptions().length === 0) {
    appService.showAlert({
      message:
        copy.noSoundsAvailable ??
        "No sounds available. Create a sound resource first.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  store.openSoundSelectorDialog({
    selectedSoundId: dialog.selectedSoundId,
  });
  render();
};

export const handleSoundFormSoundFieldKeyDown = (deps, payload) => {
  if (payload._event.key !== "Enter" && payload._event.key !== " ") {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();
  handleSoundFormSoundFieldClick(deps);
};

export const handleSoundFormAction = (deps, payload) => {
  const { render, store } = deps;
  const { actionId, values } = payload._event.detail;

  if (actionId !== "submit") {
    return;
  }

  const dialog = store.selectSoundFormDialog();
  if (!dialog.selectedSoundId) {
    const copy = selectCopy(deps);
    store.setSoundFormDialogValidationErrors({
      errors: {
        soundId: copy.soundRequired ?? "Sound is required.",
      },
    });
    render();
    return;
  }

  store.updateValueProperty({
    name: dialog.name,
    value: dialog.selectedSoundId,
  });

  if (dialog.volumeName) {
    const parsedVolume = Number(values.volume);
    const volume = Number.isFinite(parsedVolume)
      ? Math.max(0, Math.min(100, Math.round(parsedVolume)))
      : 100;

    store.updateValueProperty({
      name: dialog.volumeName,
      value: volume,
    });
  }

  if (dialog.stopTimingName) {
    store.updateValueProperty({
      name: dialog.stopTimingName,
      value: values.stopTiming === "loopEnd" ? "loopEnd" : "immediate",
    });
  }

  store.closeSoundFormDialog();
  render();
  emitPanelUpdate(deps, {
    name: dialog.name,
    value: dialog.selectedSoundId,
  });
  if (dialog.stopTimingName) {
    emitPanelUpdate(deps, {
      name: dialog.stopTimingName,
      value: store.selectValues()[dialog.stopTimingName],
    });
  }
};

export const handleSoundSelectorSoundSelected = (deps, payload) => {
  const { store } = deps;
  const { _event } = payload;
  store.setTempSelectedSoundId({
    soundId: _event.detail.soundId,
  });
};

export const handleSoundSelectorFileExplorerClickItem = (deps, payload) => {
  const itemId = payload?._event?.detail?.itemId;
  if (!itemId) {
    return;
  }

  deps.refs.soundSelector?.transformedHandlers?.handleScrollToItem?.({
    itemId,
  });
};

export const handleSoundSelectorCancel = (deps) => {
  const { store, render } = deps;
  store.closeSoundSelectorDialog();
  render();
};

export const handleSoundSelectorSubmit = (deps) => {
  const { render, store } = deps;
  const soundId = store.selectTempSelectedSoundId();
  store.setSoundFormDialogSoundId({ soundId });
  store.closeSoundSelectorDialog();
  render();
};

// --- Spritesheet Selector ---
export const handleSpritesheetSelectorAnimationSelected = (deps, payload) => {
  const { render, store } = deps;
  const detail = payload?._event?.detail ?? {};
  const selectedSpritesheetValue =
    detail.value ??
    toSpritesheetAnimationSelectionValue(
      detail.resourceId,
      detail.animationName,
    );

  if (!selectedSpritesheetValue) {
    return;
  }

  store.setTempSelectedSpritesheetValue({
    selectedSpritesheetValue,
  });
  render();
};

export const handleSpritesheetSelectorAnimationDoubleClick = (
  deps,
  payload,
) => {
  handleSpritesheetSelectorAnimationSelected(deps, payload);
  handleSpritesheetSelectorSubmit(deps);
};

export const handleSpritesheetSelectorFileExplorerClickItem = (
  deps,
  payload,
) => {
  const itemId = payload?._event?.detail?.itemId;
  if (!itemId) {
    return;
  }

  deps.refs.spritesheetSelector?.transformedHandlers?.handleScrollToItem?.({
    itemId,
  });
};

export const handleSpritesheetSelectorCancel = (deps) => {
  const { store, render } = deps;
  store.closeSpritesheetSelectorDialog();
  render();
};

export const handleSpritesheetSelectorSubmit = (deps) => {
  const { render, store } = deps;
  const selectedSpritesheetValue = store.selectTempSelectedSpritesheetValue();
  const { source } = store.selectSpritesheetSelectorDialog();
  const { resourceId, animationName } = parseSpritesheetAnimationSelectionValue(
    selectedSpritesheetValue,
  );

  if (source === "textRevealIndicator" && resourceId && animationName) {
    setTextRevealIndicatorDialogSpritesheet(deps, {
      resourceId,
      animationName,
    });
  }

  store.closeSpritesheetSelectorDialog();
  render();
};

export const handlePreviewOverlayClick = (deps) => {
  deps.store.hideFullImagePreview();
  deps.render();
};
