export const AUDIO_EFFECT_PROPERTY_CONFIG = Object.freeze({
  volume: Object.freeze({
    defaultValue: 100,
    max: 100,
    min: 0,
    step: 1,
  }),
  pan: Object.freeze({
    defaultValue: 0,
    max: 1,
    min: -1,
    step: 0.05,
  }),
  playbackRate: Object.freeze({
    defaultValue: 1,
    min: 0,
    step: 0.05,
  }),
});

export const AUDIO_EFFECT_PROPERTY_KEYS = Object.freeze([
  "volume",
  "pan",
  "playbackRate",
]);

export const AUDIO_EFFECT_KEYFRAME_MENU_ITEMS = Object.freeze([
  Object.freeze({
    label: "Edit keyframe",
    type: "item",
    value: "edit",
  }),
  Object.freeze({
    label: "Add keyframe to right",
    type: "item",
    value: "add-right",
  }),
  Object.freeze({
    label: "Add keyframe to left",
    type: "item",
    value: "add-left",
  }),
  Object.freeze({
    label: "Delete keyframe",
    type: "item",
    value: "delete-keyframe",
  }),
]);

export const SUPPORTED_AUDIO_EFFECT_EASINGS = Object.freeze([
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
]);
