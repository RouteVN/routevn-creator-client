import { nanoid } from "nanoid";
import {
  debugLog,
  previewDebugText,
} from "../../../deps/services/shared/debugLog.js";

const getLinesEditorRef = (refs) => {
  return refs?.linesEditor;
};

const getDialogueText = (line) => {
  return (line?.actions?.dialogue?.content || [])
    .map((item) => item?.text ?? "")
    .join("");
};

const isMinimalAdvDialogue = (dialogue) => {
  if (!dialogue || typeof dialogue !== "object") {
    return false;
  }

  const keysWithoutContent = Object.keys(dialogue).filter(
    (key) => key !== "content",
  );

  return keysWithoutContent.length === 1 && dialogue.mode === "adv";
};

const shouldInheritNvlModeFromPreviousLine = ({
  domainState,
  sectionId,
  lineId,
  existingDialogue,
}) => {
  const section = domainState?.sections?.[sectionId];
  if (!section) {
    return false;
  }

  if (existingDialogue?.mode === "nvl") {
    return false;
  }

  if (existingDialogue?.mode && !isMinimalAdvDialogue(existingDialogue)) {
    return false;
  }

  const lineOrder = section.lineIds || [];
  const currentIndex = lineOrder.indexOf(lineId);
  if (currentIndex <= 0) {
    return false;
  }

  const previousLineId = lineOrder[currentIndex - 1];
  if (!previousLineId) {
    return false;
  }

  const previousDialogue =
    domainState?.lines?.[previousLineId]?.actions?.dialogue;
  return previousDialogue?.mode === "nvl";
};

const resolveMergeLinesContext = (domainState, currentLineId) => {
  const currentLine = domainState?.lines?.[currentLineId];
  const sectionId = currentLine?.sectionId;
  const section = sectionId ? domainState?.sections?.[sectionId] : undefined;
  const lineIds = section?.lineIds || [];
  const currentIndex = lineIds.indexOf(currentLineId);

  if (!currentLine || currentIndex <= 0) {
    return {};
  }

  const prevLineId = lineIds[currentIndex - 1];
  const prevLine = domainState?.lines?.[prevLineId];

  if (!prevLineId || !prevLine) {
    return {};
  }

  return {
    currentLine,
    prevLineId,
    prevLine,
  };
};

const isMissingLinePreconditionError = (error, lineId) => {
  return (
    error?.name === "DomainPreconditionError" &&
    error?.message === "line not found" &&
    (!lineId || error?.details?.lineId === lineId)
  );
};

export const syncSceneEditorProjectState = (store, projectService) => {
  const repositoryState = projectService.getState();
  store.setRepositoryState({ repository: repositoryState });
  store.setDomainState({
    domainState: projectService.getDomainState(),
  });
  return repositoryState;
};

export const writeDialogueContent = async (
  deps,
  lineId,
  { sectionId, content },
) => {
  const { projectService } = deps;
  const domainState = projectService.getDomainState();
  const existingDialogue =
    domainState?.lines?.[lineId]?.actions?.dialogue || {};
  const shouldInheritNvlMode = shouldInheritNvlModeFromPreviousLine({
    domainState,
    sectionId,
    lineId,
    existingDialogue,
  });

  debugLog("lines", "scene.write-dialogue", {
    lineId,
    sectionId,
    contentLength: (content || []).map((item) => item?.text ?? "").join("")
      .length,
    content: previewDebugText(
      (content || []).map((item) => item?.text ?? "").join(""),
    ),
  });

  await projectService.updateLineDialogueAction({
    lineId,
    dialogue: {
      ...existingDialogue,
      ...(shouldInheritNvlMode ? { mode: "nvl" } : {}),
      content,
    },
  });
};

export const flushDialogueQueue = async (deps) => {
  const { dialogueQueueService } = deps;

  debugLog("lines", "scene.flush-dialogue-queue:start", {
    pendingSize: dialogueQueueService.size(),
  });

  await dialogueQueueService.flush(async (lineId, data) => {
    await writeDialogueContent(deps, lineId, data);
  });

  debugLog("lines", "scene.flush-dialogue-queue:end", {
    pendingSize: dialogueQueueService.size(),
  });
};

