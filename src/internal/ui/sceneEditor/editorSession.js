const toArray = (value) => {
  return Array.isArray(value) ? value : [];
};

const clonePlainModelValue = (value) => {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => clonePlainModelValue(item));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, clonePlainModelValue(item)])
      .filter(([, item]) => item !== undefined),
  );
};

const cloneLine = (line) => {
  const sourceLine = line || {};

  try {
    return structuredClone(sourceLine);
  } catch (error) {
    if (error?.name !== "DataCloneError") {
      throw error;
    }
  }

  return {
    id: sourceLine.id,
    sectionId: sourceLine.sectionId,
    actions: clonePlainModelValue(sourceLine.actions || {}),
  };
};

const ensureLineActions = (line) => {
  if (!line.actions || typeof line.actions !== "object") {
    line.actions = {};
  }

  return line.actions;
};

const ensureDialogueAction = (line) => {
  const actions = ensureLineActions(line);
  if (!actions.dialogue || typeof actions.dialogue !== "object") {
    actions.dialogue = {};
  }

  return actions.dialogue;
};

export const getSceneEditorLineText = (line) => {
  return line?.actions?.dialogue?.content?.[0]?.text ?? "";
};

export const setSceneEditorLineText = (line, text) => {
  const dialogue = ensureDialogueAction(line);
  dialogue.content = [{ text: text ?? "" }];
  return line;
};

const createSessionLineEntry = (
  line,
  { baseText, dirty = false, conflict = false, saveState = "idle" } = {},
) => {
  const nextLine = cloneLine(line);
  const resolvedBaseText =
    baseText !== undefined ? baseText : getSceneEditorLineText(nextLine);

  return {
    line: nextLine,
    baseText: resolvedBaseText,
    dirty,
    conflict,
    saveState,
  };
};

const createSessionLineEntries = (lines = []) => {
  const linesById = {};
  const lineOrder = [];

  for (const sourceLine of toArray(lines)) {
    if (!sourceLine?.id) {
      continue;
    }

    lineOrder.push(sourceLine.id);
    linesById[sourceLine.id] = createSessionLineEntry(sourceLine);
  }

  return {
    lineOrder,
    linesById,
  };
};

const getSectionLines = (section) => {
  return toArray(section?.lines);
};

const findLineIndex = (lineOrder, lineId) => {
  return toArray(lineOrder).indexOf(lineId);
};

const cloneSession = (session) => {
  return structuredClone(session);
};

const cloneSelectionTarget = (selectionTarget) => {
  return selectionTarget ? structuredClone(selectionTarget) : undefined;
};

const createEmptySession = ({
  sceneId,
  sectionId,
  revision = 0,
  isComposing = false,
} = {}) => {
  return {
    sceneId,
    sectionId,
    baseRevision: Number.isFinite(revision) ? revision : 0,
    lineOrder: [],
    linesById: {},
    selectionTarget: undefined,
    isComposing,
    structureDirty: false,
  };
};

const setSessionLineEntryText = (
  session,
  lineId,
  text,
  { saveState = "scheduled" } = {},
) => {
  const entry = session?.linesById?.[lineId];
  if (!entry) {
    return;
  }

  if (!entry.dirty) {
    entry.baseText = getSceneEditorLineText(entry.line);
  }

  setSceneEditorLineText(entry.line, text);
  const currentText = getSceneEditorLineText(entry.line);
  entry.dirty = currentText !== entry.baseText;
  entry.conflict = false;
  entry.saveState = entry.dirty ? saveState : "idle";
};

const createDraftLine = ({ lineId, sectionId, actions = {} } = {}) => {
  return {
    id: lineId,
    sectionId,
    actions: structuredClone(actions),
  };
};

const compareLineOrder = (left = [], right = []) => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

const getRepositorySectionState = (section) => {
  const lines = getSectionLines(section);
  const lineOrder = lines.map((line) => line.id).filter(Boolean);
  const linesById = Object.fromEntries(
    lineOrder.map((lineId) => [
      lineId,
      cloneLine(lines.find((line) => line.id === lineId)),
    ]),
  );

  return {
    lineOrder,
    linesById,
  };
};

