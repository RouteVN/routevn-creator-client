import {
  getSliderPopoverField,
  getSliderPopoverPresets,
  getSliderPopoverRange,
  getSliderPopoverStepButtons,
  hasAspectRatioToggle,
  isSliderPopoverField,
} from "./support/layoutEditPanelSliderPopovers.js";
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
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { createCommandLineResourceSelectorLayout } from "../../internal/ui/sceneEditor/commandLineResourceSelectorLayout.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { normalizeLayoutRotation } from "../../internal/project/layout.js";
import {
  getVisibilityConditionCharacterValueOptions,
  toVisibilityConditionTargetTypeByTarget,
  toVisibilityConditionTargetValueKindByTarget,
} from "./support/layoutEditPanelFeatures.js";
import {
  createChildInteractionDialogDefaults,
  createChildInteractionForm,
  createConditionalOverrideAnchorOptions,
  createConditionalOverrideAttributeDefaults,
  createConditionalOverrideAttributeForm,
  createConditionalOverrideAttributeImagePreview,
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
  toSectionedVisibilityConditionTargetOptions,
} from "./support/layoutEditPanelFeatures.js";
import {
  createSpriteBlurDialogDefaults,
  createSpriteBlurForm,
  getSpriteBlurSummary,
  isSpriteBlurValue,
} from "./support/layoutEditPanelBlur.js";
import {
  ACTION_INTERACTION_TYPES,
  createRevealEffectOptions,
  createRevealSoundStopTimingOptions,
  createSaveLoadDateFormatOptions,
  createTextContentDialogForm,
  getLayoutEditPanelSections,
  getLayoutInteractionActions,
  selectLayoutEditPanelFieldPopoverForm,
  toInspectorValues,
  toSoundOptions,
  toTextStyleOptions,
} from "./support/layoutEditPanelViewData.js";
import {
  createTextRevealIndicatorDialogDefaults,
  createTextRevealIndicatorForm,
  getTextRevealIndicatorVisualName,
  isTextRevealIndicatorStateName,
} from "./support/layoutEditPanelTextRevealIndicator.js";
import { selectLayoutEditPanelCopy } from "./support/layoutEditPanelCopy.js";

const HIDDEN_LAYOUT_ACTION_MODES = new Set(["conditional"]);
const DEFAULT_INTERACTION_SOUND_VOLUME = 100;
// Touch image and sound pickers show up to four a row, each at least 120px
// wide: four on a tablet, two on a phone.
const TOUCH_MEDIA_SELECTOR_COLUMNS = 4;
const TOUCH_MEDIA_SELECTOR_MIN_COLUMN_WIDTH = 120;
const DEFAULT_REVEAL_SOUND_STOP_TIMING = "immediate";
const TEXT_CONTENT_MENTION_VARIABLE_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
]);
const createChoiceItemOptions = (copy = {}) =>
  Array.from({ length: 20 }, (_item, index) => ({
    label: formatI18nCopy(copy.choiceItemLabel ?? "Choice {index}", {
      index: index + 1,
    }),
    value: index,
  }));
