export const DEFAULT_COMMAND_LINE_ITEM_OPACITY = 1;

export const DEFAULT_COMMAND_LINE_ITEM_BLUR = {
  x: 6,
  y: 9,
  quality: 3,
  kernelSize: 9,
  repeatEdgePixels: true,
};

export const COMMAND_LINE_ITEM_BLUR_FIELD_NAMES = [
  "x",
  "y",
  "quality",
  "kernelSize",
  "repeatEdgePixels",
];

export const COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_OPTIONS = [5, 7, 9, 11, 13, 15];

export const COMMAND_LINE_ITEM_BLUR_TOGGLE_OPTIONS = [
  { value: false, label: "No Blur" },
  { value: true, label: "Blur" },
];

export const COMMAND_LINE_ITEM_BLUR_REPEAT_EDGE_OPTIONS = [
  { value: false, label: "No" },
  { value: true, label: "Yes" },
];

export const COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_SELECT_OPTIONS =
  COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_OPTIONS.map((value) => ({
    value,
    label: String(value),
  }));

export const normalizeCommandLineItemOpacity = (opacity) => {
  if (opacity === undefined || opacity === null || opacity === "") {
    return undefined;
  }

  const parsedOpacity = Number(opacity);
  if (!Number.isFinite(parsedOpacity)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, parsedOpacity));
};

const normalizeCommandLineItemBlurNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const normalizeCommandLineItemBlurBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true";
};

const normalizeCommandLineItemBlurKernelSize = (value) => {
  const parsedValue = normalizeCommandLineItemBlurNumber(
    value,
    DEFAULT_COMMAND_LINE_ITEM_BLUR.kernelSize,
  );

  if (COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_OPTIONS.includes(parsedValue)) {
    return parsedValue;
  }

  return COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_OPTIONS.reduce(
    (closest, option) => {
      const currentDistance = Math.abs(option - parsedValue);
      const closestDistance = Math.abs(closest - parsedValue);
      return currentDistance < closestDistance ? option : closest;
    },
    DEFAULT_COMMAND_LINE_ITEM_BLUR.kernelSize,
  );
};

export const normalizeCommandLineItemBlur = (blur = {}) => {
  const source =
    blur && typeof blur === "object" && !Array.isArray(blur) ? blur : {};

  return {
    x: normalizeCommandLineItemBlurNumber(
      source.x,
      DEFAULT_COMMAND_LINE_ITEM_BLUR.x,
    ),
    y: normalizeCommandLineItemBlurNumber(
      source.y,
      DEFAULT_COMMAND_LINE_ITEM_BLUR.y,
    ),
    quality: normalizeCommandLineItemBlurNumber(
      source.quality,
      DEFAULT_COMMAND_LINE_ITEM_BLUR.quality,
    ),
    kernelSize: normalizeCommandLineItemBlurKernelSize(source.kernelSize),
    repeatEdgePixels: normalizeCommandLineItemBlurBoolean(
      source.repeatEdgePixels,
      DEFAULT_COMMAND_LINE_ITEM_BLUR.repeatEdgePixels,
    ),
  };
};

export const normalizeCommandLineItemBlurEnabled = (value) => {
  return value === true || value === "true";
};

export const normalizeCommandLineItemBlurWithField = ({
  blur,
  fieldName,
  value,
} = {}) => {
  const nextBlur = normalizeCommandLineItemBlur(
    blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
  );

  if (!COMMAND_LINE_ITEM_BLUR_FIELD_NAMES.includes(fieldName)) {
    return nextBlur;
  }

  nextBlur[fieldName] = value;
  return normalizeCommandLineItemBlur(nextBlur);
};

export const normalizeCommandLineItemEffects = (item = {}) => {
  const nextItem = {
    ...item,
  };
  const opacity = normalizeCommandLineItemOpacity(nextItem.opacity);

  if (opacity === undefined) {
    delete nextItem.opacity;
  } else {
    nextItem.opacity = opacity;
  }

  if (nextItem.blur === null) {
    nextItem.blur = null;
  } else if (
    nextItem.blur &&
    typeof nextItem.blur === "object" &&
    !Array.isArray(nextItem.blur)
  ) {
    nextItem.blur = normalizeCommandLineItemBlur(nextItem.blur);
  } else {
    delete nextItem.blur;
  }

  return nextItem;
};
