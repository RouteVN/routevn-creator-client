import {
  getSliderRange,
  getSliderStepButtons,
} from "../../internal/ui/sliderPopover.js";

// A number that opens a popover with a slider, and a row with a Presets
// menu, step buttons, and Submit. The popover's value shows on the page as it
// moves and changes the number on Submit or Enter; closing the popover leaves
// the number as it was.
const SLIDER_PRESETS_SLOT = "slider-presets";

export const createInitialState = () => ({
  popover: { open: false, key: 0, x: 0, y: 0, value: undefined },
});

export const openPopover = ({ state }, { x, y, value } = {}) => {
  state.popover.open = true;
  state.popover.key += 1;
  state.popover.x = x;
  state.popover.y = y;
  state.popover.value = value;
};

export const closePopover = ({ state }) => {
  state.popover.open = false;
};

// The popover's value as it moves, which its form keeps through a render.
export const setPopoverValue = ({ state }, { value } = {}) => {
  state.popover.value = value;
};

export const selectPopoverOpen = ({ state }) => state.popover.open;

export const selectPopoverValue = ({ state }) => state.popover.value;

export const selectViewData = ({ state, props, i18n }) => {
  const copy = i18n.sliderValueField;
  const { field } = props;
  const value = props.value ?? field.defaultValue;
  const range = getSliderRange({ field });

  return {
    label: props.label ?? "",
    valueText: field.unit ? `${value} ${field.unit}` : `${value}`,
    popover: state.popover,
    popoverForm: {
      fields: [
        {
          name: "value",
          type: "slider-with-input",
          min: range.min,
          max: range.max,
          sliderMin: range.sliderMin,
          sliderMax: range.sliderMax,
          step: range.step,
        },
        { type: "slot", slot: SLIDER_PRESETS_SLOT },
      ],
    },
    popoverDefaultValues: { value: state.popover.value },
    presetsLabel: copy.presetsLabel,
    submitLabel: copy.submitLabel,
    stepButtons: getSliderStepButtons({ field, copy }),
  };
};