export const applyPendingDialogueQueueToStore = (
  store,
  dialogueQueueService,
) => {
  for (const [lineId, data] of dialogueQueueService.entries()) {
    if (!lineId || !Array.isArray(data?.content)) {
      continue;
    }

    store.setLineTextContent({
      lineId,
      content: data.content,
    });
  }
};

export const findCharacterIdByShortcut = (repositoryState, shortcut) => {
  const normalizedShortcut = String(shortcut || "").trim();
  if (!normalizedShortcut) {
    return null;
  }

  const characters = repositoryState?.characters?.items || {};
  for (const [characterId, character] of Object.entries(characters)) {
    if (character?.type !== "character") {
      continue;
    }

    if (String(character?.shortcut || "").trim() === normalizedShortcut) {
      return characterId;
    }
  }

  return null;
};

export const handleSplitLineOperation = async (deps, payload) => {
  const { projectService, store, render, refs, subject } = deps;
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent } = payload._event.detail;
  const lockingLineId = store.selectLockingLineId();

  if (lockingLineId === lineId) {
    return;
  }

  store.setLockingLineId({ lineId });
  let shouldReleaseLockAfterFocus = false;

  try {
    const newLineId = nanoid();
    await flushDialogueQueue(deps);

    const domainState = projectService.getDomainState();
    const existingDialogue =
      domainState?.lines?.[lineId]?.actions?.dialogue || {};

    debugLog("lines", "scene.split.after-flush", {
      lineId,
      newLineId,
      domainContent: previewDebugText(
        (domainState?.lines?.[lineId]?.actions?.dialogue?.content || [])
          .map((item) => item?.text ?? "")
          .join(""),
      ),
      leftContent: previewDebugText(leftContent),
      rightContent: previewDebugText(rightContent),
    });

    const leftContentArray = leftContent
      ? [{ text: leftContent }]
      : [{ text: "" }];

    await projectService.updateLineDialogueAction({
      lineId,
      dialogue: {
        ...existingDialogue,
        content: leftContentArray,
      },
    });

    const rightContentArray = rightContent
      ? [{ text: rightContent }]
      : [{ text: "" }];
    const shouldInheritNvl =
      existingDialogue?.mode === "nvl" ||
      shouldInheritNvlModeFromPreviousLine({
        domainState,
        sectionId,
        lineId,
        existingDialogue,
      });
    const shouldCreateDialogueAction = shouldInheritNvl || !!rightContent;
    const newLineActions = shouldCreateDialogueAction
      ? {
          dialogue: {
            mode: shouldInheritNvl ? "nvl" : "adv",
            ...(rightContent ? { content: rightContentArray } : {}),
          },
        }
      : {};

    const linesEditorRef = getLinesEditorRef(refs);
    debugLog("lines", "scene.split.start", {
      lineId,
      sectionId,
      newLineId,
      leftContent: previewDebugText(leftContent),
      rightContent: previewDebugText(rightContent),
    });

    await projectService.createLineItem({
      sectionId,
      lineId: newLineId,
      data: {
        actions: newLineActions,
      },
      position: "after",
      positionTargetId: lineId,
    });
    debugLog("lines", "scene.split.created-line", {
      lineId,
      newLineId,
      leftContent: previewDebugText(leftContent),
      rightContent: previewDebugText(rightContent),
    });

    syncSceneEditorProjectState(store, projectService);
    store.setSelectedLineId({ selectedLineId: newLineId });
    render();
    shouldReleaseLockAfterFocus = true;

    requestAnimationFrame(() => {
      linesEditorRef?.focusLine({
        lineId: newLineId,
        cursorPosition: 0,
        goalColumn: 0,
        direction: "down",
        syncLineId: lineId,
      });

      requestAnimationFrame(() => {
        store.clearLockingLineId();
      });
    });

    subject.dispatch("sceneEditor.renderCanvas", {});
  } finally {
    if (!shouldReleaseLockAfterFocus) {
      store.clearLockingLineId();
    }
  }
};

