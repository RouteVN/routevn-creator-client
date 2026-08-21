const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export const mapRotatedPreviewClientPoint = (
  { clientX, clientY } = {},
  rect,
) => {
  const x = toFiniteNumber(clientX);
  const y = toFiniteNumber(clientY);
  const left = toFiniteNumber(rect?.left);
  const top = toFiniteNumber(rect?.top);
  const width = toFiniteNumber(rect?.width);
  const height = toFiniteNumber(rect?.height);

  if (
    x === undefined ||
    y === undefined ||
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return;
  }

  const relativeX = x - left;
  const relativeY = y - top;

  return {
    clientX: left + (relativeY / height) * width,
    clientY: top + (1 - relativeX / width) * height,
  };
};

const setEventCoordinate = (event, key, value) => {
  try {
    Object.defineProperty(event, key, {
      configurable: true,
      value,
    });
  } catch {
    return false;
  }

  return event[key] === value;
};

export const remapRotatedPreviewEventCoordinates = (event, rect) => {
  const mappedPoint = mapRotatedPreviewClientPoint(event, rect);
  if (!mappedPoint) {
    return false;
  }

  const didSetClientX = setEventCoordinate(
    event,
    "clientX",
    mappedPoint.clientX,
  );
  const didSetClientY = setEventCoordinate(
    event,
    "clientY",
    mappedPoint.clientY,
  );

  return didSetClientX && didSetClientY;
};
