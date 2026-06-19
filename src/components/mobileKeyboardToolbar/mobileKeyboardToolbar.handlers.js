const KEYBOARD_VISIBLE_INSET_PX = 100;
const ARROW_REPEAT_DELAY_MS = 280;
const ARROW_REPEAT_INTERVAL_MS = 70;
const ARROW_REPEAT_SUPPRESSION_ATTRIBUTE =
  "data-rvn-mobile-keyboard-arrow-repeat";
const ARROW_REPEAT_SUPPRESSION_STYLE_ID =
  "rvn-mobile-keyboard-arrow-repeat-style";

const getDeepActiveElement = () => {
  let activeElement = document.activeElement;

  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement;
  }

  return activeElement;
};

const isEditableElement = (element) => {
  const tagName = element?.tagName?.toLowerCase?.() ?? "";
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element?.isContentEditable === true
  );
};

const hasEditableFocus = () => {
  if (typeof document === "undefined") {
    return false;
  }

  return isEditableElement(getDeepActiveElement());
};

const getSelectionForElement = (element) => {
  const root = element?.getRootNode?.();

  if (root instanceof ShadowRoot && typeof root.getSelection === "function") {
    return root.getSelection();
  }

  return window.getSelection?.();
};

const ARROW_KEY_BY_DIRECTION = {
  left: "ArrowLeft",
  up: "ArrowUp",
  down: "ArrowDown",
  right: "ArrowRight",
};

const DIRECTION_BY_ACTION_ID = {
  "arrow-left": "left",
  "arrow-up": "up",
  "arrow-down": "down",
  "arrow-right": "right",
};

const moveSelection = (element, direction) => {
  const selection = getSelectionForElement(element);
  if (typeof selection?.modify !== "function") {
    return;
  }

  const moveDirection =
    direction === "left" || direction === "up" ? "backward" : "forward";
  const granularity =
    direction === "up" || direction === "down" ? "line" : "character";

  selection.modify("move", moveDirection, granularity);
};

const getEditableOwner = (element) => {
  const root = element?.getRootNode?.();
  return typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot
    ? root.host
    : undefined;
};

const revealEditableSelection = (direction) => {
  const owner = getEditableOwner(getDeepActiveElement());
  owner?.revealCurrentSelection?.({ behavior: "auto", direction });
};

const scheduleRevealEditableSelection = (direction) => {
  if (typeof requestAnimationFrame !== "function") {
    revealEditableSelection(direction);
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      revealEditableSelection(direction);
    });
  });
};

