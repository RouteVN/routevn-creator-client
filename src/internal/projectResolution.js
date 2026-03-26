export const CUSTOM_PROJECT_RESOLUTION_PRESET = "custom";
export const DEFAULT_PROJECT_RESOLUTION_PRESET = "1920x1080";
export const DEFAULT_PROJECT_RESOLUTION = Object.freeze({
  width: 1920,
  height: 1080,
});

export const PROJECT_RESOLUTION_PRESETS = Object.freeze([
  {
    value: "1280x720",
    label: "1280x720",
    width: 1280,
    height: 720,
  },
  {
    value: DEFAULT_PROJECT_RESOLUTION_PRESET,
    label: "1920x1080",
    width: 1920,
    height: 1080,
  },
  {
    value: "qhd",
    label: "QHD (2560x1440)",
    width: 2560,
    height: 1440,
  },
  {
    value: "4k",
    label: "4K (3840x2160)",
    width: 3840,
    height: 2160,
  },
  {
    value: CUSTOM_PROJECT_RESOLUTION_PRESET,
    label: "Custom",
  },
]);

export const PROJECT_RESOLUTION_OPTIONS = PROJECT_RESOLUTION_PRESETS.map(
  ({ value, label }) => ({
    value,
    label,
  }),
);

const PROJECT_RESOLUTION_BY_PRESET = new Map(
  PROJECT_RESOLUTION_PRESETS.filter(
    (preset) => preset.width !== undefined && preset.height !== undefined,
  ).map((preset) => [
    preset.value,
    {
      width: preset.width,
      height: preset.height,
    },
  ]),
);

const parseProjectResolutionDimension = (value) => {
  const numericValue = Number(value);

  if (
    !Number.isFinite(numericValue) ||
    !Number.isInteger(numericValue) ||
    numericValue <= 0
  ) {
    return undefined;
  }

  return numericValue;
};

export const resolveProjectResolutionPreset = (preset) => {
  const resolution =
    PROJECT_RESOLUTION_BY_PRESET.get(preset) ??
    PROJECT_RESOLUTION_BY_PRESET.get(DEFAULT_PROJECT_RESOLUTION_PRESET);

  return resolution
    ? {
        width: resolution.width,
        height: resolution.height,
      }
    : {
        width: DEFAULT_PROJECT_RESOLUTION.width,
        height: DEFAULT_PROJECT_RESOLUTION.height,
      };
};

export const createProjectResolutionFormValues = (
  preset = DEFAULT_PROJECT_RESOLUTION_PRESET,
) => {
  const resolution = resolveProjectResolutionPreset(preset);

  return {
    resolution: preset,
    resolutionWidth: resolution.width,
    resolutionHeight: resolution.height,
  };
};

export const formatProjectResolution = (resolution) => {
  const requiredResolution = requireProjectResolution(resolution);

  return `${requiredResolution.width} × ${requiredResolution.height}`;
};

export const requireProjectResolution = (
  resolution,
  subject = "Project resolution",
) => {
  const width = parseProjectResolutionDimension(resolution?.width);
  const height = parseProjectResolutionDimension(resolution?.height);

  if (width === undefined || height === undefined) {
    throw new Error(
      `${subject} is required and must include positive integer width and height values.`,
    );
  }

  return { width, height };
};

export const resolveProjectResolutionForWrite = ({
  projectResolution,
  fallbackResolution,
} = {}) => {
  const width = parseProjectResolutionDimension(
    projectResolution?.width ?? fallbackResolution?.width,
  );
  const height = parseProjectResolutionDimension(
    projectResolution?.height ?? fallbackResolution?.height,
  );

  if (width !== undefined && height !== undefined) {
    return { width, height };
  }

  return {
    width: DEFAULT_PROJECT_RESOLUTION.width,
    height: DEFAULT_PROJECT_RESOLUTION.height,
  };
};

export const resolveProjectResolution = ({ preset, width, height } = {}) => {
  if (preset === CUSTOM_PROJECT_RESOLUTION_PRESET) {
    const customWidth = parseProjectResolutionDimension(width);
    const customHeight = parseProjectResolutionDimension(height);

    if (customWidth === undefined || customHeight === undefined) {
      return undefined;
    }

    return {
      width: customWidth,
      height: customHeight,
    };
  }

  return resolveProjectResolutionPreset(preset);
};
