import { concatMap, filter, from } from "rxjs";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import {
  applySceneEditorSessionTextChange,
  deleteSceneEditorSessionLine,
  getSceneEditorSessionDirtyLines,
  hasSceneEditorSessionPendingChanges,
  reconcileSceneEditorSession,
  setSceneEditorSessionCompositionState,
} from "../../internal/ui/sceneEditor/editorSession.js";
import {
  findCharacterIdByShortcut,
  handleMergeLinesOperation,
  handleNewLineOperation,
  handlePasteLinesOperation,
  handleSplitLineOperation,
  handleSwapLineOperation,
  syncSceneEditorProjectState as syncStoreProjectState,
} from "../../internal/ui/sceneEditor/lineOperations.js";
import {
  cloneWithDiagnostics,
  initializeSceneEditorPage,
  mountSceneEditorSubscriptions,
  renderSceneEditorState,
  resetSceneEditorRuntime,
  restoreSceneEditorFromPreview,
  updateSceneEditorSectionChanges,
} from "../../internal/ui/sceneEditor/runtime.js";
import {
  createSceneEditorSectionWithName,
  isSectionsOverviewOpen,
  reconcileSceneEditorSelection,
  selectSceneEditorSection,
} from "../../internal/ui/sceneEditor/sectionOperations.js";
import {
  enqueueLatestSceneEditorPersistence,
  enqueueSceneEditorPersistence,
} from "../../internal/ui/sceneEditor/persistenceQueue.js";

const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another section.";
const TEXT_DRAFT_SAVE_DEBOUNCE_MS = 300;
const STRUCTURE_DRAFT_SAVE_DEBOUNCE_MS = 900;
const DRAFT_SAVE_MIN_INTERVAL_MS = 1000;
const DRAFT_SAVE_MAX_INTERVAL_MS = 3000;
const nowMs = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

const getLinesEditorRef = (refs) => {
  return refs?.linesEditor;
};

const focusLinesEditorLine = (refs, payload = {}) => {
  const linesEditorRef = getLinesEditorRef(refs);
  if (!linesEditorRef) {
    return;
  }

  linesEditorRef.focusLine(payload);
};

const scrollLinesEditorLineIntoView = (refs, lineId) => {
  const linesEditorRef = getLinesEditorRef(refs);
  if (!linesEditorRef || !lineId) {
    return;
  }

  linesEditorRef.scrollLineIntoView({ lineId });
};

const focusLinesEditorContainer = (refs) => {
  const linesEditorRef = getLinesEditorRef(refs);
  if (!linesEditorRef?.focusContainer) {
    return;
  }

  linesEditorRef.focusContainer();
  requestAnimationFrame(() => {
    linesEditorRef.focusContainer();
  });
};

const clearScheduledDraftFlush = (store) => {
  const timerId = store.selectDraftSaveTimerId();
  if (timerId !== undefined) {
    clearTimeout(timerId);
    store.clearDraftSaveTimer();
  }
};

const cancelSceneEditorDraftFlush = (deps) => {
  clearScheduledDraftFlush(deps.store);
};

const getDraftSaveDelayMs = (store, { reason = "text" } = {}) => {
  const debounceMs =
    reason === "structure"
      ? STRUCTURE_DRAFT_SAVE_DEBOUNCE_MS
      : TEXT_DRAFT_SAVE_DEBOUNCE_MS;
  const lastFlushStartedAt = store.selectLastDraftFlushStartedAt();
  const pendingSinceAt = store.selectDraftSavePendingSinceAt();
  const remainingThrottleMs =
    lastFlushStartedAt > 0
      ? Math.max(0, DRAFT_SAVE_MIN_INTERVAL_MS - (nowMs() - lastFlushStartedAt))
      : 0;
  const remainingMaxWaitMs =
    pendingSinceAt > 0
      ? Math.max(0, DRAFT_SAVE_MAX_INTERVAL_MS - (nowMs() - pendingSinceAt))
      : Number.POSITIVE_INFINITY;

  return Math.min(
    Math.max(debounceMs, remainingThrottleMs),
    remainingMaxWaitMs,
  );
};

