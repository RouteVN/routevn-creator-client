import { generateId } from "../../internal/id.js";
import { cloneSceneEditorLines } from "../../internal/ui/sceneEditorLexical/draftSection.js";
import {
  appendContentArrays,
  getContentLength,
  getLineDialogueContent,
  setLineDialogueContent,
} from "../../internal/ui/sceneEditorLexical/contentModel.js";

const getLineIdFromElement = (element) => {
  return element?.dataset?.lineId || element?.id?.replace(/^line/, "") || "";
};

const getLinesSnapshot = (props) => {
  return cloneSceneEditorLines(props.lines);
};

const getLineElementById = (refs, lineId) => {
  return Object.values(refs || {}).find(
    (element) => getLineIdFromElement(element) === lineId,
  );
};

const setActiveLineIdIfUncontrolled = (store, props, lineId) => {
  if (!lineId || props?.selectedLineId) {
    return;
  }

  store.setActiveLineId({ lineId });
};

const dispatchSelectedLineChanged = (dispatchEvent, lineId) => {
  if (!lineId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("selected-line-changed", {
      detail: {
        lineId,
      },
    }),
  );
};

const dispatchSceneLinesChanged = (
  dispatchEvent,
  { lines, selectedLineId, focusTarget, reason = "text" } = {},
) => {
  dispatchEvent(
    new CustomEvent("scene-lines-changed", {
      detail: {
        lines,
        selectedLineId,
        focusTarget,
        reason,
      },
    }),
  );
};

const focusLineAfterRender = (refs, { lineId, cursorPosition } = {}) => {
  requestAnimationFrame(() => {
    const lineElement = getLineElementById(refs, lineId);
    if (!lineElement) {
      return;
    }

    if (typeof cursorPosition === "number") {
      const targetPosition =
        cursorPosition < 0
          ? (lineElement.getPlainText?.().length ?? 0)
          : cursorPosition;
      lineElement.setCaretPosition?.(targetPosition, {
        preventScroll: true,
      });
      return;
    }

    lineElement.focus?.({ preventScroll: true });
  });
};

export const handleRowClick = (deps, payload) => {
  const { store, refs, dispatchEvent, props } = deps;
  const lineId = payload?._event?.currentTarget?.dataset?.lineId;
  if (!lineId) {
    return;
  }

  setActiveLineIdIfUncontrolled(store, props, lineId);
  dispatchSelectedLineChanged(dispatchEvent, lineId);
  focusLineAfterRender(refs, { lineId });
};

export const handleLineFocus = (deps, payload) => {
  const { store, dispatchEvent, props } = deps;
  const lineId = getLineIdFromElement(payload?._event?.currentTarget);
  if (!lineId) {
    return;
  }

  setActiveLineIdIfUncontrolled(store, props, lineId);
  dispatchSelectedLineChanged(dispatchEvent, lineId);
};

export const handleLineBlur = (deps, payload) => {
  deps.dispatchEvent(
    new CustomEvent("editor-blur", {
      detail: payload?._event?.detail || {},
    }),
  );
};

export const handleLineCompositionStateChanged = (deps, payload) => {
  deps.dispatchEvent(
    new CustomEvent("composition-state-changed", {
      detail: payload?._event?.detail || {},
    }),
  );
};

export const handleLineContentChange = (deps, payload) => {
  const { dispatchEvent, props, store } = deps;
  const lineId = getLineIdFromElement(payload?._event?.currentTarget);
  if (!lineId) {
    return;
  }

  const lines = getLinesSnapshot(props);
  const line = lines.find((item) => item.id === lineId);
  if (!line) {
    return;
  }

  setLineDialogueContent(line, payload?._event?.detail?.content);
  setActiveLineIdIfUncontrolled(store, props, lineId);
  dispatchSceneLinesChanged(dispatchEvent, {
    lines,
    selectedLineId: lineId,
    reason: "text",
  });
};

export const handleLineSplitRequest = (deps, payload) => {
  const { dispatchEvent, props, store } = deps;
  const lineId = getLineIdFromElement(payload?._event?.currentTarget);
  const { leftContent, rightContent } = payload?._event?.detail || {};
  const lines = getLinesSnapshot(props);
  const lineIndex = lines.findIndex((item) => item.id === lineId);
  if (lineIndex < 0) {
    return;
  }

  const currentLine = lines[lineIndex];
  const newLineId = generateId();
  const newLine = {
    id: newLineId,
    sectionId: currentLine.sectionId,
    actions: structuredClone(currentLine.actions || {}),
  };

  setLineDialogueContent(currentLine, leftContent);
  setLineDialogueContent(newLine, rightContent);
  lines.splice(lineIndex + 1, 0, newLine);

  setActiveLineIdIfUncontrolled(store, props, newLineId);
  dispatchSceneLinesChanged(dispatchEvent, {
    lines,
    selectedLineId: newLineId,
    focusTarget: {
      lineId: newLineId,
      cursorPosition: 0,
    },
    reason: "structure",
  });
};