const STATIC_LABEL_COPY_KEYS = {
  Absolute: "absoluteOption",
  Actions: "actionsSection",
  Alignment: "alignmentLabel",
  Anchor: "anchorLabel",
  Appearance: "appearanceSection",
  Auto: "autoOption",
  "Bottom Center": "anchorBottomCenter",
  "Bottom Left": "anchorBottomLeft",
  "Bottom Right": "anchorBottomRight",
  Center: "centerOption",
  "Center Left": "anchorCenterLeft",
  "Center Right": "anchorCenterRight",
  Choice: "choiceSection",
  Click: "clickLabel",
  Clicked: "clickedLabel",
  Conditional: "conditionalSection",
  "Child Interaction": "childInteractionTitle",
  Default: "defaultLabel",
  Date: "dateSection",
  Direction: "directionSection",
  Disabled: "disabledOption",
  Effect: "effectLabel",
  Enabled: "enabledOption",
  Field: "fieldLabel",
  Fixed: "fixedOption",
  Format: "formatLabel",
  Fragment: "fragmentLabel",
  Free: "freeOption",
  "Gap X": "gapXLabel",
  "Gap Y": "gapYLabel",
  Height: "heightLabel",
  Horizontal: "horizontalOption",
  Hover: "hoverLabel",
  Image: "imageLabel",
  Indicator: "indicatorLabel",
  Initial: "initialLabel",
  Input: "inputSection",
  Layout: "layoutSection",
  Left: "leftOption",
  Manual: "manualOption",
  Max: "maxLabel",
  Min: "minLabel",
  None: "noneOption",
  Opacity: "opacityLabel",
  Pagination: "paginationTitle",
  Particle: "particleLabel",
  Position: "positionSection",
  "Position X": "positionXLabel",
  "Position Y": "positionYLabel",
  Ratio: "ratioLabel",
  Rotation: "rotationLabel",
  "Scale X": "scaleXLabel",
  "Scale Y": "scaleYLabel",
  Revealing: "revealingLabel",
  Right: "rightOption",
  Scroll: "scrollSection",
  Slider: "sliderLabel",
  "Slider Bar": "sliderBarSection",
  "Slider Thumb": "sliderThumbSection",
  "Slider Values": "sliderValuesSection",
  Sound: "soundLabel",
  Spritesheet: "spritesheetLabel",
  Step: "stepLabel",
  Stop: "stopLabel",
  Submit: "submitButton",
  Text: "textTitle",
  "Text Alignment": "textAlignmentLabel",
  "Text Styles": "textStylesSection",
  "Top Center": "anchorTopCenter",
  "Top Left": "anchorTopLeft",
  "Top Right": "anchorTopRight",
  Transform: "transformSection",
  Value: "valueLabel",
  Vertical: "verticalOption",
  Visibility: "visibilityLabel",
  Width: "widthLabel",
};
const localizeStaticLabel = (label, copy = {}) => {
  const copyKey = STATIC_LABEL_COPY_KEYS[label];
  return copyKey ? (copy[copyKey] ?? label) : label;
};
const localizeOptions = (options, copy = {}) => {
  if (!Array.isArray(options)) {
    return options;
  }

  return options.map((option) => {
    if (!option || typeof option !== "object") {
      return option;
    }

    const nextOption = {
      ...option,
    };
    if (typeof nextOption.label === "string") {
      nextOption.label = localizeStaticLabel(nextOption.label, copy);
    }
    if (typeof nextOption.ariaLabel === "string") {
      nextOption.ariaLabel = localizeStaticLabel(nextOption.ariaLabel, copy);
    }
    if (typeof nextOption.tooltip === "string") {
      nextOption.tooltip = localizeStaticLabel(nextOption.tooltip, copy);
    }
    return nextOption;
  });
};
const localizeForm = (form, copy = {}) => {
  if (!form || typeof form !== "object") {
    return form;
  }

  const nextForm = {
    ...form,
  };
  if (typeof nextForm.title === "string") {
    nextForm.title = localizeStaticLabel(nextForm.title, copy);
  }
  if (Array.isArray(nextForm.fields)) {
    nextForm.fields = nextForm.fields.map((field) => ({
      ...field,
      label:
        typeof field.label === "string"
          ? localizeStaticLabel(field.label, copy)
          : field.label,
      options: localizeOptions(field.options, copy),
    }));
  }
  if (nextForm.actions && typeof nextForm.actions === "object") {
    nextForm.actions = {
      ...nextForm.actions,
      buttons: Array.isArray(nextForm.actions.buttons)
        ? nextForm.actions.buttons.map((button) => ({
            ...button,
            label:
              typeof button.label === "string"
                ? localizeStaticLabel(button.label, copy)
                : button.label,
          }))
        : nextForm.actions.buttons,
    };
  }

  return nextForm;
};
const localizePanelItem = (item, copy = {}) => {
  const nextItem = {
    ...item,
  };
  if (typeof nextItem.label === "string") {
    nextItem.label = localizeStaticLabel(nextItem.label, copy);
  }
  if (Array.isArray(nextItem.options)) {
    nextItem.options = localizeOptions(nextItem.options, copy);
  }
  if (Array.isArray(nextItem.fields)) {
    nextItem.fields = nextItem.fields.map((field) => ({
      ...field,
      label:
        typeof field.label === "string"
          ? localizeStaticLabel(field.label, copy)
          : field.label,
      options: localizeOptions(field.options, copy),
      popoverForm: localizeForm(field.popoverForm, copy),
    }));
  }
  if (Array.isArray(nextItem.items)) {
    nextItem.items = nextItem.items.map((childItem) =>
      localizePanelItem(childItem, copy),
    );
  }
  if (Array.isArray(nextItem.attributeItems)) {
    nextItem.attributeItems = nextItem.attributeItems.map((attributeItem) =>
      localizePanelItem(attributeItem, copy),
    );
  }

  return nextItem;
};
const localizePanelSections = (sections = [], copy = {}) => {
  return sections.map((section) => ({
    ...section,
    label:
      typeof section.label === "string"
        ? localizeStaticLabel(section.label, copy)
        : section.label,
    items: (section.items ?? []).map((item) => localizePanelItem(item, copy)),
  }));
};

