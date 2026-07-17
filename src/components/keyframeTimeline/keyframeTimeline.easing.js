const CURVE_WIDTH = 100;
const CURVE_HEIGHT = 20;
const CURVE_PADDING = 1;
const CURVE_SAMPLE_COUNT = 36;

const EASING_MODES = Object.freeze(["In", "Out", "InOut"]);
const EASING_FAMILIES = Object.freeze([
  "Quad",
  "Cubic",
  "Quart",
  "Quint",
  "Sine",
  "Expo",
  "Circ",
  "Back",
  "Bounce",
  "Elastic",
]);

export const SUPPORTED_EASING_CURVE_NAMES = Object.freeze([
  "linear",
  ...EASING_FAMILIES.flatMap((family) =>
    EASING_MODES.map((mode) => `ease${mode}${family}`),
  ),
]);

const easeOutBounce = (progress) => {
  const coefficient = 7.5625;
  const divisor = 2.75;

  if (progress < 1 / divisor) {
    return coefficient * progress ** 2;
  }

  if (progress < 2 / divisor) {
    const offsetProgress = progress - 1.5 / divisor;
    return coefficient * offsetProgress ** 2 + 0.75;
  }

  if (progress < 2.5 / divisor) {
    const offsetProgress = progress - 2.25 / divisor;
    return coefficient * offsetProgress ** 2 + 0.9375;
  }

  const offsetProgress = progress - 2.625 / divisor;
  return coefficient * offsetProgress ** 2 + 0.984375;
};

const easeInBack = (progress) => {
  const overshoot = 1.70158;
  return (overshoot + 1) * progress ** 3 - overshoot * progress ** 2;
};

const easeInOutBack = (progress) => {
  const overshoot = 1.70158 * 1.525;

  if (progress < 0.5) {
    return (
      ((2 * progress) ** 2 * ((overshoot + 1) * 2 * progress - overshoot)) / 2
    );
  }

  return (
    ((2 * progress - 2) ** 2 *
      ((overshoot + 1) * (progress * 2 - 2) + overshoot) +
      2) /
    2
  );
};

const easeInElastic = (progress) => {
  if (progress === 0 || progress === 1) {
    return progress;
  }

  const period = (2 * Math.PI) / 3;
  return (
    -(2 ** (10 * progress - 10)) * Math.sin((10 * progress - 10.75) * period)
  );
};

const easeOutElastic = (progress) => {
  if (progress === 0 || progress === 1) {
    return progress;
  }

  const period = (2 * Math.PI) / 3;
  return 2 ** (-10 * progress) * Math.sin((10 * progress - 0.75) * period) + 1;
};

const easeInOutElastic = (progress) => {
  if (progress === 0 || progress === 1) {
    return progress;
  }

  const period = (2 * Math.PI) / 4.5;
  if (progress < 0.5) {
    return (
      -(
        2 ** (20 * progress - 10) *
        Math.sin((20 * progress - 11.125) * period)
      ) / 2
    );
  }

  return (
    (2 ** (-20 * progress + 10) * Math.sin((20 * progress - 11.125) * period)) /
      2 +
    1
  );
};

const EASE_IN_BY_FAMILY = Object.freeze({
  Quad: (progress) => progress ** 2,
  Cubic: (progress) => progress ** 3,
  Quart: (progress) => progress ** 4,
  Quint: (progress) => progress ** 5,
  Sine: (progress) => 1 - Math.cos((progress * Math.PI) / 2),
  Expo: (progress) => (progress === 0 ? 0 : 2 ** (10 * progress - 10)),
  Circ: (progress) => 1 - Math.sqrt(1 - progress ** 2),
  Back: easeInBack,
  Bounce: (progress) => 1 - easeOutBounce(1 - progress),
  Elastic: easeInElastic,
});

