const EDGE_INSERT_ZONE_PX = 18;
const BETWEEN_INSERT_ZONE_PADDING_PX = 12;
const INSERT_CHIP_OFFSET_PX = 10;
const EDGE_INSERT_ZONE_WIDTH_PX = EDGE_INSERT_ZONE_PX * 2;

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
          (sum, keyframe) => sum + (parseFloat(keyframe.duration) || 1000),
          0,
        );
    maxDuration = Math.max(maxDuration, propertyDuration);
  }

  return maxDuration;
};

const dispatchRulerHoverEvent = ({
  dispatchEvent,
  side,
  timeMs,
  leftPercent,
} = {}) => {
  dispatchEvent(
    new CustomEvent("ruler-time-hover", {
      detail: {
        side,
        timeMs,
        leftPercent,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const dispatchAddKeyframeEvent = ({
  dispatchEvent,
  property,
  side,
  index,
  x,
  y,
} = {}) => {
  dispatchEvent(
    new CustomEvent("add-keyframe", {
      detail: {
        property,
        side,
        index,
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

const createHoverTarget = ({
  property,
  mode,
  index,
  indicatorLeft,
  zoneLeft,
  zoneRight,
  trackWidth,
} = {}) => {
  const safeZoneLeft = Math.max(0, zoneLeft ?? 0);
  const safeZoneRight = Math.max(safeZoneLeft, zoneRight ?? safeZoneLeft);

  return {
    property,
    mode,
    index,
    indicatorLeft,
    chipLeft: clamp(
      indicatorLeft,
      INSERT_CHIP_OFFSET_PX,
      Math.max(INSERT_CHIP_OFFSET_PX, trackWidth - INSERT_CHIP_OFFSET_PX),
    ),
    zoneLeft: safeZoneLeft,
    zoneWidth: safeZoneRight - safeZoneLeft,
  };
};

const resolveTrackHoverTarget = ({ trackElement, clientX } = {}) => {
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
  const relativeX = clamp(clientX - trackRect.left, 0, trackWidth);
  if (keyframeElements.length === 0) {
    return createHoverTarget({
      property,
      mode: "empty",
      index: 0,
      indicatorLeft: relativeX,
      zoneLeft: 0,
      zoneRight: trackWidth,
      trackWidth,
    });
  }

  const keyframeRects = keyframeElements
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - trackRect.left,
        right: rect.right - trackRect.left,
      };
    })
    .sort((left, right) => left.left - right.left);

  if (relativeX <= EDGE_INSERT_ZONE_PX) {
    return createHoverTarget({
      property,
      mode: "left",
      index: 0,
      indicatorLeft: 0,
      zoneLeft: 0,
      zoneRight: Math.min(trackWidth, EDGE_INSERT_ZONE_WIDTH_PX),
      trackWidth,
    });
  }

  for (let index = 0; index < keyframeRects.length - 1; index += 1) {
    const current = keyframeRects[index];
    const next = keyframeRects[index + 1];
    const zoneLeft = Math.max(
      0,
      current.right - BETWEEN_INSERT_ZONE_PADDING_PX,
    );
    const zoneRight = Math.min(
      trackWidth,
      next.left + BETWEEN_INSERT_ZONE_PADDING_PX,
    );

    if (relativeX >= zoneLeft && relativeX <= zoneRight) {
      return createHoverTarget({
        property,
        mode: "between",
        index: index + 1,
        indicatorLeft: current.right,
        zoneLeft,
        zoneRight,
        trackWidth,
      });
    }
  }

  const lastKeyframe = keyframeRects[keyframeRects.length - 1];
  const rightZoneRight = Math.min(
    trackWidth,
    lastKeyframe.right + EDGE_INSERT_ZONE_WIDTH_PX,
  );
  const rightZoneLeft = Math.max(0, rightZoneRight - EDGE_INSERT_ZONE_WIDTH_PX);

  if (relativeX >= rightZoneLeft) {
    return createHoverTarget({
      property,
      mode: "right",
      index: keyframeRects.length,
      indicatorLeft: lastKeyframe.right,
      zoneLeft: rightZoneLeft,
      zoneRight: rightZoneRight,
      trackWidth,
    });
  }

  return undefined;
};

export const handleRulerMouseMove = (deps, payload) => {
  const { dispatchEvent, props, render, store } = deps;
  if (props.interactiveRuler !== true) {
    return;
  }

  const leftPercent = resolveHoverIndicatorPercent({
    element: payload._event.currentTarget,
    clientX: payload._event.clientX,
  });
  const timelineDuration = resolveTimelineDuration(props);
  const timeMs =
    leftPercent === undefined
      ? undefined
      : Math.round((leftPercent / 100) * timelineDuration);

  store.setHoverIndicator({
    leftPercent,
  });
  dispatchRulerHoverEvent({
    dispatchEvent,
    side: props?.side,
    timeMs,
    leftPercent,
  });
  render();
};

export const handleRulerMouseLeave = (deps, _payload) => {
  const { dispatchEvent, props, store, render } = deps;
  if (props.interactiveRuler !== true) {
    return;
  }

  store.clearHoverIndicator({});
  dispatchEvent(
    new CustomEvent("ruler-time-leave", {
      bubbles: true,
      composed: true,
    }),
  );
  render();
};

export const handleTrackMouseMove = (deps, payload) => {
  const { render, store, props } = deps;

  store.clearHoverIndicator({});

  if (props.editable) {
    store.setHoverTarget({
      hoverTarget: resolveTrackHoverTarget({
        trackElement: payload._event.currentTarget,
        clientX: payload._event.clientX,
      }),
    });
  }
  render();
};

export const handleTrackMouseLeave = (deps, _payload) => {
  const { store, render } = deps;
  store.clearHoverIndicator({});
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

  dispatchAddKeyframeEvent({
    dispatchEvent,
    property,
    side,
    index: hoverTarget.index,
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
  const property = payload._event.currentTarget.dataset.property;
  const index = payload._event.currentTarget.dataset.index;
  const side = props?.side;
  const hoverTarget = store.selectHoverTarget();
  const trackElement = payload._event.currentTarget.parentElement;
  const keyframeCount = trackElement?.querySelectorAll?.(
    "[data-keyframe='true']",
  )?.length;
  const keyframeIndex = Number(index);
  const lastKeyframeIndex =
    keyframeCount && keyframeCount > 0 ? keyframeCount - 1 : undefined;

  if (
    hoverTarget?.property === property &&
    ((hoverTarget.mode === "left" && keyframeIndex === 0) ||
      (hoverTarget.mode === "right" && keyframeIndex === lastKeyframeIndex))
  ) {
    dispatchAddKeyframeEvent({
      dispatchEvent,
      property,
      side,
      index: hoverTarget.index,
      x: payload._event.clientX,
      y: payload._event.clientY,
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("keyframe-click", {
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

export const handlePropertyNameClick = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  const target = payload._event.currentTarget;
  const property =
    target?.dataset?.property || target?.id?.replace("propertyName", "") || "";
  const side = props?.side;

  // Dispatch event to parent to handle property right-click
  dispatchEvent(
    new CustomEvent("property-name-click", {
      detail: {
        property,
        side,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleInitialValueClick = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  const target = payload._event.currentTarget;
  if (target?.dataset?.interactive !== "true") {
    return;
  }

  const property =
    target?.dataset?.property || target?.id?.replace("initialValue", "") || "";
  const side = props?.side;

  dispatchEvent(
    new CustomEvent("initial-value-click", {
      detail: {
        property,
        side,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};
