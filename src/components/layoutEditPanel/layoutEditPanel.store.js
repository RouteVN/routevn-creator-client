import { parseAndRender } from "jempl";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import {
  getSpritesheetAnimationPreview,
  toSpritesheetAnimationSelectionItems,
  toSpritesheetAnimationSelectionValue,
} from "../../internal/spritesheets.js";
import { toParticleSelectionItems } from "../../internal/particles.js";
import { getVariableOptions } from "../../internal/project/projection.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { getRuntimeNumberFieldOptions } from "../../internal/runtimeFields.js";
import { getFragmentLayoutOptions } from "../../pages/layoutEditor/support/layoutFragments.js";
import { getLayoutEditorElementDefinition } from "../../internal/layoutEditorElementRegistry.js";
import { splitLayoutConditionFromWhen } from "../../internal/layoutConditions.js";
import {
  getVisibilityConditionCharacterValueOptions,
  toVisibilityConditionTargetTypeByTarget,
  toVisibilityConditionTargetValueKindByTarget,
} from "./support/layoutEditPanelFeatures.js";
import {
  createChildInteractionDialogDefaults,
  createChildInteractionForm,
  createConditionalOverrideAttributeDefaults,
  createConditionalOverrideAttributeForm,
  createConditionalOverrideConditionDefaults,
  createConditionalOverrideConditionForm,
  createSaveLoadPaginationDialogDefaults,
  createSaveLoadPaginationForm,
  createVisibilityConditionDialogDefaults,
  createVisibilityConditionForm,
  getChildInteractionSummary,
  getAvailableChildInteractionItems,
  getChildInteractionItems,
  hasChildInteractionInheritance,
  getConditionalOverrideAttributeOptions,
  getConditionalOverrideSummary,
  getSaveLoadPaginationSummary,
  getVisibilityConditionSummary,
  normalizeConditionalOverrideRules,
  toConditionalOverrideAttributeItems,
  toVisibilityConditionTargetOptions,
} from "./support/layoutEditPanelFeatures.js";
import {
  createSpriteBlurDialogDefaults,
  createSpriteBlurForm,
  getSpriteBlurSummary,
  isSpriteBlurValue,
} from "./support/layoutEditPanelBlur.js";
import {
  ACTION_INTERACTION_TYPES,
  REVEAL_EFFECT_OPTIONS,
  createTextContentDialogForm,
  getLayoutEditPanelSections,
  getLayoutInteractionActions,
  selectLayoutEditPanelFieldPopoverForm,
  toImageOptions,
  toInspectorValues,
  toSoundOptions,
  toTextStyleOptions,
} from "./support/layoutEditPanelViewData.js";
import {
  createTextRevealIndicatorDialogDefaults,
  createTextRevealIndicatorForm,
  isTextRevealIndicatorStateName,
} from "./support/layoutEditPanelTextRevealIndicator.js";

const HIDDEN_LAYOUT_ACTION_MODES = new Set(["conditional"]);
const POSITION_POPOVER_NAMES = new Set(["x", "y"]);
const TEXT_CONTENT_MENTION_VARIABLE_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
]);
const CHOICE_ITEM_OPTIONS = Array.from({ length: 20 }, (_item, index) => ({
  label: `Choice ${index + 1}`,
  value: index,
}));
const POSITION_POPOVER_PRESETS = [
  {
    label: "0",
    ratio: 0,
  },
  {
    label: "1/5",
    ratio: 1 / 5,
  },
  {
    label: "1/4",
    ratio: 1 / 4,
  },
  {
    label: "1/3",
    ratio: 1 / 3,
  },
  {
    label: "1/2",
    ratio: 1 / 2,
  },
  {
    label: "2/3",
    ratio: 2 / 3,
  },
  {
    label: "3/5",
    ratio: 3 / 5,
  },
  {
    label: "3/4",
    ratio: 3 / 4,
  },
  {
    label: "4/5",
    ratio: 4 / 5,
  },
  {
    label: "1",
    ratio: 1,
  },
];

const POSITION_PRESETS_SLOT = "position-presets";

const toPanelViewKeyPart = (value, fallback) => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
};

const createPanelViewKey = (...parts) => {
  return parts
    .map((part, index) => toPanelViewKeyPart(part, `part-${index}`))
    .join(":");
};

const annotatePanelNestedItems = (items = [], { parentKey } = {}) => {
  return items.map((item, index) => {
    const nextItem = {
      ...item,
    };
    const itemKeyPart = toPanelViewKeyPart(
      item?.id ?? item?.name ?? item?.fieldName ?? item?.label,
      `item-${index}`,
    );
    nextItem.viewKey = createPanelViewKey(parentKey, itemKeyPart);

    if (Array.isArray(item?.items)) {
      nextItem.items = annotatePanelNestedItems(item.items, {
        parentKey: nextItem.viewKey,
      });
    }

    if (Array.isArray(item?.attributeItems)) {
      nextItem.attributeItems = annotatePanelNestedItems(item.attributeItems, {
        parentKey: createPanelViewKey(nextItem.viewKey, "attributes"),
      });
    }

    return nextItem;
  });
};

const annotatePanelFields = (fields = [], { parentKey } = {}) => {
  return fields.map((field, index) => {
    const nextField = {
      ...field,
    };
    const fieldKeyPart = toPanelViewKeyPart(
      field?.name ?? field?.label,
      `field-${index}`,
    );
    nextField.viewKey = createPanelViewKey(parentKey, fieldKeyPart);
    return nextField;
  });
};

