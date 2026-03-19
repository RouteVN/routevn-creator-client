const getLineElement = (element, lineId) => {
  if (!lineId) {
    return;
  }

  return (
    element.shadowRoot?.querySelector(`[data-line-id="${lineId}"]`) ||
    element.querySelector(`[data-line-id="${lineId}"]`)
  );
};

const focusLineInternally = (element, payload = {}) => {
  const {
    lineId,
    cursorPosition,
    goalColumn,
    direction = null,
    syncLineId,
    scrollIntoView = true,
  } = payload;

  if (!lineId) {
    return false;
  }

  if (!getLineElement(element, lineId)) {
    return false;
  }

  element.store.setIsNavigating({ isNavigating: true });

  if (cursorPosition !== undefined) {
    element.store.setCursorPosition({ position: cursorPosition });
    element.store.setGoalColumn({
      goalColumn: goalColumn ?? cursorPosition,
    });
  } else if (goalColumn !== undefined) {
    element.store.setGoalColumn({ goalColumn });
  }

  element.store.setNavigationDirection({ direction });
  element.transformedHandlers.updateSelectedLine({ currentLineId: lineId });

  if (syncLineId) {
    element.transformedHandlers.forceSyncContentLine({ lineId: syncLineId });
  }

  element.render();

  if (scrollIntoView) {
    requestAnimationFrame(() => {
      element.scrollLineIntoView({ lineId });
    });
  }

  return true;
};

export function syncContentLine(payload = {}) {
  this.transformedHandlers.forceSyncContentLine(payload);
}

export function syncAllContentLines() {
  this.transformedHandlers.forceSyncAllContentLines({});
}

export function focusLine(payload = {}) {
  return focusLineInternally(this, payload);
}

export function focusContainer() {
  const container = this.shadowRoot?.querySelector("#container");
  container?.focus();
}

export function scrollLineIntoView(payload = {}) {
  const {
    lineId,
    behavior = "auto",
    block = "nearest",
    inline = "nearest",
  } = payload;
  const lineElement = getLineElement(this, lineId);
  lineElement?.scrollIntoView({
    behavior,
    block,
    inline,
  });
}
