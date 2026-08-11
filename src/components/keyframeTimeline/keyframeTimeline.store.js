import { createKeyframeValueCurvePath } from "./keyframeTimeline.easing.js";

export const createInitialState = () => ({
  durationResize: undefined,
  hoverTarget: undefined,
  keyframeClickSuppressed: false,
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

export const startRulerScrub = (
  { state },
  { leftPercent, pointerId, timelineDuration, trackLeft, trackWidth } = {},
) => {
  state.rulerScrub = {
    leftPercent,
    pointerId,
    timelineDuration,
    trackLeft,
    trackWidth,
  };
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
    mode = "keyframes",
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
    mode,
    edge,
    startX,
    startDelay: resolvedStartDelay,
    startDuration,
    delay: resolvedStartDelay,
    duration: startDuration,
    startTimelineDuration: timelineDuration,
    timelineDuration,
    trackWidth,
  };
};

export const setDurationResizeTiming = (
  { state },
  { delay, duration, timelineDuration } = {},
) => {
  if (state.durationResize) {
    state.durationResize.delay = delay;
    state.durationResize.duration = duration;
    state.durationResize.timelineDuration =
      timelineDuration ?? state.durationResize.timelineDuration;
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
    propertyDuration,
    timelineDuration,
    trackWidth,
  } = {},
) => {
  const resolvedStartDelay = Math.max(0, Number(startDelay) || 0);
  const resolvedStartFollowingDelay =
    startFollowingDelay === undefined
      ? undefined
      : Math.max(0, Number(startFollowingDelay) || 0);
  state.keyframeClickSuppressed = false;
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
    dragged: false,
    propertyDuration,
    startTimelineDuration: timelineDuration,
    timelineDuration,
    trackWidth,
  };
};

export const markKeyframeMoveDragged = ({ state }, _payload = {}) => {
  if (state.keyframeMove) {
    state.keyframeMove.dragged = true;
  }
};

export const setKeyframeMoveTiming = (
  { state },
  { delay, followingDelay, timelineDuration } = {},
) => {
  if (state.keyframeMove) {
    state.keyframeMove.delay = delay;
    state.keyframeMove.followingDelay = followingDelay;
    if (timelineDuration > state.keyframeMove.timelineDuration) {
      state.keyframeMove.timelineDuration = timelineDuration;
    }
  }
};

export const clearKeyframeMove = (
  { state },
  { suppressClick = false } = {},
) => {
  state.keyframeMove = undefined;
  state.keyframeClickSuppressed = suppressClick;
};

export const selectKeyframeMove = ({ state }) => {
  return state.keyframeMove;
};

const resolveKeyframeTiming = ({
  state,
  propertyName,
  index,
  keyframe,
} = {}) => {
  const durationResize = state.durationResize;
  const keyframeMove = state.keyframeMove;
  const isResizingKeyframe =
    durationResize?.mode !== "auto" &&
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

const getPreviewPropertiesDuration = ({ state, props } = {}) => {
  return Object.entries(props.properties ?? {}).reduce(
    (maxDuration, [propertyName, propertyConfig]) => {
      const isResizingAuto =
        state.durationResize?.mode === "auto" &&
        state.durationResize.property === propertyName;
      const propertyDuration = propertyConfig.auto
        ? isResizingAuto
          ? Number(state.durationResize.duration) || 0
          : Number(propertyConfig.auto.duration) || 0
        : (propertyConfig.keyframes ?? []).reduce(
            (duration, keyframe, index) => {
              const timing = resolveKeyframeTiming({
                state,
                propertyName,
                index,
                keyframe,
              });
              return duration + timing.delay + timing.duration;
            },
            0,
          );

      return Math.max(maxDuration, propertyDuration);
    },
    0,
  );
};

export const selectPreviewUsedDuration = ({ state, props }) => {
  return getPreviewPropertiesDuration({ state, props });
};

export const selectKeyframeClickSuppressed = ({ state }) => {
  return state.keyframeClickSuppressed;
};

export const clearKeyframeClickSuppression = ({ state }, _payload = {}) => {
  state.keyframeClickSuppressed = false;
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

const formatKeyframeValue = ({ value, relative } = {}) => {
  if (!relative) {
    return value;
  }

  const numberValue = parseFloat(value);
  if (Number.isNaN(numberValue)) {
    return value;
  }

  return numberValue >= 0 ? `Δ+${value}` : `Δ${value}`;
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
      labelStyle = "top: 22px; left: 0; pointer-events: none;";
    } else if (leftPercent >= 100) {
      labelStyle = "top: 22px; right: 0; pointer-events: none;";
    } else {
      labelStyle = `top: 22px; left: ${leftPercent}%; transform: translateX(-50%); pointer-events: none;`;
    }
  }

  return {
    id: `tick-${timeMs}`,
    label: showLabel ? formatRulerTimeLabel(timeMs) : undefined,
    labelStyle,
    tickStyle: `top: ${isMajor ? 40 : 45}px; left: ${leftPercent}%; width: ${isMajor ? 2 : 1}px; height: ${isMajor ? 12 : 7}px; transform: translateX(-${isMajor ? 1 : 0.5}px); pointer-events: none;`,
  };
};