const normalizeInteractionSoundVolume = (
  volume,
  fallback = DEFAULT_INTERACTION_SOUND_VOLUME,
) => {
  const parsedVolume = Number(volume);
  if (!Number.isFinite(parsedVolume)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(parsedVolume)));
};

const createSoundForm = (copy = {}, { stopTimingName } = {}) => ({
  title: stopTimingName
    ? (copy.revealingSoundLabel ?? "Revealing Sound")
    : (copy.soundLabel ?? "Sound"),
  fields: [
    {
      type: "slot",
      slot: "sound-item",
      label: copy.soundLabel ?? "Sound",
    },
    stopTimingName
      ? {
          name: "stopTiming",
          type: "segmented-control",
          label: copy.stopLabel ?? "Stop",
          clearable: false,
          options: createRevealSoundStopTimingOptions(copy),
        }
      : {
          name: "volume",
          type: "slider-with-input",
          label: copy.volumeLabel ?? "Volume",
          min: 0,
          max: 100,
          step: 1,
          required: true,
        },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.saveButton ?? "Save",
      },
    ],
  },
});

const SLIDER_PRESETS_SLOT = "slider-presets";

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

const PANEL_LIST_ITEM_TYPES = new Set([
  "list-item",
  "list-bar",
  "conditional-override-list",
  "child-interaction-list",
]);

const rendersPanelItemContent = (item) =>
  !PANEL_LIST_ITEM_TYPES.has(item.type) || item.items.length > 0;

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
    nextSection.items = annotatePanelItems(
      (section?.items ?? []).filter(rendersPanelItemContent),
      {
        sectionKey: nextSection.viewKey,
      },
    );
    return nextSection;
  });
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
  if (!isSliderPopoverField(name)) {
    return form;
  }

  const sliderRange = getSliderPopoverRange({
    name,
    values,
    projectResolution,
    currentValue: value,
  });
  if (!sliderRange) {
    return form;
  }

  const nextForm = clonePopoverForm(form);
  const normalizedFields = Array.isArray(nextForm?.fields)
    ? nextForm.fields.filter((field) => field?.slot !== SLIDER_PRESETS_SLOT)
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
      min: sliderRange.min,
      max: sliderRange.max,
      step: sliderRange.step,
    },
    {
      type: "slot",
      slot: SLIDER_PRESETS_SLOT,
    },
    ...remainingFields,
  ];

  return nextForm;
};