const runSceneEditorPersistence = (deps, task, options = {}) => {
  return enqueueSceneEditorPersistence({
    owner: deps.projectService,
    task,
    ...options,
  });
};

const reconcileCurrentEditorSession = (deps) => {
  const { store } = deps;
  const sceneId = store.selectSceneId();
  const selectedSectionId = store.selectSelectedSectionId();

  if (!sceneId || !selectedSectionId) {
    store.clearEditorSession();
    return undefined;
  }

  const committedScene = store.selectCommittedScene();
  const committedSection = committedScene?.sections?.find(
    (section) => section.id === selectedSectionId,
  );
  const nextSession = reconcileSceneEditorSession({
    session: store.selectEditorSession(),
    sceneId,
    sectionId: selectedSectionId,
    section: committedSection,
    revision: store.selectRepositoryRevision(),
  });
  store.setEditorSession({ editorSession: nextSession });
  return nextSession;
};

const processSplitLineRequest = async (deps, detail = {}) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }

  cancelSceneEditorDraftFlush(deps);
  await handleSplitLineOperation(deps, {
    _event: {
      detail,
    },
  });
  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

const processMergeLinesRequest = async (deps, detail = {}) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }

  cancelSceneEditorDraftFlush(deps);
  await handleMergeLinesOperation(deps, {
    _event: {
      detail,
    },
  });
  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

const mountSceneEditorShortcutSubscriptions = (deps) => {
  const { subject } = deps;

  const streams = [
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.requestSplitLine"),
      concatMap(({ payload }) =>
        from(processSplitLineRequest(deps, payload).catch(() => {})),
      ),
    ),
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.requestMergeLines"),
      concatMap(({ payload }) =>
        from(processMergeLinesRequest(deps, payload).catch(() => {})),
      ),
    ),
  ];

  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const flushSceneEditorDrafts = async (deps) => {
  const { store } = deps;
  clearScheduledDraftFlush(store);

  if (!hasSceneEditorSessionPendingChanges(store.selectEditorSession())) {
    store.setDraftSavePendingSinceAt({ timestamp: 0 });
    return;
  }

  return enqueueLatestSceneEditorPersistence({
    owner: deps.projectService,
    key: "draft-flush",
    task: async () => {
      const session = store.selectEditorSession();
      const dirtyLines = getSceneEditorSessionDirtyLines(session);
      const snapshotLines = (session?.lineOrder || [])
        .map((lineId) => session?.linesById?.[lineId]?.line)
        .filter(Boolean)
        .map((line) => structuredClone(line));
      if (snapshotLines.length === 0 && dirtyLines.length === 0) {
        return;
      }

      const flushStartedAt = nowMs();
      store.setLastDraftFlushStartedAt({
        timestamp: flushStartedAt,
      });
      store.setDraftSavePendingSinceAt({ timestamp: 0 });

      try {
        await deps.projectService.syncSectionLinesSnapshot({
          sectionId: session?.sectionId,
          lines: snapshotLines,
        });
      } catch (error) {
        console.error("[sceneEditor] Failed to save scene changes", {
          error,
          sceneId: session?.sceneId,
          sectionId: session?.sectionId,
          revision: store.selectRepositoryRevision(),
          dirtyLineIds: dirtyLines.map(({ lineId }) => lineId),
        });
        deps.appService?.showToast("Failed to save scene changes", {
          title: "Error",
        });
        throw error;
      }
    },
  });
};

const scheduleSceneEditorDraftFlush = (
  deps,
  { immediate = false, reason = "text" } = {},
) => {
  const { store } = deps;
  clearScheduledDraftFlush(store);

  const session = store.selectEditorSession();
  if (!hasSceneEditorSessionPendingChanges(session)) {
    store.setDraftSavePendingSinceAt({ timestamp: 0 });
    return;
  }

  if (store.selectDraftSavePendingSinceAt() <= 0) {
    store.setDraftSavePendingSinceAt({
      timestamp: nowMs(),
    });
  }

  if (immediate) {
    return flushSceneEditorDrafts(deps);
  }

  const delayMs = getDraftSaveDelayMs(store, { reason });
  const timerId = setTimeout(() => {
    void flushSceneEditorDrafts(deps).catch(() => {});
  }, delayMs);
  store.setDraftSaveTimerId({ timerId });
};

