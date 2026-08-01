const DEFAULT_TRANSITION_MASK_KIND = "single";
const DEFAULT_TRANSITION_MASK_CHANNEL = "red";
const DEFAULT_TRANSITION_MASK_COMBINE = "max";
const DEFAULT_TRANSITION_MASK_SAMPLE = "step";
const DEFAULT_TRANSITION_MASK_SOFTNESS = 0.08;
const DEFAULT_TRANSITION_MASK_PROGRESS_DURATION = 900;
const DEFAULT_TRANSITION_MASK_PROGRESS_EASING = "linear";

const TRANSITION_MASK_KINDS = new Set(["single", "sequence", "composite"]);
const EDITABLE_TRANSITION_MASK_KINDS = new Set(["single"]);
const TRANSITION_MASK_CHANNELS = new Set(["red", "alpha"]);

const normalizeTransitionMaskChannel = (channel) => {
  return TRANSITION_MASK_CHANNELS.has(channel)
    ? channel
    : DEFAULT_TRANSITION_MASK_CHANNEL;
};

const hasMaskImageReference = (value) => {
  return typeof value === "string" && value.length > 0;
};

const cloneCompositeItem = (item = {}) => {
  return {
    imageId: item.imageId,
    channel: normalizeTransitionMaskChannel(item.channel),
    invert: item.invert ?? false,
  };
};

const findImageIdByFileId = (imageItems = {}, fileId) => {
  if (typeof fileId !== "string" || fileId.length === 0) {
    return undefined;
  }

  return Object.entries(imageItems).find(
    ([, item]) => item?.fileId === fileId,
  )?.[0];
};

const resolveEditorSingleMaskImageId = (mask = {}, imageItems = {}) => {
  if (mask.kind === "single") {
    return mask.imageId ?? findImageIdByFileId(imageItems, mask.texture);
  }

  if (mask.kind === "sequence") {
    const imageId = Array.isArray(mask.imageIds)
      ? mask.imageIds.find(Boolean)
      : undefined;
    if (imageId) {
      return imageId;
    }

    const texture = Array.isArray(mask.textures)
      ? mask.textures.find(Boolean)
      : undefined;
    return findImageIdByFileId(imageItems, texture);
  }

  const item = Array.isArray(mask.items) ? mask.items.find(Boolean) : undefined;
  if (!item) {
    return undefined;
  }

  return item.imageId ?? findImageIdByFileId(imageItems, item.texture);
};

const resolveMaskProgress = (mask = {}) => {
  const progressKeyframes = mask.progress?.keyframes ?? [];
  if (progressKeyframes.length > 0) {
    const delay = progressKeyframes.reduce((sum, keyframe) => {
      return sum + Math.max(0, Number(keyframe?.delay) || 0);
    }, 0);
    const duration = progressKeyframes.reduce((sum, keyframe) => {
      return sum + Math.max(0, Number(keyframe?.duration) || 0);
    }, 0);

    return {
      delay,
      duration:
        duration > 0 ? duration : DEFAULT_TRANSITION_MASK_PROGRESS_DURATION,
      easing:
        progressKeyframes[0]?.easing ?? DEFAULT_TRANSITION_MASK_PROGRESS_EASING,
    };
  }

  if (Number.isFinite(Number(mask.progressDuration))) {
    return {
      delay: Math.max(0, Number(mask.progressDelay) || 0),
      duration: Math.max(1, Number(mask.progressDuration)),
      easing: mask.progressEasing ?? DEFAULT_TRANSITION_MASK_PROGRESS_EASING,
    };
  }

  return {
    delay: 0,
    duration: DEFAULT_TRANSITION_MASK_PROGRESS_DURATION,
    easing: DEFAULT_TRANSITION_MASK_PROGRESS_EASING,
  };
};

export const createDefaultTransitionMask = () => {
  return {
    kind: DEFAULT_TRANSITION_MASK_KIND,
    imageId: undefined,
    imageIds: [],
    items: [],
    channel: DEFAULT_TRANSITION_MASK_CHANNEL,
    combine: DEFAULT_TRANSITION_MASK_COMBINE,
    sample: DEFAULT_TRANSITION_MASK_SAMPLE,
    softness: DEFAULT_TRANSITION_MASK_SOFTNESS,
    invert: false,
    progressDelay: 0,
    progressDuration: DEFAULT_TRANSITION_MASK_PROGRESS_DURATION,
    progressEasing: DEFAULT_TRANSITION_MASK_PROGRESS_EASING,
  };
};

