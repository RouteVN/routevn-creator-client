import { normalizeLayoutRotation } from "../../../internal/project/layout.js";

export const LAYOUT_EDITOR_ROTATION_TARGET_ID = "selected-border-rotate";
export const LAYOUT_EDITOR_ROTATE_CURSOR =
  "url(/public/layout-editor-rotate-cursor.svg) 16 16, grab";

const FULL_ROTATION = 360;
const HALF_ROTATION = FULL_ROTATION / 2;

const toPointerAngle = ({ x, y, pivotX, pivotY } = {}) => {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(pivotX) ||
    !Number.isFinite(pivotY) ||
    (x === pivotX && y === pivotY)
  ) {
    return undefined;
  }

  return (Math.atan2(y - pivotY, x - pivotX) * HALF_ROTATION) / Math.PI;
};

const normalizeRotationDelta = (value) => {
  let normalized = value;

  while (normalized > HALF_ROTATION) {
    normalized -= FULL_ROTATION;
  }

  while (normalized < -HALF_ROTATION) {
    normalized += FULL_ROTATION;
  }

  return normalized;
};

export const createLayoutEditorRotationDragStart = ({
  x,
  y,
  pivotX,
  pivotY,
  itemRotation = 0,
} = {}) => {
  const pointerAngle = toPointerAngle({ x, y, pivotX, pivotY });
  if (pointerAngle === undefined) {
    return undefined;
  }

  return {
    pivotX,
    pivotY,
    pointerAngle,
    rotationDelta: 0,
    itemStartRotation: Number.isFinite(itemRotation)
      ? normalizeLayoutRotation(itemRotation)
      : 0,
  };
};

export const calculateLayoutEditorRotationDragUpdate = ({
  dragStart,
  x,
  y,
} = {}) => {
  const pointerAngle = toPointerAngle({
    x,
    y,
    pivotX: dragStart?.pivotX,
    pivotY: dragStart?.pivotY,
  });
  if (
    pointerAngle === undefined ||
    !Number.isFinite(dragStart?.pointerAngle) ||
    !Number.isFinite(dragStart?.itemStartRotation)
  ) {
    return undefined;
  }

  const rotationDelta =
    (dragStart.rotationDelta ?? 0) +
    normalizeRotationDelta(pointerAngle - dragStart.pointerAngle);
  const rotation = normalizeLayoutRotation(
    dragStart.itemStartRotation + rotationDelta,
  );

  return {
    pointerAngle,
    rotationDelta,
    rotation,
  };
};

export const resolveLayoutEditorRotationPivotFromBounds = ({ bounds } = {}) => {
  const corners = bounds?.corners ?? [];
  if (
    corners.length !== 4 ||
    corners.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))
  ) {
    return undefined;
  }

  return corners.reduce(
    (point, corner) => ({
      x: point.x + corner.x / corners.length,
      y: point.y + corner.y / corners.length,
    }),
    { x: 0, y: 0 },
  );
};
