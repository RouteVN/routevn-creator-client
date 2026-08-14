const clone = (value) => structuredClone(value);

export const getTransitionFadeEndpoint = (side) => (side === "prev" ? 0 : 100);

const createLegacyFadeKeyframe = (fade, side) => {
  const keyframe = {
    value: getTransitionFadeEndpoint(side),
    duration: Math.max(0, Number(fade.duration) || 0),
  };
  const delay = Math.max(0, Number(fade.delay) || 0);
  if (delay > 0) {
    keyframe.delay = delay;
  }
  if (fade.easing !== undefined) {
    keyframe.easing = fade.easing;
  }
  return keyframe;
};

export const getTransitionFadeKeyframes = (definition, side) => {
  const fade = definition?.[side]?.fade;
  if (!fade) {
    return [];
  }
  if (Array.isArray(fade.keyframes)) {
    return fade.keyframes;
  }
  return [createLegacyFadeKeyframe(fade, side)];
};

export const getAudioEffectKeyframesDuration = (keyframes = []) =>
  keyframes.reduce(
    (duration, keyframe) =>
      duration +
      Math.max(0, Number(keyframe.delay) || 0) +
      Math.max(0, Number(keyframe.duration) || 0),
    0,
  );

export const getAudioEffectDefinitionDuration = (definition = {}) => {
  if (definition.type === "transition") {
    return Math.max(
      ...["prev", "next"].map((side) =>
        getAudioEffectKeyframesDuration(
          getTransitionFadeKeyframes(definition, side),
        ),
      ),
    );
  }

  return Object.values(definition.tween ?? {}).reduce(
    (duration, config) =>
      Math.max(duration, getAudioEffectKeyframesDuration(config.keyframes)),
    0,
  );
};

export const normalizeAudioEffectDefinition = (definition = {}) => {
  const normalized = clone(definition);
  if (normalized.type !== "transition") {
    return normalized;
  }

  for (const side of ["prev", "next"]) {
    if (!normalized[side]?.fade) {
      continue;
    }
    const fade = normalized[side].fade;
    const normalizedFade = {
      keyframes: clone(getTransitionFadeKeyframes(normalized, side)),
    };
    if (fade.initialValue !== undefined) {
      normalizedFade.initialValue = fade.initialValue;
    }
    normalized[side].fade = normalizedFade;
  }
  return normalized;
};
