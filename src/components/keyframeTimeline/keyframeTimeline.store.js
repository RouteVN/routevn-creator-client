import { createKeyframeValueCurvePath } from "./keyframeTimeline.easing.js";

export const createInitialState = () => ({
  durationResize: undefined,
  hoverTarget: undefined,
  keyframeMove: undefined,
  rulerScrub: undefined,
});

export const setHoverTarget = ({ state }, { hoverTarget } = {}) => {
  state.hoverTarget = hoverTarget;
};

export const clearHoverTarget = ({ state }, _payload = {}) => {
  state.hoverTarget = undefined;
};

export const selectHoverTarget = ({ state }) => {
  return state.hoverTarget;
};

export const startRulerScrub = ({ state }, { leftPercent, pointerId } = {}) => {
  state.rulerScrub = { leftPercent, pointerId };
};

export const updateRulerScrub = ({ state }, { leftPercent } = {}) => {
  if (state.rulerScrub) {
    state.rulerScrub.leftPercent = leftPercent;
  }
};

export const clearRulerScrub = ({ state }, _payload = {}) => {
  state.rulerScrub = undefined;
};

export const selectRulerScrub = ({ state }) => {
  return state.rulerScrub;
};

export const startDurationResize = (
  { state },
  {
    pointerId,
    property,
    index,
    edge,
    startX,
    startDelay,
    startDuration,
    timelineDuration,
    trackWidth,
  } = {},
) => {
  const resolvedStartDelay = Math.max(0, Number(startDelay) || 0);
  state.durationResize = {
    pointerId,
    property,
    index: Number(index),
    edge,
    startX,
    startDelay: resolvedStartDelay,
    startDuration,
    delay: resolvedStartDelay,
    duration: startDuration,
    timelineDuration,
    trackWidth,
  };
};

export const setDurationResizeTiming = (
  { state },
  { delay, duration } = {},
) => {
  if (state.durationResize) {
    state.durationResize.delay = delay;
    state.durationResize.duration = duration;
  }
};

export const clearDurationResize = ({ state }, _payload = {}) => {
  state.durationResize = undefined;
};

export const selectDurationResize = ({ state }) => {
  return state.durationResize;
};

export const startKeyframeMove = (
  { state },
  {
    pointerId,
    property,
    index,
    startX,
    startDelay,
    startFollowingDelay,
    duration,
    timelineDuration,
    trackWidth,
  } = {},
) => {
  const resolvedStartDelay = Math.max(0, Number(startDelay) || 0);
  const resolvedStartFollowingDelay =
    startFollowingDelay === undefined
      ? undefined
      : Math.max(0, Number(startFollowingDelay) || 0);
  state.keyframeMove = {
    pointerId,
    property,
    index: Number(index),
    startX,
    startDelay: resolvedStartDelay,
    delay: resolvedStartDelay,
    startFollowingDelay: resolvedStartFollowingDelay,
    followingDelay: resolvedStartFollowingDelay,
    duration,
    timelineDuration,
    trackWidth,
  };
};

export const setKeyframeMoveTiming = (
  { state },
  { delay, followingDelay } = {},
) => {
  if (state.keyframeMove) {
    state.keyframeMove.delay = delay;
    state.keyframeMove.followingDelay = followingDelay;
  }
};

export const clearKeyframeMove = ({ state }, _payload = {}) => {
  state.keyframeMove = undefined;
};

export const selectKeyframeMove = ({ state }) => {
  return state.keyframeMove;
};

const RULER_TARGET_MAJOR_TICK_COUNT = 6;
const RULER_MINOR_TICKS_PER_MAJOR = 5;

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const formatRulerTimeLabel = (timeMs) => {
  if (timeMs < 1000) {
    return `${timeMs}ms`;
  }

  const seconds = timeMs / 1000;
  if (Number.isInteger(seconds)) {
    return `${seconds}s`;
  }

  return `${Number(seconds.toFixed(seconds < 10 ? 1 : 2))}s`;
};

const formatEasingLabel = (easingName) => {
  if (easingName === "linear") {
    return "Linear";
  }

  return easingName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
};

const getPropertyDuration = (config = {}) => {
  if (config?.auto) {
    return Number(config.auto.duration) || 0;
  }

  return (config?.keyframes ?? []).reduce((sum, keyframe) => {
    return (
      sum +
      Math.max(0, parseFloat(keyframe.delay) || 0) +
      (parseFloat(keyframe.duration) || 1000)
    );
  }, 0);
};

