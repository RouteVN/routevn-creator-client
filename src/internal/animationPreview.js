import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "./projectResolution.js";
import { compileTransitionMaskForRuntime } from "./animationMasks.js";
import {
  getDialogType,
  getTransitionTimelineDuration,
  getUpdateAnimationTween,
} from "./animationDisplay.js";

export const ANIMATION_PREVIEW_BG_COLOR = "#4a4a4a";
export const ANIMATION_PREVIEW_UPDATE_ELEMENT_ID = "preview-element";
export const ANIMATION_PREVIEW_TRANSITION_ELEMENT_ID =
  "preview-transition-element";
export const ANIMATION_PREVIEW_TRANSITION_PREV_FILL = "#ffffff";
export const ANIMATION_PREVIEW_TRANSITION_NEXT_FILL = "#000000";
export const AUTO_TWEEN_DEFAULT_DURATION = 1000;
export const AUTO_TWEEN_DEFAULT_EASING = "linear";

export const createPropertyFieldConfig = (
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );

  return {
    alpha: {
      label: "Alpha",
      defaultValue: 1,
      slider: {
        min: 0,
        max: 1,
        step: 0.01,
      },
    },
    x: {
      label: "Position X",
      defaultValue: width / 2,
      slider: {
        min: -width,
        max: width,
        step: 0.01,
      },
    },
    y: {
      label: "Position Y",
      defaultValue: height / 2,
      slider: {
        min: -height,
        max: height,
        step: 0.01,
      },
    },
    scaleX: {
      label: "Scale X",
      defaultValue: 1,
      slider: {
        min: 0,
        max: 5,
        step: 0.01,
      },
    },
    scaleY: {
      label: "Scale Y",
      defaultValue: 1,
      slider: {
        min: 0,
        max: 5,
        step: 0.01,
      },
    },
    rotation: {
      label: "Rotation",
      defaultValue: 0,
      slider: {
        min: -360,
        max: 360,
        step: 1,
      },
      tooltip: {
        content: "Rotation is measured in degrees.",
      },
    },
    translateX: {
      label: "Translate X",
      defaultValue: 0,
      slider: {
        min: -2,
        max: 2,
        step: 0.05,
      },
      tooltip: {
        content:
          "Uses viewport-width units. 1 moves by one full screen width, -1 moves by one full screen width to the left.",
      },
    },
    translateY: {
      label: "Translate Y",
      defaultValue: 0,
      slider: {
        min: -2,
        max: 2,
        step: 0.05,
      },
      tooltip: {
        content:
          "Uses viewport-height units. 1 moves by one full screen height, -1 moves by one full screen height upward.",
      },
    },
    blurX: {
      label: "Blur X",
      defaultValue: 0,
      slider: {
        min: 0,
        max: 64,
        step: 0.5,
      },
    },
    blurY: {
      label: "Blur Y",
      defaultValue: 0,
      slider: {
        min: 0,
        max: 64,
        step: 0.5,
      },
    },
    uProgress: {
      label: "Progress",
      defaultValue: 0,
      slider: {
        min: 0,
        max: 1,
        step: 0.01,
      },
      tooltip: {
        content: "Progress uniforms use a normalized value from 0 to 1.",
      },
    },
  };
};

const createPreviewRect = ({ id, x, y, fill, width, height } = {}) => {
  return {
    id,
    type: "rect",
    x,
    y,
    width,
    height,
    fill,
    anchorX: 0.5,
    anchorY: 0.5,
  };
};

const toPositiveNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
};

const getPreviewImageResource = (imagesData, imageId) => {
  if (!imageId) {
    return undefined;
  }

  const imageItem = imagesData?.items?.[imageId];
  if (imageItem?.type && imageItem.type !== "image") {
    return undefined;
  }

  if (!imageItem?.fileId) {
    return undefined;
  }

  return imageItem;
};

export const PREVIEW_IMAGE_SLOT_CONFIGS = Object.freeze([
  {
    label: "BG Image",
    target: "preview-background",
    field: "background",
    supportsTransform: false,
  },
  {
    label: "Outgoing Image",
    target: "preview-outgoing",
    field: "outgoing",
    supportsTransform: true,
  },
  {
    label: "Incoming Image",
    target: "preview-incoming",
    field: "incoming",
    supportsTransform: true,
  },
  {
    label: "Target Image",
    target: "preview-target",
    field: "target",
    supportsTransform: true,
  },
]);