const hasPendingLineState = (session) => {
  return Object.values(session?.linesById || {}).some(
    (entry) => entry?.dirty || entry?.conflict,
  );
};

const adoptRepositorySectionIntoSession = (
  session,
  section,
  { revision } = {},
) => {
  const repositorySectionState = getRepositorySectionState(section);
  const nextSession = cloneSession(session);

  nextSession.baseRevision = Number.isFinite(revision)
    ? revision
    : nextSession.baseRevision;
  nextSession.lineOrder = repositorySectionState.lineOrder;
  nextSession.linesById = Object.fromEntries(
    repositorySectionState.lineOrder.map((lineId) => [
      lineId,
      createSessionLineEntry(repositorySectionState.linesById[lineId]),
    ]),
  );

  return nextSession;
};

const rebaseDirtyEntryOntoRepositoryLine = (
  entry,
  repositoryLine,
  { conflict = false } = {},
) => {
  const repositoryText = getSceneEditorLineText(repositoryLine);
  const draftText = getSceneEditorLineText(entry.line);
  const rebasedLine = cloneLine(repositoryLine);

  setSceneEditorLineText(rebasedLine, draftText);

  return {
    ...structuredClone(entry),
    line: rebasedLine,
    baseText: repositoryText,
    dirty: draftText !== repositoryText,
    conflict,
    saveState:
      draftText !== repositoryText ? entry.saveState || "scheduled" : "idle",
  };
};

export const createSceneEditorSession = ({
  sceneId,
  sectionId,
  section,
  revision = 0,
  isComposing = false,
} = {}) => {
  const session = createEmptySession({
    sceneId,
    sectionId,
    revision,
    isComposing,
  });
  const { lineOrder, linesById } = createSessionLineEntries(
    getSectionLines(section),
  );
  session.lineOrder = lineOrder;
  session.linesById = linesById;
  return session;
};

export const ensureSceneEditorSession = ({
  session,
  sceneId,
  sectionId,
  section,
  revision = 0,
} = {}) => {
  if (!sceneId || !sectionId) {
    return undefined;
  }

  if (session?.sceneId === sceneId && session?.sectionId === sectionId) {
    return session;
  }

  return createSceneEditorSession({
    sceneId,
    sectionId,
    section,
    revision,
    isComposing: session?.isComposing === true,
  });
};

export const setSceneEditorSessionCompositionState = (
  session,
  { isComposing } = {},
) => {
  if (!session) {
    return session;
  }

  const nextSession = cloneSession(session);
  nextSession.isComposing = isComposing === true;
  return nextSession;
};

export const applySceneEditorSessionTextChange = (
  session,
  { lineId, content } = {},
) => {
  if (!session?.linesById?.[lineId]) {
    return session;
  }

  const nextSession = cloneSession(session);
  setSessionLineEntryText(nextSession, lineId, content);
  return nextSession;
};

export const clearSceneEditorSessionSelectionTarget = (session) => {
  if (!session) {
    return session;
  }

  const nextSession = cloneSession(session);
  nextSession.selectionTarget = undefined;
  return nextSession;
};

export const setSceneEditorSessionSelectionTarget = (
  session,
  selectionTarget,
) => {
  if (!session) {
    return session;
  }

  const nextSession = cloneSession(session);
  nextSession.selectionTarget = cloneSelectionTarget(selectionTarget);
  return nextSession;
};

export const getSceneEditorSessionSelectionTarget = (session) => {
  return cloneSelectionTarget(session?.selectionTarget);
};

export const getSceneEditorSessionLine = (session, lineId) => {
  const entry = session?.linesById?.[lineId];
  return entry ? cloneLine(entry.line) : undefined;
};

export const getSceneEditorSessionDirtyLines = (session) => {
  return toArray(session?.lineOrder)
    .map((lineId) => {
      const entry = session?.linesById?.[lineId];
      if (!entry?.dirty) {
        return undefined;
      }

      return {
        lineId,
        line: cloneLine(entry.line),
      };
    })
    .filter(Boolean);
};

