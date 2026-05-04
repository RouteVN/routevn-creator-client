const KEYBOARD_VISIBLE_INSET_PX = 100;

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

const moveSelectionByLine = (element, direction) => {
  const selection = getSelectionForElement(element);
  if (typeof selection?.modify !== "function") {
    return;
  }

  selection.modify("move", direction === "up" ? "backward" : "forward", "line");
};

const dispatchArrowKey = (direction) => {
  const activeElement = getDeepActiveElement();
  if (!isEditableElement(activeElement)) {
    return;
  }

  const key = direction === "up" ? "ArrowUp" : "ArrowDown";
  const event = new KeyboardEvent("keydown", {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  activeElement.dispatchEvent(event);
  if (!event.defaultPrevented) {
    moveSelectionByLine(activeElement, direction);
  }
};

const getViewportMetrics = (largestViewportHeight) => {
  const viewport = window.visualViewport;
  const layoutHeight =
    window.innerHeight || document.documentElement?.clientHeight || 0;
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

export const handleBeforeMount = ({ store, render, dispatchEvent }) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

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
    };
    const currentState = store.selectKeyboardState();
    if (
      currentState.isVisible === nextState.isVisible &&
      currentState.bottom === Math.round(nextState.bottom)
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

  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", scheduleSync);
  viewport?.addEventListener("scroll", scheduleSync);
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("orientationchange", scheduleSync);
  window.addEventListener("focusin", scheduleFocusSync);
  window.addEventListener("focusout", scheduleFocusSync);
  scheduleSync();

  return () => {
    viewport?.removeEventListener("resize", scheduleSync);
    viewport?.removeEventListener("scroll", scheduleSync);
    window.removeEventListener("resize", scheduleSync);
    window.removeEventListener("orientationchange", scheduleSync);
    window.removeEventListener("focusin", scheduleFocusSync);
    window.removeEventListener("focusout", scheduleFocusSync);
    clearTimeout(focusTimerId);
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
  };
};

export const handleToolbarItemPointerDown = (_deps, payload) => {
  payload._event.preventDefault();
};

export const handleToolbarItemClick = ({ dispatchEvent }, payload) => {
  const actionId = payload._event.currentTarget.dataset.actionId;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  if (actionId === "arrow-up") {
    dispatchArrowKey("up");
    return;
  }

  if (actionId === "arrow-down") {
    dispatchArrowKey("down");
    return;
  }

  dispatchEvent(
    new CustomEvent("action-click", {
      detail: {
        actionId,
      },
      bubbles: true,
    }),
  );
};
