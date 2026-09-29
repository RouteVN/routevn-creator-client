const LONG_PRESS_DELAY_MS = 500;
// Matches UIKit's long-press drift allowance; iPad finger holds can pass 8px.
const MOVE_TOLERANCE_PX = 10;
const RELEASE_CLICK_WINDOW_MS = 1000;
const TARGET_SELECTOR = '[data-long-press="true"]';
// Editable surfaces keep native selection unless they opt in to menu holds.
const CONTROL_SELECTOR =
  'button, input, textarea, select, a, [contenteditable="true"]:not([data-long-press-menu="true"]), [data-long-press-ignore]';
const registrations = new WeakMap();

// iPadOS reports a desktop platform, so touch support identifies it.
const isAppleTouchDevice = ({ userAgent, platform, maxTouchPoints }) =>
  /iPad|iPhone|iPod/.test(userAgent) ||
  (platform === "MacIntel" && maxTouchPoints > 1);

// Delegation crosses component shadow roots and also covers cards rendered later.
// Opted-in surfaces receive `long-press`. On iOS, where WebKit never sends
// `contextmenu` for a touch hold, other holds emit the touch `contextmenu`
// Android sends natively. Normal taps and scrolling stay native.
export const installLongPress = (documentTarget = document) => {
  if (registrations.has(documentTarget))
    return registrations.get(documentTarget);

  const emulateContextMenu = isAppleTouchDevice(
    documentTarget.defaultView.navigator,
  );
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

  const findContextMenuTarget = (event) => {
    if (!emulateContextMenu) return;
    const path = event.composedPath();
    if (path.some((element) => element.matches?.(CONTROL_SELECTOR))) return;
    return path[0];
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

    cancelPress();
    const longPressTarget = findTarget(event);
    lastTouch = {
      target: longPressTarget,
      until: Date.now() + RELEASE_CLICK_WINDOW_MS,
    };
    const contextMenu = !longPressTarget;
    const target = longPressTarget ?? findContextMenuTarget(event);
    // WebKit may deliver a touch's pointerup only to its removed target, so
    // tracking active pointers can leak; a second finger is never primary.
    if (!event.isPrimary || event.button !== 0 || !target) return;

    const rect = target.getBoundingClientRect();
    const current = {
      target,
      contextMenu,
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
        (!contextMenu && !target.matches(TARGET_SELECTOR)) ||
        Math.hypot(nextRect.top - current.top, nextRect.left - current.left) >
          MOVE_TOLERANCE_PX
      ) {
        cancelPress();
        return;
      }

      if (contextMenu) {
        const menuEvent = new documentTarget.defaultView.PointerEvent(
          "contextmenu",
          {
            clientX: current.x,
            clientY: current.y,
            pointerId: current.pointerId,
            pointerType: current.pointerType,
            isPrimary: true,
            button: 2,
            bubbles: true,
            cancelable: true,
            composed: true,
          },
        );
        target.dispatchEvent(menuEvent);
        // Only a handled menu consumes the release click.
        if (!menuEvent.defaultPrevented) return;
        current.fired = true;
        consumedPress = current;
        consumedPress.until = Infinity;
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