const resolveMajorTickInterval = (durationMs) => {
  if (durationMs <= 0) {
    return 0;
  }

  const roughInterval = durationMs / RULER_TARGET_MAJOR_TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(roughInterval));
  const normalizedInterval = roughInterval / magnitude;
  let niceNormalizedInterval = 10;

  if (normalizedInterval <= 1) {
    niceNormalizedInterval = 1;
  } else if (normalizedInterval <= 2) {
    niceNormalizedInterval = 2;
  } else if (normalizedInterval <= 2.5) {
    niceNormalizedInterval = 2.5;
  } else if (normalizedInterval <= 5) {
    niceNormalizedInterval = 5;
  }

  return Math.max(1, Math.round(niceNormalizedInterval * magnitude));
};

const createRulerTick = ({
  timeMs,
  durationMs,
  isMajor = false,
  showLabel = false,
} = {}) => {
  const leftPercent =
    durationMs > 0 ? clamp((timeMs / durationMs) * 100, 0, 100) : 0;
  let labelStyle = "";

  if (showLabel) {
    if (leftPercent <= 0) {
      labelStyle = "top: 10px; left: 0; pointer-events: none;";
    } else if (leftPercent >= 100) {
      labelStyle = "top: 10px; right: 0; pointer-events: none;";
    } else {
      labelStyle = `top: 10px; left: ${leftPercent}%; transform: translateX(-50%); pointer-events: none;`;
    }
  }

  return {
    id: `tick-${timeMs}`,
    label: showLabel ? formatRulerTimeLabel(timeMs) : undefined,
    labelStyle,
    tickStyle: `top: ${isMajor ? 32 : 37}px; left: ${leftPercent}%; width: ${isMajor ? 2 : 1}px; height: ${isMajor ? 12 : 7}px; transform: translateX(-${isMajor ? 1 : 0.5}px); pointer-events: none;`,
  };
};

const createHoverIndicatorLabelStyle = (leftPercent) => {
  if (leftPercent <= 0) {
    return "top: -10px; left: 0; pointer-events: none; z-index: 4; white-space: nowrap;";
  }

  if (leftPercent >= 100) {
    return "top: -10px; right: 0; pointer-events: none; z-index: 4; white-space: nowrap;";
  }

  return `top: -10px; left: ${leftPercent}%; transform: translateX(-50%); pointer-events: none; z-index: 4; white-space: nowrap;`;
};

const createRulerTicks = (durationMs) => {
  if (durationMs <= 0) {
    return [
      createRulerTick({
        timeMs: 0,
        durationMs: 0,
        isMajor: true,
        showLabel: true,
      }),
    ];
  }

  const majorTickInterval = resolveMajorTickInterval(durationMs);
  const minorTickInterval = Math.max(
    1,
    Math.round(majorTickInterval / RULER_MINOR_TICKS_PER_MAJOR),
  );
  const ticksByTime = new Map();
  const upsertTick = ({ timeMs, isMajor = false, showLabel = false } = {}) => {
    const roundedTimeMs = Math.round(timeMs);
    const existingTick = ticksByTime.get(roundedTimeMs);
    ticksByTime.set(roundedTimeMs, {
      timeMs: roundedTimeMs,
      isMajor: existingTick?.isMajor === true || isMajor,
      showLabel: existingTick?.showLabel === true || showLabel,
    });
  };

  const minorTickCount = Math.floor(durationMs / minorTickInterval);
  for (let tickIndex = 0; tickIndex <= minorTickCount; tickIndex += 1) {
    upsertTick({
      timeMs: tickIndex * minorTickInterval,
      isMajor: tickIndex % RULER_MINOR_TICKS_PER_MAJOR === 0,
      showLabel: tickIndex % RULER_MINOR_TICKS_PER_MAJOR === 0,
    });
  }

  upsertTick({
    timeMs: durationMs,
    isMajor: true,
    showLabel: true,
  });

  return Array.from(ticksByTime.values())
    .sort((left, right) => left.timeMs - right.timeMs)
    .map((tick) =>
      createRulerTick({
        timeMs: tick.timeMs,
        durationMs,
        isMajor: tick.isMajor,
        showLabel: tick.showLabel,
      }),
    );
};

