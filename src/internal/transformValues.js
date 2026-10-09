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

const toFiniteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

// Rounds away floating-point noise, such as 1.9100000000000001.
export const roundTransformValue = (value, decimals = 4) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

// The values a transform saves, from a saved transform or the inspector.
export const normalizeTransformValues = (values = {}) => {
  const transform = {};
  for (const field of TRANSFORM_VALUE_FIELDS) {
    transform[field] = roundTransformValue(
      toFiniteNumber(values[field], DEFAULT_TRANSFORM_VALUES[field]),
    );
  }
  return transform;
};
