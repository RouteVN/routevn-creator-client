const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const createTransformSelectionHitArea = ({
  id,
  width,
  height,
  fill,
  border,
  draggable = true,
} = {}) => {
  const resolvedWidth = toPositiveNumber(width);
  const resolvedHeight = toPositiveNumber(height);
  if (!id || !resolvedWidth || !resolvedHeight) {
    return undefined;
  }

  const hitArea = {
    id,
    type: "rect",
    x: 0,
    y: 0,
    width: resolvedWidth,
    height: resolvedHeight,
    fill,
  };

  if (border) {
    hitArea.border = border;
  }

  if (draggable) {
    hitArea.hover = {
      cursor: "all-scroll",
    };
    hitArea.drag = {
      start: { payload: {} },
      move: { payload: {} },
      end: { payload: {} },
    };
  }

  return hitArea;
};

export const createTransformSelectionAnchor = ({
  id,
  width,
  height,
  anchorX = 0,
  anchorY = 0,
  size,
  fill,
  border,
} = {}) => {
  const resolvedWidth = toPositiveNumber(width);
  const resolvedHeight = toPositiveNumber(height);
  const resolvedSize = toPositiveNumber(size);
  if (!id || !resolvedWidth || !resolvedHeight || !resolvedSize) {
    return undefined;
  }

  const marker = {
    id,
    type: "rect",
    x: resolvedWidth * anchorX - resolvedSize / 2,
    y: resolvedHeight * anchorY - resolvedSize / 2,
    width: resolvedSize,
    height: resolvedSize,
    fill,
  };

  if (border) {
    marker.border = border;
  }

  return marker;
};

const RESIZE_CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];

// The cursor follows the direction the edge moves in on screen, to the
// nearest 45 degrees. Rotation is clockwise, as drawn.
const getResizeCursor = ({ vertical, rotation }) => {
  const angle =
    (Number.isFinite(rotation) ? rotation : 0) + (vertical ? 0 : 90);
  const step = Math.round(angle / 45);

  return RESIZE_CURSORS[((step % 4) + 4) % 4];
};

export const createTransformSelectionResizeHandle = ({
  id,
  width,
  height,
  edge,
  size,
  fill,
  rotation = 0,
} = {}) => {
  const resolvedWidth = toPositiveNumber(width);
  const resolvedHeight = toPositiveNumber(height);
  const resolvedSize = toPositiveNumber(size);
  const vertical = edge === "left" || edge === "right";
  const horizontal = edge === "top" || edge === "bottom";
  if (
    !id ||
    !resolvedWidth ||
    !resolvedHeight ||
    !resolvedSize ||
    (!vertical && !horizontal)
  ) {
    return undefined;
  }

  return {
    id,
    type: "rect",
    x:
      edge === "left"
        ? -resolvedSize / 2
        : edge === "right"
          ? resolvedWidth - resolvedSize / 2
          : 0,
    y:
      edge === "top"
        ? -resolvedSize / 2
        : edge === "bottom"
          ? resolvedHeight - resolvedSize / 2
          : 0,
    width: vertical ? resolvedSize : resolvedWidth,
    height: vertical ? resolvedHeight : resolvedSize,
    fill,
    hover: {
      cursor: getResizeCursor({ vertical, rotation }),
    },
    drag: {
      start: { payload: {} },
      move: { payload: {} },
      end: { payload: {} },
    },
  };
};