export const hasSceneEditorSessionPendingChanges = (session) => {
  return Boolean(session?.structureDirty || hasPendingLineState(session));
};

export const overlaySceneWithEditorSession = (scene, session) => {
  if (!scene || !session || session.sceneId !== scene.id) {
    return scene;
  }

  const sections = toArray(scene.sections).map((section) => {
    if (section.id !== session.sectionId) {
      return section;
    }

    return {
      ...section,
      lines: toArray(session.lineOrder)
        .map((lineId) => {
          const entry = session.linesById?.[lineId];
          if (!entry?.line) {
            return undefined;
          }

          return {
            ...cloneLine(entry.line),
            hasDraftConflict: entry.conflict === true,
            isDraftDirty: entry.dirty === true,
          };
        })
        .filter(Boolean),
    };
  });

  return {
    ...scene,
    sections,
  };
};

export const reconcileSceneEditorSession = ({
  session,
  sceneId,
  sectionId,
  section,
  revision = 0,
} = {}) => {
  if (!sceneId || !sectionId) {
    return undefined;
  }

  if (
    !session ||
    session.sceneId !== sceneId ||
    session.sectionId !== sectionId
  ) {
    return createSceneEditorSession({
      sceneId,
      sectionId,
      section,
      revision,
      isComposing: session?.isComposing === true,
    });
  }

  const repositorySectionState = getRepositorySectionState(section);
  const repositoryOrder = repositorySectionState.lineOrder;
  const structureMatchesRepository = compareLineOrder(
    session.lineOrder,
    repositoryOrder,
  );

  if (
    !session.structureDirty &&
    !hasPendingLineState(session) &&
    structureMatchesRepository
  ) {
    return adoptRepositorySectionIntoSession(session, section, { revision });
  }

  if (session.structureDirty && !structureMatchesRepository) {
    const nextSession = cloneSession(session);
    nextSession.baseRevision = Number.isFinite(revision)
      ? revision
      : nextSession.baseRevision;

    for (const lineId of session.lineOrder) {
      const repositoryLine = repositorySectionState.linesById[lineId];
      const entry = nextSession.linesById?.[lineId];
      if (!repositoryLine || !entry?.dirty) {
        continue;
      }

      const repositoryText = getSceneEditorLineText(repositoryLine);
      const draftText = getSceneEditorLineText(entry.line);

      if (repositoryText === draftText) {
        nextSession.linesById[lineId] = createSessionLineEntry(repositoryLine);
        continue;
      }

      if (repositoryText !== entry.baseText) {
        nextSession.linesById[lineId] = rebaseDirtyEntryOntoRepositoryLine(
          entry,
          repositoryLine,
          { conflict: true },
        );
        console.warn("[sceneEditor] Rebased dirty draft onto repository text", {
          lineId,
          repositoryText,
          draftText,
          baseText: entry.baseText,
        });
      }
    }

    return nextSession;
  }

  const nextSession = cloneSession(session);
  nextSession.baseRevision = Number.isFinite(revision)
    ? revision
    : nextSession.baseRevision;
  nextSession.structureDirty = false;
  nextSession.lineOrder = repositoryOrder;

  const nextLinesById = {};
  for (const lineId of repositoryOrder) {
    const repositoryLine = repositorySectionState.linesById[lineId];
    const currentEntry = session.linesById?.[lineId];

    if (!currentEntry) {
      nextLinesById[lineId] = createSessionLineEntry(repositoryLine);
      continue;
    }

    if (!currentEntry.dirty) {
      nextLinesById[lineId] = createSessionLineEntry(repositoryLine);
      continue;
    }

    const repositoryText = getSceneEditorLineText(repositoryLine);
    const draftText = getSceneEditorLineText(currentEntry.line);

    if (repositoryText === draftText) {
      nextLinesById[lineId] = createSessionLineEntry(repositoryLine);
      continue;
    }

    if (repositoryText === currentEntry.baseText) {
      nextLinesById[lineId] = rebaseDirtyEntryOntoRepositoryLine(
        currentEntry,
        repositoryLine,
      );
      continue;
    }

    nextLinesById[lineId] = rebaseDirtyEntryOntoRepositoryLine(
      currentEntry,
      repositoryLine,
      { conflict: true },
    );
    console.warn("[sceneEditor] Rebased dirty draft onto repository text", {
      lineId,
      repositoryText,
      draftText,
      baseText: currentEntry.baseText,
    });
  }

  nextSession.linesById = nextLinesById;
  return nextSession;
};

