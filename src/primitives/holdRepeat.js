export const HOLD_REPEAT_DELAY_MS = 400;
export const HOLD_REPEAT_INTERVAL_MS = 80;
const TARGET_SELECTOR = '[data-hold-repeat="true"]';
const registrations = new WeakMap();

const findTarget = (event) =>
  event.composedPath().find((element) => element.matches?.(TARGET_SELECTOR));

const press = (target) => {
  target.dispatchEvent(new CustomEvent("hold-repeat"));
};

// Opted-in buttons get `hold-repeat` when pressed, and again every interval
// after a pause while held, until the press lifts, leaves the button, or is
// cancelled. Delegation crosses component shadow roots. A keyboard click
// presses once; holding the key repeats through the keyboard's own repeat.
export const installHoldRepeat = (documentTarget = document) => {
  if (registrations.has(documentTarget)) {
    return registrations.get(documentTarget);
  }

  let hold;

  const stop = () => {
    if (!hold) {
      return;
    }
    clearTimeout(hold.delayTimer);
    clearInterval(hold.repeatTimer);
    hold.target.removeEventListener("pointerleave", stop);
    hold = undefined;
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    const target = findTarget(event);
    if (!target || target.hasAttribute("disabled")) {
      return;
    }

    stop();
    const current = { target };
    hold = current;
    target.addEventListener("pointerleave", stop);
    press(target);
    current.delayTimer = setTimeout(() => {
      current.repeatTimer = setInterval(() => {
        // A re-render can replace the button while it is held.
        if (!target.isConnected) {
          stop();
          return;
        }
        press(target);
      }, HOLD_REPEAT_INTERVAL_MS);
    }, HOLD_REPEAT_DELAY_MS);
  };

  // A pointer press already pressed on pointerdown; a keyboard click has no
  // pointer, so its detail is 0.
  const handleClick = (event) => {
    if (event.detail !== 0) {
      return;
    }
    const target = findTarget(event);
    if (target && !target.hasAttribute("disabled")) {
      press(target);
    }
  };

  const view = documentTarget.defaultView;
  documentTarget.addEventListener("pointerdown", handlePointerDown, true);
  documentTarget.addEventListener("pointerup", stop, true);
  documentTarget.addEventListener("pointercancel", stop, true);
  documentTarget.addEventListener("click", handleClick, true);
  view?.addEventListener("blur", stop);

  const uninstall = () => {
    stop();
    documentTarget.removeEventListener("pointerdown", handlePointerDown, true);
    documentTarget.removeEventListener("pointerup", stop, true);
    documentTarget.removeEventListener("pointercancel", stop, true);
    documentTarget.removeEventListener("click", handleClick, true);
    view?.removeEventListener("blur", stop);
    registrations.delete(documentTarget);
  };
  registrations.set(documentTarget, uninstall);
  return uninstall;
};
