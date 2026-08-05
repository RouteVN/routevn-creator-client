const DURATION_RESIZE_SNAP_MS = 100;
const DEFAULT_KEYFRAME_DURATION_MS = 1000;
const TIMELINE_EXTENSION_STEP_MS = 1000;

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const resolveHoverIndicatorPercent = ({ element, clientX } = {}) => {
  const rect = element?.getBoundingClientRect?.();
  const width = rect?.width ?? 0;

  if (width <= 0) {
    return undefined;
  }

  return (clamp(clientX - rect.left, 0, width) / width) * 100;
};

const resolveTimelineDuration = (props = {}) => {
  const explicitDuration = Number(props.timelineDuration);
  if (explicitDuration > 0) {
    return explicitDuration;
  }

  let maxDuration = 0;
  for (const config of Object.values(props.properties ?? {})) {
    const propertyDuration = config?.auto
      ? Number(config.auto.duration) || 0
      : (config?.keyframes ?? []).reduce(
          (sum, keyframe) =>
            sum +
            Math.max(0, parseFloat(keyframe.delay) || 0) +
            (parseFloat(keyframe.duration) || 1000),
          0,
        );
    maxDuration = Math.max(maxDuration, propertyDuration);
  }

  return maxDuration;
};

const getKeyframesDuration = (keyframes = []) => {
  return keyframes.reduce((sum, keyframe) => {
    return (
      sum +
      Math.max(0, parseFloat(keyframe.delay) || 0) +
      (parseFloat(keyframe.duration) || DEFAULT_KEYFRAME_DURATION_MS)
    );
  }, 0);
};