const annotatePanelItems = (items = [], { sectionKey } = {}) => {
  return items.map((item, index) => {
    const nextItem = {
      ...item,
    };
    const itemKeyPart = toPanelViewKeyPart(
      item?.name ?? item?.type,
      `item-${index}`,
    );
    nextItem.viewKey = createPanelViewKey(sectionKey, itemKeyPart);

    if (Array.isArray(item?.fields)) {
      nextItem.fields = annotatePanelFields(item.fields, {
        parentKey: nextItem.viewKey,
      });
    }

    if (Array.isArray(item?.items)) {
      nextItem.items = annotatePanelNestedItems(item.items, {
        parentKey: nextItem.viewKey,
      });
    }

    if (item?.type === "spritesheet-preview") {
      nextItem.previewKey = item?.key ?? nextItem.viewKey;
    }

    return nextItem;
  });
};

const annotatePanelSections = (sections = []) => {
  return sections.map((section, index) => {
    const nextSection = {
      ...section,
    };
    const sectionKeyPart = toPanelViewKeyPart(
      section?.id ?? section?.label,
      `section-${index}`,
    );
    nextSection.viewKey = createPanelViewKey(sectionKeyPart);
    nextSection.items = annotatePanelItems(section?.items ?? [], {
      sectionKey: nextSection.viewKey,
    });
    return nextSection;
  });
};

const getPositionPopoverResolutionDimension = (projectResolution = {}) => {
  const width = Number(projectResolution?.width);
  const height = Number(projectResolution?.height);
  const dimensions = [width, height].filter(
    (value) => Number.isFinite(value) && value > 0,
  );

  if (dimensions.length === 0) {
    return undefined;
  }

  return Math.max(...dimensions);
};

const getPositionPopoverRange = ({
  values = {},
  projectResolution,
  currentValue,
} = {}) => {
  const resolutionDimension =
    getPositionPopoverResolutionDimension(projectResolution);
  if (!Number.isFinite(resolutionDimension) || resolutionDimension <= 0) {
    return undefined;
  }

  let min = -resolutionDimension;
  let max = resolutionDimension * 2;

  const numericValues = [values?.x, values?.y, currentValue]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  for (const value of numericValues) {
    if (value < min) {
      min = Math.floor(value);
    }
    if (value > max) {
      max = Math.ceil(value);
    }
  }

  return {
    min,
    max,
    resolutionDimension,
  };
};

const clonePopoverForm = (form) => {
  if (!form || typeof form !== "object") {
    return form;
  }

  const nextForm = {
    ...form,
  };

  if (Array.isArray(form.fields)) {
    nextForm.fields = form.fields.map((field) => ({
      ...field,
    }));
  }

  if (form.actions && typeof form.actions === "object") {
    nextForm.actions = {
      ...form.actions,
    };

    if (Array.isArray(form.actions.buttons)) {
      nextForm.actions.buttons = form.actions.buttons.map((button) => ({
        ...button,
      }));
    }
  }

  return nextForm;
};

const buildPopoverForm = ({
  form,
  name,
  projectResolution,
  values,
  value,
} = {}) => {
  if (!POSITION_POPOVER_NAMES.has(name)) {
    return form;
  }

  const positionRange = getPositionPopoverRange({
    values,
    projectResolution,
    currentValue: value,
  });
  if (!positionRange) {
    return form;
  }

  const nextForm = clonePopoverForm(form);
  const normalizedFields = Array.isArray(nextForm?.fields)
    ? nextForm.fields.filter((field) => field?.slot !== POSITION_PRESETS_SLOT)
    : [];
  const firstField = normalizedFields[0];
  if (!firstField) {
    return nextForm;
  }
  const remainingFields = normalizedFields.slice(1);

  nextForm.fields = [
    {
      ...firstField,
      type: "slider-with-input",
      min: positionRange.min,
      max: positionRange.max,
      step: 1,
    },
    {
      type: "slot",
      slot: POSITION_PRESETS_SLOT,
      label: "Presets",
    },
    ...remainingFields,
  ];

  return nextForm;
};

const buildPositionPopoverContext = ({
  name,
  projectResolution,
  values,
} = {}) => {
  if (!POSITION_POPOVER_NAMES.has(name)) {
    return {};
  }

  const positionRange = getPositionPopoverRange({
    values,
    projectResolution,
  });
  if (!positionRange) {
    return {};
  }

  return {
    isPositionPopover: true,
    positionPresetItems: POSITION_POPOVER_PRESETS.map((preset) => ({
      label: preset.label,
      ratio: preset.ratio,
      value: Math.round(positionRange.resolutionDimension * preset.ratio),
    })),
  };
};

const isDirectedContainer = (capabilities = {}, values = {}) => {
  return (
    capabilities.supportsDirection === true &&
    (values.direction === "vertical" || values.direction === "horizontal")
  );
};

const isAutoContainerSize = (value) => {
  const parsedValue = Number(value);
  return !Number.isFinite(parsedValue) || parsedValue <= 0;
};

const getTextContentMentionVariableType = (item = {}) => {
  if (item.type === "variable") {
    return String(item.variableType ?? "string").toLowerCase();
  }

  return String(item.variableType ?? item.type ?? "").toLowerCase();
};

const buildTextContentMentionTargets = (variablesData = {}) => {
  const variableItems = variablesData.items || {};
  const flatItems = toFlatItems(variablesData);
  const seenIds = new Set(flatItems.map((item) => item.id));

  for (const [id, item] of Object.entries(variableItems)) {
    if (seenIds.has(id)) {
      continue;
    }

    flatItems.push({
      id,
      ...item,
    });
  }

  return flatItems
    .filter((item) => {
      const variableType = getTextContentMentionVariableType(item);
      return TEXT_CONTENT_MENTION_VARIABLE_TYPES.has(variableType);
    })
    .map((item) => ({
      id: item.id,
      label: item.name || item.id,
      variableType: getTextContentMentionVariableType(item),
    }));
};

