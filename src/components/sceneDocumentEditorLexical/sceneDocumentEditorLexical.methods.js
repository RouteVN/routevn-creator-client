const getEditor = (element) => {
  return element.shadowRoot?.querySelector("#editor");
};

const dispatchSceneLinesSnapshot = (element) => {
  const editor = getEditor(element);
  if (!editor) {
    return;
  }

  const lines = editor.getLinesSnapshot?.() ?? editor.lines;
  const selectedLineId =
    editor.getSelectedLineIdSnapshot?.() ?? editor.selectedLineId;

  element.dispatchEvent(
    new CustomEvent("scene-lines-changed", {
      detail: {
        lines,
        selectedLineId,
        reason: "text",
      },
      bubbles: true,
    }),
  );
};

export function hardRefresh() {
  getEditor(this)?.hardRefresh?.();
}

export function focusLine(payload = {}) {
  return getEditor(this)?.focusLine?.(payload) ?? false;
}

export function focusContainer() {
  getEditor(this)?.focusContainer?.();
}

export function scrollLineIntoView(payload = {}) {
  getEditor(this)?.scrollLineIntoView?.(payload);
}

export function applyTextFormat(payload = {}) {
  const editor = getEditor(this);
  editor?.applyTextFormat?.(payload?.format);

  queueMicrotask(() => {
    if (!this.isConnected) {
      return;
    }

    dispatchSceneLinesSnapshot(this);
  });

  requestAnimationFrame(() => {
    if (!this.isConnected) {
      return;
    }

    dispatchSceneLinesSnapshot(this);
  });
}

export function getLines() {
  const editor = getEditor(this);
  return editor?.getLinesSnapshot?.() ?? editor?.lines ?? [];
}

export function getSelectedLineId() {
  const editor = getEditor(this);
  return editor?.getSelectedLineIdSnapshot?.() ?? editor?.selectedLineId;
}
