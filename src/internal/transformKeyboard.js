const ARROW_KEY_DIRECTIONS = Object.freeze({
  ArrowUp: { axis: "y", direction: -1 },
  ArrowDown: { axis: "y", direction: 1 },
  ArrowLeft: { axis: "x", direction: -1 },
  ArrowRight: { axis: "x", direction: 1 },
});

export const isTransformArrowKey = (key) => {
  return Object.hasOwn(ARROW_KEY_DIRECTIONS, key);
};

export const createTransformKeyboardIntent = ({
  key,
  shiftKey = false,
  resize = false,
  unit = 1,
  fastUnit = 10,
} = {}) => {
  const direction = ARROW_KEY_DIRECTIONS[key];
  if (!direction) {
    return undefined;
  }

  const resolvedUnit = Number(shiftKey ? fastUnit : unit);
  const delta = Number.isFinite(resolvedUnit)
    ? direction.direction * resolvedUnit
    : direction.direction;

  return {
    type: resize ? "resize" : "move",
    axis: direction.axis,
    delta,
  };
};

export const applyTransformPositionIntent = (transform, intent) => {
  if (!transform || intent?.type !== "move") {
    return transform;
  }

  const fieldName = intent.axis === "y" ? "y" : "x";
  const currentValue = Number(transform[fieldName]);
  const delta = Number(intent.delta);
  if (!Number.isFinite(currentValue) || !Number.isFinite(delta)) {
    return transform;
  }

  return {
    ...transform,
    [fieldName]: currentValue + delta,
  };
};