const createDefaultValues = () => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  opacity: 1,
  aspectRatioLock: undefined,
  rotation: 0,
  anchor: {
    x: 0,
    y: 0,
  },
  direction: undefined,
  gapX: 0,
  gapY: 0,
  actions: {},
});

const getValueAtPath = (target, path) => {
  if (!path) {
    return undefined;
  }

  return path.split(".").reduce((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return current[key];
  }, target);
};

const resetSelectionUiState = (state) => {
  state.tempSelectedImageId = undefined;
  state.tempSelectedSpritesheetValue = undefined;
  state.imageSelectorDialog = {
    open: false,
    name: undefined,
    source: undefined,
  };
  state.spritesheetSelectorDialog = {
    open: false,
    source: undefined,
  };
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.popover = {
    key: 0,
    x: undefined,
    y: undefined,
    open: false,
    defaultValues: {},
    name: undefined,
    form: undefined,
    context: {},
  };
  state.visibilityConditionDialog = {
    open: false,
    key: 0,
    selectedVariableType: undefined,
    selectedValueKind: undefined,
  };
  state.dropdownMenu = {
    isOpen: false,
    x: 0,
    y: 0,
    targetName: undefined,
    items: [],
  };
  state.saveLoadPaginationDialog = {
    open: false,
    key: 0,
  };
  state.childInteractionDialog = {
    open: false,
    key: 0,
  };
  state.spriteBlurDialog = {
    open: false,
    key: 0,
  };
  state.textRevealIndicatorDialog = {
    open: false,
    key: 0,
    stateName: undefined,
    kind: "image",
    imageId: undefined,
    resourceId: undefined,
    animationName: undefined,
    validationErrors: {},
  };
  state.textContentDialog = {
    open: false,
    key: 0,
  };
  state.conditionalOverrideConditionDialog = {
    open: false,
    key: 0,
    editingIndex: undefined,
    selectedVariableType: undefined,
    selectedValueKind: undefined,
  };
  state.conditionalOverrideAttributeDialog = {
    open: false,
    key: 0,
    editingIndex: undefined,
    fieldName: undefined,
  };
  state.selectedElementMetrics = undefined;
  state.activeInteractionType = "click";
  state.actionsEditorActions = {};
};

export const createInitialState = () => {
  const state = {
    imagesData: { tree: [], items: {} },
    soundsData: { tree: [], items: {} },
    spritesheetsData: { tree: [], items: {} },
    particlesData: { tree: [], items: {} },
    textStylesData: { tree: [], items: {} },
    variablesData: { tree: [], items: {} },
    values: createDefaultValues(),
  };

  resetSelectionUiState(state);
  return state;
};

export const updateValueProperty = ({ state }, { value, name } = {}) => {
  if (!name) {
    return;
  }

  const keys = name.split(".");

  if (keys.length === 1) {
    if (value === undefined) {
      delete state.values[name];
    } else {
      state.values[name] = value;
    }
    return;
  }

  let current = state.values;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }
};

export const openPopoverForm = (
  { state },
  { x, y, name, form, projectResolution } = {},
) => {
  if (!name) {
    return;
  }

  const value = getValueAtPath(state.values, name);
  const popoverFormValues = {
    value,
  };

  if (value && typeof value === "string" && value.startsWith("${")) {
    popoverFormValues.contentType = "variable";
  } else {
    popoverFormValues.contentType = "plain";
  }

  state.popover = {
    key: state.popover.key + 1,
    open: true,
    x,
    y,
    defaultValues: popoverFormValues,
    name,
    form: buildPopoverForm({
      form,
      name,
      projectResolution,
      values: state.values,
      value,
    }),
    context: {
      popoverFormValues,
      ...buildPositionPopoverContext({
        name,
        projectResolution,
        values: state.values,
      }),
    },
  };
};

export const updatePopoverFormContext = (
  { state },
  { values = {}, name, projectResolution } = {},
) => {
  const nextName = name ?? state.popover.name;

  state.popover.context = {
    popoverFormValues: values,
    ...buildPositionPopoverContext({
      name: nextName,
      projectResolution,
      values: state.values,
    }),
  };
  state.popover.defaultValues = values;
  state.popover.form = buildPopoverForm({
    form: state.popover.form,
    name: nextName,
    projectResolution,
    values: state.values,
    value: values.value,
  });
  state.popover.name = nextName;
  state.popover.key = state.popover.key + 1;
};

export const closePopoverForm = ({ state }, _payload = {}) => {
  state.popover = {
    key: 0,
    open: false,
    x: undefined,
    y: undefined,
    defaultValues: {},
    name: undefined,
    form: undefined,
    context: {},
  };
};

export const openVisibilityConditionDialog = ({ state }, _payload = {}) => {
  state.visibilityConditionDialog.open = true;
  state.visibilityConditionDialog.key += 1;
};

export const showContextMenu = (
  { state },
  { targetName, x, y, items } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetName = targetName;
  state.dropdownMenu.items = items ?? [
    { label: "Delete", type: "item", value: "delete" },
  ];
};

export const hideContextMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetName = undefined;
  state.dropdownMenu.items = [];
};

export const openSaveLoadPaginationDialog = ({ state }, _payload = {}) => {
  state.saveLoadPaginationDialog.open = true;
  state.saveLoadPaginationDialog.key += 1;
};

export const openChildInteractionDialog = ({ state }, _payload = {}) => {
  state.childInteractionDialog.open = true;
  state.childInteractionDialog.key += 1;
};