export const splitSceneEditorSessionLine = (
  session,
  {
    lineId,
    newLineId,
    sectionId,
    leftContent,
    rightContent,
    newLineActions,
  } = {},
) => {
  if (!session?.linesById?.[lineId] || !newLineId) {
    return session;
  }

  const nextSession = cloneSession(session);
  setSessionLineEntryText(nextSession, lineId, leftContent ?? "", {
    saveState: "saving",
  });

  const sourceLine = nextSession.linesById[lineId].line;
  const newLine = createDraftLine({
    lineId: newLineId,
    sectionId: sectionId || sourceLine.sectionId,
    actions: newLineActions,
  });
  setSceneEditorLineText(newLine, rightContent ?? "");

  nextSession.linesById[newLineId] = createSessionLineEntry(newLine, {
    baseText: rightContent ?? "",
  });

  const currentIndex = findLineIndex(nextSession.lineOrder, lineId);
  const insertIndex =
    currentIndex >= 0 ? currentIndex + 1 : nextSession.lineOrder.length;
  nextSession.lineOrder.splice(insertIndex, 0, newLineId);
  nextSession.structureDirty = true;
  nextSession.selectionTarget = {
    lineId: newLineId,
    cursorPosition: 0,
    goalColumn: 0,
    direction: "down",
    syncLineId: lineId,
  };
  return nextSession;
};

export const pasteSceneEditorSessionLines = (
  session,
  {
    lineId,
    sectionId,
    leftContent,
    rightContent,
    lines = [],
    newLines = [],
  } = {},
) => {
  if (
    !session?.linesById?.[lineId] ||
    !Array.isArray(lines) ||
    lines.length === 0
  ) {
    return session;
  }

  const nextSession = cloneSession(session);
  const firstLineContent = `${leftContent ?? ""}${lines[0] ?? ""}`;
  const currentIndex = findLineIndex(nextSession.lineOrder, lineId);

  if (lines.length === 1) {
    const combinedContent = `${firstLineContent}${rightContent ?? ""}`;
    setSessionLineEntryText(nextSession, lineId, combinedContent, {
      saveState: "saving",
    });
    nextSession.selectionTarget = {
      lineId,
      cursorPosition:
        combinedContent.length - String(rightContent ?? "").length,
      goalColumn: combinedContent.length - String(rightContent ?? "").length,
      direction: undefined,
    };
    return nextSession;
  }

  setSessionLineEntryText(nextSession, lineId, firstLineContent, {
    saveState: "saving",
  });

  let insertIndex =
    currentIndex >= 0 ? currentIndex + 1 : nextSession.lineOrder.length;
  let lastLineId = lineId;
  let lastLineContent = firstLineContent;

  for (let index = 0; index < newLines.length; index += 1) {
    const draftLine = newLines[index];
    if (!draftLine?.lineId) {
      continue;
    }

    const isLastLine = index === newLines.length - 1;
    const lineText = isLastLine
      ? `${lines[index + 1] ?? ""}${rightContent ?? ""}`
      : `${lines[index + 1] ?? ""}`;
    const sessionLine = createDraftLine({
      lineId: draftLine.lineId,
      sectionId,
      actions: draftLine.data?.actions || {},
    });
    setSceneEditorLineText(sessionLine, lineText);

    nextSession.linesById[draftLine.lineId] = createSessionLineEntry(
      sessionLine,
      {
        baseText: lineText,
      },
    );
    nextSession.lineOrder.splice(insertIndex, 0, draftLine.lineId);
    insertIndex += 1;
    lastLineId = draftLine.lineId;
    lastLineContent = lineText;
  }

  nextSession.structureDirty = true;
  nextSession.selectionTarget = {
    lineId: lastLineId,
    cursorPosition: lastLineContent.length - String(rightContent ?? "").length,
    goalColumn: lastLineContent.length - String(rightContent ?? "").length,
    direction: undefined,
    syncLineId: lineId,
  };
  return nextSession;
};