export const createInitialAnimationPreviewImages = () => ({
  background: {},
  outgoing: {},
  incoming: {},
  target: {},
});

export const getPreviewSlotConfig = (target) => {
  return PREVIEW_IMAGE_SLOT_CONFIGS.find((slot) => slot.target === target);
};

const normalizePreviewSlot = (value, { supportsTransform = false } = {}) => {
  const slot = {};

  if (typeof value === "string" && value.length > 0) {
    slot.imageId = value;
    return slot;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return slot;
  }

  if (typeof value.imageId === "string" && value.imageId.length > 0) {
    slot.imageId = value.imageId;
  }

  if (
    supportsTransform &&
    typeof value.transformId === "string" &&
    value.transformId.length > 0
  ) {
    slot.transformId = value.transformId;
  }

  return slot;
};

export const normalizeAnimationPreviewData = (previewData) => {
  const source =
    previewData &&
    typeof previewData === "object" &&
    !Array.isArray(previewData)
      ? previewData
      : {};

  return {
    background: normalizePreviewSlot(
      source.background ?? source.backgroundImageId,
      { supportsTransform: false },
    ),
    outgoing: normalizePreviewSlot(source.outgoing ?? source.outgoingImageId, {
      supportsTransform: true,
    }),
    incoming: normalizePreviewSlot(source.incoming ?? source.incomingImageId, {
      supportsTransform: true,
    }),
    target: normalizePreviewSlot(
      source.target ?? source.targetImageId ?? source.incoming,
      { supportsTransform: true },
    ),
  };
};

const getPreviewSlot = (previewImages, target) => {
  const slotConfig = getPreviewSlotConfig(target);
  if (!slotConfig) {
    return {};
  }

  return previewImages?.[slotConfig.field] ?? {};
};

export const getPreviewSlotImageId = (previewImages, target) => {
  return getPreviewSlot(previewImages, target).imageId;
};

const getUpdatePreviewSlot = (previewImages = {}) => {
  return previewImages.target?.imageId
    ? previewImages.target
    : (previewImages.incoming ?? {});
};

const createPreviewBackgroundElement = ({
  imagesData,
  previewImages,
  projectResolution,
} = {}) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  const imageItem = getPreviewImageResource(
    imagesData,
    getPreviewSlotImageId(previewImages, "preview-background"),
  );

  if (!imageItem) {
    return {
      id: "bg",
      type: "rect",
      x: 0,
      y: 0,
      width,
      height,
      fill: ANIMATION_PREVIEW_BG_COLOR,
    };
  }

  return {
    id: "bg",
    type: "sprite",
    src: imageItem.fileId,
    fileType: imageItem.fileType ?? "image/png",
    x: width / 2,
    y: height / 2,
    width: toPositiveNumber(imageItem.width, width),
    height: toPositiveNumber(imageItem.height, height),
    anchorX: 0.5,
    anchorY: 0.5,
  };
};

const createPreviewContentElement = ({
  id,
  previewSlot,
  imagesData,
  projectResolution,
  fallbackFill,
} = {}) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  const centerX = width / 2;
  const centerY = height / 2;
  const imageItem = getPreviewImageResource(imagesData, previewSlot?.imageId);

  if (!imageItem) {
    return createPreviewRect({
      id,
      x: centerX,
      y: centerY,
      width,
      height,
      fill: fallbackFill,
    });
  }

  return {
    id,
    type: "sprite",
    src: imageItem.fileId,
    fileType: imageItem.fileType ?? "image/png",
    x: centerX,
    y: centerY,
    width: toPositiveNumber(imageItem.width, width),
    height: toPositiveNumber(imageItem.height, height),
    anchorX: 0.5,
    anchorY: 0.5,
  };
};