// X, Y, rotation and opacity popovers show a slider with a Presets menu and
// step buttons.
const buildSliderPopoverContext = ({ name, projectResolution, copy } = {}) => {
  if (!isSliderPopoverField(name)) {
    return {};
  }

  return {
    isSliderPopover: true,
    presetItems: getSliderPopoverPresets({ name, projectResolution, copy }),
    stepButtons: getSliderPopoverStepButtons({ name, copy }),
    showAspectRatioToggle: hasAspectRatioToggle(name),
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
  state.tempSelectedSoundId = undefined;
  state.tempSelectedSpritesheetValue = undefined;
  state.imageSelectorDialog = {
    open: false,
    name: undefined,
    source: undefined,
  };
  state.soundSelectorDialog = { open: false };
  state.soundFormDialog = {
    open: false,
    key: 0,
    name: undefined,
    volumeName: undefined,
    stopTimingName: undefined,
    selectedSoundId: undefined,
    volume: DEFAULT_INTERACTION_SOUND_VOLUME,
    stopTiming: DEFAULT_REVEAL_SOUND_STOP_TIMING,
    validationErrors: {},
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
  state.sectionTooltip = {
    open: false,
    x: 0,
    y: 0,
    content: "",
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
    selectedImageId: undefined,
    selectedAnchor: undefined,
    validationErrors: {},
  };
  state.selectedElementMetrics = undefined;
  state.activeInteractionType = "click";
  state.actionsEditorActions = {};
};

export const createInitialState = () => {
  const state = {
    // Scale popovers keep the aspect ratio unless it is turned off.
    scaleAspectRatioLocked: true,
    imagesData: { tree: [], items: {} },
    soundsData: { tree: [], items: {} },
    spritesheetsData: { tree: [], items: {} },
    particlesData: { tree: [], items: {} },
    textStylesData: { tree: [], items: {} },
    variablesData: { tree: [], items: {} },
    values: createDefaultValues(),
    isTouchMode: false,
  };

  resetSelectionUiState(state);
  return state;
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
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

const roundScaleForDisplay = (value) => Number(Number(value ?? 1).toFixed(2));

export const openPopoverForm = (
  { state },
  { x, y, name, form, projectResolution, copy } = {},
) => {
  if (!name) {
    return;
  }

  const fieldValue =
    getValueAtPath(state.values, name) ??
    getSliderPopoverField(name)?.defaultValue;
  const value =
    name === "scaleX" || name === "scaleY"
      ? roundScaleForDisplay(fieldValue)
      : fieldValue;
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
      ...buildSliderPopoverContext({
        name,
        projectResolution,
        copy,
      }),
    },
  };
};

export const updatePopoverFormContext = (
  { state },
  { values = {}, name, projectResolution, copy } = {},
) => {
  const nextName = name ?? state.popover.name;

  state.popover.context = {
    popoverFormValues: values,
    ...buildSliderPopoverContext({
      name: nextName,
      projectResolution,
      copy,
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

export const setScaleAspectRatioLocked = ({ state }, { locked } = {}) => {
  state.scaleAspectRatioLocked = locked;
};

export const selectScaleAspectRatioLocked = ({ state }) =>
  state.scaleAspectRatioLocked;

// The value the open popover's form shows while it is edited, without
// rebuilding the form.
export const setPopoverFormValue = ({ state }, { value } = {}) => {
  if (!state.popover.open) {
    return;
  }
  state.popover.defaultValues.value = value;
  state.popover.context.popoverFormValues.value = value;
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
  { targetName, x, y, items, copy } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetName = targetName;
  state.dropdownMenu.items = items ?? [
    { label: copy?.deleteMenuItem ?? "Delete", type: "item", value: "delete" },
  ];
};

export const hideContextMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.x = 0;
  state.dropdownMenu.y = 0;
  state.dropdownMenu.targetName = undefined;
  state.dropdownMenu.items = [];
};

export const showSectionTooltip = ({ state }, { x, y, content } = {}) => {
  state.sectionTooltip.open = true;
  state.sectionTooltip.x = x;
  state.sectionTooltip.y = y;
  state.sectionTooltip.content = content;
};

export const hideSectionTooltip = ({ state }, _payload = {}) => {
  state.sectionTooltip.open = false;
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
  { editingIndex, fieldName, selectedImageId, selectedAnchor } = {},
) => {
  state.conditionalOverrideAttributeDialog.open = true;
  state.conditionalOverrideAttributeDialog.key += 1;
  state.conditionalOverrideAttributeDialog.editingIndex = editingIndex;
  state.conditionalOverrideAttributeDialog.fieldName = fieldName;
  state.conditionalOverrideAttributeDialog.selectedImageId = selectedImageId;
  state.conditionalOverrideAttributeDialog.selectedAnchor = selectedAnchor;
  state.conditionalOverrideAttributeDialog.validationErrors = {};
};

export const closeConditionalOverrideAttributeDialog = (
  { state },
  _payload = {},
) => {
  state.conditionalOverrideAttributeDialog.open = false;
  state.conditionalOverrideAttributeDialog.editingIndex = undefined;
  state.conditionalOverrideAttributeDialog.fieldName = undefined;
  state.conditionalOverrideAttributeDialog.selectedImageId = undefined;
  state.conditionalOverrideAttributeDialog.selectedAnchor = undefined;
  state.conditionalOverrideAttributeDialog.validationErrors = {};
};

export const setConditionalOverrideAttributeDialogImage = (
  { state },
  { imageId } = {},
) => {
  state.conditionalOverrideAttributeDialog.selectedImageId = imageId;
  delete state.conditionalOverrideAttributeDialog.validationErrors
    .selectedImageId;
};

export const setConditionalOverrideAttributeDialogAnchor = (
  { state },
  { anchor } = {},
) => {
  state.conditionalOverrideAttributeDialog.selectedAnchor = anchor;
};

export const setConditionalOverrideAttributeDialogValidationErrors = (
  { state },
  { errors } = {},
) => {
  state.conditionalOverrideAttributeDialog.validationErrors = errors ?? {};
};

export const selectFieldPopoverForm = (
  { constants, props, i18n },
  { name } = {},
) => {
  const copy = selectLayoutEditPanelCopy(i18n);
  return localizeForm(
    selectLayoutEditPanelFieldPopoverForm({ constants, props }, { name }),
    copy,
  );
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

export const openSoundSelectorDialog = (
  { state },
  { selectedSoundId } = {},
) => {
  state.soundSelectorDialog = { open: true };
  state.tempSelectedSoundId = selectedSoundId;
};

export const closeSoundSelectorDialog = ({ state }, _payload = {}) => {
  state.soundSelectorDialog = { open: false };
  state.tempSelectedSoundId = undefined;
};

export const openSoundFormDialog = (
  { state },
  { name, volumeName, stopTimingName } = {},
) => {
  if (!name || (!volumeName && !stopTimingName)) {
    return;
  }

  state.soundFormDialog = {
    open: true,
    key: state.soundFormDialog.key + 1,
    name,
    volumeName,
    stopTimingName,
    selectedSoundId: getValueAtPath(state.values, name),
    volume: normalizeInteractionSoundVolume(
      volumeName ? getValueAtPath(state.values, volumeName) : undefined,
    ),
    stopTiming:
      getValueAtPath(state.values, stopTimingName) === "loopEnd"
        ? "loopEnd"
        : DEFAULT_REVEAL_SOUND_STOP_TIMING,
    validationErrors: {},
  };
};

export const closeSoundFormDialog = ({ state }, _payload = {}) => {
  state.soundFormDialog = {
    open: false,
    key: state.soundFormDialog.key,
    name: undefined,
    volumeName: undefined,
    stopTimingName: undefined,
    selectedSoundId: undefined,
    volume: DEFAULT_INTERACTION_SOUND_VOLUME,
    stopTiming: DEFAULT_REVEAL_SOUND_STOP_TIMING,
    validationErrors: {},
  };
};

export const setSoundFormDialogSoundId = ({ state }, { soundId } = {}) => {
  state.soundFormDialog.selectedSoundId = soundId;
  state.soundFormDialog.validationErrors = {};
};

export const setSoundFormDialogValidationErrors = (
  { state },
  { errors } = {},
) => {
  state.soundFormDialog.validationErrors = errors ?? {};
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
  const nextValues = values ?? {};
  state.values = Number.isFinite(nextValues.rotation)
    ? {
        ...nextValues,
        rotation: normalizeLayoutRotation(nextValues.rotation),
      }
    : nextValues;
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

export const setTempSelectedSoundId = ({ state }, { soundId } = {}) => {
  state.tempSelectedSoundId = soundId;
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

export const selectSoundFormDialog = ({ state }) => {
  return state.soundFormDialog;
};

export const selectSpritesheetSelectorDialog = ({ state }) => {
  return state.spritesheetSelectorDialog;
};

export const selectTempSelectedImageId = ({ state }) => {
  return state.tempSelectedImageId;
};

export const selectTempSelectedSoundId = ({ state }) => {
  return state.tempSelectedSoundId;
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

const hydrateSoundListBarItem = (item = {}, soundsData = {}) => {
  if (!item.soundId) {
    return item;
  }

  const soundItem = soundsData?.items?.[item.soundId];
  return {
    ...item,
    soundName: soundItem?.name ?? item.soundId,
    soundFileId: soundItem?.fileId,
    waveformDataFileId: soundItem?.waveformDataFileId,
  };
};

const hydrateImageListBarItem = (item = {}, imagesData = {}) => {
  if (!item.imageId) {
    return item;
  }

  return {
    ...item,
    imageName: imagesData?.items?.[item.imageId]?.name ?? item.imageId,
  };
};

const hydrateListBarItems = (
  sections = [],
  { soundsData, imagesData } = {},
) => {
  return sections.map((section) => {
    const nextSection = {
      ...section,
      items: (section.items ?? []).map((item) => {
        if (item.type !== "list-bar" || !Array.isArray(item.items)) {
          return item;
        }

        return {
          ...item,
          items: item.items.map((barItem) =>
            hydrateImageListBarItem(
              hydrateSoundListBarItem(barItem, soundsData),
              imagesData,
            ),
          ),
        };
      }),
    };

    return nextSection;
  });
};

export const selectViewData = ({ state, props, constants, i18n }) => {
  const copy = selectLayoutEditPanelCopy(i18n);
  const textStyleItems = toTextStyleOptions(state.textStylesData);
  const soundItems = toSoundOptions(state.soundsData);
  const spritesheetSelectionItems = toSpritesheetAnimationSelectionItems(
    state.spritesheetsData,
  );
  const particleSelectionItems = toParticleSelectionItems(state.particlesData);
  const imageFlatItems = toFlatItems(state.imagesData);
  const imageFolderItems = imageFlatItems.filter(
    (item) => item.type === "folder",
  );
  const soundFlatItems = toFlatItems(state.soundsData);
  const soundFolderItems = soundFlatItems.filter(
    (item) => item.type === "folder",
  );
  const spritesheetFlatItems = toFlatItems(state.spritesheetsData);
  const spritesheetFolderItems = spritesheetFlatItems.filter(
    (item) => item.type === "folder",
  );
  const firstTextStyleId = getFirstTextStyleId(state.textStylesData);
  const textStyleItemsWithNone = [
    { label: copy.noneOption ?? "None", value: "" },
    ...textStyleItems,
  ];
  const soundItemsWithNone = [
    { label: copy.noneOption ?? "None", value: "" },
    ...soundItems,
  ];
  const selectorLayout = createCommandLineResourceSelectorLayout(state);
  const soundFormSoundItem =
    state.soundsData?.items?.[state.soundFormDialog.selectedSoundId];
  const variableOptions = getVariableOptions(state.variablesData, {
    type: "number",
    includeComputed: false,
  });
  const sliderValueOptions = [
    { label: copy.manualOption ?? "Manual", value: "" },
    ...getRuntimeNumberFieldOptions(),
  ];
  const revealEffectOptions = createRevealEffectOptions(copy);
  const dateFormatOptions = createSaveLoadDateFormatOptions();
  const fragmentLayoutOptions = getFragmentLayoutOptions(props.layoutsData);
  const visibilityConditionOptions = {
    includeSaveDataAvailable: props.isInsideSaveLoadSlot === true,
    charactersData: props.charactersData,
    systemSectionLabel: copy.systemSection ?? "System",
    variablesSectionLabel: copy.variablesSection ?? "Variables",
  };
  // Visibility and conditional overrides list the same targets, by section.
  const conditionTargetOptions = toSectionedVisibilityConditionTargetOptions(
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
    copy,
  });
  values.scaleX = roundScaleForDisplay(values.scaleX);
  values.scaleY = roundScaleForDisplay(values.scaleY);
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
        copy,
      ),
      attributeItems: toConditionalOverrideAttributeItems(
        rule,
        state.textStylesData,
        state.imagesData,
        copy,
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
  const stackWidthMode = props.itemType?.startsWith("text") === true;
  const supportsHeightMode = showsDirectedContainerSizeMode;
  const groupSizeModes = showsDirectedContainerSizeMode;
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
  const renderedSections = parseAndRender(
    getLayoutEditPanelSections({
      constants,
      resourceType: props.resourceType,
      mode: props.mode,
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
      revealEffectOptions,
      dateFormatOptions,
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
      stackWidthMode,
      widthMode,
      supportsHeightMode,
      groupSizeModes,
      heightMode,
      showWidthField,
      showHeightField,
      showAspectRatioMode,
      paginationSummary: getSaveLoadPaginationSummary({
        values,
        variablesData: state.variablesData,
        copy,
      }),
      childInteractionSummary: getChildInteractionSummary(values, copy),
      childInteractionItems: getChildInteractionItems(values, copy),
      choiceItemOptions: createChoiceItemOptions(copy),
      hasChildInteractionInheritance: hasChildInteractionInheritance(values),
      canAddChildInteractionInheritance:
        getAvailableChildInteractionItems(values, copy).length > 0,
      blurSummary: getSpriteBlurSummary(values.blur, copy),
      canAddSpriteBlur: !hasSpriteBlur,
      canAddTextRevealSound:
        capabilities.supportsTextRevealSound === true && !values.revealSoundId,
      canAddTextRevealIndicator: values.textRevealIndicatorAddItems.length > 0,
      canAddTextStyleVariant:
        !values.hoverTextStyleId || !values.clickTextStyleId,
      canAddSoundVariant: !values.hoverSoundId || !values.clickSoundId,
      hoverSoundVolumeLabel: `${normalizeInteractionSoundVolume(values.hover?.soundVolume)}%`,
      clickSoundVolumeLabel: `${normalizeInteractionSoundVolume(values.click?.soundVolume)}%`,
      conditionalOverrideItems,
      visibilityConditionSummary: getVisibilityConditionSummary(
        currentVisibilityCondition,
        state.variablesData,
        visibilityConditionOptions,
        copy,
      ),
      hasVisibilityCondition: !!currentVisibilityCondition?.target,
      canAddSpriteImageVariant:
        !values.imageId || !values.hoverImageId || !values.clickImageId,
      showsGapField: showsDirectedContainerSizeMode,
      ...capabilities,
    },
  );
  const sections = hydrateListBarItems(
    annotatePanelSections(localizePanelSections(renderedSections, copy)),
    { soundsData: state.soundsData, imagesData: state.imagesData },
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
      copy,
    });
  const conditionalOverrideAttributeDefaults =
    createConditionalOverrideAttributeDefaults(
      editingConditionalOverrideAttributeRule,
      state.conditionalOverrideAttributeDialog.fieldName,
      conditionalOverrideAttributeOptions,
    );
  const conditionalOverrideAnchorOptions =
    createConditionalOverrideAnchorOptions(copy);
  const conditionalOverrideAttributeImagePreview =
    createConditionalOverrideAttributeImagePreview(
      state.imagesData,
      state.conditionalOverrideAttributeDialog.selectedImageId,
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
    copy,
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
    showTrailingDivider: props.mode !== "transform",
    actionsData: state.actionsEditorActions,
    hiddenSystemActionModes: [...HIDDEN_LAYOUT_ACTION_MODES],
    config: {
      sections,
    },
    popover: state.popover,
    visibilityConditionDialog: state.visibilityConditionDialog,
    dropdownMenu: state.dropdownMenu,
    presetsButtonLabel: copy.presetsLabel,
    scaleAspectRatioLocked: state.scaleAspectRatioLocked,
    keepAspectRatioLabel: copy.keepAspectRatioLabel,
    sectionTooltip: state.sectionTooltip,
    visibilityConditionDialogDefaults,
    visibilityConditionDialogForm: createVisibilityConditionForm({
      targetOptions: conditionTargetOptions,
      copy,
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
      copy,
    }),
    childInteractionDialog: state.childInteractionDialog,
    childInteractionDialogDefaults:
      createChildInteractionDialogDefaults(values),
    childInteractionDialogForm: createChildInteractionForm(copy),
    spriteBlurDialog: state.spriteBlurDialog,
    spriteBlurDialogDefaults: createSpriteBlurDialogDefaults(values.blur),
    spriteBlurDialogForm: createSpriteBlurForm({
      submitLabel: hasSpriteBlur
        ? (copy.saveBlurButton ?? "Save Blur")
        : (copy.addBlurButton ?? "Add Blur"),
      copy,
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
    textRevealIndicatorDialogVisualName: getTextRevealIndicatorVisualName({
      dialog: state.textRevealIndicatorDialog,
      imagesData: state.imagesData,
      spritesheetsData: state.spritesheetsData,
    }),
    textContentDialog: state.textContentDialog,
    textContentDialogDefaults: {},
    textContentDialogContent: values.content,
    textContentSummaryParts: values.textContentSummaryParts,
    textContentDialogForm: createTextContentDialogForm(copy),
    textContentMentionTargets,
    conditionalOverrideConditionDialog:
      state.conditionalOverrideConditionDialog,
    conditionalOverrideItems,
    conditionalOverrideConditionDefaults,
    conditionalOverrideConditionForm: createConditionalOverrideConditionForm({
      targetOptions: conditionTargetOptions,
      submitLabel: editingConditionalOverrideRule
        ? (copy.saveButton ?? "Save")
        : (copy.createButton ?? "Create"),
      copy,
    }),
    conditionalOverrideConditionDialogContext: {
      selectedVariableType: selectedConditionalOverrideVariableType,
      selectedValueKind: selectedConditionalOverrideValueKind,
      characterValueOptions: conditionalOverrideCharacterValueOptions,
    },
    conditionalOverrideAttributeDialog:
      state.conditionalOverrideAttributeDialog,
    conditionalOverrideAnchorLabel: copy.anchorLabel ?? "Anchor",
    conditionalOverrideAnchorOptions,
    conditionalOverrideAnchorValue:
      state.conditionalOverrideAttributeDialog.selectedAnchor ??
      conditionalOverrideAnchorOptions[0].value,
    conditionalOverrideAttributeImagePreview,
    conditionalOverrideAttributeDefaults,
    conditionalOverrideAttributeForm: createConditionalOverrideAttributeForm({
      attributeOptions: conditionalOverrideAttributeOptions,
      textStyleOptions: textStyleItems,
      submitLabel: state.conditionalOverrideAttributeDialog.fieldName
        ? (copy.saveButton ?? "Save")
        : (copy.addButton ?? "Add"),
      copy,
    }),
    conditionalOverrideAttributeDialogContext: {
      hasAttributeOptions: conditionalOverrideAttributeOptions.length > 0,
    },
    imageSelectorDialog: state.imageSelectorDialog,
    tempSelectedImageId: state.tempSelectedImageId,
    imageFolderItems,
    showImageSelectorFileExplorer: selectorLayout.showFileExplorer,
    selectorColumns: selectorLayout.columns,
    soundSelectorDialog: state.soundSelectorDialog,
    tempSelectedSoundId: state.tempSelectedSoundId,
    soundFolderItems,
    showSoundSelectorFileExplorer: selectorLayout.showFileExplorer,
    imageSelectorColumns: state.isTouchMode
      ? TOUCH_MEDIA_SELECTOR_COLUMNS
      : undefined,
    imageSelectorMinColumnWidth: state.isTouchMode
      ? TOUCH_MEDIA_SELECTOR_MIN_COLUMN_WIDTH
      : undefined,
    soundSelectorColumns: state.isTouchMode
      ? TOUCH_MEDIA_SELECTOR_COLUMNS
      : undefined,
    soundSelectorMinColumnWidth: state.isTouchMode
      ? TOUCH_MEDIA_SELECTOR_MIN_COLUMN_WIDTH
      : undefined,
    soundFormDialog: state.soundFormDialog,
    soundForm: createSoundForm(copy, state.soundFormDialog),
    soundFormDefaults: {
      volume: state.soundFormDialog.volume,
      stopTiming: state.soundFormDialog.stopTiming,
    },
    soundFormSoundItem,
    spritesheetSelectorDialog: state.spritesheetSelectorDialog,
    tempSelectedSpritesheetValue: state.tempSelectedSpritesheetValue,
    spritesheetFolderItems,
    showSpritesheetSelectorFileExplorer: selectorLayout.showFileExplorer,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewImageId: state.fullImagePreviewImageId,
    addAttributeButton: copy.addAttributeButton ?? "Add Attribute",
    cancelButton: copy.cancelButton ?? "Cancel",
    deleteButton: copy.deleteButton ?? "Delete",
    imageLabel: copy.imageLabel ?? "Image",
    noAttributesYet: copy.noAttributesYet ?? "No attributes yet",
    noPreviewLabel: copy.noPreviewLabel ?? "No preview",
    notSetLabel: copy.notSetLabel ?? "Not set",
    removeButton: copy.removeButton ?? "Remove",
    selectButton: copy.selectButton ?? "Select",
    selectSpritesheetAnimationLabel:
      copy.selectSpritesheetAnimationLabel ?? "Select a spritesheet animation",
    selectImageLabel: copy.selectImageLabel ?? "Select image",
    selectSoundLabel: copy.selectSoundLabel ?? "Select sound",
  };
};
