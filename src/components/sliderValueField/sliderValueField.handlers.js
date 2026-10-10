import {
  isSliderPopoverSubmitKey,
  stepSliderValue,
  toSliderPresetMenuItems,
} from "../../internal/ui/sliderPopover.js";

// The popover opens under the field, from the value it shows.
export const handleValueClick = (deps, payload) => {
  const { props, render, store } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openPopover({
    x: rect.left + rect.width / 2,
    y: rect.bottom,
    value: props.value ?? props.field.defaultValue,
  });
  render();
};

export const handleValueKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") {
    return;
  }

  _event.preventDefault();
  handleValueClick(deps, payload);
};

// Every change in the popover shows on the page as it happens.
const previewPopoverValue = (deps, value) => {
  const { dispatchEvent, store } = deps;
  store.setPopoverValue({ value });
  dispatchEvent(new CustomEvent("value-input", { detail: { value } }));
};

export const handleFormInput = (deps, payload) => {
  previewPopoverValue(deps, payload._event.detail.values.value);
};

export const handleFormChange = (deps, payload) => {
  const { render } = deps;
  previewPopoverValue(deps, payload._event.detail.values.value);
  render();
};

// A value the popover sets itself goes into its form in place, since
// rebuilding the form would replace a step button that is held.
const showPopoverValue = (deps, value) => {
  const { refs, render } = deps;
  previewPopoverValue(deps, value);
  render();
  refs.form.setValues({ values: { value } });
};

export const handlePresetsButtonClick = async (deps, payload) => {
  const { appService, props } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  const result = await appService.showDropdownMenu({
    items: toSliderPresetMenuItems(props.field.presets),
    x: rect.left,
    y: rect.bottom,
    place: "bs",
  });

  const value = Number(result?.item?.key);
  if (result?.item === undefined || !Number.isFinite(value)) {
    return;
  }
  showPopoverValue(deps, value);
};

// Held, a step button keeps stepping.
export const handleStepPress = (deps, payload) => {
  const { props, store } = deps;
  const delta = Number(payload._event.currentTarget.dataset.delta);
  const value = Number(store.selectPopoverValue());
  if (!Number.isFinite(value) || !Number.isFinite(delta)) {
    return;
  }

  showPopoverValue(deps, stepSliderValue({ field: props.field, value, delta }));
};

// Submit and Enter change the number to the form's value.
const submitPopoverValue = (deps) => {
  const { dispatchEvent, refs, render, store } = deps;
  const { value } = refs.form.getValues();
  store.closePopover();
  render();
  dispatchEvent(new CustomEvent("value-change", { detail: { value } }));
};

export const handleSubmitClick = (deps) => {
  submitPopoverValue(deps);
};

export const handleFormKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (!isSliderPopoverSubmitKey(_event)) {
    return;
  }

  _event.preventDefault();
  submitPopoverValue(deps);
};

// The popover also reports closing after Submit, which already closed it.
export const handlePopoverClose = (deps) => {
  const { dispatchEvent, render, store } = deps;
  if (!store.selectPopoverOpen()) {
    return;
  }

  store.closePopover();
  render();
  dispatchEvent(new CustomEvent("value-cancel"));
};
