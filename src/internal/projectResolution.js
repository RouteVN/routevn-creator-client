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

const isFiniteNumber = (value) => {
  return typeof value === "number" && Number.isFinite(value);
};

const scaleNumericValue = (value, scale) => {
  return isFiniteNumber(value) ? Math.round(value * scale) : value;
};

const scaleObjectField = (target, key, scale) => {
  if (!Object.hasOwn(target, key) || !isFiniteNumber(target[key])) {
    return;
  }

  target[key] = scaleNumericValue(target[key], scale);
};

const createProjectResolutionScale = ({
  projectResolution,
  sourceResolution = DEFAULT_PROJECT_RESOLUTION,
} = {}) => {
  const target = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  const source = requireProjectResolution(
    sourceResolution,
    "Source project resolution",
  );

  return {
    x: target.width / source.width,
    y: target.height / source.height,
    uniform: Math.min(
      target.width / source.width,
      target.height / source.height,
    ),
  };
};

const scaleTextStyleOverrides = (textStyle, scale) => {
  if (!textStyle || typeof textStyle !== "object" || Array.isArray(textStyle)) {
    return textStyle;
  }

  const nextTextStyle = structuredClone(textStyle);
  scaleObjectField(nextTextStyle, "fontSize", scale.uniform);
  scaleObjectField(nextTextStyle, "wordWrapWidth", scale.x);
  scaleObjectField(nextTextStyle, "strokeWidth", scale.uniform);
  scaleObjectField(nextTextStyle, "dropShadowDistance", scale.uniform);
  scaleObjectField(nextTextStyle, "padding", scale.uniform);

  return nextTextStyle;
};

const scaleLayoutElementItem = (item, scale) => {
  const nextItem = structuredClone(item);
  scaleObjectField(nextItem, "x", scale.x);
  scaleObjectField(nextItem, "y", scale.y);
  scaleObjectField(nextItem, "width", scale.x);
  scaleObjectField(nextItem, "height", scale.y);

  if (Object.hasOwn(nextItem, "gap") && isFiniteNumber(nextItem.gap)) {
    const gapScale =
      nextItem.direction === "horizontal"
        ? scale.x
        : nextItem.direction === "vertical"
          ? scale.y
          : scale.uniform;
    nextItem.gap = scaleNumericValue(nextItem.gap, gapScale);
  }

  if (Object.hasOwn(nextItem, "textStyle")) {
    nextItem.textStyle = scaleTextStyleOverrides(nextItem.textStyle, scale);
  }

  return nextItem;
};

const scaleTransformItem = (item, scale) => {
  const nextItem = structuredClone(item);
  scaleObjectField(nextItem, "x", scale.x);
  scaleObjectField(nextItem, "y", scale.y);
  return nextItem;
};

const scaleTextStyleResource = (textStyle, scale) => {
  const nextTextStyle = structuredClone(textStyle);
  scaleObjectField(nextTextStyle, "fontSize", scale.uniform);
  scaleObjectField(nextTextStyle, "strokeWidth", scale.uniform);
  return nextTextStyle;
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

export const formatProjectResolutionAspectRatio = (resolution) => {
  const requiredResolution = requireProjectResolution(resolution);

  return `${requiredResolution.width} / ${requiredResolution.height}`;
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

export const scaleLayoutElementsForProjectResolution = (
  elements,
  projectResolution,
  { sourceResolution = DEFAULT_PROJECT_RESOLUTION } = {},
) => {
  const scale = createProjectResolutionScale({
    projectResolution,
    sourceResolution,
  });
  const items = elements?.items ?? {};
  const nextItems = {};

  Object.entries(items).forEach(([itemId, item]) => {
    nextItems[itemId] = scaleLayoutElementItem(item, scale);
  });

  return {
    ...elements,
    items: nextItems,
    tree: structuredClone(elements?.tree ?? []),
  };
};

export const scaleLayoutElementItemForProjectResolution = (
  item,
  projectResolution,
  { sourceResolution = DEFAULT_PROJECT_RESOLUTION } = {},
) => {
  const scale = createProjectResolutionScale({
    projectResolution,
    sourceResolution,
  });

  return scaleLayoutElementItem(item, scale);
};

export const scaleTemplateProjectStateForResolution = (
  templateState,
  projectResolution,
) => {
  const targetResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  const sourceResolution = resolveProjectResolutionForWrite({
    fallbackResolution: templateState?.project?.resolution,
  });
  const scale = createProjectResolutionScale({
    projectResolution: targetResolution,
    sourceResolution,
  });
  const nextState = structuredClone(templateState ?? {});

  nextState.project = {
    ...nextState.project,
    resolution: targetResolution,
  };

  if (nextState.transforms?.items) {
    Object.entries(nextState.transforms.items).forEach(([itemId, item]) => {
      nextState.transforms.items[itemId] =
        item?.type === "transform" ? scaleTransformItem(item, scale) : item;
    });
  }

  if (nextState.layouts?.items) {
    Object.entries(nextState.layouts.items).forEach(([itemId, item]) => {
      if (item?.type !== "layout" || !item.elements) {
        return;
      }

      nextState.layouts.items[itemId] = {
        ...item,
        elements: scaleLayoutElementsForProjectResolution(
          item.elements,
          targetResolution,
          { sourceResolution },
        ),
      };
    });
  }

  if (nextState.controls?.items) {
    Object.entries(nextState.controls.items).forEach(([itemId, item]) => {
      if (item?.type !== "control" || !item.elements) {
        return;
      }

      nextState.controls.items[itemId] = {
        ...item,
        elements: scaleLayoutElementsForProjectResolution(
          item.elements,
          targetResolution,
          { sourceResolution },
        ),
      };
    });
  }

  if (nextState.textStyles?.items) {
    Object.entries(nextState.textStyles.items).forEach(([itemId, item]) => {
      nextState.textStyles.items[itemId] =
        item?.type === "textStyle" ? scaleTextStyleResource(item, scale) : item;
    });
  }

  return nextState;
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
