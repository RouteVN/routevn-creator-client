const getLineElement = (element, lineId) => {
  if (!lineId) {
    return undefined;
  }

  return (
    element.shadowRoot?.querySelector(`[data-line-id="${lineId}"]`) ||
    element.querySelector(`[data-line-id="${lineId}"]`)
  );
};

const getSelectedLineElement = (element) => {
  const selectedLineId =
    element.props?.selectedLineId ||
    element.store?.getState?.()?.activeLineId;
  return getLineElement(element, selectedLineId);
};

export function focusLine(payload = {}) {
  const { lineId, cursorPosition } = payload;
  const lineElement = getLineElement(this, lineId);
  if (!lineElement) {
    return false;
  }

  if (typeof cursorPosition === "number") {
    const targetPosition =
      cursorPosition < 0 ? lineElement.getPlainText().length : cursorPosition;
    lineElement.setCaretPosition(targetPosition, {
      preventScroll: true,
    });
  } else {
    lineElement.focus({ preventScroll: true });
  }

  return true;
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

export function hardRefresh() {
  const lineElement = getSelectedLineElement(this);
  lineElement?.updateContent?.(lineElement.getContent?.());
}

export function applyTextFormat(payload = {}) {
  const lineElement = getSelectedLineElement(this);
  lineElement?.applyTextFormat?.(payload?.format);
}