export const openSpriteBlurDialog = ({ state }, _payload = {}) => {
  state.spriteBlurDialog.open = true;
  state.spriteBlurDialog.key += 1;
};

export const closeSaveLoadPaginationDialog = ({ state }, _payload = {}) => {
  state.saveLoadPaginationDialog.open = false;
};

export const closeChildInteractionDialog = ({ state }, _payload = {}) => {
  state.childInteractionDialog.open = false;
};

export const closeSpriteBlurDialog = ({ state }, _payload = {}) => {
  state.spriteBlurDialog.open = false;
};

export const openTextRevealIndicatorDialog = (
  { state },
  { stateName } = {},
) => {
  if (!isTextRevealIndicatorStateName(stateName)) {
    return;
  }

  const defaults = createTextRevealIndicatorDialogDefaults({
    values: state.values,
    stateName,
  });

  state.textRevealIndicatorDialog.open = true;
  state.textRevealIndicatorDialog.key += 1;
  state.textRevealIndicatorDialog.stateName = stateName;
  state.textRevealIndicatorDialog.kind = defaults.kind ?? "image";
  state.textRevealIndicatorDialog.imageId = defaults.imageId || undefined;
  state.textRevealIndicatorDialog.resourceId = defaults.resourceId || undefined;
  state.textRevealIndicatorDialog.animationName =
    defaults.animationName || undefined;
  state.textRevealIndicatorDialog.validationErrors = {};
};

export const closeTextRevealIndicatorDialog = ({ state }, _payload = {}) => {
  state.textRevealIndicatorDialog.open = false;
  state.textRevealIndicatorDialog.stateName = undefined;
  state.textRevealIndicatorDialog.kind = "image";
  state.textRevealIndicatorDialog.imageId = undefined;
  state.textRevealIndicatorDialog.resourceId = undefined;
  state.textRevealIndicatorDialog.animationName = undefined;
  state.textRevealIndicatorDialog.validationErrors = {};
};

export const setTextRevealIndicatorDialogImage = (
  { state },
  { imageId } = {},
) => {
  state.textRevealIndicatorDialog.kind = "image";
  state.textRevealIndicatorDialog.imageId = imageId;
  state.textRevealIndicatorDialog.resourceId = undefined;
  state.textRevealIndicatorDialog.animationName = undefined;
  delete state.textRevealIndicatorDialog.validationErrors.imageId;
};

export const setTextRevealIndicatorDialogSpritesheet = (
  { state },
  { resourceId, animationName } = {},
) => {
  state.textRevealIndicatorDialog.kind = "spritesheet";
  state.textRevealIndicatorDialog.imageId = undefined;
  state.textRevealIndicatorDialog.resourceId = resourceId;
  state.textRevealIndicatorDialog.animationName = animationName;
  delete state.textRevealIndicatorDialog.validationErrors.imageId;
};

export const setTextRevealIndicatorDialogValidationErrors = (
  { state },
  { errors } = {},
) => {
  state.textRevealIndicatorDialog.validationErrors = errors ?? {};
};

export const openTextContentDialog = ({ state }, _payload = {}) => {
  state.textContentDialog.open = true;
  state.textContentDialog.key += 1;
};

export const closeTextContentDialog = ({ state }, _payload = {}) => {
  state.textContentDialog.open = false;
};

export const openConditionalOverrideConditionDialog = (
  { state },
  { editingIndex, selectedVariableType } = {},
) => {
  state.conditionalOverrideConditionDialog.open = true;
  state.conditionalOverrideConditionDialog.key += 1;
  state.conditionalOverrideConditionDialog.editingIndex = editingIndex;
  state.conditionalOverrideConditionDialog.selectedVariableType =
    selectedVariableType;
};

export const closeConditionalOverrideConditionDialog = (
  { state },
  _payload = {},
) => {
  state.conditionalOverrideConditionDialog.open = false;
  state.conditionalOverrideConditionDialog.editingIndex = undefined;
  state.conditionalOverrideConditionDialog.selectedValueKind = undefined;
};

export const closeVisibilityConditionDialog = ({ state }, _payload = {}) => {
  state.visibilityConditionDialog.open = false;
  state.visibilityConditionDialog.selectedValueKind = undefined;
};

export const setVisibilityConditionDialogSelectedVariableType = (
  { state },
  { selectedVariableType, selectedValueKind } = {},
) => {
  state.visibilityConditionDialog.selectedVariableType =
    selectedVariableType ?? "string";
  state.visibilityConditionDialog.selectedValueKind =
    selectedValueKind ?? selectedVariableType ?? "string";
};

export const setConditionalOverrideConditionDialogSelectedVariableType = (
  { state },
  { selectedVariableType, selectedValueKind } = {},
) => {
  state.conditionalOverrideConditionDialog.selectedVariableType =
    selectedVariableType ?? "string";
  state.conditionalOverrideConditionDialog.selectedValueKind =
    selectedValueKind ?? selectedVariableType ?? "string";
};

export const openConditionalOverrideAttributeDialog = (
  { state },
  { editingIndex, fieldName } = {},
) => {
  state.conditionalOverrideAttributeDialog.open = true;
  state.conditionalOverrideAttributeDialog.key += 1;
  state.conditionalOverrideAttributeDialog.editingIndex = editingIndex;
  state.conditionalOverrideAttributeDialog.fieldName = fieldName;
};

export const closeConditionalOverrideAttributeDialog = (
  { state },
  _payload = {},
) => {
  state.conditionalOverrideAttributeDialog.open = false;
  state.conditionalOverrideAttributeDialog.editingIndex = undefined;
  state.conditionalOverrideAttributeDialog.fieldName = undefined;
};