export const handlePasteLinesOperation = async (deps, payload) => {
  const { projectService, store, render, refs, subject } = deps;
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent, lines } = payload._event.detail;

  await flushDialogueQueue(deps);

  const domainState = projectService.getDomainState();
  const existingDialogue =
    domainState?.lines?.[lineId]?.actions?.dialogue || {};
  const shouldInheritNvl =
    existingDialogue?.mode === "nvl" ||
    shouldInheritNvlModeFromPreviousLine({
      domainState,
      sectionId,
      lineId,
      existingDialogue,
    });

  const firstLineContent = leftContent + lines[0];
  const firstContentArray = [{ text: firstLineContent }];
  await projectService.updateLineDialogueAction({
    lineId,
    dialogue: {
      ...existingDialogue,
      content: firstContentArray,
    },
  });

  let lastCreatedLineId = lineId;
  if (lines.length > 1) {
    const createdLineIds = await projectService.createLineItem({
      sectionId,
      position: "after",
      positionTargetId: lineId,
      lines: lines.slice(1).map((content, index) => {
        const isLastLine = index === lines.length - 2;
        const lineContent = isLastLine ? content + rightContent : content;
        return {
          lineId: nanoid(),
          data: {
            actions: {
              dialogue: {
                mode: shouldInheritNvl ? "nvl" : "adv",
                content: [{ text: lineContent }],
              },
            },
          },
        };
      }),
    });

    if (Array.isArray(createdLineIds) && createdLineIds.length > 0) {
      lastCreatedLineId = createdLineIds[createdLineIds.length - 1];
    }
  }

  if (lines.length === 1) {
    const combinedContentArray = [{ text: firstLineContent + rightContent }];
    await projectService.updateLineDialogueAction({
      lineId,
      dialogue: {
        ...existingDialogue,
        content: combinedContentArray,
      },
    });
    lastCreatedLineId = lineId;
  }

  syncSceneEditorProjectState(store, projectService);
  store.setSelectedLineId({ selectedLineId: lastCreatedLineId });
  render();

  const linesEditorRef = getLinesEditorRef(refs);
  const lastLineContent =
    lines.length === 1
      ? firstLineContent + rightContent
      : lines[lines.length - 1] + rightContent;
  const cursorPosition = lastLineContent.length - rightContent.length;

  requestAnimationFrame(() => {
    linesEditorRef?.focusLine({
      lineId: lastCreatedLineId,
      cursorPosition,
      goalColumn: cursorPosition,
      direction: null,
      syncLineId: lineId,
    });
  });

  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleNewLineOperation = async (deps, payload) => {
  const { store, render, projectService, subject, refs } = deps;
  const detail = payload?._event?.detail || {};
  const newLineId = nanoid();
  const sectionId = store.selectSelectedSectionId();
  if (!sectionId) {
    return;
  }

  const requestedPosition =
    detail.position === "before" || detail.position === "after"
      ? detail.position
      : null;
  const referenceLineId =
    typeof detail.lineId === "string" && detail.lineId ? detail.lineId : null;
  const selectedLine = store.selectSelectedLine();
  const selectedLineId = store.selectSelectedLineId();
  const baseLineId = referenceLineId || selectedLineId || selectedLine?.id;

  if (requestedPosition && !baseLineId) {
    return;
  }

  await flushDialogueQueue(deps);

  const domainState = projectService.getDomainState();
  const existingDialogue = baseLineId
    ? domainState?.lines?.[baseLineId]?.actions?.dialogue || {}
    : selectedLine?.actions?.dialogue || {};
  const shouldInheritNvl =
    existingDialogue?.mode === "nvl" ||
    shouldInheritNvlModeFromPreviousLine({
      domainState,
      sectionId,
      lineId: baseLineId,
      existingDialogue,
    });

  let createPosition = "last";
  let createPositionId;
  if (requestedPosition === "before") {
    createPosition = "before";
    createPositionId = baseLineId;
  } else if (requestedPosition === "after") {
    createPosition = "after";
    createPositionId = baseLineId;
  }

  const createLinePayload = {
    sectionId,
    lineId: newLineId,
    data: {
      actions: shouldInheritNvl
        ? {
            dialogue: {
              mode: "nvl",
            },
          }
        : {},
    },
  };

  createLinePayload.position = createPosition;
  createLinePayload.positionTargetId = createPositionId;

  await projectService.createLineItem(createLinePayload);

  syncSceneEditorProjectState(store, projectService);
  store.setSelectedLineId({ selectedLineId: newLineId });
  render();

  const linesEditorRef = getLinesEditorRef(refs);
  if (requestedPosition && linesEditorRef) {
    requestAnimationFrame(() => {
      linesEditorRef.focusLine({
        lineId: newLineId,
        cursorPosition: 0,
        goalColumn: 0,
        direction: null,
      });
    });
  }

  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleSwapLineOperation = async (deps, payload) => {
  const { store, projectService, render, subject } = deps;
  const detail = payload?._event?.detail || {};
  const direction =
    detail.direction === "up" || detail.direction === "down"
      ? detail.direction
      : null;
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();
  const sectionId = store.selectSelectedSectionId();

  if (!direction || !lineId || !sectionId) {
    return;
  }

  const scene = store.selectScene();
  const section = scene?.sections?.find((item) => item.id === sectionId);
  const lines = Array.isArray(section?.lines) ? section.lines : [];
  const currentIndex = lines.findIndex((line) => line.id === lineId);
  if (currentIndex < 0) {
    return;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= lines.length) {
    return;
  }

  await flushDialogueQueue(deps);
  await projectService.moveLineItem({
    lineId,
    toSectionId: sectionId,
    index: targetIndex,
  });

  syncSceneEditorProjectState(store, projectService);
  store.setSelectedLineId({ selectedLineId: lineId });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleMergeLinesOperation = async (deps, payload) => {
  const { store, refs, render, projectService, subject } = deps;
  const { currentLineId } = payload._event.detail;
  const lockingLineId = store.selectLockingLineId();

  if (lockingLineId) {
    return;
  }

  store.setLockingLineId({ lineId: currentLineId });
  let shouldReleaseLockAfterFocus = false;
  let resolvedPrevLineId;

  try {
    await flushDialogueQueue(deps);

    const domainState = projectService.getDomainState();
    const { currentLine, prevLineId, prevLine } = resolveMergeLinesContext(
      domainState,
      currentLineId,
    );
    resolvedPrevLineId = prevLineId;

    if (!currentLine || !prevLineId || !prevLine) {
      return;
    }

    const prevContentText = getDialogueText(prevLine);
    const currentContentText = getDialogueText(currentLine);
    const prevContentLength = prevContentText.length;
    const existingDialogue = prevLine.actions?.dialogue || {};

    await projectService.updateLineDialogueAction({
      lineId: prevLineId,
      dialogue: {
        ...existingDialogue,
        content: [{ text: prevContentText + currentContentText }],
      },
    });

    if (!projectService.getDomainState()?.lines?.[currentLineId]) {
      return;
    }

    try {
      await projectService.deleteLineItem({ lineId: currentLineId });
    } catch (error) {
      if (isMissingLinePreconditionError(error, currentLineId)) {
        return;
      }

      throw error;
    }

    syncSceneEditorProjectState(store, projectService);
    store.setSelectedLineId({ selectedLineId: prevLineId });
    render();
    shouldReleaseLockAfterFocus = true;

    const linesEditorRef = getLinesEditorRef(refs);
    requestAnimationFrame(() => {
      linesEditorRef?.focusLine({
        lineId: prevLineId,
        cursorPosition: prevContentLength,
        goalColumn: prevContentLength,
        direction: null,
      });

      requestAnimationFrame(() => {
        store.clearLockingLineId();
      });
    });

    subject.dispatch("sceneEditor.renderCanvas", {});
  } catch (error) {
    if (
      isMissingLinePreconditionError(error, currentLineId) ||
      isMissingLinePreconditionError(error, resolvedPrevLineId)
    ) {
      return;
    }

    throw error;
  } finally {
    if (!shouldReleaseLockAfterFocus) {
      store.clearLockingLineId();
    }
  }
};