const syncSceneEditorProjectPayload = async (deps, payload = {}) => {
  const { store, render, subject } = deps;
  const hadPendingSessionChanges = hasSceneEditorSessionPendingChanges(
    store.selectEditorSession(),
  );
  const { repositoryState, domainState, revision } = payload;

  store.setRepositoryState({ repository: repositoryState });
  store.setDomainState({ domainState });
  store.setRepositoryRevision({ revision });

  if (!store.selectSceneId()) {
    return;
  }

  reconcileCurrentEditorSession(deps);
  reconcileSceneEditorSelection(store);
  await updateSceneEditorSectionChanges(deps);

  if (hadPendingSessionChanges) {
    subject.dispatch("sceneEditor.renderCanvas", {
      skipRender: true,
      skipAnimations: true,
    });
    return;
  }

  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipAnimations: true,
  });
};

export const handleBeforeMount = (deps) => {
  const { projectService } = deps;
  const cleanupRuntimeSubscriptions = mountSceneEditorSubscriptions(deps);
  const cleanupShortcutSubscriptions =
    mountSceneEditorShortcutSubscriptions(deps);
  const projectSubscription = createProjectStateStream({
    projectService,
  }).subscribe({
    next: (payload) => {
      void syncSceneEditorProjectPayload(deps, payload);
    },
  });

  return async () => {
    projectSubscription.unsubscribe();
    cleanupRuntimeSubscriptions();
    cleanupShortcutSubscriptions();
    await flushSceneEditorDrafts(deps);
    resetSceneEditorRuntime(deps);
  };
};

export const handleAfterMount = async (deps) => {
  await initializeSceneEditorPage({
    ...deps,
    syncProjectState: syncStoreProjectState,
  });
  reconcileCurrentEditorSession(deps);
  deps.render();
};

export const handleDataChanged = async (deps) => {
  const { projectService } = deps;
  await projectService.ensureRepository();
  await syncSceneEditorProjectPayload(deps, {
    repositoryState: projectService.getRepositoryState(),
    domainState: projectService.getDomainState(),
    revision: projectService.getRepositoryRevision(),
  });
};