export const handleLineMergeRequest = (deps, payload) => {
  const { dispatchEvent, props, store } = deps;
  const lineId = getLineIdFromElement(payload?._event?.currentTarget);
  const lines = getLinesSnapshot(props);
  const lineIndex = lines.findIndex((item) => item.id === lineId);
  if (lineIndex <= 0) {
    return;
  }

  const previousLine = lines[lineIndex - 1];
  const currentLine = lines[lineIndex];
  const previousContent = getLineDialogueContent(previousLine);
  const mergedContent = appendContentArrays(
    previousContent,
    getLineDialogueContent(currentLine),
  );
  const cursorPosition = getContentLength(previousContent);

  setLineDialogueContent(previousLine, mergedContent);
  lines.splice(lineIndex, 1);

  setActiveLineIdIfUncontrolled(store, props, previousLine.id);
  dispatchSceneLinesChanged(dispatchEvent, {
    lines,
    selectedLineId: previousLine.id,
    focusTarget: {
      lineId: previousLine.id,
      cursorPosition,
    },
    reason: "structure",
  });
};

export const handleLinePasteRequest = (deps, payload) => {
  const { dispatchEvent, props, store } = deps;
  const lineId = getLineIdFromElement(payload?._event?.currentTarget);
  const {
    leftContent,
    rightContent,
    lines: pastedLines,
  } = payload?._event?.detail || {};
  const lines = getLinesSnapshot(props);
  const lineIndex = lines.findIndex((item) => item.id === lineId);
  if (
    lineIndex < 0 ||
    !Array.isArray(pastedLines) ||
    pastedLines.length === 0
  ) {
    return;
  }

  const currentLine = lines[lineIndex];
  const nextLines = [];

  const firstContent = appendContentArrays(leftContent, pastedLines[0]);
  setLineDialogueContent(currentLine, firstContent);

  let selectedLineId = currentLine.id;
  let cursorPosition = getContentLength(firstContent);

  for (let index = 1; index < pastedLines.length; index += 1) {
    const content = pastedLines[index];
    const isLastLine = index === pastedLines.length - 1;
    const newLine = {
      id: generateId(),
      sectionId: currentLine.sectionId,
      actions: structuredClone(currentLine.actions || {}),
    };
    const nextContent = isLastLine
      ? appendContentArrays(content, rightContent)
      : content;
    setLineDialogueContent(newLine, nextContent);
    nextLines.push(newLine);
    selectedLineId = newLine.id;
    cursorPosition = getContentLength(content);
  }

  if (nextLines.length === 0) {
    setLineDialogueContent(
      currentLine,
      appendContentArrays(firstContent, rightContent),
    );
    cursorPosition = getContentLength(firstContent);
  }

  lines.splice(lineIndex + 1, 0, ...nextLines);
  setActiveLineIdIfUncontrolled(store, props, selectedLineId);
  dispatchSceneLinesChanged(dispatchEvent, {
    lines,
    selectedLineId,
    focusTarget: {
      lineId: selectedLineId,
      cursorPosition,
    },
    reason: "structure",
  });
};

export const handleLineNavigateRequest = (deps, payload) => {
  const { props, refs, store, dispatchEvent } = deps;
  const currentLineId = getLineIdFromElement(payload?._event?.currentTarget);
  const direction = payload?._event?.detail?.direction;
  const requestedCursorPosition = payload?._event?.detail?.cursorPosition;
  const lines = Array.isArray(props.lines) ? props.lines : [];
  const currentIndex = lines.findIndex((line) => line.id === currentLineId);

  if (currentIndex < 0) {
    return;
  }

  const targetIndex =
    direction === "previous" ? currentIndex - 1 : currentIndex + 1;
  const targetLine = lines[targetIndex];
  if (!targetLine?.id) {
    return;
  }

  const targetPosition =
    requestedCursorPosition === -1
      ? (getLineElementById(refs, targetLine.id)?.getPlainText?.().length ?? 0)
      : requestedCursorPosition;

  setActiveLineIdIfUncontrolled(store, props, targetLine.id);
  dispatchSelectedLineChanged(dispatchEvent, targetLine.id);
  focusLineAfterRender(refs, {
    lineId: targetLine.id,
    cursorPosition: targetPosition,
  });
};
