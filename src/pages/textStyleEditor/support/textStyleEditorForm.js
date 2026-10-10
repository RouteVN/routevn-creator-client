import { isFontWeightSupported } from "../../../internal/fontCapabilities.js";
import { toFontIds, toPrimaryFontId } from "../../../internal/fontIds.js";

const FONT_WEIGHT_DEFINITIONS = [
  { value: "100", copyKey: "weight100Thin", label: "100 - Thin" },
  {
    value: "200",
    copyKey: "weight200ExtraLight",
    label: "200 - Extra Light",
  },
  { value: "300", copyKey: "weight300Light", label: "300 - Light" },
  { value: "400", copyKey: "weight400Normal", label: "400 - Normal" },
  { value: "500", copyKey: "weight500Medium", label: "500 - Medium" },
  {
    value: "600",
    copyKey: "weight600SemiBold",
    label: "600 - Semi Bold",
  },
  { value: "700", copyKey: "weight700Bold", label: "700 - Bold" },
  {
    value: "800",
    copyKey: "weight800ExtraBold",
    label: "800 - Extra Bold",
  },
  { value: "900", copyKey: "weight900Black", label: "900 - Black" },
];

// A new outline shows at once instead of starting at zero thickness.
const DEFAULT_OUTLINE_WIDTH = 2;

const DEFAULT_SHADOW = Object.freeze({
  alpha: 1,
  blur: 0,
  offsetX: 2,
  offsetY: 2,
});

// The weights the font can draw, and a weight the text style already had
// with this font, which stays available.
export const buildFontWeightOptions = ({
  capabilities,
  grandfatheredWeight,
  copy = {},
} = {}) => {
  const optionsByValue = new Map();
  const addOption = (value) => {
    const normalizedValue = String(value);
    const definition = FONT_WEIGHT_DEFINITIONS.find(
      (item) => item.value === normalizedValue,
    );
    optionsByValue.set(normalizedValue, {
      label: definition
        ? (copy[definition.copyKey] ?? definition.label)
        : normalizedValue,
      value: normalizedValue,
    });
  };

  if (!capabilities || capabilities.kind === "unrestricted") {
    FONT_WEIGHT_DEFINITIONS.forEach((definition) =>
      addOption(definition.value),
    );
  } else {
    FONT_WEIGHT_DEFINITIONS.forEach((definition) => {
      if (isFontWeightSupported(capabilities, definition.value)) {
        addOption(definition.value);
      }
    });
    if (capabilities.defaultWeight !== undefined) {
      addOption(capabilities.defaultWeight);
    }
  }

  if (grandfatheredWeight !== undefined) {
    addOption(grandfatheredWeight);
  }

  return Array.from(optionsByValue.values()).sort(
    (left, right) => Number(left.value) - Number(right.value),
  );
};

// What this page edits and saves: how the text looks. Its name, description
// and tags are edited on the text styles page, its preview text saves with
// the preview settings, and fields the form does not show, such as its
// alignment, are left as they are. Every key is always present, so two versions
// compare equal when they look the same.
export const toTextStyleValues = (item) => ({
  fontId: toFontIds(item.fontId),
  colorId: item.colorId,
  fontSize: item.fontSize,
  lineHeight: item.lineHeight,
  fontWeight: String(item.fontWeight),
  strokeColorId: item.strokeColorId,
  strokeWidth: item.strokeColorId ? (item.strokeWidth ?? 0) : 0,
  shadow: item.shadow?.colorId
    ? {
        colorId: item.shadow.colorId,
        alpha: item.shadow.alpha ?? DEFAULT_SHADOW.alpha,
        blur: item.shadow.blur ?? DEFAULT_SHADOW.blur,
        offsetX: item.shadow.offsetX ?? DEFAULT_SHADOW.offsetX,
        offsetY: item.shadow.offsetY ?? DEFAULT_SHADOW.offsetY,
      }
    : undefined,
});

