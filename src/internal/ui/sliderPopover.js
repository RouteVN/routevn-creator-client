import { formatI18nCopy } from "./i18nCopy.js";

// A slider popover edits one number with a slider, and a row with a Presets
// menu, four step buttons, and Submit. Its field gives `step` and the larger
// `fastStep`; `min` and `max`, which bound the value itself; `range`, where
// the slider runs, when smaller than `min` to `max`; `defaultValue`, which an
// unset value starts from; and `stepsAsPercent`, set where the steps read as
// percentages, as the field's presets do.

const getStepDecimals = (step) => `${step}`.split(".")[1]?.length ?? 0;

// The slider runs over the range, or `min` to `max` without one. A value can
// be typed past the slider's ends, within `min` and `max`; the slider then
// rests at the nearer end.
export const getSliderRange = ({
  field,
  range = field.range,
  min = field.min,
  max = field.max,
}) => ({
  min,
  max,
  sliderMin: range?.min ?? min,
  sliderMax: range?.max ?? max,
  step: field.step,
});

// A step's size as its button shows it: 0.25 is 25% where the steps read as
// percentages.
const formatStepAmount = ({ field, delta }) => {
  const amount = Math.abs(delta);
  return field.stepsAsPercent ? `${Math.round(amount * 100)}%` : `${amount}`;
};

// The step buttons show what they add: the larger step down, the step down,
// the step up, and the larger step up, as −4 −1 +1 +4.
export const getSliderStepButtons = ({ field, copy = {} }) =>
  [-field.fastStep, -field.step, field.step, field.fastStep].map((delta) => {
    const amount = formatStepAmount({ field, delta });
    return {
      delta,
      text: `${delta < 0 ? "−" : "+"}${amount}`,
      label: formatI18nCopy(
        delta < 0
          ? (copy.decreaseByLabel ?? "Decrease by {step}")
          : (copy.increaseByLabel ?? "Increase by {step}"),
        { step: amount },
      ),
    };
  });

// Enter submits a slider popover. Its form submits on Enter only through
// its own actions, which a slider popover leaves out for the Submit button in
// its row, so Enter counts unless the form took it or it pressed a button.
export const isSliderPopoverSubmitKey = (event) =>
  event.key === "Enter" &&
  !event.shiftKey &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.isComposing &&
  !event.defaultPrevented &&
  !event
    .composedPath()
    .some(
      (target) =>
        target?.tagName === "BUTTON" ||
        target?.tagName === "RTGL-BUTTON" ||
        target?.getAttribute?.("role") === "button",
    );

// A value moved by a step, rounded to the step and kept within the field's
// bounds, or the bounds given.
export const stepSliderValue = ({
  field,
  value,
  delta,
  min = field.min,
  max = field.max,
}) => {
  const decimals = getStepDecimals(field.step);
  let stepped = Number((Number(value) + Number(delta)).toFixed(decimals));
  if (Number.isFinite(min)) {
    stepped = Math.max(min, stepped);
  }
  if (Number.isFinite(max)) {
    stepped = Math.min(max, stepped);
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
