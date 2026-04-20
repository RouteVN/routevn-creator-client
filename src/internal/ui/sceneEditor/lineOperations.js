import { generateId } from "../../id.js";
import {
  clearSceneEditorSessionSelectionTarget,
  getSceneEditorSessionSelectionTarget,
  insertSceneEditorSessionLine,
  mergeSceneEditorSessionLine,
  pasteSceneEditorSessionLines,
  splitSceneEditorSessionLine,
  swapSceneEditorSessionLine,
} from "./editorSession.js";

const getLinesEditorRef = (refs) => {
  return refs?.linesEditor;
};

const cloneControlAction = (action) => {
  if (!action || typeof action !== "object") {
    return undefined;
  }

  return structuredClone(action);
};

const findFirstControlAction = (repositoryState) => {
  const controls = repositoryState?.controls?.items || {};

  for (const [controlId, control] of Object.entries(controls)) {
    if (control?.type === "control") {
      return {
        resourceId: controlId,
        resourceType: "control",
      };
    }
  }

  return undefined;
};

const getDialogueLayoutType = ({ repositoryState, dialogue } = {}) => {
  const resourceId = dialogue?.ui?.resourceId ?? dialogue?.gui?.resourceId;
  if (!resourceId) {
    return undefined;
  }

  return repositoryState?.layouts?.items?.[resourceId]?.layoutType;
};

const resolveEffectiveDialogueMode = ({ repositoryState, dialogue } = {}) => {
  if (dialogue?.mode === "nvl") {
    return "nvl";
  }

  if (getDialogueLayoutType({ repositoryState, dialogue }) === "dialogue-nvl") {
    return "nvl";
  }

  return "adv";
};

const resolveLineDialogueMode = ({
  repositoryState,
  lines,
  lineId,
  existingDialogue,
}) => {
  if (
    resolveEffectiveDialogueMode({
      repositoryState,
      dialogue: existingDialogue,
    }) === "nvl"
  ) {
    return "nvl";
  }

  const lineOrder = (lines || []).map((line) => line.id);
  const currentIndex = lineOrder.indexOf(lineId);
  if (currentIndex <= 0) {
    return "adv";
  }

  const previousLine = lines[currentIndex - 1];
  return resolveEffectiveDialogueMode({
    repositoryState,
    dialogue: previousLine?.actions?.dialogue,
  });
};

const resolveLineControlAction = ({ repositoryState, line, fallbackLine }) => {
  const primaryAction = cloneControlAction(line?.actions?.control);
  if (primaryAction) {
    return primaryAction;
  }

  const fallbackAction = cloneControlAction(fallbackLine?.actions?.control);
  if (fallbackAction) {
    return fallbackAction;
  }

  return findFirstControlAction(repositoryState);
};

const getCurrentSection = (store) => {
  const scene = store.selectScene();
  const sectionId = store.selectSelectedSectionId();
  return scene?.sections?.find((section) => section.id === sectionId);
};

const getCurrentSectionLines = (store) => {
  return getCurrentSection(store)?.lines || [];
};

const getLineById = (lines, lineId) => {
  return (lines || []).find((line) => line.id === lineId);
};

const applyEditorSessionSelectionTarget = (deps, session) => {
  const { store } = deps;
  const selectionTarget = getSceneEditorSessionSelectionTarget(session);
  const sessionWithoutSelection = selectionTarget
    ? clearSceneEditorSessionSelectionTarget(session)
    : session;

  store.setEditorSession({ editorSession: sessionWithoutSelection });

  if (!selectionTarget) {
    return;
  }

  const linesEditorRef = getLinesEditorRef(deps.refs);
  const tryFocusSelectionTarget = (remainingAttempts = 4) => {
    if (linesEditorRef?.focusLine(selectionTarget)) {
      return;
    }

    if (remainingAttempts <= 0) {
      return;
    }

    requestAnimationFrame(() => {
      tryFocusSelectionTarget(remainingAttempts - 1);
    });
  };

  requestAnimationFrame(() => {
    tryFocusSelectionTarget();
  });
};