// The update that saves `values`: an outline or shadow that was removed is
// cleared from the saved text style.
export const toTextStyleUpdateData = (values) => {
  const data = {
    fontId: values.fontId,
    colorId: values.colorId,
    fontSize: values.fontSize,
    lineHeight: values.lineHeight,
    fontWeight: values.fontWeight,
    strokeColorId: values.strokeColorId,
    strokeWidth: values.strokeWidth,
  };
  if (values.shadow) {
    data.shadow = values.shadow;
  } else {
    data.clearShadow = true;
  }
  return data;
};

// The values the form fields show. Font and colors are selects in the
// form's slots, so they can offer to add a new font or color.
export const buildTextStyleFormValues = (values) => ({
  fontSize: values.fontSize,
  lineHeight: values.lineHeight,
  fontWeight: values.fontWeight,
  strokeWidth: values.strokeWidth,
  shadowAlpha: values.shadow?.alpha ?? DEFAULT_SHADOW.alpha,
  shadowBlur: values.shadow?.blur ?? DEFAULT_SHADOW.blur,
  shadowOffsetX: values.shadow?.offsetX ?? DEFAULT_SHADOW.offsetX,
  shadowOffsetY: values.shadow?.offsetY ?? DEFAULT_SHADOW.offsetY,
});

const TEXT_FORM_FIELDS = ["fontSize", "lineHeight", "fontWeight"];

const FONT_SIZE_PRESETS = [
  12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 128,
];
const LINE_HEIGHT_PRESETS = [1, 1.2, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3];
const OUTLINE_THICKNESS_PRESETS = [0, 1, 2, 3, 4, 6, 8, 12];
const SHADOW_OPACITY_PRESETS = [0, 0.25, 0.5, 0.75, 1];
const SHADOW_BLUR_PRESETS = [0, 2, 4, 8, 12, 16, 24, 32];
const SHADOW_OFFSET_PRESETS = [-16, -8, -4, -2, 0, 2, 4, 8, 16];

const toPixelPresets = (values) =>
  values.map((value) => ({ label: `${value} px`, value }));

// A share as a percentage, with its value beside it.
const toPercentPresets = (values) =>
  values.map((value) => ({
    label: `${Math.round(value * 100)}%`,
    value,
    suffixText: `${value}`,
  }));

const SHADOW_OFFSET_FIELD = {
  step: 1,
  fastStep: 4,
  min: -32,
  max: 32,
  unit: "px",
  presets: toPixelPresets(SHADOW_OFFSET_PRESETS),
};

// The form's numbers open slider popovers (see
// src/internal/ui/sliderPopover.js). Each slider's range bounds its value, as
// the slider keeps a typed value within it; font size's reaches further to a
// size already outside it. The ranges are the form's sliders' from before,
// with font size from 8 px, the minimum its input had, to 128 px.
export const TEXT_STYLE_SLIDER_FIELDS = Object.freeze({
  fontSize: {
    defaultValue: 16,
    step: 1,
    fastStep: 4,
    min: 8,
    range: { min: 8, max: 128 },
    unit: "px",
    presets: toPixelPresets(FONT_SIZE_PRESETS),
  },
  lineHeight: {
    defaultValue: 1.5,
    step: 0.1,
    fastStep: 0.5,
    min: 0.8,
    range: { min: 0.8, max: 3 },
    presets: LINE_HEIGHT_PRESETS.map((value) => ({ label: `${value}`, value })),
  },
  strokeWidth: {
    defaultValue: DEFAULT_OUTLINE_WIDTH,
    step: 0.5,
    fastStep: 2,
    min: 0,
    max: 12,
    unit: "px",
    presets: toPixelPresets(OUTLINE_THICKNESS_PRESETS),
  },
  shadowAlpha: {
    defaultValue: DEFAULT_SHADOW.alpha,
    step: 0.05,
    fastStep: 0.25,
    min: 0,
    max: 1,
    presets: toPercentPresets(SHADOW_OPACITY_PRESETS),
  },
  shadowBlur: {
    defaultValue: DEFAULT_SHADOW.blur,
    step: 1,
    fastStep: 4,
    min: 0,
    max: 32,
    unit: "px",
    presets: toPixelPresets(SHADOW_BLUR_PRESETS),
  },
  shadowOffsetX: {
    ...SHADOW_OFFSET_FIELD,
    defaultValue: DEFAULT_SHADOW.offsetX,
  },
  shadowOffsetY: {
    ...SHADOW_OFFSET_FIELD,
    defaultValue: DEFAULT_SHADOW.offsetY,
  },
});

