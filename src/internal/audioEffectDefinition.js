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

const AUDIO_EFFECT_IDENTITY = Object.freeze({
  volume: 100,
  pan: 0,
  playbackRate: 1,
});

// The values an audio effect leaves on the BGM it plays on. Route Engine
// keeps a final keyframe that differs from its identity after the effect:
// volume as a percentage of the line's volume, pan as an offset from its pan,
// and playback rate as a multiple of its rate. Relative final keyframes leave
// nothing behind.
export const getAudioEffectFinalMix = (definition = {}) => {
  const tracks =
    definition.type === "transition" ? definition.next : definition.tween;
  const mix = {};
  for (const [property, identity] of Object.entries(AUDIO_EFFECT_IDENTITY)) {
    const finalKeyframe = tracks?.[property]?.keyframes?.at(-1);
    if (
      typeof finalKeyframe?.value !== "number" ||
      !Number.isFinite(finalKeyframe.value) ||
      finalKeyframe.relative === true ||
      finalKeyframe.value === identity
    ) {
      continue;
    }
    mix[property] = finalKeyframe.value;
  }
  return mix;
};

// A copy of a BGM action with an audio effect mix folded into its own values,
// so it sounds as the BGM does once the effect ends. As Route Engine does,
// the mix scales the channel volume, offsets the channel pan, and multiplies
// each sound's playback rate. The channel pan stays within -1 and 1. Legacy
// single-sound BGM is returned as it is.
export const applyAudioEffectMixToBgm = (
  bgm,
  mix = {},
  { sounds = {} } = {},
) => {
  const settled = clone(bgm);
  if (!Array.isArray(settled?.sounds)) {
    return settled;
  }

  if (mix.volume !== undefined) {
    settled.volume = ((settled.volume ?? 100) * mix.volume) / 100;
  }
  if (mix.pan !== undefined) {
    settled.pan = Math.max(-1, Math.min(1, (settled.pan ?? 0) + mix.pan));
  }
  if (mix.playbackRate !== undefined) {
    for (const sound of settled.sounds) {
      sound.playbackRate =
        (sound.playbackRate ?? sounds[sound.resourceId]?.playbackRate ?? 1) *
        mix.playbackRate;
    }
  }
  return settled;
};
