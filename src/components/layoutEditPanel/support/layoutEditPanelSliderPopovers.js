import { formatI18nCopy } from "../../../internal/ui/i18nCopy.js";
import {
  getSliderRange,
  getSliderStepButtons,
  stepSliderValue,
} from "../../../internal/ui/sliderPopover.js";

// The fields whose popover has a slider, a Presets menu, and step buttons.
// The steps are the mouse wheel's, the larger ones Shift's. A field left
// unset starts from its default, as the element draws it. `range` is where
// the slider runs, reaching further to a value already outside; `min` and
// `max` bound the value itself.
const SCALE_FIELD = {
  defaultValue: 1,
  step: 0.01,
  fastStep: 0.1,
  range: { min: 0, max: 2 },
};

const SLIDER_POPOVER_FIELDS = {
  x: { step: 1, fastStep: 10 },
  y: { step: 1, fastStep: 10 },
  rotation: {
    defaultValue: 0,
    step: 1,
    fastStep: 15,
    range: { min: -180, max: 180 },
  },
  scaleX: SCALE_FIELD,
  scaleY: SCALE_FIELD,
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

const SCALE_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

// A share as a percentage, with its value beside it.
const toPercentPreset = (value) => ({
  label: `${Math.round(value * 100)}%`,
  value,
  suffixText: `${value}`,
});

const isPositionField = (name) => name === "x" || name === "y";

export const getSliderPopoverField = (name) => SLIDER_POPOVER_FIELDS[name];

export const isSliderPopoverField = (name) =>
  Object.hasOwn(SLIDER_POPOVER_FIELDS, name);

const getPositionDimension = ({ name, projectResolution }) =>
  Number(name === "y" ? projectResolution?.height : projectResolution?.width);

// X and Y run half the project's width or height beyond each edge, rotation
// half a turn each way, and scale from 0 to 2; all reach further to a value
// already outside. Opacity stays between 0 and 1.
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

  let { range } = field;
  if (isPositionField(name)) {
    const dimension = getPositionDimension({ name, projectResolution });
    if (!Number.isFinite(dimension) || dimension <= 0) {
      return undefined;
    }
    range = {
      min: Math.round(-dimension * 0.5),
      max: Math.round(dimension * 1.5),
    };
  }

  return getSliderRange({
    field,
    range,
    values: [values?.[name], currentValue],
  });
};

// The Presets menu: shares of the width or height with their pixels,
// rotations in degrees, and scales and opacities as percentages with their
// values.
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
        suffixText: formatI18nCopy(copy.presetPixelsLabel ?? "{value} px", {
          value,
        }),
      };
    });
  }

  if (name === "rotation") {
    return ROTATION_PRESETS.map((value) => ({ label: `${value}°`, value }));
  }

  if (name === "scaleX" || name === "scaleY") {
    return SCALE_PRESETS.map(toPercentPreset);
  }

  if (name === "opacity") {
    return OPACITY_PRESETS.map(toPercentPreset);
  }

  return [];
};

// The step buttons move by the field's steps.
export const getSliderPopoverStepButtons = ({ name, copy = {} } = {}) => {
  const field = SLIDER_POPOVER_FIELDS[name];
  return field ? getSliderStepButtons({ field, copy }) : [];
};

// A value moved by a step, rounded to the step and kept within the field's
// bounds.
export const stepSliderPopoverValue = ({ name, value, delta } = {}) =>
  stepSliderValue({ field: SLIDER_POPOVER_FIELDS[name], value, delta });

const isScaleField = (name) => name === "scaleX" || name === "scaleY";

// Scale popovers offer to keep the aspect ratio.
export const hasAspectRatioToggle = (name) => isScaleField(name);

// While the aspect ratio is kept, a scale change moves the other scale in
// proportion, from the values as they are saved; from 0, the two match.
export const getLinkedScaleValues = ({ name, value, values = {} } = {}) => {
  const next = Number(value);
  if (!isScaleField(name) || !Number.isFinite(next)) {
    return undefined;
  }

  const partner = name === "scaleX" ? "scaleY" : "scaleX";
  const current = Number(values[name] ?? 1);
  const partnerValue = Number(values[partner] ?? 1);
  const linked =
    Number.isFinite(current) && current !== 0 && Number.isFinite(partnerValue)
      ? partnerValue * (next / current)
      : next;
  return { [partner]: Number(linked.toFixed(2)) };
};