const dispatchTimelineDurationExtendEvent = ({
  dispatchEvent,
  duration,
} = {}) => {
  dispatchEvent(
    new CustomEvent("timeline-duration-extend", {
      detail: { duration },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchTimelineUsedDurationPreviewEvent = ({
  active,
  dispatchEvent,
  duration,
  side,
} = {}) => {
  dispatchEvent(
    new CustomEvent("timeline-used-duration-preview", {
      detail: { active, duration, side },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchRulerScrubEvent = ({
  committed = false,
  dispatchEvent,
  side,
  timeMs,
  leftPercent,
} = {}) => {
  dispatchEvent(
    new CustomEvent("ruler-time-scrub", {
      detail: {
        committed,
        side,
        timeMs,
        leftPercent,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const resolveRulerScrubPosition = ({ element, clientX, props } = {}) => {
  const leftPercent = resolveHoverIndicatorPercent({ element, clientX });
  const timelineDuration = resolveTimelineDuration(props);
  const timeMs =
    leftPercent === undefined
      ? undefined
      : Math.round((leftPercent / 100) * timelineDuration);

  return { leftPercent, timeMs };
};

const dispatchAddKeyframeEvent = ({
  dispatchEvent,
  property,
  side,
  index,
  delay,
  duration,
  followingDelay,
  x,
  y,
} = {}) => {
  dispatchEvent(
    new CustomEvent("add-keyframe", {
      detail: {
        property,
        side,
        index,
        delay,
        duration,
        followingDelay,
        x,
        y,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchAutoTrackClickEvent = ({
  dispatchEvent,
  property,
  side,
  x,
  y,
} = {}) => {
  dispatchEvent(
    new CustomEvent("auto-track-click", {
      detail: {
        property,
        side,
        x,
        y,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchKeyframeDurationChangeEvent = ({
  dispatchEvent,
  delay,
  duration,
  followingDelay,
  property,
  side,
  index,
} = {}) => {
  const detail = {
    delay,
    duration,
    property,
    side,
    index,
  };
  if (followingDelay !== undefined) {
    detail.followingDelay = followingDelay;
  }

  dispatchEvent(
    new CustomEvent("keyframe-duration-change", {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchKeyframeClickEvent = ({
  dispatchEvent,
  property,
  index,
  side,
  x,
  y,
} = {}) => {
  dispatchEvent(
    new CustomEvent("keyframe-click", {
      detail: {
        property,
        index,
        side,
        x,
        y,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchKeyframeSelectEvent = ({
  dispatchEvent,
  property,
  index,
  side,
} = {}) => {
  dispatchEvent(
    new CustomEvent("keyframe-select", {
      detail: {
        property,
        index,
        side,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const createGapHoverTarget = ({
  property,
  index,
  relativeX,
  zoneLeft,
  zoneRight,
  gapDuration,
  hasFollowingKeyframe = false,
} = {}) => {
  if (
    gapDuration <= 0 ||
    zoneRight <= zoneLeft ||
    relativeX < zoneLeft ||
    relativeX > zoneRight
  ) {
    return undefined;
  }

  const duration = Math.min(DEFAULT_KEYFRAME_DURATION_MS, gapDuration);
  const remainingDelay = gapDuration - duration;
  const delay = Math.round(remainingDelay / 2);
  const hoverTarget = {
    property,
    mode: "gap",
    index,
    chipLeft: (zoneLeft + zoneRight) / 2,
    zoneLeft,
    zoneWidth: zoneRight - zoneLeft,
    delay,
    duration,
  };
  if (hasFollowingKeyframe) {
    hoverTarget.followingDelay = remainingDelay - delay;
  }

  return hoverTarget;
};

const resolveTrackHoverTarget = ({ clientX, props, trackElement } = {}) => {
  const property = trackElement?.dataset?.property;
  const trackMode = trackElement?.dataset?.trackMode;
  const trackRect = trackElement?.getBoundingClientRect?.();
  const trackWidth = trackRect?.width ?? 0;

  if (!property || trackWidth <= 0 || trackMode === "auto") {
    return undefined;
  }

  const keyframeElements = Array.from(
    trackElement.querySelectorAll("[data-keyframe='true']"),
  );
  if (keyframeElements.length === 0) {
    return {
      property,
      mode: "empty",
      index: 0,
      chipLeft: trackWidth / 2,
      zoneLeft: 0,
      zoneWidth: trackWidth,
    };
  }

  const relativeX = clamp(clientX - trackRect.left, 0, trackWidth);
  const keyframes = props.properties?.[property]?.keyframes ?? [];
  const keyframeRects = keyframeElements
    .map((element) => ({
      index: Number(element.dataset.index),
      rect: element.getBoundingClientRect(),
    }))
    .sort((left, right) => left.index - right.index);

  const first = keyframeRects[0];
  const leadingGapTarget = createGapHoverTarget({
    property,
    index: first.index,
    relativeX,
    zoneLeft: 0,
    zoneRight: first.rect.left - trackRect.left,
    gapDuration: Math.max(0, parseFloat(keyframes[first.index]?.delay) || 0),
    hasFollowingKeyframe: true,
  });
  if (leadingGapTarget) {
    return leadingGapTarget;
  }

  for (let position = 1; position < keyframeRects.length; position += 1) {
    const previous = keyframeRects[position - 1];
    const next = keyframeRects[position];
    const gapDuration = Math.max(
      0,
      parseFloat(keyframes[next.index]?.delay) || 0,
    );
    const zoneLeft = previous.rect.right - trackRect.left;
    const zoneRight = next.rect.left - trackRect.left;

    const betweenGapTarget = createGapHoverTarget({
      property,
      index: next.index,
      relativeX,
      zoneLeft,
      zoneRight,
      gapDuration,
      hasFollowingKeyframe: true,
    });
    if (betweenGapTarget) {
      return betweenGapTarget;
    }
  }

  const propertyDuration = keyframes.reduce((sum, keyframe) => {
    return (
      sum +
      Math.max(0, parseFloat(keyframe.delay) || 0) +
      (parseFloat(keyframe.duration) || DEFAULT_KEYFRAME_DURATION_MS)
    );
  }, 0);
  const trailingGapDuration = Math.max(
    0,
    resolveTimelineDuration(props) - propertyDuration,
  );
  const last = keyframeRects[keyframeRects.length - 1];

  return createGapHoverTarget({
    property,
    index: last.index + 1,
    relativeX,
    zoneLeft: last.rect.right - trackRect.left,
    zoneRight: trackWidth,
    gapDuration: trailingGapDuration,
  });
};

export const handleRulerScrubStart = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  if (props.interactiveRuler !== true || event.button !== 0) {
    return;
  }

  const { leftPercent, timeMs } = resolveRulerScrubPosition({
    element: event.currentTarget,
    clientX: event.clientX,
    props,
  });
  if (leftPercent === undefined) {
    return;
  }

  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  store.startRulerScrub({
    leftPercent,
    pointerId: event.pointerId,
  });
  dispatchRulerScrubEvent({
    dispatchEvent,
    side: props?.side,
    timeMs,
    leftPercent,
  });
  render();
};

export const handleRulerScrubMove = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const rulerScrub = store.selectRulerScrub();
  if (!rulerScrub || rulerScrub.pointerId !== event.pointerId) {
    return;
  }

  const { leftPercent, timeMs } = resolveRulerScrubPosition({
    element: event.currentTarget,
    clientX: event.clientX,
    props,
  });
  event.preventDefault();
  store.updateRulerScrub({ leftPercent });
  dispatchRulerScrubEvent({
    dispatchEvent,
    side: props?.side,
    timeMs,
    leftPercent,
  });
  render();
};

export const handleRulerScrubEnd = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const rulerScrub = store.selectRulerScrub();
  if (!rulerScrub || rulerScrub.pointerId !== event.pointerId) {
    return;
  }

  const { leftPercent, timeMs } = resolveRulerScrubPosition({
    element: event.currentTarget,
    clientX: event.clientX,
    props,
  });
  event.preventDefault();
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  store.clearRulerScrub({});
  dispatchRulerScrubEvent({
    committed: true,
    dispatchEvent,
    side: props?.side,
    timeMs,
    leftPercent,
  });
  render();
};

export const handleRulerScrubCancel = (deps, payload) => {
  const { render, store } = deps;
  const rulerScrub = store.selectRulerScrub();
  if (!rulerScrub || rulerScrub.pointerId !== payload._event.pointerId) {
    return;
  }

  store.clearRulerScrub({});
  render();
};

export const handleTrackMouseMove = (deps, payload) => {
  const { render, store, props } = deps;

  if (props.editable) {
    store.setHoverTarget({
      hoverTarget: resolveTrackHoverTarget({
        clientX: payload._event.clientX,
        props,
        trackElement: payload._event.currentTarget,
      }),
    });
  }
  render();
};

export const handleTrackMouseLeave = (deps, _payload) => {
  const { store, render } = deps;
  store.clearHoverTarget({});
  render();
};

export const handleTrackClick = (deps, payload) => {
  const { dispatchEvent, props, store } = deps;
  if (!props.editable) {
    return;
  }

  if (payload._event.target?.closest?.("[data-keyframe='true']")) {
    return;
  }

  const hoverTarget = store.selectHoverTarget();
  const property = payload._event.currentTarget?.dataset?.property ?? "";
  const trackMode = payload._event.currentTarget?.dataset?.trackMode ?? "";
  const side = props?.side;

  if (trackMode === "auto") {
    payload._event.stopPropagation();
    dispatchAutoTrackClickEvent({
      dispatchEvent,
      property,
      side,
      x: payload._event.clientX,
      y: payload._event.clientY,
    });
    return;
  }

  if (!hoverTarget || hoverTarget.property !== property) {
    return;
  }

  payload._event.stopPropagation();
  dispatchAddKeyframeEvent({
    dispatchEvent,
    property,
    side,
    index: hoverTarget.index,
    delay: hoverTarget.delay,
    duration: hoverTarget.duration,
    followingDelay: hoverTarget.followingDelay,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
};

export const handleKeyframeClick = (deps, payload) => {
  const { dispatchEvent, props, store } = deps;
  if (!props.editable) {
    return;
  }

  payload._event.stopPropagation();
  if (store.selectKeyframeClickSuppressed()) {
    store.clearKeyframeClickSuppression({});
    return;
  }

  const property = payload._event.currentTarget.dataset.property;
  const index = payload._event.currentTarget.dataset.index;
  const side = props?.side;

  dispatchKeyframeClickEvent({
    dispatchEvent,
    property,
    index,
    side,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
};

export const handleKeyframeRightClick = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  const property = payload._event.currentTarget.dataset.property;
  const index = payload._event.currentTarget.dataset.index;
  const side = props?.side;

  payload._event.preventDefault();

  // Dispatch event to parent to add keyframe - let the parent get the context
  dispatchEvent(
    new CustomEvent("keyframe-right-click", {
      detail: {
        property,
        index,
        side,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleKeyframeMoveStart = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  if (!props.editable || event.button !== 0) {
    return;
  }

  const keyframeElement = event.currentTarget;
  const trackElement = keyframeElement.closest?.(
    "[data-keyframe-track='true']",
  );
  const trackWidth = trackElement?.getBoundingClientRect?.().width;
  const property = keyframeElement.dataset.property;
  const index = Number(keyframeElement.dataset.index);
  const keyframes = props.properties?.[property]?.keyframes ?? [];
  const keyframe = keyframes[index];
  const followingKeyframe = keyframes[index + 1];
  const startDelay = Math.max(0, parseFloat(keyframe?.delay) || 0);
  const startFollowingDelay = followingKeyframe
    ? Math.max(0, parseFloat(followingKeyframe.delay) || 0)
    : undefined;
  const startDuration = parseFloat(keyframe?.duration) || 1000;
  const timelineDuration = resolveTimelineDuration(props);

  if (!(trackWidth > 0) || !(timelineDuration > 0)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  keyframeElement.setPointerCapture?.(event.pointerId);
  store.startKeyframeMove({
    pointerId: event.pointerId,
    property,
    index,
    startX: event.clientX,
    startDelay,
    startFollowingDelay,
    duration: startDuration,
    propertyDuration: getKeyframesDuration(keyframes),
    timelineDuration,
    trackWidth,
  });
  dispatchKeyframeSelectEvent({
    dispatchEvent,
    property,
    index,
    side: props.side,
  });
  render();
};

export const handleKeyframeMove = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const keyframeMove = store.selectKeyframeMove();
  if (!keyframeMove || keyframeMove.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const deltaX = event.clientX - keyframeMove.startX;
  if (Math.abs(deltaX) >= 4) {
    store.markKeyframeMoveDragged({});
  }
  const deltaDelay =
    (deltaX / keyframeMove.trackWidth) *
    (keyframeMove.startTimelineDuration ?? keyframeMove.timelineDuration);
  const snappedDelay =
    Math.round(
      (keyframeMove.startDelay + deltaDelay) / DURATION_RESIZE_SNAP_MS,
    ) * DURATION_RESIZE_SNAP_MS;
  const maxDelay =
    keyframeMove.startFollowingDelay === undefined
      ? Number.POSITIVE_INFINITY
      : keyframeMove.startDelay + keyframeMove.startFollowingDelay;
  const delay = clamp(snappedDelay, 0, maxDelay);
  const followingDelay =
    keyframeMove.startFollowingDelay === undefined
      ? undefined
      : keyframeMove.startFollowingDelay - (delay - keyframeMove.startDelay);
  const timing = {
    delay,
    followingDelay,
  };
  if (keyframeMove.startFollowingDelay === undefined) {
    const movedPropertyDuration =
      keyframeMove.propertyDuration + delay - keyframeMove.startDelay;
    if (movedPropertyDuration >= keyframeMove.timelineDuration) {
      timing.timelineDuration =
        (Math.floor(movedPropertyDuration / TIMELINE_EXTENSION_STEP_MS) + 1) *
        TIMELINE_EXTENSION_STEP_MS;
      dispatchTimelineDurationExtendEvent({
        dispatchEvent,
        duration: timing.timelineDuration,
      });
    }
  }
  store.setKeyframeMoveTiming(timing);
  dispatchTimelineUsedDurationPreviewEvent({
    active: true,
    dispatchEvent,
    duration: store.selectPreviewUsedDuration(),
    side: props.side,
  });
  render();
};

export const handleKeyframeMoveEnd = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const keyframeMove = store.selectKeyframeMove();
  if (!keyframeMove || keyframeMove.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  store.clearKeyframeMove({
    suppressClick:
      keyframeMove.dragged || keyframeMove.delay !== keyframeMove.startDelay,
  });
  if (keyframeMove.delay !== keyframeMove.startDelay) {
    dispatchKeyframeDurationChangeEvent({
      dispatchEvent,
      delay: keyframeMove.delay,
      duration: keyframeMove.duration,
      followingDelay: keyframeMove.followingDelay,
      property: keyframeMove.property,
      side: props.side,
      index: keyframeMove.index,
    });
  }
  dispatchTimelineUsedDurationPreviewEvent({
    active: false,
    dispatchEvent,
    duration: undefined,
    side: props.side,
  });
  render();
};

export const handleKeyframeMoveCancel = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const keyframeMove = store.selectKeyframeMove();
  if (!keyframeMove || keyframeMove.pointerId !== event.pointerId) {
    return;
  }

  event.stopPropagation();
  store.clearKeyframeMove({});
  dispatchTimelineUsedDurationPreviewEvent({
    active: false,
    dispatchEvent,
    duration: undefined,
    side: props.side,
  });
  render();
};

export const handleDurationResizeStart = (deps, payload) => {
  const { props, render, store } = deps;
  const event = payload._event;
  if (!props.editable || event.button !== 0) {
    return;
  }

  const handleElement = event.currentTarget;
  const trackElement = handleElement.closest?.("[data-keyframe-track='true']");
  const trackWidth = trackElement?.getBoundingClientRect?.().width;
  const property = handleElement.dataset.property;
  const index = Number(handleElement.dataset.index);
  const edge = handleElement.dataset.resizeEdge ?? "right";
  const startDelay = Math.max(
    0,
    parseFloat(props.properties?.[property]?.keyframes?.[index]?.delay) || 0,
  );
  const startDuration =
    parseFloat(props.properties?.[property]?.keyframes?.[index]?.duration) ||
    1000;
  const timelineDuration = resolveTimelineDuration(props);

  if (!(trackWidth > 0) || !(timelineDuration > 0)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  handleElement.setPointerCapture?.(event.pointerId);
  store.startDurationResize({
    pointerId: event.pointerId,
    property,
    index,
    edge,
    startX: event.clientX,
    startDelay,
    startDuration,
    timelineDuration,
    trackWidth,
  });
  render();
};

export const handleDurationResizeMove = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const durationResize = store.selectDurationResize();
  if (!durationResize || durationResize.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const deltaX = event.clientX - durationResize.startX;
  const deltaDuration =
    (deltaX / durationResize.trackWidth) *
    (durationResize.startTimelineDuration ?? durationResize.timelineDuration);
  let delay = durationResize.startDelay;
  let duration;

  if (durationResize.edge === "left") {
    const totalDuration =
      durationResize.startDelay + durationResize.startDuration;
    const maxDelay = Math.max(0, totalDuration - DURATION_RESIZE_SNAP_MS);
    delay = clamp(
      Math.round(
        (durationResize.startDelay + deltaDuration) / DURATION_RESIZE_SNAP_MS,
      ) * DURATION_RESIZE_SNAP_MS,
      0,
      maxDelay,
    );
    duration = totalDuration - delay;
  } else {
    duration = Math.max(
      DURATION_RESIZE_SNAP_MS,
      Math.round(
        (durationResize.startDuration + deltaDuration) /
          DURATION_RESIZE_SNAP_MS,
      ) * DURATION_RESIZE_SNAP_MS,
    );
  }

  store.setDurationResizeTiming({ delay, duration });
  const usedDuration = store.selectPreviewUsedDuration();
  if (usedDuration > durationResize.timelineDuration) {
    const timelineDuration =
      (Math.floor(usedDuration / TIMELINE_EXTENSION_STEP_MS) + 1) *
      TIMELINE_EXTENSION_STEP_MS;
    store.setDurationResizeTiming({ delay, duration, timelineDuration });
    dispatchTimelineDurationExtendEvent({
      dispatchEvent,
      duration: timelineDuration,
    });
  }
  dispatchTimelineUsedDurationPreviewEvent({
    active: true,
    dispatchEvent,
    duration: usedDuration,
    side: props.side,
  });
  render();
};

export const handleDurationResizeEnd = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const durationResize = store.selectDurationResize();
  if (!durationResize || durationResize.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  store.clearDurationResize({});
  dispatchKeyframeDurationChangeEvent({
    dispatchEvent,
    delay: durationResize.delay,
    duration: durationResize.duration,
    property: durationResize.property,
    side: props.side,
    index: durationResize.index,
  });
  dispatchTimelineUsedDurationPreviewEvent({
    active: false,
    dispatchEvent,
    duration: undefined,
    side: props.side,
  });
  render();
};

export const handleDurationResizeCancel = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  const event = payload._event;
  const durationResize = store.selectDurationResize();
  if (!durationResize || durationResize.pointerId !== event.pointerId) {
    return;
  }

  event.stopPropagation();
  store.clearDurationResize({});
  dispatchTimelineUsedDurationPreviewEvent({
    active: false,
    dispatchEvent,
    duration: undefined,
    side: props.side,
  });
  render();
};

export const handleDurationHandleClick = (_deps, payload) => {
  payload._event.preventDefault();
  payload._event.stopPropagation();
};

const dispatchPropertyNameClickEvent = (deps, event, { x, y } = {}) => {
  const { dispatchEvent, props } = deps;
  event.stopPropagation();

  dispatchEvent(
    new CustomEvent("property-name-click", {
      detail: {
        property: event.currentTarget.dataset.property,
        side: props.side,
        x,
        y,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePropertyNameClick = (deps, payload) => {
  if (!deps.props.editable) {
    return;
  }

  const event = payload._event;
  dispatchPropertyNameClickEvent(deps, event, {
    x: event.clientX,
    y: event.clientY,
  });
};

export const handlePropertyNameKeyDown = (deps, payload) => {
  if (!deps.props.editable) {
    return;
  }

  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  dispatchPropertyNameClickEvent(deps, event, {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });
};
