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

export const createTransformSelectionResizeHandle = ({
  id,
  width,
  height,
  edge,
  size,
  fill,
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
      cursor: vertical ? "ew-resize" : "ns-resize",
    },
    drag: {
      start: { payload: {} },
      move: { payload: {} },
      end: { payload: {} },
    },
  };
};