export const handleSectionTabClick = async (deps, payload) => {
  const { store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionTab", "") ||
    "";
  await flushSceneEditorDrafts(deps);
  await selectSceneEditorSection(deps, sectionId);
  reconcileCurrentEditorSession(deps);
  deps.render();
};

export const handleCommandLineSubmit = async (deps, payload) => {
  const { store, render, projectService, subject, appService } = deps;
  const lineId = store.selectSelectedLineId();

  // Handle section/scene transitions
  if (payload._event.detail.sectionTransition) {
    if (!lineId) {
      console.warn("Section transition requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (sectionTransition)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await runSceneEditorPersistence(
      deps,
      async () => {
        await projectService.updateLineActions({
          lineId,
          data: safeDetail,
          replace: false,
        });
      },
      {
        label: "section-transition",
        meta: {
          lineId,
        },
      },
    );

    syncStoreProjectState(store, projectService);
    reconcileCurrentEditorSession(deps);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  // Handle pushLayeredView
  if (payload._event.detail.pushLayeredView) {
    if (!lineId) {
      console.warn("Push layered view requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (pushLayeredView)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await runSceneEditorPersistence(
      deps,
      async () => {
        await projectService.updateLineActions({
          lineId,
          data: safeDetail,
          replace: false,
        });
      },
      {
        label: "push-layered-view",
        meta: {
          lineId,
        },
      },
    );

    syncStoreProjectState(store, projectService);
    reconcileCurrentEditorSession(deps);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  // Handle popLayeredView
  if (payload._event.detail.popLayeredView) {
    if (!lineId) {
      console.warn("Pop layered view requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (popLayeredView)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await runSceneEditorPersistence(
      deps,
      async () => {
        await projectService.updateLineActions({
          lineId,
          data: safeDetail,
          replace: false,
        });
      },
      {
        label: "pop-layered-view",
        meta: {
          lineId,
        },
      },
    );

    syncStoreProjectState(store, projectService);
    reconcileCurrentEditorSession(deps);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  if (!lineId) {
    return;
  }

  let submissionData = payload._event.detail;

  // Dialogue updates replace the full dialogue action, so keep content here.
  if (submissionData.dialogue) {
    const line = store.selectSelectedLine();
    if (line && line.actions?.dialogue?.content) {
      submissionData = {
        ...submissionData,
        dialogue: {
          content: line.actions.dialogue.content,
          ...submissionData.dialogue,
        },
      };
    }
  }

  try {
    submissionData = cloneWithDiagnostics(
      submissionData,
      "command line submit detail (general)",
    );
  } catch {
    appService?.showToast("Invalid action payload (non-serializable data)", {
      title: "Error",
    });
    return;
  }

  const { dialogue, ...otherActions } = submissionData;

  await runSceneEditorPersistence(
    deps,
    async () => {
      if (dialogue) {
        await projectService.updateLineDialogueAction({
          lineId,
          dialogue,
        });
      }

      if (Object.keys(otherActions).length > 0) {
        await projectService.updateLineActions({
          lineId,
          data: otherActions,
          replace: false,
        });
      }
    },
    {
      label: "command-line-submit",
      meta: {
        lineId,
        hasDialogue: Boolean(dialogue),
        otherActionCount: Object.keys(otherActions).length,
      },
    },
  );

  syncStoreProjectState(store, projectService);
  reconcileCurrentEditorSession(deps);
  render();

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleEditorDataChanged = async (deps, payload) => {
  const { subject, store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const lineId = payload._event.detail.lineId;

  if (!lineId) {
    return;
  }

  const currentSession =
    store.selectEditorSession() || reconcileCurrentEditorSession(deps);
  if (!currentSession?.linesById?.[lineId]) {
    return;
  }

  const nextSession = applySceneEditorSessionTextChange(currentSession, {
    lineId,
    content: payload._event.detail.content,
  });
  store.setEditorSession({ editorSession: nextSession });
  scheduleSceneEditorDraftFlush(deps, {
    reason: "text",
  });

  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    skipAnimations: true,
  });
};

export const handleEditorCompositionStateChanged = (deps, payload) => {
  const { store } = deps;
  const currentSession = store.selectEditorSession();
  if (!currentSession) {
    return;
  }

  const nextSession = setSceneEditorSessionCompositionState(currentSession, {
    isComposing: payload?._event?.detail?.isComposing === true,
  });
  store.setEditorSession({ editorSession: nextSession });
};

export const handleEditorBlur = async (deps) => {
  try {
    await scheduleSceneEditorDraftFlush(deps, { immediate: true });
  } catch {}
};

export const handleDialogueCharacterShortcut = async (deps, payload) => {
  const { store, projectService, render, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const detail = payload?._event?.detail || {};
  const lineId = detail.lineId || store.selectSelectedLineId();
  const shortcut = detail.shortcut;
  if (!lineId || !shortcut) {
    return;
  }

  const currentSection = store
    .selectScene()
    ?.sections?.find(
      (section) => section.id === store.selectSelectedSectionId(),
    );
  const currentLine =
    currentSection?.lines?.find((line) => line.id === lineId) ||
    store.selectSelectedLine();
  const existingDialogue = currentLine?.actions?.dialogue || {};

  const isClearShortcut = String(shortcut) === "0";
  if (isClearShortcut && !existingDialogue.characterId) {
    return;
  }

  let characterId;
  if (!isClearShortcut) {
    const repositoryState = projectService.getRepositoryState();
    characterId = findCharacterIdByShortcut(repositoryState, shortcut);
    if (!characterId) {
      return;
    }
  }

  if (!isClearShortcut && existingDialogue.characterId === characterId) {
    return;
  }

  const updatedDialogue = {
    ...existingDialogue,
  };

  if (isClearShortcut) {
    delete updatedDialogue.characterId;
  } else {
    updatedDialogue.characterId = characterId;
  }

  await runSceneEditorPersistence(
    deps,
    async () => {
      await projectService.updateLineDialogueAction({
        lineId,
        dialogue: updatedDialogue,
      });
    },
    {
      label: "dialogue-character-shortcut",
      meta: {
        lineId,
        shortcut,
      },
    },
  );

  syncStoreProjectState(store, projectService);
  reconcileCurrentEditorSession(deps);
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleAddActionsButtonClick = (deps) => {
  const { refs, render } = deps;
  refs.systemActions?.transformedHandlers?.open?.({
    mode: "actions",
  });
  render();
};

export const handleSectionAddClick = (deps) => {
  const { store, render } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const scene = store.selectScene();
  const sectionCount = scene?.sections?.length || 0;
  const defaultName = `Section ${sectionCount + 1}`;
  store.showSectionCreateDialog({ defaultName });
  render();
};

export const handleSectionsOverviewClick = (deps, payload) => {
  const { store, render, appService } = deps;
  if (payload?._event) {
    payload._event.preventDefault();
  }

  appService.blurActiveElement();

  store.hideDeadEndTooltip();
  store.openSectionsOverviewPanel();
  render();
};

export const handleSectionsOverviewClose = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  store.closeSectionsOverviewPanel();
  render();
};

export const handleSectionsOverviewWarningMouseEnter = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showDeadEndTooltip({
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    content: DEAD_END_TOOLTIP_CONTENT,
  });
  render();
};

export const handleSectionsOverviewWarningMouseLeave = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  render();
};

export const handleSectionsOverviewRowClick = async (deps, payload) => {
  const { store } = deps;
  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionOverviewRow", "") ||
    "";

  if (!sectionId) {
    return;
  }

  store.closeSectionsOverviewPanel();
  await flushSceneEditorDrafts(deps);
  await selectSceneEditorSection(deps, sectionId);
  reconcileCurrentEditorSession(deps);
  deps.render();
};

export const handleSplitLine = async (deps, payload) => {
  deps.subject.dispatch(
    "sceneEditor.requestSplitLine",
    payload?._event?.detail || {},
  );
};

export const handlePasteLines = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  cancelSceneEditorDraftFlush(deps);
  await handlePasteLinesOperation(deps, payload);
  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

export const handleNewLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  cancelSceneEditorDraftFlush(deps);
  await handleNewLineOperation(deps, payload);
  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

export const handleLineNavigation = (deps, payload) => {
  const { store, refs, render, subject, graphicsService } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const { targetLineId, mode, direction, targetCursorPosition } =
    payload._event.detail;

  // For block mode, just update the selection and handle scrolling
  if (mode === "block") {
    const currentLineId = store.selectSelectedLineId();

    // Check if we're trying to move up from the first line
    if (direction === "up" && currentLineId === targetLineId) {
      // First line - show animation effects
      graphicsService.render({
        elements: [],
        animations: [],
      });
      subject.dispatch("sceneEditor.renderCanvas", {});
      return;
    }

    store.setSelectedLineId({ selectedLineId: targetLineId });
    render();

    if (targetLineId) {
      requestAnimationFrame(() => {
        scrollLinesEditorLineIntoView(refs, targetLineId);
      });
    }

    // Trigger debounced canvas render
    subject.dispatch("sceneEditor.renderCanvas", {});
    return;
  }

  // For text-editor mode, handle cursor navigation
  const currentLineId = store.selectSelectedLineId();
  let nextLineId = targetLineId;

  // Determine next line based on direction if targetLineId is current line
  if (targetLineId === currentLineId) {
    if (direction === "up" || direction === "end") {
      nextLineId = store.selectPreviousLineId({ lineId: currentLineId });
    } else if (direction === "down") {
      nextLineId = store.selectNextLineId({ lineId: currentLineId });
    }
  }

  // Handle navigation to different line
  if (nextLineId && nextLineId !== currentLineId) {
    const linesEditorRef = getLinesEditorRef(refs);

    // Update selectedLineId through the store
    store.setSelectedLineId({ selectedLineId: nextLineId });
    render();

    requestAnimationFrame(() => {
      if (linesEditorRef) {
        const isEndNavigation = targetCursorPosition === -1;
        focusLinesEditorLine(refs, {
          lineId: nextLineId,
          cursorPosition: isEndNavigation
            ? Number.MAX_SAFE_INTEGER
            : targetCursorPosition,
          goalColumn: isEndNavigation
            ? Number.MAX_SAFE_INTEGER
            : targetCursorPosition,
          direction: direction ?? undefined,
        });
      }

      // Trigger debounced canvas render
      subject.dispatch("sceneEditor.renderCanvas", {});
    });
  } else if (direction === "up" && currentLineId === targetLineId) {
    // First line - show animation effects
    graphicsService.render({
      elements: [],
      animations: [],
    });
    render();
    subject.dispatch("sceneEditor.renderCanvas", {});
  }
};

export const handleSwapLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  cancelSceneEditorDraftFlush(deps);
  await handleSwapLineOperation(deps, payload);
  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

export const handleMergeLines = async (deps, payload) => {
  deps.subject.dispatch(
    "sceneEditor.requestMergeLines",
    payload?._event?.detail || {},
  );
};

export const handleSectionTabRightClick = (deps, payload) => {
  const { store, render } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  payload._event.preventDefault(); // Prevent default browser context menu

  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionTab", "") ||
    "";

  store.showSectionDropdownMenu({
    position: {
      x: payload._event.clientX,
      y: payload._event.clientY,
    },
    sectionId,
  });

  render();
};

export const handleActionsDialogClose = (deps) => {
  const { render } = deps;
  render();
};

export const handleDropdownMenuClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, subject } = deps;
  const item = payload._event.detail.item || payload._event.detail;
  const action = item?.value;
  const dropdownState = store.getState().dropdownMenu;
  const sectionId = dropdownState.sectionId;
  const actionsType = dropdownState.actionsType;
  const sceneId = store.selectSceneId();

  // Store position before hiding dropdown (for rename popover)
  const position = dropdownState.position;

  store.hideDropdownMenu();

  if (typeof action === "string" && action.startsWith("go-to-section:")) {
    const nextSectionId = action.replace("go-to-section:", "");
    if (nextSectionId) {
      await flushSceneEditorDrafts(deps);
      await selectSceneEditorSection(deps, nextSectionId);
      reconcileCurrentEditorSession(deps);
      render();
      return;
    }
  }

  if (action === "delete-section") {
    await flushSceneEditorDrafts(deps);
    await runSceneEditorPersistence(
      deps,
      async () => {
        await projectService.deleteSectionItem({
          sceneId,
          sectionIds: [sectionId],
        });
      },
      {
        label: "delete-section",
        meta: {
          sceneId,
          sectionId,
        },
      },
    );

    // Update store with new repository state
    syncStoreProjectState(store, projectService);
    reconcileCurrentEditorSession(deps);

    // Update scene data and select first remaining section
    const newScene = store.selectScene();
    if (newScene && newScene.sections.length > 0) {
      store.setSelectedSectionId({
        selectedSectionId: newScene.sections[0].id,
      });
    }
    reconcileCurrentEditorSession(deps);
  } else if (action === "rename-section") {
    // Show rename popover using the stored position
    store.showPopover({
      position,
      sectionId,
      mode: "rename-section",
      defaultName: "",
    });
  } else if (action === "delete-actions") {
    const selectedLineId = store.selectSelectedLineId();
    const selectedSectionId = store.selectSelectedSectionId();
    const selectedLine = store.selectSelectedLine();

    if (actionsType && selectedLineId && selectedSectionId) {
      // Special handling for dialogue - keep content, remove only layoutId and characterId
      if (actionsType === "dialogue") {
        const currentDialogue = selectedLine?.actions?.dialogue;
        if (currentDialogue) {
          // Keep content if it exists, remove layoutId and characterId
          const updatedDialogue = {
            content: currentDialogue.content,
          };

          await runSceneEditorPersistence(
            deps,
            async () => {
              await projectService.updateLineDialogueAction({
                lineId: selectedLineId,
                dialogue: updatedDialogue,
              });
            },
            {
              label: "delete-dialogue-action",
              meta: {
                lineId: selectedLineId,
              },
            },
          );
        }
      } else {
        const currentActions = selectedLine?.actions || {};
        const nextActions = structuredClone(currentActions);
        delete nextActions[actionsType];

        await runSceneEditorPersistence(
          deps,
          async () => {
            await projectService.updateLineActions({
              lineId: selectedLineId,
              data: nextActions,
              replace: true,
            });
          },
          {
            label: "delete-line-action",
            meta: {
              lineId: selectedLineId,
              actionType: actionsType,
            },
          },
        );
      }

      syncStoreProjectState(store, projectService);
      reconcileCurrentEditorSession(deps);

      // Trigger re-render to update the view
      subject.dispatch("sceneEditor.renderCanvas", {});
    }
  }

  render();
};

export const handlePopoverClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleSectionCreateDialogClose = (deps) => {
  const { store, render } = deps;
  store.hideSectionCreateDialog();
  render();
};

export const handleSectionCreateFormActionClick = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const action = detail.actionId;
  const values = detail.values || {};
  const nextSectionName = String(values.name || "").trim();

  if (action === "cancel") {
    store.hideSectionCreateDialog();
    render();
    return;
  }

  if (action === "submit") {
    store.hideSectionCreateDialog();
    if (nextSectionName) {
      await createSceneEditorSectionWithName(
        deps,
        nextSectionName,
        syncStoreProjectState,
      );
      reconcileCurrentEditorSession(deps);
      render();
      return;
    }
  }

  render();
};

export const handleFormActionClick = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload._event.detail;

  const action = detail.actionId;
  const values = detail.values;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    const popoverState = store.getState().popover || {};
    const sectionId = popoverState.sectionId;
    const popoverMode = popoverState.mode;
    const sceneId = store.selectSceneId();
    const nextSectionName = String(values?.name || "").trim();

    // Hide popover
    store.hidePopover();

    if (popoverMode === "create-section" && nextSectionName && sceneId) {
      await createSceneEditorSectionWithName(
        deps,
        nextSectionName,
        syncStoreProjectState,
      );
      reconcileCurrentEditorSession(deps);
      render();
      return;
    }

    if (sectionId && nextSectionName && sceneId) {
      await runSceneEditorPersistence(
        deps,
        async () => {
          await projectService.renameSectionItem({
            sceneId,
            sectionId,
            name: nextSectionName,
          });
        },
        {
          label: "rename-section",
          meta: {
            sceneId,
            sectionId,
          },
        },
      );

      // Update store with new repository state
      syncStoreProjectState(store, projectService);
      reconcileCurrentEditorSession(deps);
    }

    render();
  }
};

export const handleToggleSectionsGraphView = (deps) => {
  const { store, render } = deps;
  store.toggleSectionsGraphView();
  render();
};

export const handlePreviewClick = (deps) => {
  const openPreview = async () => {
    const { store, render, appService } = deps;
    const sceneId = store.selectSceneId();
    const sectionId = store.selectSelectedSectionId();
    const lineId = store.selectSelectedLineId();
    await flushSceneEditorDrafts(deps);
    appService.blurActiveElement();
    store.showPreviewSceneId({ sceneId, sectionId, lineId });
    render();
  };

  void openPreview();
};

export const handlePreviewShortcut = (deps) => {
  handlePreviewClick(deps);
};

export const handleDeleteLineShortcut = async (deps, payload) => {
  const { store, render } = deps;
  const { subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }
  cancelSceneEditorDraftFlush(deps);

  const detail = payload?._event?.detail || {};
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();
  const sectionId = store.selectSelectedSectionId();

  if (!lineId || !sectionId) {
    return;
  }

  const scene = store.selectScene();
  const section = scene?.sections?.find((item) => item.id === sectionId);
  const lines = Array.isArray(section?.lines) ? section.lines : [];
  const currentIndex = lines.findIndex((line) => line.id === lineId);
  if (currentIndex < 0) {
    return;
  }

  const nextSelectedLineId =
    lines[currentIndex + 1]?.id || lines[currentIndex - 1]?.id;

  const nextSession = deleteSceneEditorSessionLine(
    store.selectEditorSession(),
    {
      lineId,
      nextSelectedLineId,
    },
  );
  const sessionForStore = nextSession
    ? {
        ...nextSession,
        selectionTarget: undefined,
      }
    : nextSession;
  store.setEditorSession({ editorSession: sessionForStore });
  store.setSelectedLineId({ selectedLineId: nextSelectedLineId });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});

  if (nextSelectedLineId) {
    focusLinesEditorContainer(deps.refs);
    requestAnimationFrame(() => {
      scrollLinesEditorLineIntoView(deps.refs, nextSelectedLineId);
      focusLinesEditorContainer(deps.refs);
    });
  } else {
    focusLinesEditorContainer(deps.refs);
  }
  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