export const createAnimationPreviewResetState = ({
  dialogType,
  imagesData,
  previewImages,
  projectResolution,
} = {}) => {
  const elements = [
    createPreviewBackgroundElement({
      imagesData,
      previewImages,
      projectResolution,
    }),
  ];

  if (dialogType === "transition") {
    elements.push(
      createPreviewContentElement({
        id: ANIMATION_PREVIEW_TRANSITION_ELEMENT_ID,
        previewSlot: getPreviewSlot(previewImages, "preview-outgoing"),
        imagesData,
        projectResolution,
        fallbackFill: ANIMATION_PREVIEW_TRANSITION_PREV_FILL,
      }),
    );
  } else {
    elements.push(
      createPreviewContentElement({
        id: ANIMATION_PREVIEW_UPDATE_ELEMENT_ID,
        previewSlot: getUpdatePreviewSlot(previewImages),
        imagesData,
        projectResolution,
        fallbackFill: "white",
      }),
    );
  }

  return {
    elements,
    animations: [],
  };
};

export const createDefaultInitialValuesByProperty = (propertyFieldConfig) => {
  return Object.fromEntries(
    Object.entries(propertyFieldConfig).map(([property, config]) => [
      property,
      config.defaultValue,
    ]),
  );
};

export const resolveAutoTweenConfig = (config = {}) => {
  const duration =
    Number.isFinite(Number(config.duration)) && Number(config.duration) >= 1
      ? Number(config.duration)
      : AUTO_TWEEN_DEFAULT_DURATION;

  return {
    duration,
    easing: config.easing ?? AUTO_TWEEN_DEFAULT_EASING,
  };
};

export const getTweenPropertyDuration = (config = {}) => {
  if (config?.auto) {
    return Number(config.auto.duration) || 0;
  }

  return (config?.keyframes ?? []).reduce((sum, keyframe) => {
    return sum + (Number(keyframe?.duration) || 0);
  }, 0);
};

const createTweenAnimationsForTarget = ({
  properties,
  projectResolution,
  targetId,
  animationIdPrefix,
} = {}) => {
  const animations = [];
  const defaultInitialValuesByProperty = createDefaultInitialValuesByProperty(
    createPropertyFieldConfig(projectResolution),
  );

  if (properties && Object.keys(properties).length > 0) {
    for (const [property, config] of Object.entries(properties)) {
      const tween = {};

      if (config?.auto) {
        tween[property] = {
          auto: resolveAutoTweenConfig(config.auto),
        };
      } else if (config?.keyframes?.length) {
        tween[property] = {
          keyframes: config.keyframes.map((keyframe) => {
            let value = parseFloat(keyframe.value) ?? 0;

            return {
              duration: keyframe.duration,
              value,
              easing: keyframe.easing ?? "linear",
              relative: keyframe.relative ?? false,
            };
          }),
        };
      } else {
        continue;
      }

      if (!config?.auto) {
        const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
        const initialValue =
          config.initialValue !== undefined && config.initialValue !== ""
            ? parseFloat(config.initialValue)
            : undefined;
        const processedInitialValue = Number.isNaN(initialValue)
          ? defaultValue
          : initialValue;

        if (processedInitialValue !== undefined) {
          tween[property].initialValue = processedInitialValue;
        }
      }

      animations.push({
        id: `${animationIdPrefix}-${property}`,
        targetId,
        type: "update",
        tween,
      });
    }
  }

  return animations;
};

const createTweenPayload = ({ properties, projectResolution } = {}) => {
  const tween = {};
  const defaultInitialValuesByProperty = createDefaultInitialValuesByProperty(
    createPropertyFieldConfig(projectResolution),
  );

  for (const [property, config] of Object.entries(properties ?? {})) {
    if (config?.auto) {
      tween[property] = {
        auto: resolveAutoTweenConfig(config.auto),
      };
      continue;
    }

    if (!config?.keyframes?.length) {
      continue;
    }

    tween[property] = {
      keyframes: config.keyframes.map((keyframe) => ({
        duration: keyframe.duration,
        value: parseFloat(keyframe.value) ?? 0,
        easing: keyframe.easing ?? "linear",
        relative: keyframe.relative ?? false,
      })),
    };

    const defaultValue = defaultInitialValuesByProperty[property] ?? 0;
    const initialValue =
      config.initialValue !== undefined && config.initialValue !== ""
        ? parseFloat(config.initialValue)
        : undefined;
    const processedInitialValue = Number.isNaN(initialValue)
      ? defaultValue
      : initialValue;

    if (processedInitialValue !== undefined) {
      tween[property].initialValue = processedInitialValue;
    }
  }

  return tween;
};