export const selectViewData = ({ state, props, props: attrs }) => {
  const showRuler = attrs.showRuler === true;
  const showTracks = attrs.showTracks !== false;
  const resolveTrackCursor = ({ propertyName, trackMode } = {}) => {
    if (attrs.editable && trackMode === "auto") {
      return "pointer";
    }

    return state.hoverTarget?.property === propertyName ? "pointer" : "default";
  };
  const resolveEmptyLabelVisible = ({ propertyName } = {}) => {
    return !(
      state.hoverTarget?.property === propertyName &&
      state.hoverTarget?.mode === "empty"
    );
  };
  const resolveKeyframeTiming = ({ propertyName, index, keyframe } = {}) => {
    const durationResize = state.durationResize;
    const keyframeMove = state.keyframeMove;
    const isResizingKeyframe =
      durationResize?.property === propertyName &&
      durationResize.index === index;
    const isMovingKeyframe =
      keyframeMove?.property === propertyName && keyframeMove.index === index;
    const isFollowingMovingKeyframe =
      keyframeMove?.property === propertyName &&
      keyframeMove.index + 1 === index &&
      keyframeMove.followingDelay !== undefined;

    return {
      delay: isMovingKeyframe
        ? Math.max(0, Number(keyframeMove.delay) || 0)
        : isFollowingMovingKeyframe
          ? Math.max(0, Number(keyframeMove.followingDelay) || 0)
          : isResizingKeyframe
            ? Math.max(0, Number(durationResize.delay) || 0)
            : Math.max(0, parseFloat(keyframe.delay) || 0),
      duration: isMovingKeyframe
        ? keyframeMove.duration
        : isResizingKeyframe
          ? durationResize.duration
          : parseFloat(keyframe.duration) || 1000,
    };
  };

  let selectedProperties = [];
  if (props.properties) {
    selectedProperties = Object.keys(props.properties).map((propertyName) => {
      const propertyConfig = props.properties[propertyName] ?? {};
      const value = propertyConfig.initialValue;
      const isDefault = value === undefined || value === "";
      const autoConfig = propertyConfig.auto;
      const selected =
        attrs.selectedProperty?.side === attrs.side &&
        attrs.selectedProperty?.property === propertyName;
      return {
        name: propertyName,
        selected,
        nameColor: selected ? "pr" : "fg",
        initialValue: autoConfig ? "" : isDefault ? "D" : value,
        initialValueInteractive: !autoConfig,
        trackMode: autoConfig ? "auto" : "keyframes",
        keyframes: propertyConfig.keyframes,
        auto: autoConfig
          ? {
              duration: Number(autoConfig.duration) || 0,
              easing: autoConfig.easing ?? "linear",
            }
          : undefined,
      };
    });
  }

  let maxDuration = 0;
  if (selectedProperties.length > 0) {
    selectedProperties.forEach((property) => {
      const propertyDuration = property.auto
        ? getPropertyDuration(property)
        : (property.keyframes ?? []).reduce((sum, keyframe, index) => {
            const timing = resolveKeyframeTiming({
              propertyName: property.name,
              index,
              keyframe,
            });
            return sum + timing.delay + timing.duration;
          }, 0);
      maxDuration = Math.max(maxDuration, propertyDuration);
    });
  }
  const interactionTimelineDuration = Number(
    state.durationResize?.timelineDuration ??
      state.keyframeMove?.timelineDuration,
  );
  const resolvedTimelineDuration =
    interactionTimelineDuration > 0
      ? interactionTimelineDuration
      : Number(props.timelineDuration) > 0
        ? Number(props.timelineDuration)
        : maxDuration;
  const totalDuration =
    resolvedTimelineDuration > 0 ? `${resolvedTimelineDuration}ms` : "0ms";
  const externalIndicatorTimeMs = Number(attrs.indicatorTimeMs);
  const externalIndicatorLeftPercent =
    attrs.indicatorVisible === true &&
    Number.isFinite(externalIndicatorTimeMs) &&
    resolvedTimelineDuration > 0
      ? clamp(
          (externalIndicatorTimeMs / resolvedTimelineDuration) * 100,
          0,
          100,
        )
      : undefined;
  const indicatorLeftPercent =
    state.rulerScrub?.leftPercent ?? externalIndicatorLeftPercent;
  const indicatorVisible = indicatorLeftPercent !== undefined;
  const rulerIndicatorVisible = indicatorVisible && showRuler;
  const playheadIndicatorTimeMs = rulerIndicatorVisible
    ? state.rulerScrub?.leftPercent !== undefined
      ? Math.round((indicatorLeftPercent / 100) * resolvedTimelineDuration)
      : Math.round(externalIndicatorTimeMs)
    : undefined;
  const playheadIndicatorTimeLabel =
    playheadIndicatorTimeMs === undefined
      ? ""
      : `${playheadIndicatorTimeMs} ms`;
  const playheadIndicatorLabelStyle = rulerIndicatorVisible
    ? createHoverIndicatorLabelStyle(indicatorLeftPercent)
    : "";
  const rulerTicks = showRuler
    ? createRulerTicks(resolvedTimelineDuration)
    : [];

  selectedProperties = selectedProperties.map((property) => {
    if (property.auto) {
      const nextProperty = {
        ...property,
      };
      const propertyDuration = getPropertyDuration(property);
      const autoWidthPercent =
        resolvedTimelineDuration > 0
          ? (propertyDuration / resolvedTimelineDuration) * 100
          : 100;

      nextProperty.auto = {
        ...property.auto,
        easingLabel: formatEasingLabel(property.auto.easing),
        label: `Auto ${propertyDuration}ms ${formatEasingLabel(property.auto.easing)}`,
        widthPercent: autoWidthPercent.toFixed(2),
      };
      nextProperty.fillerWidthPercent = Math.max(
        0,
        100 - autoWidthPercent,
      ).toFixed(2);
      nextProperty.hoverTarget = undefined;
      nextProperty.trackCursor = resolveTrackCursor({
        propertyName: property.name,
        trackMode: property.trackMode,
      });
      nextProperty.initialValueCursor = "default";
      nextProperty.emptyLabelVisible = true;

      return nextProperty;
    }

    if (property.keyframes && property.keyframes.length > 0) {
      const nextProperty = {
        ...property,
      };

      if (resolvedTimelineDuration > 0) {
        const propertyConfig = props.properties?.[property.name] ?? {};
        const effectiveKeyframes = property.keyframes.map(
          (keyframe, keyframeIndex) => {
            const timing = resolveKeyframeTiming({
              propertyName: property.name,
              index: keyframeIndex,
              keyframe,
            });
            return {
              ...keyframe,
              ...timing,
            };
          },
        );
        const propertyTotalDuration = effectiveKeyframes.reduce(
          (sum, keyframe) => sum + keyframe.delay + keyframe.duration,
          0,
        );

        // Calculate property's total width percentage relative to max duration
        const propertyWidthPercent =
          (propertyTotalDuration / resolvedTimelineDuration) * 100;

        // Calculate width percentage for each keyframe based on max duration
        nextProperty.keyframes = effectiveKeyframes.map(
          (keyframe, keyframeIndex) => {
            const segmentDuration = keyframe.delay + keyframe.duration;
            const widthPercent =
              (segmentDuration / resolvedTimelineDuration) * 100;
            const delayPercent =
              segmentDuration > 0
                ? (keyframe.delay / segmentDuration) * 100
                : 0;
            const selected =
              attrs.selectedKeyframe?.side === attrs.side &&
              attrs.selectedKeyframe?.property === property.name &&
              Number(attrs.selectedKeyframe?.index) === keyframeIndex;
            // Add prefix for relative values
            let displayValue = keyframe.value;
            if (keyframe.relative) {
              // Check if value already has a sign
              const numValue = parseFloat(keyframe.value);
              if (!isNaN(numValue)) {
                displayValue =
                  numValue >= 0 ? `Δ+${keyframe.value}` : `Δ${keyframe.value}`;
              }
            }
            return {
              ...keyframe,
              easing: keyframe.easing ?? "linear",
              easingLabel: formatEasingLabel(keyframe.easing ?? "linear"),
              value: displayValue,
              widthPercent: widthPercent.toFixed(2),
              delayPercent: delayPercent.toFixed(2),
              cursor:
                state.keyframeMove?.property === property.name &&
                state.keyframeMove.index === keyframeIndex
                  ? "grabbing"
                  : "grab",
              selected,
              backgroundColor: "ac",
              foregroundColor: "ac-fg",
              borderColor: selected ? "var(--ring)" : "var(--accent)",
            };
          },
        );
        nextProperty.valueCurvePath = createKeyframeValueCurvePath({
          defaultValue: props.defaultValues?.[property.name],
          initialValue: propertyConfig.initialValue,
          keyframes: effectiveKeyframes,
          timelineDuration: resolvedTimelineDuration,
        });
        nextProperty.propertyWidthPercent = propertyWidthPercent.toFixed(2);
        nextProperty.fillerWidthPercent = (100 - propertyWidthPercent).toFixed(
          2,
        );
      }

      nextProperty.hoverTarget =
        state.hoverTarget?.property === property.name
          ? state.hoverTarget
          : undefined;
      nextProperty.trackCursor = resolveTrackCursor({
        propertyName: property.name,
        trackMode: property.trackMode,
      });
      nextProperty.initialValueCursor = property.initialValueInteractive
        ? "pointer"
        : "default";
      nextProperty.emptyLabelVisible = resolveEmptyLabelVisible({
        propertyName: property.name,
      });

      return nextProperty;
    }

    return {
      ...property,
      hoverTarget:
        state.hoverTarget?.property === property.name
          ? state.hoverTarget
          : undefined,
      trackCursor: resolveTrackCursor({
        propertyName: property.name,
        trackMode: property.trackMode,
      }),
      initialValueCursor: property.initialValueInteractive
        ? "pointer"
        : "default",
      emptyLabelVisible: resolveEmptyLabelVisible({
        propertyName: property.name,
      }),
    };
  });

  const result = {
    totalDuration,
    selectedProperties,
    showTotalDuration: attrs.showTotalDuration !== false,
    showRuler,
    showTracks,
    rulerTicks,
    rulerIndicatorVisible,
    playheadIndicatorTimeLabel,
    playheadIndicatorLabelStyle,
    editable: attrs.editable,
  };

  return result;
};