// Each slider value field's slot in the form, and its label.
const SLIDER_VALUE_FIELD_SLOTS = Object.freeze({
  fontSize: { slot: "text-style-font-size", labelKey: "fontSizeLabel" },
  lineHeight: { slot: "text-style-line-height", labelKey: "lineHeightLabel" },
  strokeWidth: {
    slot: "text-style-outline-thickness",
    labelKey: "outlineThicknessLabel",
  },
  shadowAlpha: {
    slot: "text-style-shadow-opacity",
    labelKey: "shadowOpacityLabel",
  },
  shadowBlur: { slot: "text-style-shadow-blur", labelKey: "shadowBlurLabel" },
  shadowOffsetX: {
    slot: "text-style-shadow-offset-x",
    labelKey: "shadowOffsetXLabel",
  },
  shadowOffsetY: {
    slot: "text-style-shadow-offset-y",
    labelKey: "shadowOffsetYLabel",
  },
});

const createSliderSlotField = (name, copy, { required = false } = {}) => {
  const { slot, labelKey } = SLIDER_VALUE_FIELD_SLOTS[name];
  return { type: "slot", slot, label: copy[labelKey], required };
};

// The slider value fields the page puts in the form's slots, with the form's
// values. A field whose section is hidden has no slot to show in.
export const buildTextStyleSliderValueFields = ({ formValues, copy }) =>
  Object.entries(SLIDER_VALUE_FIELD_SLOTS).map(
    ([name, { slot, labelKey }]) => ({
      name,
      slot,
      label: copy[labelKey],
      value: formValues[name],
      field: TEXT_STYLE_SLIDER_FIELDS[name],
    }),
  );

const SHADOW_FIELD_KEYS = {
  shadowAlpha: "alpha",
  shadowBlur: "blur",
  shadowOffsetX: "offsetX",
  shadowOffsetY: "offsetY",
};

const toFiniteNumber = (value) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
};

// The value a form field keeps, or undefined when it cannot keep it, such
// as an empty or negative font size.
const normalizeFieldValue = (name, value) => {
  if (name === "fontWeight") {
    return value ? String(value) : undefined;
  }

  const numericValue = toFiniteNumber(value);
  if (numericValue === undefined) {
    return undefined;
  }
  if (name === "fontSize" || name === "lineHeight") {
    return numericValue > 0 ? numericValue : undefined;
  }
  if (name === "strokeWidth" || name === "shadowBlur") {
    return Math.max(0, numericValue);
  }
  if (name === "shadowAlpha") {
    return Math.min(1, Math.max(0, numericValue));
  }
  return numericValue;
};

// Applies the one field that changed onto the values. A value the field
// cannot keep is dropped, and one kept differently from how it was typed,
// such as an opacity above 1, shows as it is kept: both refresh the form.
export const applyTextStyleFormChange = (values, { name, value }) => {
  const normalizedValue = normalizeFieldValue(name, value);
  const nextValues = { ...values };
  const shadowKey = SHADOW_FIELD_KEYS[name];
  if (normalizedValue !== undefined) {
    if (shadowKey && values.shadow) {
      nextValues.shadow = { ...values.shadow, [shadowKey]: normalizedValue };
    } else if (name === "strokeWidth" && values.strokeColorId) {
      nextValues.strokeWidth = normalizedValue;
    } else if (TEXT_FORM_FIELDS.includes(name)) {
      nextValues[name] = normalizedValue;
    }
  }

  return {
    values: nextValues,
    refreshForm:
      String(value) !== String(buildTextStyleFormValues(nextValues)[name]),
  };
};

