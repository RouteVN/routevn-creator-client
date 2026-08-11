import {
  AUDIO_EFFECT_PROPERTY_CONFIG,
  AUDIO_EFFECT_PROPERTY_KEYS,
  SUPPORTED_AUDIO_EFFECT_EASINGS,
} from "../audioEffectsEditor.constants.js";

const toNonNegativeNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? numericValue
    : undefined;
};

const isAbsoluteValueInBounds = (property, value) => {
  const config = AUDIO_EFFECT_PROPERTY_CONFIG[property];
  if (!config || !Number.isFinite(value)) {
    return false;
  }
  if (config.min !== undefined && value < config.min) {
    return false;
  }
  if (config.max !== undefined && value > config.max) {
    return false;
  }
  return true;
};

export const buildAudioEffectKeyframe = ({
  finalKeyframe = false,
  property,
  values = {},
} = {}) => {
  if (!AUDIO_EFFECT_PROPERTY_KEYS.includes(property)) {
    return { valid: false, error: "Select a supported audio property." };
  }

  const delay = toNonNegativeNumber(values.delay);
  const duration = toNonNegativeNumber(values.duration);
  const easing = values.easing;
  if (
    delay === undefined ||
    duration === undefined ||
    !SUPPORTED_AUDIO_EFFECT_EASINGS.includes(easing)
  ) {
    return {
      valid: false,
      error: "Keyframe timing and easing must be valid.",
    };
  }

  const relative = !finalKeyframe && values.relative === true;
  const value = Number(values.value);
  if (
    !Number.isFinite(value) ||
    (!relative && !isAbsoluteValueInBounds(property, value))
  ) {
    return {
      valid: false,
      error: "The keyframe value is outside the allowed range.",
    };
  }
  const keyframe = {
    value,
    duration,
    easing,
  };
  if (delay > 0) {
    keyframe.delay = delay;
  }

  if (values.useStartValue === true) {
    const startValue = Number(values.startValue);
    if (
      !Number.isFinite(startValue) ||
      (!relative && !isAbsoluteValueInBounds(property, startValue))
    ) {
      return {
        valid: false,
        error: "The start value is outside the allowed range.",
      };
    }
    keyframe.startValue = startValue;
  }

  if (relative) {
    keyframe.relative = true;
  }

  return { valid: true, keyframe };
};
