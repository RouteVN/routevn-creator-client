const clone = (value) => structuredClone(value);

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
    return ["prev", "next"].reduce(
      (duration, side) =>
        Object.values(definition[side] ?? {}).reduce(
          (sideDuration, config) =>
            Math.max(
              sideDuration,
              getAudioEffectKeyframesDuration(config.keyframes),
            ),
          duration,
        ),
      0,
    );
  }

  return Object.values(definition.tween ?? {}).reduce(
    (duration, config) =>
      Math.max(duration, getAudioEffectKeyframesDuration(config.keyframes)),
    0,
  );
};

export const normalizeAudioEffectDefinition = (definition = {}) => {
  return clone(definition);
};