const dispatchArrowKey = (direction) => {
  const activeElement = getDeepActiveElement();
  if (!isEditableElement(activeElement)) {
    return;
  }

  const key = ARROW_KEY_BY_DIRECTION[direction];
  if (!key) {
    return;
  }

  const event = new KeyboardEvent("keydown", {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  activeElement.dispatchEvent(event);
  if (!event.defaultPrevented) {
    moveSelection(activeElement, direction);
  }
  scheduleRevealEditableSelection(direction);
};

const blurActiveEditableElement = () => {
  const activeElement = getDeepActiveElement();
  if (!isEditableElement(activeElement)) {
    return;
  }

  activeElement.blur?.();
};

const getVirtualKeyboard = () => {
  return navigator.virtualKeyboard;
};

const enableVirtualKeyboardOverlay = () => {
  const virtualKeyboard = getVirtualKeyboard();
  if (!virtualKeyboard || !("overlaysContent" in virtualKeyboard)) {
    return undefined;
  }

  const previousOverlaysContent = virtualKeyboard.overlaysContent;
  virtualKeyboard.overlaysContent = true;

  return () => {
    virtualKeyboard.overlaysContent = previousOverlaysContent;
  };
};

const getVirtualKeyboardRect = () => {
  const rect = getVirtualKeyboard()?.boundingRect;
  if (!rect) {
    return undefined;
  }

  const height = Number(rect.height) || 0;
  if (height <= 0) {
    return undefined;
  }

  const top = Number(rect.y ?? rect.top);
  if (!Number.isFinite(top)) {
    return undefined;
  }

  return {
    height,
    top: Math.max(0, Math.round(top)),
  };
};

const getViewportMetrics = (largestViewportHeight) => {
  const viewport = window.visualViewport;
  const layoutHeight =
    window.innerHeight || document.documentElement?.clientHeight || 0;
  const virtualKeyboardRect = getVirtualKeyboardRect();

  if (virtualKeyboardRect) {
    const keyboardInset = Math.min(virtualKeyboardRect.height, layoutHeight);
    const visualHeight = Math.max(0, layoutHeight - keyboardInset);

    return {
      keyboardInset,
      visualOffsetTop: 0,
      pageTop: 0,
      bottom: keyboardInset,
      visualHeight,
      layoutHeight,
    };
  }

  const visualHeight = viewport?.height ?? layoutHeight;
  const visualOffsetTop = viewport?.offsetTop ?? 0;
  const overlayKeyboardInset = Math.max(
    0,
    layoutHeight - visualHeight - visualOffsetTop,
  );
  const resizedViewportInset = Math.max(
    0,
    largestViewportHeight - visualHeight,
  );
  const keyboardInset = Math.max(overlayKeyboardInset, resizedViewportInset);

  return {
    keyboardInset,
    visualOffsetTop,
    pageTop: 0,
    bottom: overlayKeyboardInset > 0 ? overlayKeyboardInset : 0,
    visualHeight,
    layoutHeight,
  };
};

const dispatchKeyboardStateChange = (dispatchEvent, keyboardState) => {
  if (typeof dispatchEvent !== "function") {
    return;
  }

  dispatchEvent(
    new CustomEvent("keyboard-state-change", {
      detail: keyboardState,
      bubbles: true,
    }),
  );
};

const ensureArrowRepeatSuppressionStyle = () => {
  if (document.getElementById(ARROW_REPEAT_SUPPRESSION_STYLE_ID)) {
    return;
  }

  const styleElement = document.createElement("style");
  styleElement.id = ARROW_REPEAT_SUPPRESSION_STYLE_ID;
  styleElement.textContent = `
html[${ARROW_REPEAT_SUPPRESSION_ATTRIBUTE}="true"],
html[${ARROW_REPEAT_SUPPRESSION_ATTRIBUTE}="true"] * {
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  user-select: none !important;
}
`;
  document.head.append(styleElement);
};

const enableArrowRepeatNativeCalloutSuppression = () => {
  document.documentElement?.setAttribute(
    ARROW_REPEAT_SUPPRESSION_ATTRIBUTE,
    "true",
  );
};

const disableArrowRepeatNativeCalloutSuppression = () => {
  document.documentElement?.removeAttribute(ARROW_REPEAT_SUPPRESSION_ATTRIBUTE);
};

const isArrowRepeatNativeCalloutSuppressed = () => {
  return (
    document.documentElement?.getAttribute(
      ARROW_REPEAT_SUPPRESSION_ATTRIBUTE,
    ) === "true"
  );
};

const stopArrowRepeat = (store) => {
  const repeatState = store.selectArrowRepeatState?.();
  if (!repeatState) {
    disableArrowRepeatNativeCalloutSuppression();
    return;
  }

  clearTimeout(repeatState.delayTimerId);
  clearInterval(repeatState.intervalTimerId);
  store.clearArrowRepeatState?.();
  disableArrowRepeatNativeCalloutSuppression();
};

const startArrowRepeat = (store, direction, pointerId) => {
  stopArrowRepeat(store);
  enableArrowRepeatNativeCalloutSuppression();
  dispatchArrowKey(direction);

  const delayTimerId = setTimeout(() => {
    const repeatState = store.selectArrowRepeatState?.();
    if (
      repeatState?.direction !== direction ||
      repeatState?.pointerId !== pointerId
    ) {
      return;
    }

    dispatchArrowKey(direction);
    const intervalTimerId = setInterval(() => {
      dispatchArrowKey(direction);
    }, ARROW_REPEAT_INTERVAL_MS);
    store.setArrowRepeatIntervalId?.({ intervalTimerId });
  }, ARROW_REPEAT_DELAY_MS);

  store.setArrowRepeatState?.({
    direction,
    pointerId,
    delayTimerId,
  });
};

export const handleBeforeMount = (deps) => {
  const { store, render, dispatchEvent } = deps;

  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  ensureArrowRepeatSuppressionStyle();
  const cleanupVirtualKeyboardOverlay = enableVirtualKeyboardOverlay();
  let largestViewportHeight =
    window.visualViewport?.height ??
    window.innerHeight ??
    document.documentElement?.clientHeight ??
    0;
  let animationFrameId;
  let focusTimerId;

  const syncKeyboardState = () => {
    animationFrameId = undefined;
    const metrics = getViewportMetrics(largestViewportHeight);
    largestViewportHeight = Math.max(
      largestViewportHeight,
      metrics.visualHeight,
      metrics.layoutHeight,
    );

    const nextState = {
      isVisible:
        hasEditableFocus() &&
        metrics.keyboardInset >= KEYBOARD_VISIBLE_INSET_PX,
      bottom: metrics.bottom,
      keyboardInset: metrics.keyboardInset,
      visualOffsetTop: metrics.visualOffsetTop,
      pageTop: metrics.pageTop,
      visualHeight: metrics.visualHeight,
      layoutHeight: metrics.layoutHeight,
    };
    const currentState = store.selectKeyboardState();
    if (
      currentState.isVisible === nextState.isVisible &&
      currentState.bottom === Math.round(nextState.bottom) &&
      currentState.keyboardInset === Math.round(nextState.keyboardInset) &&
      currentState.visualOffsetTop === Math.round(nextState.visualOffsetTop) &&
      currentState.pageTop === Math.round(nextState.pageTop) &&
      currentState.visualHeight === Math.round(nextState.visualHeight) &&
      currentState.layoutHeight === Math.round(nextState.layoutHeight)
    ) {
      return;
    }

    store.setKeyboardState(nextState);
    dispatchKeyboardStateChange(dispatchEvent, store.selectKeyboardState());
    render();
  };

  const scheduleSync = () => {
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(syncKeyboardState);
  };

  const scheduleFocusSync = () => {
    clearTimeout(focusTimerId);
    focusTimerId = setTimeout(scheduleSync, 60);
  };
  const stopArrowRepeatOnPointerEnd = () => {
    stopArrowRepeat(store);
  };
  const suppressNativeCalloutEvent = (event) => {
    if (!isArrowRepeatNativeCalloutSuppressed()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const viewport = window.visualViewport;
  const virtualKeyboard = getVirtualKeyboard();
  viewport?.addEventListener("resize", scheduleSync);
  viewport?.addEventListener("scroll", scheduleSync);
  virtualKeyboard?.addEventListener?.("geometrychange", scheduleSync);
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("scroll", scheduleSync, true);
  window.addEventListener("orientationchange", scheduleSync);
  window.addEventListener("focusin", scheduleFocusSync);
  window.addEventListener("focusout", scheduleFocusSync);
  window.addEventListener("pointerup", stopArrowRepeatOnPointerEnd, true);
  window.addEventListener("pointercancel", stopArrowRepeatOnPointerEnd, true);
  window.addEventListener("blur", stopArrowRepeatOnPointerEnd);
  document.addEventListener("contextmenu", suppressNativeCalloutEvent, true);
  document.addEventListener("selectstart", suppressNativeCalloutEvent, true);
  scheduleSync();

  return () => {
    viewport?.removeEventListener("resize", scheduleSync);
    viewport?.removeEventListener("scroll", scheduleSync);
    virtualKeyboard?.removeEventListener?.("geometrychange", scheduleSync);
    window.removeEventListener("resize", scheduleSync);
    window.removeEventListener("scroll", scheduleSync, true);
    window.removeEventListener("orientationchange", scheduleSync);
    window.removeEventListener("focusin", scheduleFocusSync);
    window.removeEventListener("focusout", scheduleFocusSync);
    window.removeEventListener("pointerup", stopArrowRepeatOnPointerEnd, true);
    window.removeEventListener(
      "pointercancel",
      stopArrowRepeatOnPointerEnd,
      true,
    );
    window.removeEventListener("blur", stopArrowRepeatOnPointerEnd);
    document.removeEventListener(
      "contextmenu",
      suppressNativeCalloutEvent,
      true,
    );
    document.removeEventListener(
      "selectstart",
      suppressNativeCalloutEvent,
      true,
    );
    clearTimeout(focusTimerId);
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
    stopArrowRepeat(store);
    document.getElementById(ARROW_REPEAT_SUPPRESSION_STYLE_ID)?.remove();
    cleanupVirtualKeyboardOverlay?.();
  };
};

export const handleToolbarItemPointerDown = ({ store }, payload) => {
  const event = payload._event;
  const actionId = event.currentTarget.dataset.actionId;
  const direction = DIRECTION_BY_ACTION_ID[actionId];

  event.preventDefault();
  event.stopPropagation();

  if (!direction) {
    stopArrowRepeat(store);
    return;
  }

  event.currentTarget.setPointerCapture?.(event.pointerId);
  startArrowRepeat(store, direction, event.pointerId);
};

const stopToolbarPointerAction = ({ store }, payload) => {
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  stopArrowRepeat(store);
};

export const handleToolbarItemPointerUp = stopToolbarPointerAction;

export const handleToolbarItemPointerCancel = stopToolbarPointerAction;

export const handleToolbarItemLostPointerCapture = ({ store }) => {
  stopArrowRepeat(store);
};

const suppressArrowTouchDefault = (payload) => {
  const event = payload._event;
  const actionId = event.currentTarget.dataset.actionId;
  const direction = DIRECTION_BY_ACTION_ID[actionId];
  if (!direction) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
};

export const handleToolbarItemTouchStart = (_deps, payload) => {
  suppressArrowTouchDefault(payload);
};

export const handleToolbarItemTouchEnd = (_deps, payload) => {
  suppressArrowTouchDefault(payload);
};

export const handleToolbarItemTouchCancel = (_deps, payload) => {
  suppressArrowTouchDefault(payload);
};

export const handleToolbarItemContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  payload._event.stopPropagation();
  stopArrowRepeat(deps.store);
};

export const handleToolbarItemClick = ({ dispatchEvent }, payload) => {
  const actionId = payload._event.currentTarget.dataset.actionId;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const direction = DIRECTION_BY_ACTION_ID[actionId];
  if (direction) {
    return;
  }

  blurActiveEditableElement();
  dispatchEvent(
    new CustomEvent("action-click", {
      detail: {
        actionId,
      },
      bubbles: true,
    }),
  );
};