export const selectFieldPopoverForm = ({ constants, props }, { name } = {}) => {
  return selectLayoutEditPanelFieldPopoverForm({ constants, props }, { name });
};

export const selectPopoverForm = ({ state }) => {
  return state.popover;
};

export const openImageSelectorDialog = (
  { state },
  { name, selectedImageId, source = "value" } = {},
) => {
  state.imageSelectorDialog = {
    open: true,
    name,
    source,
  };
  state.tempSelectedImageId =
    selectedImageId ??
    (typeof name === "string" ? getValueAtPath(state.values, name) : undefined);
};

export const closeImageSelectorDialog = ({ state }, _payload = {}) => {
  state.imageSelectorDialog = {
    open: false,
    name: undefined,
    source: undefined,
  };
  state.tempSelectedImageId = undefined;
};

export const openSpritesheetSelectorDialog = (
  { state },
  { selectedSpritesheetValue, source = "value" } = {},
) => {
  state.spritesheetSelectorDialog = {
    open: true,
    source,
  };
  state.tempSelectedSpritesheetValue = selectedSpritesheetValue;
};

export const closeSpritesheetSelectorDialog = ({ state }, _payload = {}) => {
  state.spritesheetSelectorDialog = {
    open: false,
    source: undefined,
  };
  state.tempSelectedSpritesheetValue = undefined;
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewImageId = imageId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
};

export const setValues = ({ state }, { values } = {}) => {
  state.values = values ?? {};
  state.actionsEditorActions = getLayoutInteractionActions(
    state.values,
    state.activeInteractionType,
  );
};

export const setActiveInteractionType = (
  { state },
  { interactionType } = {},
) => {
  if (!ACTION_INTERACTION_TYPES.includes(interactionType)) {
    return;
  }

  state.activeInteractionType = interactionType;
};

export const syncActionsEditorActions = (
  { state },
  { interactionType } = {},
) => {
  const nextInteractionType = ACTION_INTERACTION_TYPES.includes(interactionType)
    ? interactionType
    : state.activeInteractionType;

  state.actionsEditorActions = getLayoutInteractionActions(
    state.values,
    nextInteractionType,
  );
};

export const setActionsEditorActions = ({ state }, { actions } = {}) => {
  state.actionsEditorActions =
    actions && typeof actions === "object" && !Array.isArray(actions)
      ? actions
      : {};
};

export const selectActiveInteractionType = ({ state }) => {
  return state.activeInteractionType ?? "click";
};

export const setTextStylesData = ({ state }, { textStylesData } = {}) => {
  state.textStylesData = textStylesData;
};

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData;
};

export const setSoundsData = ({ state }, { soundsData } = {}) => {
  state.soundsData = soundsData;
};

export const setSpritesheetsData = ({ state }, { spritesheetsData } = {}) => {
  state.spritesheetsData = spritesheetsData;
};

export const setParticlesData = ({ state }, { particlesData } = {}) => {
  state.particlesData = particlesData;
};

export const setVariablesData = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
};

export const setSelectedElementMetrics = ({ state }, { metrics } = {}) => {
  state.selectedElementMetrics = metrics;
};

export const resetForSelectionChange = ({ state }, _payload = {}) => {
  resetSelectionUiState(state);
};

export const selectValues = ({ state }) => {
  return state.values;
};

export const selectSelectedElementMetrics = ({ state }) => {
  return state.selectedElementMetrics;
};

export const setTempSelectedImageId = ({ state }, { imageId } = {}) => {
  state.tempSelectedImageId = imageId;
};

export const setTempSelectedSpritesheetValue = (
  { state },
  { selectedSpritesheetValue } = {},
) => {
  state.tempSelectedSpritesheetValue = selectedSpritesheetValue;
};

export const selectImageSelectorDialog = ({ state }) => {
  return state.imageSelectorDialog;
};

export const selectSpritesheetSelectorDialog = ({ state }) => {
  return state.spritesheetSelectorDialog;
};

export const selectTempSelectedImageId = ({ state }) => {
  return state.tempSelectedImageId;
};

export const selectTempSelectedSpritesheetValue = ({ state }) => {
  return state.tempSelectedSpritesheetValue;
};

export const selectVisibilityConditionDialog = ({ state }) => {
  return state.visibilityConditionDialog;
};

export const selectDropdownMenu = ({ state }) => {
  return state.dropdownMenu;
};

export const selectSaveLoadPaginationDialog = ({ state }) => {
  return state.saveLoadPaginationDialog;
};

export const selectChildInteractionDialog = ({ state }) => {
  return state.childInteractionDialog;
};

export const selectSpriteBlurDialog = ({ state }) => {
  return state.spriteBlurDialog;
};

export const selectTextRevealIndicatorDialog = ({ state }) => {
  return state.textRevealIndicatorDialog;
};

export const selectTextContentDialog = ({ state }) => {
  return state.textContentDialog;
};

export const selectConditionalOverrideConditionDialog = ({ state }) => {
  return state.conditionalOverrideConditionDialog;
};

export const selectConditionalOverrideAttributeDialog = ({ state }) => {
  return state.conditionalOverrideAttributeDialog;
};

export const selectVisibilityConditionTargetTypeByTarget = ({
  state,
  props,
}) => {
  return toVisibilityConditionTargetTypeByTarget(state.variablesData, {
    includeSaveDataAvailable: props.isInsideSaveLoadSlot === true,
  });
};

export const selectVisibilityConditionTargetValueKindByTarget = ({
  state,
  props,
}) => {
  return toVisibilityConditionTargetValueKindByTarget(state.variablesData, {
    includeSaveDataAvailable: props.isInsideSaveLoadSlot === true,
  });
};