export const getPropertiesDuration = (properties = {}) => {
  return Object.values(properties).reduce((maxDuration, config) => {
    const propertyDuration = getTweenPropertyDuration(config);

    return Math.max(maxDuration, propertyDuration);
  }, 0);
};

export const createAnimationPreviewRenderState = ({
  dialogType,
  updateProperties,
  previousProperties,
  nextProperties,
  transitionMask,
  imagesData,
  previewImages,
  projectResolution,
  includeAnimations = true,
} = {}) => {
  if (dialogType !== "transition") {
    const animations = includeAnimations
      ? createTweenAnimationsForTarget({
          properties: updateProperties,
          projectResolution,
          targetId: ANIMATION_PREVIEW_UPDATE_ELEMENT_ID,
          animationIdPrefix: "preview-animation",
        })
      : [];

    return {
      ...createAnimationPreviewResetState({
        dialogType,
        imagesData,
        previewImages,
        projectResolution,
      }),
      animations,
    };
  }

  const prevTween = createTweenPayload({
    properties: previousProperties,
    projectResolution,
  });
  const nextTween = createTweenPayload({
    properties: nextProperties,
    projectResolution,
  });
  const compiledMask = compileTransitionMaskForRuntime(
    transitionMask,
    imagesData?.items ?? {},
  );
  const transitionAnimation = {
    id: "preview-transition-animation",
    targetId: ANIMATION_PREVIEW_TRANSITION_ELEMENT_ID,
    type: "transition",
  };

  if (Object.keys(prevTween).length > 0) {
    transitionAnimation.prev = {
      tween: prevTween,
    };
  }

  if (Object.keys(nextTween).length > 0) {
    transitionAnimation.next = {
      tween: nextTween,
    };
  }

  if (compiledMask) {
    transitionAnimation.mask = compiledMask;
  }

  const hasTransitionAnimation =
    includeAnimations &&
    (transitionAnimation.prev ||
      transitionAnimation.next ||
      transitionAnimation.mask);

  return {
    elements: [
      createPreviewBackgroundElement({
        imagesData,
        previewImages,
        projectResolution,
      }),
      createPreviewContentElement({
        id: ANIMATION_PREVIEW_TRANSITION_ELEMENT_ID,
        previewSlot: getPreviewSlot(previewImages, "preview-incoming"),
        imagesData,
        projectResolution,
        fallbackFill: ANIMATION_PREVIEW_TRANSITION_NEXT_FILL,
      }),
    ],
    animations: hasTransitionAnimation ? [transitionAnimation] : [],
  };
};

export const createAnimationResourcePreviewStates = ({
  animationItem,
  imagesData,
  projectResolution,
  includeAnimations = true,
} = {}) => {
  const dialogType = getDialogType(animationItem?.animation?.type);
  const previewImages = normalizeAnimationPreviewData(animationItem?.preview);
  const updateProperties = getUpdateAnimationTween(animationItem);
  const previousProperties =
    animationItem?.animation?.type === "transition"
      ? structuredClone(animationItem.animation?.prev?.tween ?? {})
      : {};
  const nextProperties =
    animationItem?.animation?.type === "transition"
      ? structuredClone(animationItem.animation?.next?.tween ?? {})
      : {};
  const transitionMask = animationItem?.animation?.mask;
  const resetState = createAnimationPreviewResetState({
    dialogType,
    imagesData,
    previewImages,
    projectResolution,
  });
  const renderState = createAnimationPreviewRenderState({
    dialogType,
    updateProperties,
    previousProperties,
    nextProperties,
    transitionMask,
    imagesData,
    previewImages,
    projectResolution,
    includeAnimations,
  });
  const durationMs =
    dialogType === "transition"
      ? getTransitionTimelineDuration({
          prevProperties: previousProperties,
          nextProperties,
          mask: transitionMask,
        })
      : getPropertiesDuration(updateProperties);

  return {
    resetState,
    renderState,
    durationMs,
  };
};