// A new primary font replaces the fallback fonts after it; picking the same
// font keeps them.
export const applyTextStyleFontChange = (values, { fontId, fontWeight }) => {
  const nextValues = { ...values };
  if (fontId && toPrimaryFontId(values.fontId) !== fontId) {
    nextValues.fontId = [fontId];
  }
  if (fontWeight !== undefined) {
    nextValues.fontWeight = String(fontWeight);
  }
  return nextValues;
};

// The colors in the form's color selects: the text color, which a text
// style always has, and the outline and shadow colors, which clearing
// removes.
export const TEXT_STYLE_COLOR_FIELDS = Object.freeze([
  "colorId",
  "strokeColorId",
  "shadowColorId",
]);

export const applyTextStyleColorChange = (values, { field, colorId }) => {
  const nextValues = { ...values };
  if (field === "colorId") {
    if (colorId) {
      nextValues.colorId = colorId;
    }
    return nextValues;
  }

  if (field === "strokeColorId") {
    nextValues.strokeColorId = colorId;
    if (!colorId) {
      nextValues.strokeWidth = 0;
    } else if (!values.strokeColorId && values.strokeWidth === 0) {
      nextValues.strokeWidth = DEFAULT_OUTLINE_WIDTH;
    }
    return nextValues;
  }

  if (field === "shadowColorId") {
    nextValues.shadow = colorId
      ? { ...DEFAULT_SHADOW, ...values.shadow, colorId }
      : undefined;
  }
  return nextValues;
};

export const selectTextStyleColorValue = (values, field) =>
  field === "shadowColorId" ? values.shadow?.colorId : values[field];

export const createTextStyleForm = ({
  copy = {},
  fontWeightOptions = [],
  showOutlineWidth = false,
  showShadowFields = false,
} = {}) => {
  const fields = [
    {
      type: "slot",
      slot: "text-style-font",
      label: copy.fontLabel,
      required: true,
    },
    createSliderSlotField("fontSize", copy, { required: true }),
    createSliderSlotField("lineHeight", copy, { required: true }),
    {
      name: "fontWeight",
      type: "select",
      label: copy.fontWeightLabel,
      placeholder: copy.chooseFontWeightPlaceholder,
      options: fontWeightOptions,
      clearable: false,
      required: true,
    },
    {
      type: "slot",
      slot: "text-style-color",
      label: copy.colorLabel,
      required: true,
    },
  ];

  // Outline and shadow each get their own section, under a separator.
  const outlineFields = [
    {
      type: "slot",
      slot: "text-style-outline-color",
      label: copy.outlineColorLabel,
    },
  ];
  if (showOutlineWidth) {
    outlineFields.push(createSliderSlotField("strokeWidth", copy));
  }
  fields.push({
    type: "section",
    id: "outline",
    label: copy.outlineSectionLabel,
    fields: outlineFields,
  });

  const shadowFields = [
    {
      type: "slot",
      slot: "text-style-shadow-color",
      label: copy.shadowColorLabel,
    },
  ];
  if (showShadowFields) {
    shadowFields.push(
      createSliderSlotField("shadowAlpha", copy),
      createSliderSlotField("shadowBlur", copy),
      createSliderSlotField("shadowOffsetX", copy),
      createSliderSlotField("shadowOffsetY", copy),
    );
  }
  fields.push({
    type: "section",
    id: "shadow",
    label: copy.shadowSectionLabel,
    fields: shadowFields,
  });

  return {
    fields,
    actions: {
      layout: "",
      buttons: [],
    },
  };
};