const updateEditorSessionAndRender = (
  deps,
  nextSession,
  { selectedLineId } = {},
) => {
  const { store, render, subject } = deps;

  if (selectedLineId !== undefined) {
    store.setSelectedLineId({ selectedLineId });
  }

  applyEditorSessionSelectionTarget(deps, nextSession);
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

const createDialogueContent = (text) => {
  return [{ text: text ?? "" }];
};

export const syncSceneEditorProjectState = (store, projectService) => {
  const repositoryState = projectService.getRepositoryState();
  const domainState = projectService.getDomainState();
  const revision = projectService.getRepositoryRevision();
  store.setRepositoryState({ repository: repositoryState });
  store.setDomainState({
    domainState,
  });
  store.setRepositoryRevision({ revision });
  return repositoryState;
};

export const writeDialogueContent = async (
  deps,
  lineId,
  { sectionId: _sectionId, content },
) => {
  const [update] = createDialogueContentUpdates(deps, [
    {
      lineId,
      content,
    },
  ]);
  if (!update) {
    return;
  }

  await deps.projectService.updateLineDialogueAction(update);
};

const createDialogueContentUpdates = (deps, updates = []) => {
  const { store } = deps;
  const currentSectionLines = getCurrentSectionLines(store);
  const repositoryState = store.selectRepositoryState();

  return updates.map(({ lineId, content }) => {
    const existingLine =
      store.selectSelectedLine()?.id === lineId
        ? store.selectSelectedLine()
        : getLineById(currentSectionLines, lineId);
    const existingDialogue = existingLine?.actions?.dialogue || {};
    const resolvedMode = resolveLineDialogueMode({
      repositoryState,
      lines: currentSectionLines,
      lineId,
      existingDialogue,
    });

    return {
      lineId,
      dialogue: {
        ...existingDialogue,
        mode: resolvedMode,
        content,
      },
    };
  });
};

export const writeDialogueContents = async (deps, updates = []) => {
  const normalizedUpdates = createDialogueContentUpdates(deps, updates);
  if (normalizedUpdates.length === 0) {
    return;
  }

  await deps.projectService.updateLineDialogueActionsBatch({
    updates: normalizedUpdates,
  });
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
  const { projectService, store } = deps;
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent } = payload._event.detail;
  const lockingLineId = store.selectLockingLineId();

  if (!sectionId || !lineId || lockingLineId === lineId) {
    return;
  }

  const currentLines = getCurrentSectionLines(store);
  const currentLine = getLineById(currentLines, lineId);
  if (!currentLine) {
    return;
  }

  store.setLockingLineId({ lineId });
  const controlAction = resolveLineControlAction({
    repositoryState: projectService.getRepositoryState(),
    line: currentLine,
  });
  const newLineId = generateId();
  const persistedNewLineActions = {
    dialogue: {
      content: createDialogueContent(rightContent ?? ""),
    },
  };

  if (controlAction) {
    persistedNewLineActions.control = controlAction;
  }

  const sessionNewLineActions = structuredClone(persistedNewLineActions);

  const nextSession = splitSceneEditorSessionLine(store.selectEditorSession(), {
    lineId,
    newLineId,
    sectionId,
    leftContent,
    rightContent,
    newLineActions: sessionNewLineActions,
  });
  updateEditorSessionAndRender(deps, nextSession, {
    selectedLineId: newLineId,
  });
  requestAnimationFrame(() => {
    store.clearLockingLineId();
  });
};