export const selectTextStyleOptions = ({ state }) => {
  return toTextStyleOptions(state.textStylesData);
};

export const selectSoundOptions = ({ state }) => {
  return toSoundOptions(state.soundsData);
};

export const selectImageItemById = ({ state }, { imageId } = {}) => {
  return state.imagesData?.items?.[imageId];
};

export const selectSpritesheetItemById = ({ state }, { resourceId } = {}) => {
  return state.spritesheetsData?.items?.[resourceId];
};

const createSpritesheetPreviewKey = ({
  selectionValue,
  fileId,
  animation,
} = {}) => {
  return (
    selectionValue ??
    `${fileId ?? ""}:${animation?.frames?.join(",") ?? ""}:${animation?.fps ?? ""}`
  );
};

const hydrateTextRevealIndicatorItem = (item, spritesheetsData) => {
  if (item.kind !== "spritesheet" || !item.resourceId) {
    return item;
  }

  const selectionValue = toSpritesheetAnimationSelectionValue(
    item.resourceId,
    item.animationName,
  );
  const preview = getSpritesheetAnimationPreview(
    spritesheetsData,
    item.resourceId,
    item.animationName,
  );

  return {
    ...item,
    spritesheetFileId: preview.fileId,
    spritesheetAtlas: preview.atlas,
    spritesheetAnimation: preview.animation,
    spritesheetPreviewKey: createSpritesheetPreviewKey({
      selectionValue,
      fileId: preview.fileId,
      animation: preview.animation,
    }),
  };
};