export const insertSceneEditorSessionLine = (
  session,
  { lineId, newLineId, sectionId, position = "last", actions = {} } = {},
) => {
  if (!session || !newLineId) {
    return session;
  }

  const nextSession = cloneSession(session);
  const draftLine = createDraftLine({
    lineId: newLineId,
    sectionId,
    actions,
  });
  const insertLineIndex = findLineIndex(nextSession.lineOrder, lineId);

  nextSession.linesById[newLineId] = createSessionLineEntry(draftLine, {
    baseText: "",
  });

  if (position === "before" && insertLineIndex >= 0) {
    nextSession.lineOrder.splice(insertLineIndex, 0, newLineId);
  } else if (position === "after" && insertLineIndex >= 0) {
    nextSession.lineOrder.splice(insertLineIndex + 1, 0, newLineId);
  } else {
    nextSession.lineOrder.push(newLineId);
  }

  nextSession.structureDirty = true;
  nextSession.selectionTarget = {
    lineId: newLineId,
    cursorPosition: 0,
    goalColumn: 0,
    direction: undefined,
  };
  return nextSession;
};

export const mergeSceneEditorSessionLine = (
  session,
  { currentLineId, previousLineId } = {},
) => {
  if (
    !session?.linesById?.[currentLineId] ||
    !session?.linesById?.[previousLineId]
  ) {
    return session;
  }

  const nextSession = cloneSession(session);
  const previousEntry = nextSession.linesById[previousLineId];
  const currentEntry = nextSession.linesById[currentLineId];
  const previousText = getSceneEditorLineText(previousEntry.line);
  const currentText = getSceneEditorLineText(currentEntry.line);

  setSessionLineEntryText(
    nextSession,
    previousLineId,
    `${previousText}${currentText}`,
    {
      saveState: "saving",
    },
  );

  delete nextSession.linesById[currentLineId];
  nextSession.lineOrder = nextSession.lineOrder.filter(
    (id) => id !== currentLineId,
  );
  nextSession.structureDirty = true;
  nextSession.selectionTarget = {
    lineId: previousLineId,
    cursorPosition: previousText.length,
    goalColumn: previousText.length,
    direction: undefined,
  };
  return nextSession;
};

export const deleteSceneEditorSessionLine = (
  session,
  { lineId, nextSelectedLineId } = {},
) => {
  if (!session?.linesById?.[lineId]) {
    return session;
  }

  const nextSession = cloneSession(session);
  delete nextSession.linesById[lineId];
  nextSession.lineOrder = nextSession.lineOrder.filter((id) => id !== lineId);
  nextSession.structureDirty = true;
  nextSession.selectionTarget = nextSelectedLineId
    ? {
        lineId: nextSelectedLineId,
        cursorPosition: undefined,
        goalColumn: undefined,
        direction: undefined,
      }
    : undefined;
  return nextSession;
};

export const swapSceneEditorSessionLine = (
  session,
  { lineId, direction } = {},
) => {
  if (!session || (direction !== "up" && direction !== "down")) {
    return session;
  }

  const nextSession = cloneSession(session);
  const currentIndex = findLineIndex(nextSession.lineOrder, lineId);
  if (currentIndex < 0) {
    return session;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= nextSession.lineOrder.length) {
    return session;
  }

  const [movedLineId] = nextSession.lineOrder.splice(currentIndex, 1);
  nextSession.lineOrder.splice(targetIndex, 0, movedLineId);
  nextSession.structureDirty = true;
  nextSession.selectionTarget = {
    lineId,
    direction: undefined,
  };
  return nextSession;
};