export const handlePasteLinesOperation = async (deps, payload) => {
  const { projectService, store } = deps;
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent, lines } = payload._event.detail;
  const currentLines = getCurrentSectionLines(store);
  const currentLine = getLineById(currentLines, lineId);

  if (
    !sectionId ||
    !currentLine ||
    !Array.isArray(lines) ||
    lines.length === 0
  ) {
    return;
  }

  const controlAction = resolveLineControlAction({
    repositoryState: projectService.getRepositoryState(),
    line: currentLine,
  });

  const newLines = lines.slice(1).map((content) => ({
    lineId: generateId(),
    data: {
      actions: {
        dialogue: {
          content: createDialogueContent(content),
        },
        ...(controlAction ? { control: structuredClone(controlAction) } : {}),
      },
    },
  }));

  const nextSession = pasteSceneEditorSessionLines(
    store.selectEditorSession(),
    {
      lineId,
      sectionId,
      leftContent,
      rightContent,
      lines,
      newLines,
    },
  );
  const selectionTarget = getSceneEditorSessionSelectionTarget(nextSession);
  updateEditorSessionAndRender(deps, nextSession, {
    selectedLineId: selectionTarget?.lineId,
  });
};

export const handleNewLineOperation = async (deps, payload) => {
  const { store, projectService } = deps;
  const detail = payload?._event?.detail || {};
  const sectionId = store.selectSelectedSectionId();
  if (!sectionId) {
    return;
  }

  const requestedPosition =
    detail.position === "before" || detail.position === "after"
      ? detail.position
      : undefined;
  const referenceLineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : undefined;
  const selectedLine = store.selectSelectedLine();
  const baseLineId = referenceLineId || selectedLine?.id;
  const currentLines = getCurrentSectionLines(store);
  const baseLine = baseLineId
    ? getLineById(currentLines, baseLineId)
    : selectedLine;
  const controlAction = resolveLineControlAction({
    repositoryState: projectService.getRepositoryState(),
    line: baseLine,
    fallbackLine: selectedLine,
  });

  const newLineId = generateId();
  const persistedActions = {
    dialogue: {
      content: createDialogueContent(""),
    },
  };
  if (controlAction) {
    persistedActions.control = controlAction;
  }

  const sessionActions = structuredClone(persistedActions);

  const nextSession = insertSceneEditorSessionLine(
    store.selectEditorSession(),
    {
      lineId: baseLineId,
      newLineId,
      sectionId,
      position: requestedPosition,
      actions: sessionActions,
    },
  );
  updateEditorSessionAndRender(deps, nextSession, {
    selectedLineId: newLineId,
  });
};

export const handleSwapLineOperation = async (deps, payload) => {
  const { store } = deps;
  const detail = payload?._event?.detail || {};
  const direction =
    detail.direction === "up" || detail.direction === "down"
      ? detail.direction
      : undefined;
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

  const nextSession = swapSceneEditorSessionLine(store.selectEditorSession(), {
    lineId,
    direction,
  });
  updateEditorSessionAndRender(deps, nextSession, {
    selectedLineId: lineId,
  });
};

export const handleMergeLinesOperation = async (deps, payload) => {
  const { store } = deps;
  const { currentLineId } = payload._event.detail;
  const lockingLineId = store.selectLockingLineId();

  if (!currentLineId || lockingLineId) {
    return;
  }

  const currentLines = getCurrentSectionLines(store);
  const currentIndex = currentLines.findIndex(
    (line) => line.id === currentLineId,
  );
  if (currentIndex <= 0) {
    return;
  }

  const previousLine = currentLines[currentIndex - 1];
  const currentLine = currentLines[currentIndex];
  if (!previousLine || !currentLine) {
    return;
  }

  store.setLockingLineId({ lineId: currentLineId });
  const nextSession = mergeSceneEditorSessionLine(store.selectEditorSession(), {
    currentLineId,
    previousLineId: previousLine.id,
  });
  updateEditorSessionAndRender(deps, nextSession, {
    selectedLineId: previousLine.id,
  });
  requestAnimationFrame(() => {
    store.clearLockingLineId();
  });
};