export const handleLineDeleteActionItem = async (deps, payload) => {
  const { store, subject, render, projectService } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine || !selectedLine.actions) {
    return;
  }
  // Create a new actions object without the action to delete
  const newActions = { ...selectedLine.actions };
  if (newActions.hasOwnProperty(actionType)) {
    if (actionType === "dialogue") {
      newActions[actionType] = {
        content: newActions[actionType].content,
      };
    } else {
      delete newActions[actionType];
    }
  }
  await runSceneEditorPersistence(
    deps,
    async () => {
      await projectService.updateLineActions({
        lineId: selectedLine.id,
        data: newActions,
        replace: true,
      });
    },
    {
      label: "line-delete-action-item",
      meta: {
        lineId: selectedLine.id,
        actionType,
      },
    },
  );
  // Update store with new repository state
  syncStoreProjectState(store, projectService);
  reconcileCurrentEditorSession(deps);
  // Trigger re-render
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleHidePreviewScene = async (deps) => {
  await restoreSceneEditorFromPreview(deps);
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  await flushSceneEditorDrafts(deps);
  const { p } = appService.getPayload();
  appService.navigate("/project/scenes", { p });
};

export const handleSystemActionsActionDelete = async (deps, payload) => {
  const { store, render, projectService, subject } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine) {
    return;
  }
  // Create a new actions object with the action cleared
  // For inherited actions (visual, character, background), we set a "clear" value
  // to override inherited state. For non-inherited actions, we delete the key.
  const newActions = structuredClone(selectedLine.actions || {});
  if (actionType === "dialogue") {
    newActions.dialogue = { clear: true };
  } else if (actionType === "visual") {
    // Clear visual by setting empty items array
    newActions.visual = { items: [] };
  } else if (actionType === "character") {
    // Clear characters by setting empty items array
    newActions.character = { items: [] };
  } else if (actionType === "background") {
    // Clear background by setting without resourceId
    newActions.background = {};
  } else if (actionType === "bgm") {
    // Clear inherited BGM by writing an explicit empty action
    newActions.bgm = {};
  } else if (actionType === "control") {
    newActions.control = {};
  } else {
    // For non-inherited actions, delete as before
    delete newActions[actionType];
  }
  await runSceneEditorPersistence(
    deps,
    async () => {
      await projectService.updateLineActions({
        lineId: selectedLine.id,
        data: newActions,
        replace: true,
      });
    },
    {
      label: "system-action-delete",
      meta: {
        lineId: selectedLine.id,
        actionType,
      },
    },
  );
  // Update store with new repository state
  syncStoreProjectState(store, projectService);
  reconcileCurrentEditorSession(deps);
  // Trigger re-render
  render();

  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleMuteToggle = (deps) => {
  const { store, render, subject } = deps;
  store.toggleMute();
  render();
  // Re-render canvas with new mute state
  subject.dispatch("sceneEditor.renderCanvas", {});
};
