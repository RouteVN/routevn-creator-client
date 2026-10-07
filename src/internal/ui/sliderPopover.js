import { formatI18nCopy } from "./i18nCopy.js";

// A slider popover edits one number with a slider, a Presets menu, and four
// step buttons. Its field gives `step` and the larger `fastStep`; `range`,
// where the slider runs; `min` and `max`, either or both, which bound the
// value itself; and `defaultValue`, which an unset value starts from.

const getStepDecimals = (step) => `${step}`.split(".")[1]?.length ?? 0;

// The slider runs `min` to `max` when the field has both, and over its range
// otherwise, reaching further to a value already outside it.
export const getSliderRange = ({ field, range = field.range, values = [] }) => {
  if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    return { min: field.min, max: field.max, step: field.step };
  }

  let { min, max } = range;
  for (const value of values) {
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

// The step buttons: the larger step down and the step down (two overlapping
// minus signs, and one), then the step up and the larger step up.
export const getSliderStepButtons = ({ field, copy = {} }) =>
  [
    { delta: -field.fastStep, icon: "minusDouble" },
    { delta: -field.step, icon: "minus" },
    { delta: field.step, icon: "plus" },
    { delta: field.fastStep, icon: "plusDouble" },
  ].map((button) => ({
    ...button,
    label: formatI18nCopy(
      button.delta < 0
        ? (copy.decreaseByLabel ?? "Decrease by {step}")
        : (copy.increaseByLabel ?? "Increase by {step}"),
      { step: Math.abs(button.delta) },
    ),
  }));

// A value moved by a step, rounded to the step and kept within the field's
// bounds.
export const stepSliderValue = ({ field, value, delta }) => {
  const decimals = getStepDecimals(field.step);
  let stepped = Number((Number(value) + Number(delta)).toFixed(decimals));
  if (Number.isFinite(field.min)) {
    stepped = Math.max(field.min, stepped);
  }
  if (Number.isFinite(field.max)) {
    stepped = Math.min(field.max, stepped);
  }
  return stepped;
};

// The Presets menu's items, each keyed by its value, with the value on the
// right where the label is not the value itself.
export const toSliderPresetMenuItems = (presets = []) =>
  presets.map((preset) => {
    const item = {
      type: "item",
      label: preset.label,
      key: String(preset.value),
    };
    if (preset.suffixText) {
      item.suffixText = preset.suffixText;
    }
    return item;
  });
