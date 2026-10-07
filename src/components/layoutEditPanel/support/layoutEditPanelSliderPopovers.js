import { formatI18nCopy } from "../../../internal/ui/i18nCopy.js";

// The fields whose popover has a slider, a Presets menu, and step buttons.
// The steps are the mouse wheel's, the larger ones Shift's. A field left
// unset starts from its default, as the element draws it.
const SLIDER_POPOVER_FIELDS = {
  x: { step: 1, fastStep: 10 },
  y: { step: 1, fastStep: 10 },
  rotation: { defaultValue: 0, step: 1, fastStep: 15 },
  opacity: { defaultValue: 1, step: 0.01, fastStep: 0.1, min: 0, max: 1 },
};

// Shares of the project's width or height.
const POSITION_PRESETS = [
  { label: "0", ratio: 0 },
  { label: "1/5", ratio: 1 / 5 },
  { label: "1/4", ratio: 1 / 4 },
  { label: "1/3", ratio: 1 / 3 },
  { label: "1/2", ratio: 1 / 2 },
  { label: "2/3", ratio: 2 / 3 },
  { label: "3/5", ratio: 3 / 5 },
  { label: "3/4", ratio: 3 / 4 },
  { label: "4/5", ratio: 4 / 5 },
  { label: "1", ratio: 1 },
];

const ROTATION_PRESETS = [-180, -135, -90, -45, 0, 45, 90, 135, 180];

const OPACITY_PRESETS = [0, 0.25, 0.5, 0.75, 1];

const isPositionField = (name) => name === "x" || name === "y";

const getStepDecimals = (step) => `${step}`.split(".")[1]?.length ?? 0;

export const getSliderPopoverField = (name) => SLIDER_POPOVER_FIELDS[name];

export const isSliderPopoverField = (name) =>
  Object.hasOwn(SLIDER_POPOVER_FIELDS, name);

const getPositionDimension = ({ name, projectResolution }) =>
  Number(name === "y" ? projectResolution?.height : projectResolution?.width);

// X and Y run half the project's width or height beyond each edge, and
// rotation half a turn each way; both reach further to a value already
// outside. Opacity stays between 0 and 1.
export const getSliderPopoverRange = ({
  name,
  values = {},
  projectResolution,
  currentValue,
} = {}) => {
  const field = SLIDER_POPOVER_FIELDS[name];
  if (!field) {
    return undefined;
  }

  if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    return { min: field.min, max: field.max, step: field.step };
  }

  let min = -180;
  let max = 180;
  if (isPositionField(name)) {
    const dimension = getPositionDimension({ name, projectResolution });
    if (!Number.isFinite(dimension) || dimension <= 0) {
      return undefined;
    }
    min = Math.round(-dimension * 0.5);
    max = Math.round(dimension * 1.5);
  }

  for (const value of [values?.[name], currentValue]) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      continue;
    }
    if (number < min) {
      min = Math.floor(number);
    }
    if (number > max) {
      max = Math.ceil(number);
    }
  }

  return { min, max, step: field.step };
};

// The Presets menu: shares of the width or height with their pixels,
// rotations in degrees, and opacities as percentages with their values.
export const getSliderPopoverPresets = ({
  name,
  projectResolution,
  copy = {},
} = {}) => {
  if (isPositionField(name)) {
    const dimension = getPositionDimension({ name, projectResolution });
    if (!Number.isFinite(dimension) || dimension <= 0) {
      return [];
    }
    return POSITION_PRESETS.map((preset) => {
      const value = Math.round(dimension * preset.ratio);
      return {
        label: preset.label,
        value,
        suffixText: formatI18nCopy(copy.presetPixelsLabel, { value }),
      };
    });
  }

  if (name === "rotation") {
    return ROTATION_PRESETS.map((value) => ({ label: `${value}°`, value }));
  }

  if (name === "opacity") {
    return OPACITY_PRESETS.map((value) => ({
      label: `${Math.round(value * 100)}%`,
      value,
      suffixText: `${value}`,
    }));
  }

  return [];
};

// −−, −, + and ++ (minus signs, the width of the plus): the field's step,
// and its larger step.
export const getSliderPopoverStepButtons = ({ name, copy = {} } = {}) => {
  const field = SLIDER_POPOVER_FIELDS[name];
  if (!field) {
    return [];
  }

  return [
    { delta: -field.fastStep, text: "−−" },
    { delta: -field.step, text: "−" },
    { delta: field.step, text: "+" },
    { delta: field.fastStep, text: "++" },
  ].map((button) => ({
    ...button,
    label: formatI18nCopy(
      button.delta < 0 ? copy.decreaseByLabel : copy.increaseByLabel,
      { step: Math.abs(button.delta) },
    ),
  }));
};

// A value moved by a step, rounded to the step and kept in the field's
// range when it has one.
export const stepSliderPopoverValue = ({ name, value, delta } = {}) => {
  const field = SLIDER_POPOVER_FIELDS[name];
  const decimals = getStepDecimals(field.step);
  const stepped = Number((Number(value) + Number(delta)).toFixed(decimals));
  if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    return Math.min(field.max, Math.max(field.min, stepped));
  }
  return stepped;
};
