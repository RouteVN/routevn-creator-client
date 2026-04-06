export const createInitialState = () => ({
  hoverTarget: undefined,
  hoverIndicatorLeftPercent: undefined,
});

export const setHoverTarget = ({ state }, { hoverTarget } = {}) => {
  state.hoverTarget = hoverTarget;
};

export const setHoverIndicator = ({ state }, { leftPercent } = {}) => {
  state.hoverIndicatorLeftPercent = leftPercent;
};

export const clearHoverTarget = ({ state }, _payload = {}) => {
  state.hoverTarget = undefined;
};

export const clearHoverIndicator = ({ state }, _payload = {}) => {
  state.hoverIndicatorLeftPercent = undefined;
};

export const selectHoverTarget = ({ state }) => {
  return state.hoverTarget;
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
  const resolveTrackCursor = ({ propertyName } = {}) => {
    return state.hoverTarget?.property === propertyName ? "pointer" : "default";
  };
  const resolveEmptyLabelVisible = ({ propertyName } = {}) => {
    return !(
      state.hoverTarget?.property === propertyName &&
      state.hoverTarget?.mode === "empty"
    );
  };

  let selectedProperties = [];
  const defaultValues = props.defaultValues ?? {
    x: 0,
    y: 0,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    translateX: 0,
    translateY: 0,
  };

  if (props.properties) {
    selectedProperties = Object.keys(props.properties).map((propertyName) => {
      const value = props.properties[propertyName].initialValue;
      const isDefault = value === defaultValues[propertyName];
      return {
        name: propertyName,
        initialValue: isDefault ? "D" : value,
        keyframes: props.properties[propertyName].keyframes,
      };
    });
  }

  // Calculate total duration based on keyframe durations
  let maxDuration = 0;
  if (selectedProperties.length > 0) {
    selectedProperties.forEach((property) => {
      if (property.keyframes && property.keyframes.length > 0) {
        const propertyDuration = property.keyframes.reduce(
          (sum, keyframe) => sum + (parseFloat(keyframe.duration) || 1000),
          0,
        );
        maxDuration = Math.max(maxDuration, propertyDuration);
      }
    });
  }
  const resolvedTimelineDuration =
    Number(props.timelineDuration) > 0
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
    state.hoverIndicatorLeftPercent ?? externalIndicatorLeftPercent;
  const hoverIndicatorVisible = indicatorLeftPercent !== undefined && showRuler;
  const hoverIndicatorTimeMs = hoverIndicatorVisible
    ? state.hoverIndicatorLeftPercent !== undefined
      ? Math.round((indicatorLeftPercent / 100) * resolvedTimelineDuration)
      : Math.round(externalIndicatorTimeMs)
    : undefined;
  const hoverIndicatorTimeLabel =
    hoverIndicatorTimeMs === undefined ? "" : `${hoverIndicatorTimeMs} ms`;
  const hoverIndicatorRulerStyle = hoverIndicatorVisible
    ? `top: 10px; bottom: 0; left: ${indicatorLeftPercent}%; width: 1px; transform: translateX(-0.5px); pointer-events: none; z-index: 3;`
    : "";
  const hoverIndicatorTrackStyle = hoverIndicatorVisible
    ? `top: 0; bottom: 0; left: ${indicatorLeftPercent}%; width: 1px; transform: translateX(-0.5px); pointer-events: none; z-index: 3;`
    : "";
  const hoverIndicatorLabelStyle = hoverIndicatorVisible
    ? createHoverIndicatorLabelStyle(indicatorLeftPercent)
    : "";
  const rulerTicks = showRuler
    ? createRulerTicks(resolvedTimelineDuration)
    : [];

  selectedProperties = selectedProperties.map((property) => {
    if (property.keyframes && property.keyframes.length > 0) {
      const nextProperty = {
        ...property,
      };

      if (resolvedTimelineDuration > 0) {
        const propertyTotalDuration = property.keyframes.reduce(
          (sum, keyframe) => sum + (parseFloat(keyframe.duration) || 1000),
          0,
        );

        // Calculate property's total width percentage relative to max duration
        const propertyWidthPercent =
          (propertyTotalDuration / resolvedTimelineDuration) * 100;

        // Calculate width percentage for each keyframe based on max duration
        nextProperty.keyframes = property.keyframes.map((keyframe) => {
          const duration = parseFloat(keyframe.duration) || 1000;
          const widthPercent = (duration / resolvedTimelineDuration) * 100;
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
            value: displayValue,
            widthPercent: widthPercent.toFixed(2),
          };
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
    rulerTicks,
    hoverIndicatorVisible,
    hoverIndicatorTimeLabel,
    hoverIndicatorLabelStyle,
    hoverIndicatorRulerStyle,
    hoverIndicatorTrackStyle,
    editable: attrs.editable,
  };

  return result;
};
