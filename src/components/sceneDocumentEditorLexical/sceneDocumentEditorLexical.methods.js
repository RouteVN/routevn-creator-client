const getEditor = (element) => {
  return element.shadowRoot?.querySelector("#editor");
};

const FOCUS_LINE_RETRY_FRAMES = 3;

const scheduleFrame = (callback) => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }

  queueMicrotask(callback);
};

const editorHasLine = (editor, lineId) => {
  if (!lineId) {
    return false;
  }

  if (typeof editor.hasLine === "function") {
    return editor.hasLine(lineId);
  }

  const lines = editor.getLinesSnapshot?.() ?? editor.lines ?? [];
  return lines.some((line) => line?.id === lineId);
};

const focusLineWhenReady = (element, payload, retriesRemaining) => {
  const editor = getEditor(element);
  const lineId = payload?.lineId;
  if (!editor?.focusLine || !lineId) {
    return false;
  }

  if (editorHasLine(editor, lineId)) {
    return editor.focusLine(payload);
  }

  if (retriesRemaining <= 0) {
    return false;
  }

  scheduleFrame(() => {
    if (!element.isConnected) {
      return;
    }

    focusLineWhenReady(element, payload, retriesRemaining - 1);
  });
  return false;
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
  return focusLineWhenReady(this, payload, FOCUS_LINE_RETRY_FRAMES);
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
