const SPRITE_BLUR_KERNEL_SIZE_OPTIONS = [5, 7, 9, 11, 13, 15];

const DEFAULT_SPRITE_BLUR = {
  x: 6,
  y: 9,
  quality: 3,
  kernelSize: 9,
  repeatEdgePixels: true,
};

export const isSpriteBlurValue = (value) => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const normalizeBlurNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const normalizeBlurBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true";
};

const normalizeBlurKernelSize = (value) => {
  const parsedValue = normalizeBlurNumber(
    value,
    DEFAULT_SPRITE_BLUR.kernelSize,
  );

  if (SPRITE_BLUR_KERNEL_SIZE_OPTIONS.includes(parsedValue)) {
    return parsedValue;
  }

  return SPRITE_BLUR_KERNEL_SIZE_OPTIONS.reduce((closest, option) => {
    const currentDistance = Math.abs(option - parsedValue);
    const closestDistance = Math.abs(closest - parsedValue);
    return currentDistance < closestDistance ? option : closest;
  }, DEFAULT_SPRITE_BLUR.kernelSize);
};

export const normalizeSpriteBlur = (blur = {}) => ({
  x: normalizeBlurNumber(blur.x, DEFAULT_SPRITE_BLUR.x),
  y: normalizeBlurNumber(blur.y, DEFAULT_SPRITE_BLUR.y),
  quality: normalizeBlurNumber(blur.quality, DEFAULT_SPRITE_BLUR.quality),
  kernelSize: normalizeBlurKernelSize(blur.kernelSize),
  repeatEdgePixels: normalizeBlurBoolean(
    blur.repeatEdgePixels,
    DEFAULT_SPRITE_BLUR.repeatEdgePixels,
  ),
});

export const createSpriteBlurDialogDefaults = (blur) => {
  const normalizedBlur = normalizeSpriteBlur(
    isSpriteBlurValue(blur) ? blur : DEFAULT_SPRITE_BLUR,
  );

  return {
    blurX: normalizedBlur.x,
    blurY: normalizedBlur.y,
    blurQuality: normalizedBlur.quality,
    blurKernelSize: normalizedBlur.kernelSize,
    blurRepeatEdgePixels: normalizedBlur.repeatEdgePixels,
  };
};

export const createSpriteBlurFromDialogValues = (values = {}) =>
  normalizeSpriteBlur({
    x: values.blurX,
    y: values.blurY,
    quality: values.blurQuality,
    kernelSize: values.blurKernelSize,
    repeatEdgePixels: values.blurRepeatEdgePixels,
  });

export const createSpriteBlurForm = ({
  submitLabel = "Add Blur",
  copy = {},
} = {}) => ({
  title: copy.blurTitle ?? "Blur",
  fields: [
    {
      name: "blurX",
      label: copy.blurXLabel ?? "Blur X",
      type: "input-number",
    },
    {
      name: "blurY",
      label: copy.blurYLabel ?? "Blur Y",
      type: "input-number",
    },
    {
      name: "blurQuality",
      label: copy.qualityLabel ?? "Quality",
      type: "input-number",
    },
    {
      name: "blurKernelSize",
      label: copy.kernelSizeLabel ?? "Kernel Size",
      type: "select",
      clearable: false,
      options: SPRITE_BLUR_KERNEL_SIZE_OPTIONS.map((value) => ({
        value,
        label: String(value),
      })),
    },
    {
      name: "blurRepeatEdgePixels",
      label: copy.repeatEdgePixelsLabel ?? "Repeat Edge Pixels",
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: copy.noOption ?? "No" },
        { value: true, label: copy.yesOption ?? "Yes" },
      ],
    },
  ],
  actions: {
    buttons: [
      {
        id: "cancel",
        variant: "se",
        label: copy.cancelButton ?? "Cancel",
        align: "left",
      },
      {
        id: "submit",
        variant: "pr",
        label: submitLabel,
        validate: true,
      },
    ],
  },
});

export const getSpriteBlurSummary = (blur, copy = {}) => {
  if (!isSpriteBlurValue(blur)) {
    return copy.noBlurSummary ?? "No blur";
  }

  const normalizedBlur = normalizeSpriteBlur(blur);
  const edgeLabel = normalizedBlur.repeatEdgePixels
    ? (copy.repeatEdgeSummary ?? "repeat edge")
    : (copy.noRepeatEdgeSummary ?? "no repeat edge");

  return `X ${normalizedBlur.x}, Y ${normalizedBlur.y}, ${copy.qualitySummaryLabel ?? "quality"} ${normalizedBlur.quality}, ${copy.kernelSummaryLabel ?? "kernel"} ${normalizedBlur.kernelSize}, ${edgeLabel}`;
};