export const isEditableTransitionMaskKind = (kind) => {
  return EDITABLE_TRANSITION_MASK_KINDS.has(kind);
};

export const createDefaultTransitionMaskCompositeItem = () => {
  return {
    imageId: undefined,
    channel: DEFAULT_TRANSITION_MASK_CHANNEL,
    invert: false,
  };
};

export const normalizeTransitionMaskForEditor = (mask, imageItems = {}) => {
  if (
    !mask ||
    !TRANSITION_MASK_KINDS.has(mask.kind) ||
    !isEditableTransitionMaskKind(mask.kind)
  ) {
    return undefined;
  }

  const nextMask = createDefaultTransitionMask();
  const progress = resolveMaskProgress(mask);

  nextMask.softness =
    Number.isFinite(Number(mask.softness)) && Number(mask.softness) >= 0
      ? Number(mask.softness)
      : nextMask.softness;
  nextMask.progressDelay = progress.delay;
  nextMask.progressDuration = progress.duration;
  nextMask.progressEasing = progress.easing;
  nextMask.progress = mask.progress
    ? structuredClone(mask.progress)
    : undefined;
  nextMask.imageId = resolveEditorSingleMaskImageId(mask, imageItems);
  nextMask.channel = normalizeTransitionMaskChannel(mask.channel);
  nextMask.invert = mask.invert ?? nextMask.invert;

  return nextMask;
};

export const isTransitionMaskComplete = (mask) => {
  if (!mask || !TRANSITION_MASK_KINDS.has(mask.kind)) {
    return false;
  }

  if (mask.kind === "single") {
    return (
      hasMaskImageReference(mask.imageId) || hasMaskImageReference(mask.texture)
    );
  }

  if (mask.kind === "sequence") {
    const imageIds = Array.isArray(mask.imageIds) ? mask.imageIds : [];
    const textures = Array.isArray(mask.textures) ? mask.textures : [];
    return (
      imageIds.some(hasMaskImageReference) ||
      textures.some(hasMaskImageReference)
    );
  }

  const items = Array.isArray(mask.items) ? mask.items : [];
  return (
    items.length > 0 &&
    items.every((item) => {
      return (
        hasMaskImageReference(item?.imageId) ||
        hasMaskImageReference(item?.texture)
      );
    })
  );
};

export const serializeTransitionMask = (mask) => {
  if (!isTransitionMaskComplete(mask)) {
    return undefined;
  }

  const progress = resolveMaskProgress(mask);
  const serializedMask = {
    kind: mask.kind,
    softness:
      Number.isFinite(Number(mask.softness)) && Number(mask.softness) >= 0
        ? Number(mask.softness)
        : DEFAULT_TRANSITION_MASK_SOFTNESS,
  };

  if (mask.progress?.keyframes?.length > 0) {
    serializedMask.progress = structuredClone(mask.progress);
  } else if (progress.delay > 0) {
    serializedMask.progress = {
      initialValue: 0,
      keyframes: [
        {
          delay: progress.delay,
          duration: progress.duration,
          value: 1,
          easing: progress.easing,
        },
      ],
    };
  } else {
    serializedMask.progressDuration = progress.duration;
    serializedMask.progressEasing = progress.easing;
  }

  if (mask.kind === "single") {
    serializedMask.channel = normalizeTransitionMaskChannel(mask.channel);
    serializedMask.invert = mask.invert ?? false;
    if (mask.imageId) {
      serializedMask.imageId = mask.imageId;
    }
    return serializedMask;
  }

  if (mask.kind === "sequence") {
    serializedMask.channel = normalizeTransitionMaskChannel(mask.channel);
    serializedMask.invert = mask.invert ?? false;
    serializedMask.sample = mask.sample ?? DEFAULT_TRANSITION_MASK_SAMPLE;
    serializedMask.imageIds = (mask.imageIds ?? []).filter(Boolean);
    return serializedMask;
  }

  serializedMask.combine = mask.combine ?? DEFAULT_TRANSITION_MASK_COMBINE;
  serializedMask.items = (mask.items ?? []).map((item) =>
    cloneCompositeItem(item),
  );
  return serializedMask;
};