export const selectViewData = ({ state, props, constants }) => {
  const textStyleItems = toTextStyleOptions(state.textStylesData);
  const soundItems = toSoundOptions(state.soundsData);
  const imageItems = toImageOptions(state.imagesData);
  const spritesheetSelectionItems = toSpritesheetAnimationSelectionItems(
    state.spritesheetsData,
  );
  const particleSelectionItems = toParticleSelectionItems(state.particlesData);
  const imageFlatItems = toFlatItems(state.imagesData);
  const imageFolderItems = imageFlatItems.filter(
    (item) => item.type === "folder",
  );
  const spritesheetFlatItems = toFlatItems(state.spritesheetsData);
  const spritesheetFolderItems = spritesheetFlatItems.filter(
    (item) => item.type === "folder",
  );
  const firstTextStyleId = getFirstTextStyleId(state.textStylesData);
  const textStyleItemsWithNone = [
    { label: "None", value: "" },
    ...textStyleItems,
  ];
  const soundItemsWithNone = [{ label: "None", value: "" }, ...soundItems];
  const variableOptions = getVariableOptions(state.variablesData, {
    type: "number",
  });
  const sliderValueOptions = [
    { label: "Manual", value: "" },
    ...getRuntimeNumberFieldOptions(),
  ];
  const fragmentLayoutOptions = getFragmentLayoutOptions(props.layoutsData);
  const visibilityConditionOptions = {
    includeSaveDataAvailable: props.isInsideSaveLoadSlot === true,
    charactersData: props.charactersData,
  };
  const visibilityConditionTargetOptions = toVisibilityConditionTargetOptions(
    state.variablesData,
    visibilityConditionOptions,
  );
  const visibilityConditionTargetTypeByTarget =
    toVisibilityConditionTargetTypeByTarget(
      state.variablesData,
      visibilityConditionOptions,
    );
  const visibilityConditionTargetValueKindByTarget =
    toVisibilityConditionTargetValueKindByTarget(
      state.variablesData,
      visibilityConditionOptions,
    );
  const values = toInspectorValues({
    values: state.values,
    firstTextStyleId,
    hiddenActionModes: HIDDEN_LAYOUT_ACTION_MODES,
    variablesData: state.variablesData,
  });
  values.textRevealIndicatorItems = values.textRevealIndicatorItems.map(
    (item) => hydrateTextRevealIndicatorItem(item, state.spritesheetsData),
  );
  const textContentMentionTargets = buildTextContentMentionTargets(
    state.variablesData,
  );
  const spritesheetSelectionValue = toSpritesheetAnimationSelectionValue(
    values.resourceId,
    values.animationName,
  );
  const selectedSpritesheetPreview = getSpritesheetAnimationPreview(
    state.spritesheetsData,
    values.resourceId,
    values.animationName,
  );
  const currentVisibilityCondition = splitLayoutConditionFromWhen(
    values["$when"],
  ).visibilityCondition;
  const conditionalOverrideRules = normalizeConditionalOverrideRules(
    values.conditionalOverrides,
  );
  const conditionalOverrideItems = conditionalOverrideRules.map(
    (rule, index) => ({
      index,
      summary: getConditionalOverrideSummary(
        rule,
        state.variablesData,
        visibilityConditionOptions,
        getVisibilityConditionSummary,
      ),
      attributeItems: toConditionalOverrideAttributeItems(
        rule,
        state.textStylesData,
        state.imagesData,
      ),
    }),
  );
  const capabilities =
    getLayoutEditorElementDefinition(props.itemType)?.capabilities ?? {};
  const showsDirectedContainerSizeMode = isDirectedContainer(
    capabilities,
    values,
  );
  const supportsWidthMode =
    props.itemType?.startsWith("text") === true ||
    showsDirectedContainerSizeMode;
  const supportsHeightMode = showsDirectedContainerSizeMode;
  const widthMode =
    props.itemType?.startsWith("text") === true
      ? values.width === undefined
        ? "auto"
        : "fixed"
      : supportsWidthMode && isAutoContainerSize(values.width)
        ? "auto"
        : "fixed";
  const heightMode =
    supportsHeightMode && isAutoContainerSize(values.height) ? "auto" : "fixed";
  const showWidthField = !supportsWidthMode || widthMode === "fixed";
  const showHeightField =
    capabilities.supportsHeight === true &&
    (!supportsHeightMode || heightMode === "fixed");
  const showLayoutSizeSection =
    capabilities.supportsSize === true || showsDirectedContainerSizeMode;
  const showAspectRatioMode =
    capabilities.supportsHeight === true && !showsDirectedContainerSizeMode;
  const hasSpriteBlur = isSpriteBlurValue(values.blur);
  const sections = annotatePanelSections(
    parseAndRender(
      getLayoutEditPanelSections({
        constants,
        resourceType: props.resourceType,
      }),
      {
        itemType: props.itemType,
        layoutType: props.layoutType,
        resourceType: props.resourceType,
        isInsideDirectedContainer: props.isInsideDirectedContainer === true,
        textStyleItems,
        textStyleItemsWithNone,
        soundItems,
        soundItemsWithNone,
        spritesheetSelectionItems,
        particleSelectionItems,
        sliderValueOptions,
        spritesheetSelectionValue,
        selectedSpritesheetFileId: selectedSpritesheetPreview.fileId,
        selectedSpritesheetAtlas: selectedSpritesheetPreview.atlas,
        selectedSpritesheetAnimation: selectedSpritesheetPreview.animation,
        selectedSpritesheetPreviewKey:
          spritesheetSelectionValue ??
          `${selectedSpritesheetPreview.fileId ?? ""}:${selectedSpritesheetPreview.animation?.frames?.join(",") ?? ""}:${selectedSpritesheetPreview.animation?.fps ?? ""}`,
        fragmentLayoutOptions,
        values,
        showLayoutSizeSection,
        supportsWidthMode,
        widthMode,
        supportsHeightMode,
        heightMode,
        showWidthField,
        showHeightField,
        showAspectRatioMode,
        paginationSummary: getSaveLoadPaginationSummary({
          values,
          variablesData: state.variablesData,
        }),
        childInteractionSummary: getChildInteractionSummary(values),
        childInteractionItems: getChildInteractionItems(values),
        choiceItemOptions: CHOICE_ITEM_OPTIONS,
        hasChildInteractionInheritance: hasChildInteractionInheritance(values),
        canAddChildInteractionInheritance:
          getAvailableChildInteractionItems(values).length > 0,
        blurSummary: getSpriteBlurSummary(values.blur),
        canAddSpriteBlur: !hasSpriteBlur,
        canAddTextRevealIndicator:
          values.textRevealIndicatorAddItems.length > 0,
        canAddTextStyleVariant:
          !values.hoverTextStyleId || !values.clickTextStyleId,
        canAddSoundVariant: !values.hoverSoundId || !values.clickSoundId,
        conditionalOverrideItems,
        visibilityConditionSummary: getVisibilityConditionSummary(
          currentVisibilityCondition,
          state.variablesData,
          visibilityConditionOptions,
        ),
        hasVisibilityCondition: !!currentVisibilityCondition?.target,
        canAddSpriteImageVariant:
          !values.imageId || !values.hoverImageId || !values.clickImageId,
        showsGapField: showsDirectedContainerSizeMode,
        ...capabilities,
      },
    ),
  );
  const visibilityConditionDialogDefaults =
    createVisibilityConditionDialogDefaults(
      currentVisibilityCondition,
      visibilityConditionTargetTypeByTarget,
      visibilityConditionTargetValueKindByTarget,
    );
  const editingConditionalOverrideRule =
    Number.isInteger(state.conditionalOverrideConditionDialog.editingIndex) &&
    state.conditionalOverrideConditionDialog.editingIndex >= 0
      ? conditionalOverrideRules[
          state.conditionalOverrideConditionDialog.editingIndex
        ]
      : undefined;
  const conditionalOverrideConditionDefaults =
    createConditionalOverrideConditionDefaults(
      editingConditionalOverrideRule,
      visibilityConditionTargetTypeByTarget,
      visibilityConditionTargetValueKindByTarget,
    );
  const editingConditionalOverrideAttributeRule =
    Number.isInteger(state.conditionalOverrideAttributeDialog.editingIndex) &&
    state.conditionalOverrideAttributeDialog.editingIndex >= 0
      ? conditionalOverrideRules[
          state.conditionalOverrideAttributeDialog.editingIndex
        ]
      : undefined;
  const conditionalOverrideAttributeOptions =
    getConditionalOverrideAttributeOptions({
      rule: editingConditionalOverrideAttributeRule,
      includeFieldName: state.conditionalOverrideAttributeDialog.fieldName,
      capabilities,
    });
  const conditionalOverrideAttributeDefaults =
    createConditionalOverrideAttributeDefaults(
      editingConditionalOverrideAttributeRule,
      state.conditionalOverrideAttributeDialog.fieldName,
      conditionalOverrideAttributeOptions,
    );
  const selectedVisibilityConditionVariableType =
    state.visibilityConditionDialog.selectedVariableType ??
    visibilityConditionDialogDefaults.selectedVariableType;
  const selectedVisibilityConditionValueKind =
    state.visibilityConditionDialog.selectedValueKind ??
    visibilityConditionDialogDefaults.selectedValueKind;
  const selectedConditionalOverrideVariableType =
    state.conditionalOverrideConditionDialog.selectedVariableType ??
    conditionalOverrideConditionDefaults.selectedVariableType;
  const selectedConditionalOverrideValueKind =
    state.conditionalOverrideConditionDialog.selectedValueKind ??
    conditionalOverrideConditionDefaults.selectedValueKind;
  const visibilityConditionCharacterValueOptions =
    getVisibilityConditionCharacterValueOptions({
      charactersData: props.charactersData,
      currentValue: visibilityConditionDialogDefaults.characterValue,
    });
  const conditionalOverrideCharacterValueOptions =
    getVisibilityConditionCharacterValueOptions({
      charactersData: props.charactersData,
      currentValue: conditionalOverrideConditionDefaults.characterValue,
    });
  const textRevealIndicatorDialogDefaults =
    createTextRevealIndicatorDialogDefaults({
      values,
      stateName: state.textRevealIndicatorDialog.stateName,
    });
  const textRevealIndicatorDialogForm = createTextRevealIndicatorForm({
    stateName: state.textRevealIndicatorDialog.stateName,
  });
  const textRevealIndicatorDialogSpritesheetSelectionValue =
    toSpritesheetAnimationSelectionValue(
      state.textRevealIndicatorDialog.resourceId,
      state.textRevealIndicatorDialog.animationName,
    );
  const textRevealIndicatorDialogSpritesheetPreview =
    getSpritesheetAnimationPreview(
      state.spritesheetsData,
      state.textRevealIndicatorDialog.resourceId,
      state.textRevealIndicatorDialog.animationName,
    );
  const textRevealIndicatorDialogPreviewKey = createSpritesheetPreviewKey({
    selectionValue: textRevealIndicatorDialogSpritesheetSelectionValue,
    fileId: textRevealIndicatorDialogSpritesheetPreview.fileId,
    animation: textRevealIndicatorDialogSpritesheetPreview.animation,
  });

  return {
    values: state.values,
    actionsData: state.actionsEditorActions,
    hiddenSystemActionModes: [...HIDDEN_LAYOUT_ACTION_MODES],
    config: {
      sections,
    },
    revealEffectOptions: REVEAL_EFFECT_OPTIONS,
    revealEffectValue: values.revealEffect,
    popover: state.popover,
    visibilityConditionDialog: state.visibilityConditionDialog,
    dropdownMenu: state.dropdownMenu,
    visibilityConditionDialogDefaults,
    visibilityConditionDialogForm: createVisibilityConditionForm({
      targetOptions: visibilityConditionTargetOptions,
    }),
    visibilityConditionDialogContext: {
      selectedVariableType: selectedVisibilityConditionVariableType,
      selectedValueKind: selectedVisibilityConditionValueKind,
      characterValueOptions: visibilityConditionCharacterValueOptions,
    },
    saveLoadPaginationDialog: state.saveLoadPaginationDialog,
    saveLoadPaginationDialogDefaults:
      createSaveLoadPaginationDialogDefaults(values),
    saveLoadPaginationDialogForm: createSaveLoadPaginationForm({
      variableOptions,
    }),
    childInteractionDialog: state.childInteractionDialog,
    childInteractionDialogDefaults:
      createChildInteractionDialogDefaults(values),
    childInteractionDialogForm: createChildInteractionForm(),
    spriteBlurDialog: state.spriteBlurDialog,
    spriteBlurDialogDefaults: createSpriteBlurDialogDefaults(values.blur),
    spriteBlurDialogForm: createSpriteBlurForm({
      submitLabel: hasSpriteBlur ? "Save Blur" : "Add Blur",
    }),
    textRevealIndicatorDialog: state.textRevealIndicatorDialog,
    textRevealIndicatorDialogDefaults,
    textRevealIndicatorDialogForm,
    textRevealIndicatorDialogSpritesheetFileId:
      textRevealIndicatorDialogSpritesheetPreview.fileId,
    textRevealIndicatorDialogSpritesheetAtlas:
      textRevealIndicatorDialogSpritesheetPreview.atlas,
    textRevealIndicatorDialogSpritesheetAnimation:
      textRevealIndicatorDialogSpritesheetPreview.animation,
    textRevealIndicatorDialogPreviewKey,
    textContentDialog: state.textContentDialog,
    textContentDialogDefaults: {},
    textContentDialogContent: values.content,
    textContentSummaryParts: values.textContentSummaryParts,
    textContentDialogForm: createTextContentDialogForm(),
    textContentMentionTargets,
    conditionalOverrideConditionDialog:
      state.conditionalOverrideConditionDialog,
    conditionalOverrideItems,
    conditionalOverrideConditionDefaults,
    conditionalOverrideConditionForm: createConditionalOverrideConditionForm({
      targetOptions: visibilityConditionTargetOptions,
      submitLabel: editingConditionalOverrideRule ? "Save" : "Create",
    }),
    conditionalOverrideConditionDialogContext: {
      selectedVariableType: selectedConditionalOverrideVariableType,
      selectedValueKind: selectedConditionalOverrideValueKind,
      characterValueOptions: conditionalOverrideCharacterValueOptions,
    },
    conditionalOverrideAttributeDialog:
      state.conditionalOverrideAttributeDialog,
    conditionalOverrideAttributeDefaults,
    conditionalOverrideAttributeForm: createConditionalOverrideAttributeForm({
      attributeOptions: conditionalOverrideAttributeOptions,
      textStyleOptions: textStyleItems,
      imageOptions: imageItems,
      submitLabel: state.conditionalOverrideAttributeDialog.fieldName
        ? "Save"
        : "Add",
    }),
    conditionalOverrideAttributeDialogContext: {
      hasAttributeOptions: conditionalOverrideAttributeOptions.length > 0,
    },
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
    imageFolderItems,
    spritesheetSelectorDialog: state.spritesheetSelectorDialog,
    tempSelectedSpritesheetValue: state.tempSelectedSpritesheetValue,
    spritesheetFolderItems,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
  };
};
