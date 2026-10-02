// Desktop and mobile come from uiConfig. Touch landscape is a third layout
// derived from full app-window bounds, never screen orientation: Split View,
// multi-window, and keyboards make the screen shape differ from the window.
// Phones are locked to portrait natively, so only tablets qualify.
const TOUCH_LANDSCAPE_MIN_WIDTH = 768;
const TOUCH_LANDSCAPE_MIN_ASPECT_RATIO = 1;

export const isTouchLandscape = ({ isTouchMode, width, height }) =>
  isTouchMode &&
  width >= TOUCH_LANDSCAPE_MIN_WIDTH &&
  width / height > TOUCH_LANDSCAPE_MIN_ASPECT_RATIO;
