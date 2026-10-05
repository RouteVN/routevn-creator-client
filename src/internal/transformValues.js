// The values a transform saves. A new transform places its target at the
// top-left corner, as is, and a value a transform lacks reads as this
// default.
export const DEFAULT_TRANSFORM_VALUES = Object.freeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  anchorX: 0,
  anchorY: 0,
  rotation: 0,
});

export const TRANSFORM_VALUE_FIELDS = Object.freeze(
  Object.keys(DEFAULT_TRANSFORM_VALUES),
);