const resolveEasingFunction = (easingName) => {
  if (easingName === "linear") {
    return (progress) => progress;
  }

  const match = /^ease(InOut|In|Out)([A-Za-z]+)$/.exec(easingName ?? "");
  if (!match) {
    return (progress) => progress;
  }

  const [, mode, family] = match;
  if (family === "Elastic") {
    if (mode === "In") return easeInElastic;
    if (mode === "Out") return easeOutElastic;
    return easeInOutElastic;
  }

  if (family === "Back" && mode === "InOut") {
    return easeInOutBack;
  }

  if (family === "Bounce" && mode === "Out") {
    return easeOutBounce;
  }

  const easeIn = EASE_IN_BY_FAMILY[family];
  if (!easeIn) {
    return (progress) => progress;
  }

  if (mode === "In") {
    return easeIn;
  }

  if (mode === "Out") {
    return (progress) => 1 - easeIn(1 - progress);
  }

  return (progress) => {
    if (progress < 0.5) {
      return easeIn(progress * 2) / 2;
    }

    return 1 - easeIn((1 - progress) * 2) / 2;
  };
};

const createEasingSamples = (easingName) => {
  const easing = resolveEasingFunction(easingName);
  const samples = Array.from(
    { length: CURVE_SAMPLE_COUNT + 1 },
    (_, sampleIndex) => {
      const progress = sampleIndex / CURVE_SAMPLE_COUNT;
      const value = easing(progress);
      return {
        progress,
        value: Number.isFinite(value) ? value : progress,
      };
    },
  );
  samples[0].value = 0;
  samples[samples.length - 1].value = 1;
  return samples;
};

const EASING_SAMPLES = Object.freeze(
  Object.fromEntries(
    SUPPORTED_EASING_CURVE_NAMES.map((easingName) => [
      easingName,
      createEasingSamples(easingName),
    ]),
  ),
);

const resolveNumber = (value, fallback) => {
  const numberValue = Number.parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const resolveInitialValue = ({ initialValue, defaultValue } = {}) => {
  return resolveNumber(initialValue, resolveNumber(defaultValue, 0));
};

const resolveTargetValue = ({ keyframe, startValue } = {}) => {
  const keyframeValue = resolveNumber(keyframe?.value, 0);
  return keyframe?.relative ? startValue + keyframeValue : keyframeValue;
};

const createValuePointPath = ({ points, timelineDuration } = {}) => {
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const hasValueRange = maxValue !== minValue;
  const valueRange = hasValueRange ? maxValue - minValue : 1;
  const drawableHeight = CURVE_HEIGHT - CURVE_PADDING * 2;

  return points
    .map(({ timeMs, value }, pointIndex) => {
      const x = (timeMs / timelineDuration) * CURVE_WIDTH;
      const normalizedValue = hasValueRange
        ? (value - minValue) / valueRange
        : 0.5;
      const y = CURVE_PADDING + (1 - normalizedValue) * drawableHeight;
      const command = pointIndex === 0 ? "M" : "L";
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

export const createKeyframeValueCurvePath = ({
  defaultValue,
  initialValue,
  keyframes = [],
  timelineDuration,
} = {}) => {
  if (keyframes.length === 0) {
    return "";
  }

  const points = [];
  let elapsedTimeMs = 0;
  let startValue = resolveInitialValue({ initialValue, defaultValue });

  keyframes.forEach((keyframe, keyframeIndex) => {
    const duration = resolveNumber(keyframe.duration, 1000) || 1000;
    const targetValue = resolveTargetValue({ keyframe, startValue });
    const easingSamples =
      EASING_SAMPLES[keyframe.easing ?? "linear"] ?? EASING_SAMPLES.linear;

    easingSamples.forEach(({ progress, value: easedProgress }, sampleIndex) => {
      if (keyframeIndex > 0 && sampleIndex === 0) {
        return;
      }

      points.push({
        timeMs: elapsedTimeMs + progress * duration,
        value: startValue + (targetValue - startValue) * easedProgress,
      });
    });

    elapsedTimeMs += duration;
    startValue = targetValue;
  });

  const resolvedTimelineDuration =
    Number(timelineDuration) > 0 ? Number(timelineDuration) : elapsedTimeMs;
  if (resolvedTimelineDuration <= 0) {
    return "";
  }

  if (resolvedTimelineDuration > elapsedTimeMs) {
    points.push({
      timeMs: resolvedTimelineDuration,
      value: startValue,
    });
  }

  return createValuePointPath({
    points,
    timelineDuration: resolvedTimelineDuration,
  });
};