const createHoverIndicatorLabelStyle = (leftPercent) => {
  if (leftPercent <= 0) {
    return "top: 4px; left: 0; pointer-events: none; z-index: 10; white-space: nowrap;";
  }

  if (leftPercent >= 100) {
    return "top: 4px; right: 0; pointer-events: none; z-index: 10; white-space: nowrap;";
  }

  return `top: 4px; left: ${leftPercent}%; transform: translateX(-50%); pointer-events: none; z-index: 10; white-space: nowrap;`;
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

  const endpointTimeMs = Math.round(durationMs);
  ticksByTime.set(endpointTimeMs, {
    timeMs: endpointTimeMs,
    isMajor: true,
    showLabel: false,
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

export const selectViewData = ({ state, props, props: attrs, i18n = {} }) => {
  const autoLabel = i18n.animationEditorPage?.autoTweenMode ?? "Auto";
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
  let selectedProperties = [];
  if (props.properties) {
    selectedProperties = Object.keys(props.properties).map((propertyName) => {
      const propertyConfig = props.properties[propertyName] ?? {};
      const value = propertyConfig.initialValue;
      const isDefault = value === undefined || value === "";
      const autoConfig = propertyConfig.auto;
      const selected =
        propertyConfig.selected === true ||
        (attrs.selectedProperty?.side === attrs.side &&
          attrs.selectedProperty?.property === propertyName);
      return {
        name: propertyName,
        selected,
        backgroundColor: selected ? "ac" : "bg",
        hoverBackgroundColor: attrs.editable
          ? selected
            ? "ac"
            : "mu"
          : selected
            ? "ac"
            : "bg",
        nameColor: selected ? "ac-fg" : "fg",
        rowCursor: attrs.editable ? "pointer" : "default",
        thumbnail: propertyConfig.thumbnail === true,
        thumbnailBorderColor: propertyConfig.thumbnailBorderColor ?? "bo",
        thumbnailFileId: propertyConfig.thumbnailFileId,
        thumbnailName: propertyConfig.thumbnailName ?? propertyName,
        initialValue: autoConfig
          ? autoLabel.toLocaleLowerCase()
          : isDefault
            ? "D"
            : value,
        initialValueColor: autoConfig ? "mu" : selected ? "ac-fg" : "fg",
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

  const maxDuration = getPreviewPropertiesDuration({ state, props });
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
  const requestedUsedDuration = Number(props.usedDuration);
  const interactionActive = Boolean(state.durationResize || state.keyframeMove);
  const usedDuration =
    interactionActive || !Number.isFinite(requestedUsedDuration)
      ? maxDuration
      : Math.max(0, requestedUsedDuration, maxDuration);
  const usedDurationPercent =
    resolvedTimelineDuration > 0
      ? clamp((usedDuration / resolvedTimelineDuration) * 100, 0, 100)
      : 0;
  const usedDurationVisible = usedDurationPercent > 0;
  const usedDurationStyle = usedDurationVisible
    ? `left: 0; top: 0; bottom: 0; width: ${usedDurationPercent.toFixed(2)}%; pointer-events: none; z-index: 0;`
    : "";
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
      const isResizingAuto =
        state.durationResize?.mode === "auto" &&
        state.durationResize.property === property.name;
      const propertyDuration = isResizingAuto
        ? Number(state.durationResize.duration) || 0
        : getPropertyDuration(property);
      const autoWidthPercent =
        resolvedTimelineDuration > 0
          ? (propertyDuration / resolvedTimelineDuration) * 100
          : 100;

      nextProperty.auto = {
        ...property.auto,
        duration: propertyDuration,
        easingLabel: formatEasingLabel(property.auto.easing),
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
              state,
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
            return {
              ...keyframe,
              easing: keyframe.easing ?? "linear",
              easingLabel: formatEasingLabel(keyframe.easing ?? "linear"),
              startValueLabel: formatKeyframeValue({
                value: keyframe.startValue,
                relative: keyframe.relative,
              }),
              startValueVisible: keyframe.startValue !== undefined,
              value: formatKeyframeValue({
                value: keyframe.value,
                relative: keyframe.relative,
              }),
              widthPercent: widthPercent.toFixed(2),
              delayPercent: delayPercent.toFixed(2),
              cursor: attrs.editable
                ? state.keyframeMove?.property === property.name &&
                  state.keyframeMove.index === keyframeIndex
                  ? "grabbing"
                  : "grab"
                : "default",
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
    rulerCursor: attrs.interactiveRuler === true ? "ew-resize" : "default",
    rulerTicks,
    rulerIndicatorVisible,
    playheadIndicatorTimeLabel,
    playheadIndicatorLabelStyle,
    usedDurationVisible,
    usedDuration,
    usedDurationStyle,
    editable: attrs.editable,
  };

  return result;
};
