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

// A phone: a touch window whose short side is under 600 logical pixels,
// Android's line between phones and tablets, outside the touch landscape
// layout. Tablets stay over it in either orientation; a window not measured
// yet does not count.
const TOUCH_PHONE_MAX_SHORT_SIDE = 600;

export const isTouchPhone = ({ isTouchMode, width, height }) =>
  isTouchMode &&
  width > 0 &&
  height > 0 &&
  Math.min(width, height) < TOUCH_PHONE_MAX_SHORT_SIDE &&
  !isTouchLandscape({ isTouchMode, width, height });