export const compileTransitionMaskForRuntime = (mask, imageItems = {}) => {
  if (!mask || !TRANSITION_MASK_KINDS.has(mask.kind)) {
    return undefined;
  }

  const progress = resolveMaskProgress(mask);
  const progressKeyframe = {
    duration: progress.duration,
    value: 1,
    easing: progress.easing,
  };
  if (progress.delay > 0) {
    progressKeyframe.delay = progress.delay;
  }

  const runtimeProgress =
    mask.progress?.keyframes?.length > 0
      ? structuredClone(mask.progress)
      : {
          initialValue: 0,
          keyframes: [progressKeyframe],
        };
  const runtimeMask = {
    kind: mask.kind,
    softness:
      Number.isFinite(Number(mask.softness)) && Number(mask.softness) >= 0
        ? Number(mask.softness)
        : DEFAULT_TRANSITION_MASK_SOFTNESS,
    progress: runtimeProgress,
  };

  if (mask.kind === "single") {
    const texture =
      imageItems?.[mask.imageId]?.fileId ??
      (typeof mask.texture === "string" ? mask.texture : undefined);
    if (!texture) {
      return undefined;
    }

    runtimeMask.texture = texture;
    runtimeMask.channel = normalizeTransitionMaskChannel(mask.channel);
    runtimeMask.invert = mask.invert ?? false;
    return runtimeMask;
  }

  if (mask.kind === "sequence") {
    const textures = (
      Array.isArray(mask.imageIds)
        ? mask.imageIds.map((imageId) => imageItems?.[imageId]?.fileId)
        : []
    )
      .concat(Array.isArray(mask.textures) ? mask.textures : [])
      .filter(Boolean);

    if (textures.length === 0) {
      return undefined;
    }

    runtimeMask.textures = Array.from(new Set(textures));
    runtimeMask.channel = normalizeTransitionMaskChannel(mask.channel);
    runtimeMask.invert = mask.invert ?? false;
    runtimeMask.sample = mask.sample ?? DEFAULT_TRANSITION_MASK_SAMPLE;
    return runtimeMask;
  }

  const items = (mask.items ?? [])
    .map((item) => {
      const texture =
        imageItems?.[item?.imageId]?.fileId ??
        (typeof item?.texture === "string" ? item.texture : undefined);

      if (!texture) {
        return undefined;
      }

      return {
        texture,
        channel: normalizeTransitionMaskChannel(item.channel),
        invert: item.invert ?? false,
      };
    })
    .filter(Boolean);

  if (items.length === 0) {
    return undefined;
  }

  runtimeMask.items = items;
  runtimeMask.combine = mask.combine ?? DEFAULT_TRANSITION_MASK_COMBINE;
  return runtimeMask;
};

export const collectTransitionMaskImageIds = (mask, imageItems = {}) => {
  if (!mask || !TRANSITION_MASK_KINDS.has(mask.kind)) {
    return [];
  }

  if (mask.kind === "single") {
    const imageId =
      mask.imageId ?? findImageIdByFileId(imageItems, mask.texture);
    return imageId ? [imageId] : [];
  }

  if (mask.kind === "sequence") {
    const imageIds =
      Array.isArray(mask.imageIds) && mask.imageIds.length > 0
        ? mask.imageIds
        : (mask.textures ?? []).map((texture) =>
            findImageIdByFileId(imageItems, texture),
          );

    return imageIds.filter(Boolean);
  }

  return (mask.items ?? [])
    .map((item) => {
      return item?.imageId ?? findImageIdByFileId(imageItems, item?.texture);
    })
    .filter(Boolean);
};

export const getTransitionMaskDuration = (mask = {}) => {
  if (!mask || !TRANSITION_MASK_KINDS.has(mask.kind)) {
    return 0;
  }

  const progress = resolveMaskProgress(mask);
  return progress.delay + progress.duration;
};
