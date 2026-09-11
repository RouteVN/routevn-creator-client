const LONG_PRESS_DELAY_MS = 500;
const MOVE_TOLERANCE_PX = 8;
const RELEASE_CLICK_WINDOW_MS = 1000;
const TARGET_SELECTOR = '[data-long-press="true"]';
const CONTROL_SELECTOR =
  'button, input, textarea, select, a, [contenteditable="true"], [data-long-press-ignore]';
const registrations = new WeakMap();

// Delegation crosses component shadow roots and also covers cards rendered later.
// Only explicitly opted-in surfaces participate; normal taps and scrolling stay native.
export const installLongPress = (documentTarget = document) => {
  if (registrations.has(documentTarget))
    return registrations.get(documentTarget);

  const pointers = new Set();
  let press;
  let consumedPress;
  let lastTouch;

  const cancelPress = () => {
    clearTimeout(press?.timer);
    press = undefined;
  };

  const findTarget = (event) => {
    for (const element of event.composedPath()) {
      if (element.matches?.(TARGET_SELECTOR)) return element;
      if (element.matches?.(CONTROL_SELECTOR)) return;
    }
  };

  const suppress = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handlePointerDown = (event) => {
    consumedPress = undefined;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      lastTouch = undefined;
      cancelPress();
      return;
    }

    pointers.add(event.pointerId);
    cancelPress();
    const target = findTarget(event);
    lastTouch = { target, until: Date.now() + RELEASE_CLICK_WINDOW_MS };
    if (pointers.size !== 1 || event.button !== 0 || !target) return;

    const rect = target.getBoundingClientRect();
    const current = {
      target,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      top: rect.top,
      left: rect.left,
      fired: false,
    };
    press = current;
    current.timer = setTimeout(() => {
      const nextRect = target.getBoundingClientRect();
      if (
        !target.isConnected ||
        !target.matches(TARGET_SELECTOR) ||
        Math.hypot(nextRect.top - current.top, nextRect.left - current.left) >
          MOVE_TOLERANCE_PX
      ) {
        cancelPress();
        return;
      }

      current.fired = true;
      consumedPress = current;
      consumedPress.until = Infinity;
      target.dispatchEvent(
        new documentTarget.defaultView.CustomEvent("long-press", {
          detail: {
            clientX: current.x,
            clientY: current.y,
            pointerType: current.pointerType,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }, LONG_PRESS_DELAY_MS);
  };

  const handlePointerMove = (event) => {
    if (
      press?.pointerId === event.pointerId &&
      !press.fired &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >
        MOVE_TOLERANCE_PX
    ) {
      cancelPress();
    }
  };

  const handlePointerEnd = (event) => {
    pointers.delete(event.pointerId);
    if (consumedPress?.pointerId === event.pointerId) {
      consumedPress.until = Date.now() + RELEASE_CLICK_WINDOW_MS;
    }
    if (press?.pointerId === event.pointerId) {
      lastTouch = {
        target: press.target,
        until: Date.now() + RELEASE_CLICK_WINDOW_MS,
      };
      cancelPress();
    }
  };

  const handleClick = (event) => {
    if (!consumedPress || event.detail === 0) return;
    if (Date.now() > consumedPress.until) {
      consumedPress = undefined;
      return;
    }
    // The hold may have opened an overlay or removed its card before release.
    if (
      event.composedPath().includes(consumedPress.target) ||
      Math.hypot(
        event.clientX - consumedPress.x,
        event.clientY - consumedPress.y,
      ) <= MOVE_TOLERANCE_PX
    ) {
      suppress(event);
      consumedPress = undefined;
    }
  };

  const handleContextMenu = (event) => {
    const target = findTarget(event);
    if (
      target &&
      (event.pointerType === "touch" ||
        event.pointerType === "pen" ||
        press?.target === target ||
        (lastTouch?.target === target && Date.now() <= lastTouch.until))
    ) {
      suppress(event);
    }
  };

  const reset = () => {
    cancelPress();
    pointers.clear();
    consumedPress = undefined;
    lastTouch = undefined;
  };
  const listeners = {
    pointerdown: handlePointerDown,
    pointermove: handlePointerMove,
    pointerup: handlePointerEnd,
    pointercancel: handlePointerEnd,
    click: handleClick,
    contextmenu: handleContextMenu,
    keydown: reset,
    visibilitychange: reset,
    scroll: cancelPress,
  };
  for (const [type, listener] of Object.entries(listeners)) {
    documentTarget.addEventListener(type, listener, true);
  }
  documentTarget.defaultView.addEventListener("blur", reset);

  const cleanup = () => {
    reset();
    for (const [type, listener] of Object.entries(listeners)) {
      documentTarget.removeEventListener(type, listener, true);
    }
    documentTarget.defaultView.removeEventListener("blur", reset);
    registrations.delete(documentTarget);
  };
  registrations.set(documentTarget, cleanup);
  return cleanup;
};
