import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { generateId } from "../../internal/id.js";
import {
  areSceneEditorLinesEqual,
  cloneSceneEditorLines,
  ensureSceneEditorDraftSection,
  hasPendingSceneEditorDraftChanges,
  replaceSceneEditorDraftSectionLines,
  setSceneEditorDraftSectionCompositionState,
} from "../../internal/ui/sceneEditorLexical/draftSection.js";
import { createSceneEditorDraftPersistence } from "../../internal/ui/sceneEditorLexical/draftPersistence.js";
import { createEmptyContent } from "../../internal/ui/sceneEditorLexical/contentModel.js";
import {
  findCharacterIdByShortcut,
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
const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another section.";
const MISSING_PROJECT_RESOLUTION_MESSAGE =
  "Project is missing required resolution settings.";
const SHOW_LINE_NUMBERS_CONFIG_KEY = "sceneEditor.showLineNumbers";
const IS_MUTED_CONFIG_KEY = "sceneEditor.isMuted";

const toPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const normalizeTemporaryPresentationState = (detail = {}) => {
  return toPlainObject(detail.presentationState);
};

const requestTemporaryPresentationCanvasRender = (subject) => {
  subject?.dispatch?.("sceneEditor.renderCanvas", {
    skipRender: true,
    skipAnimations: true,
  });
};

const clearTemporaryPresentationPreview = ({ store, subject }) => {
  store.clearTemporaryPresentationState?.();
  requestTemporaryPresentationCanvasRender(subject);
};

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

const resolveDocumentLineControlAction = ({
  repositoryState,
  line,
  fallbackLine,
} = {}) => {
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

const createDocumentDraftLine = ({ lineId, sectionId, controlAction } = {}) => {
  const actions = {
    dialogue: {
      content: createEmptyContent(),
    },
  };

  if (controlAction) {
    actions.control = controlAction;
  }

  return {
    id: lineId || generateId(),
    sectionId,
    actions,
  };
};

const getLiveLinesEditorElementFromPayload = (payload) => {
  const findEditorElement = (node) => {
    if (!node || typeof node.querySelector !== "function") {
      return undefined;
    }

    const wrapper = node.querySelector("rvn-scene-document-editor-lexical");
    const primitive = wrapper?.shadowRoot?.querySelector?.(
      "rvn-lexical-scene-document-editor",
    );

    return primitive || wrapper;
  };

  let current = payload?._event?.currentTarget;
  while (current) {
    const directMatch = findEditorElement(current);
    if (directMatch) {
      return directMatch;
    }

    const root = current.getRootNode?.();
    const rootMatch = findEditorElement(root);
    if (rootMatch) {
      return rootMatch;
    }

    current = root?.host;
  }

  return undefined;
};

const getLiveLinesFromElement = (element) => {
  return (
    element?.getLines?.() || element?.getLinesSnapshot?.() || element?.lines
  );
};

const resolveActionTargetLineId = (store) => {
  return store.selectActionTargetLineId?.() || store.selectSelectedLineId();
};

const finalizeActionTargetLine = (store, lineId) => {
  if (lineId) {
    store.setSelectedLineId({ selectedLineId: lineId });
  }
  store.clearActionTargetLineId?.();
};

const syncDraftSectionFromLines = (deps, liveLines) => {
  const { store } = deps;
  const draftSection = store.selectDraftSection();

  if (!draftSection || !Array.isArray(liveLines) || liveLines.length === 0) {
    return draftSection;
  }

  if (areSceneEditorLinesEqual(draftSection.lines, liveLines)) {
    return draftSection;
  }

  const nextDraftSection = replaceSceneEditorDraftSectionLines(draftSection, {
    lines: liveLines,
    source: "live-editor",
    dirty: true,
  });
  store.setDraftSection({ draftSection: nextDraftSection });
  return nextDraftSection;
};

const syncDraftSectionFromLiveEditor = (deps) => {
  const { refs } = deps;
  const liveLines = getLinesEditorRef(refs)?.getLines?.();
  return syncDraftSectionFromLines(deps, liveLines);
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

const shouldAnimateLineNavigation = (
  store,
  { previousLineId, nextLineId } = {},
) => {
  if (!previousLineId || !nextLineId || previousLineId === nextLineId) {
    return false;
  }

  const scene = store.selectScene();
  const currentSection = scene?.sections?.find(
    (section) => section.id === store.selectSelectedSectionId(),
  );
  const currentLines = Array.isArray(currentSection?.lines)
    ? currentSection.lines
    : [];
  const previousLineIndex = currentLines.findIndex(
    (line) => line.id === previousLineId,
  );
  const nextLineIndex = currentLines.findIndex(
    (line) => line.id === nextLineId,
  );

  if (previousLineIndex < 0 || nextLineIndex < 0) {
    return false;
  }

  return nextLineIndex === previousLineIndex + 1;
};

const dispatchLineNavigationRender = (
  subject,
  store,
  { previousLineId, nextLineId, skipRender = false } = {},
) => {
  if (!nextLineId || previousLineId === nextLineId) {
    return;
  }

  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender,
    syncPresentationState: true,
    skipAnimations: !shouldAnimateLineNavigation(store, {
      previousLineId,
      nextLineId,
    }),
  });
};

const assertSceneEditorCommandResult = (
  result,
  { appService, fallbackMessage = "Failed to save scene changes" } = {},
) => {
  if (result?.valid !== false) {
    return result;
  }

  const message = result?.error?.message || fallbackMessage;
  appService?.showAlert({ message: message, title: "Error" });

  const error = new Error(message);
  error.code = result?.error?.code || "validation_failed";
  error.details = result?.error?.details;
  throw error;
};

const isMissingProjectResolutionError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("project resolution is required") &&
    message.includes("width") &&
    message.includes("height")
  );
};

const reconcileCurrentEditorSession = (deps) => {
  const { store } = deps;
  const sceneId = store.selectSceneId();
  const selectedSectionId = store.selectSelectedSectionId();

  if (!sceneId || !selectedSectionId) {
    store.clearDraftSection();
    return undefined;
  }

  const committedScene = store.selectCommittedScene();
  const committedSection = committedScene?.sections?.find(
    (section) => section.id === selectedSectionId,
  );
  const nextDraftSection = ensureSceneEditorDraftSection({
    draftSection: store.selectDraftSection(),
    sceneId,
    sectionId: selectedSectionId,
    section: committedSection,
    revision: store.selectRepositoryRevision(),
  });
  store.setDraftSection({ draftSection: nextDraftSection });
  return nextDraftSection;
};

const {
  cancelSceneEditorDraftFlush,
  flushSceneEditorDrafts,
  runSceneEditorPersistence,
  scheduleSceneEditorDraftFlush,
} = createSceneEditorDraftPersistence({
  syncDraftSectionFromLines,
  syncDraftSectionFromLiveEditor,
  syncStoreProjectState,
  reconcileCurrentEditorSession,
});

const refreshSceneEditorStateFromProject = async (deps) => {
  const { store, projectService } = deps;
  syncStoreProjectState(store, projectService);
  reconcileCurrentEditorSession(deps);
  await updateSceneEditorSectionChanges(deps);
};

const syncSceneEditorProjectPayload = async (deps, payload = {}) => {
  const { store, render, subject } = deps;
  const hadPendingSessionChanges = hasPendingSceneEditorDraftChanges(
    store.selectDraftSection(),
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
      syncPresentationState: true,
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
  const { projectService, appService, store } = deps;
  store.setScenePageLoading({ isLoading: true });
  const showLineNumbers =
    appService.getUserConfig(SHOW_LINE_NUMBERS_CONFIG_KEY) ?? true;
  const isMuted = appService.getUserConfig(IS_MUTED_CONFIG_KEY) ?? false;
  store.setSceneSettings({
    showLineNumbers,
    isMuted,
  });

  const cleanupRuntimeSubscriptions = mountSceneEditorSubscriptions(deps);
  const projectSubscription = createProjectStateStream({
    projectService,
    emitCurrent: false,
  }).subscribe({
    next: (payload) => {
      void syncSceneEditorProjectPayload(deps, payload).catch(() => {});
    },
  });

  return async () => {
    projectSubscription.unsubscribe();
    cleanupRuntimeSubscriptions();
    await flushSceneEditorDrafts(deps);
    await projectService.clearActiveSceneId().catch(() => {});
    await resetSceneEditorRuntime(deps);
  };
};

export const handleAfterMount = async (deps) => {
  try {
    await initializeSceneEditorPage({
      ...deps,
      syncProjectState: syncStoreProjectState,
    });
    reconcileCurrentEditorSession(deps);
    deps.render();
  } catch (error) {
    if (!isMissingProjectResolutionError(error)) {
      throw error;
    }

    deps.appService?.showAlert({
      message: MISSING_PROJECT_RESOLUTION_MESSAGE,
      title: "Error",
    });
    deps.appService?.navigate("/projects");
  }
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

export const handleSectionsTabsWheel = (deps, payload) => {
  const event = payload._event;
  const container = event.currentTarget;
  const maxScrollLeft = container.scrollWidth - container.clientWidth;

  if (maxScrollLeft <= 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return;
  }

  event.preventDefault();
  container.scrollLeft = Math.max(
    0,
    Math.min(maxScrollLeft, container.scrollLeft + event.deltaY),
  );
};

const openSectionTabDropdown = (deps, event) => {
  const { store, render } = deps;
  const sectionId =
    event.currentTarget?.dataset?.sectionId ||
    event.currentTarget?.id?.replace("sectionTab", "") ||
    "";

  store.showSectionDropdownMenu({
    position: {
      x: event.clientX,
      y: event.clientY,
    },
    sectionId,
  });

  render();
};

export const handleCommandLineSubmit = async (deps, payload) => {
  const { store, render, projectService, subject, appService } = deps;
  const lineId = resolveActionTargetLineId(store);
  if (lineId) {
    store.setSelectedLineId({ selectedLineId: lineId });
  }

  // Handle section/scene transitions
  if (payload._event.detail.sectionTransition) {
    if (!lineId) {
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (sectionTransition)",
      );
    } catch {
      appService?.showAlert({
        message: "Invalid action payload (non-serializable data)",
        title: "Error",
      });
      return;
    }

    await runSceneEditorPersistence(
      deps,
      async () => {
        assertSceneEditorCommandResult(
          await projectService.updateLineActions({
            lineId,
            data: safeDetail,
            replace: false,
          }),
          {
            appService,
            fallbackMessage: "Failed to save section transition",
          },
        );
      },
      {
        label: "section-transition",
        meta: {
          lineId,
        },
      },
    );

    await refreshSceneEditorStateFromProject(deps);
    finalizeActionTargetLine(store, lineId);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  // Handle pushOverlay
  if (payload._event.detail.pushOverlay) {
    if (!lineId) {
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (pushOverlay)",
      );
    } catch {
      appService?.showAlert({
        message: "Invalid action payload (non-serializable data)",
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
        label: "push-overlay",
        meta: {
          lineId,
        },
      },
    );

    await refreshSceneEditorStateFromProject(deps);
    finalizeActionTargetLine(store, lineId);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  // Handle popOverlay
  if (payload._event.detail.popOverlay) {
    if (!lineId) {
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (popOverlay)",
      );
    } catch {
      appService?.showAlert({
        message: "Invalid action payload (non-serializable data)",
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
        label: "pop-overlay",
        meta: {
          lineId,
        },
      },
    );

    await refreshSceneEditorStateFromProject(deps);
    finalizeActionTargetLine(store, lineId);
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

  let submissionData = payload?._event?.detail || {};

  try {
    submissionData = cloneWithDiagnostics(
      submissionData,
      "command line submit detail (general)",
    );
  } catch {
    appService?.showAlert({
      message: "Invalid action payload (non-serializable data)",
      title: "Error",
    });
    return;
  }

  const { dialogue, ...otherActions } = submissionData;
  const preserveDialogueContent =
    dialogue && !Object.hasOwn(dialogue, "content")
      ? ["dialogue.content"]
      : undefined;

  try {
    await runSceneEditorPersistence(
      deps,
      async () => {
        if (dialogue) {
          assertSceneEditorCommandResult(
            await projectService.updateLineDialogueAction({
              lineId,
              dialogue,
              preserve: preserveDialogueContent,
            }),
            {
              appService,
              fallbackMessage: "Failed to save dialogue action",
            },
          );
        }

        if (Object.keys(otherActions).length > 0) {
          assertSceneEditorCommandResult(
            await projectService.updateLineActions({
              lineId,
              data: otherActions,
              replace: false,
            }),
            {
              appService,
              fallbackMessage: "Failed to save line actions",
            },
          );
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
  } catch (error) {
    clearTemporaryPresentationPreview(deps);
    throw error;
  }

  store.clearTemporaryPresentationState?.();
  await refreshSceneEditorStateFromProject(deps);
  finalizeActionTargetLine(store, lineId);
  render();

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleEditorDataChanged = async (deps, payload) => {
  const { subject, store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const nextLines = payload?._event?.detail?.lines;
  if (!Array.isArray(nextLines)) {
    return;
  }
  const changeReason = payload?._event?.detail?.reason || "text";

  const draftSection =
    store.selectDraftSection() || reconcileCurrentEditorSession(deps);
  if (!draftSection) {
    return;
  }

  const nextDraftSection = replaceSceneEditorDraftSectionLines(draftSection, {
    lines: nextLines,
    source: changeReason,
    dirty: true,
  });
  store.setDraftSection({ draftSection: nextDraftSection });
  const selectedLineId =
    payload?._event?.detail?.selectedLineId ||
    store.selectSelectedLineId() ||
    nextLines[0]?.id;
  if (selectedLineId) {
    store.setSelectedLineId({
      selectedLineId,
    });
  }
  deps.render();
  const focusTarget = payload?._event?.detail?.focusTarget;
  if (focusTarget?.lineId) {
    requestAnimationFrame(() => {
      focusLinesEditorLine(deps.refs, focusTarget);
    });
  }
  scheduleSceneEditorDraftFlush(deps, {
    reason: changeReason,
  });

  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    syncPresentationState: true,
    skipAnimations: true,
  });
};

export const handleEditorCompositionStateChanged = (deps, payload) => {
  const { store } = deps;
  const draftSection = store.selectDraftSection();
  if (!draftSection) {
    return;
  }

  const nextDraftSection = setSceneEditorDraftSectionCompositionState(
    draftSection,
    {
      isComposing: payload?._event?.detail?.isComposing === true,
    },
  );
  store.setDraftSection({ draftSection: nextDraftSection });
};

export const handleEditorBlur = async (deps) => {
  const { store } = deps;
  const skipDraftFlush = store.selectSkipNextEditorBlurDraftFlush?.() === true;
  if (skipDraftFlush) {
    store.setSkipNextEditorBlurDraftFlush({ value: false });
  }

  setTimeout(() => {
    deps.render();

    if (skipDraftFlush) {
      return;
    }

    Promise.resolve(
      scheduleSceneEditorDraftFlush(deps, { immediate: true }),
    ).catch(() => {});
  }, 0);
};

export const handleSelectedLineChanged = (deps, payload) => {
  const { store, render, subject } = deps;
  const detail = payload?._event?.detail || {};
  const lineId = detail.lineId;
  if (!lineId || lineId === store.selectSelectedLineId()) {
    return;
  }

  const previousLineId = store.selectSelectedLineId();
  store.setSelectedLineId({ selectedLineId: lineId });

  render();

  dispatchLineNavigationRender(subject, store, {
    previousLineId,
    nextLineId: lineId,
    skipRender: true,
  });
};

export const handleFormatButtonMouseDown = (deps, payload) => {
  payload?._event?.preventDefault?.();
};

export const handlePreviewButtonMouseDown = (deps, payload) => {
  payload?._event?.preventDefault?.();
  deps.store.setSkipNextEditorBlurDraftFlush({ value: true });
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

  const { content: _content, ...updatedDialogue } =
    structuredClone(existingDialogue);

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
        preserve: ["dialogue.content"],
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

  await refreshSceneEditorStateFromProject(deps);
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleAddActionsButtonClick = (deps) => {
  const { refs, render, store } = deps;
  const lineId = store.selectSelectedLineId();
  if (lineId) {
    store.setActionTargetLineId({ lineId });
  }
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

export const handleNewLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  cancelSceneEditorDraftFlush(deps);

  const { store, render, subject, refs, projectService } = deps;
  const detail = payload?._event?.detail || {};
  const draftSection =
    store.selectDraftSection() || reconcileCurrentEditorSession(deps);
  if (!draftSection) {
    return;
  }

  const lines = cloneSceneEditorLines(draftSection.lines);
  const requestedPosition =
    detail.position === "before" || detail.position === "after"
      ? detail.position
      : undefined;
  const selectedLineId = store.selectSelectedLineId();
  const baseLineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : selectedLineId;
  const baseLine = baseLineId
    ? lines.find((line) => line.id === baseLineId)
    : undefined;
  const fallbackLine = selectedLineId
    ? lines.find((line) => line.id === selectedLineId)
    : undefined;
  const controlAction = resolveDocumentLineControlAction({
    repositoryState: projectService.getRepositoryState(),
    line: baseLine,
    fallbackLine,
  });
  const newLine = createDocumentDraftLine({
    sectionId: draftSection.sectionId || baseLine?.sectionId,
    controlAction,
  });
  const baseIndex = baseLineId
    ? lines.findIndex((line) => line.id === baseLineId)
    : -1;

  if (requestedPosition === "before" && baseIndex >= 0) {
    lines.splice(baseIndex, 0, newLine);
  } else if (requestedPosition === "after" && baseIndex >= 0) {
    lines.splice(baseIndex + 1, 0, newLine);
  } else {
    lines.push(newLine);
  }

  const nextDraftSection = replaceSceneEditorDraftSectionLines(draftSection, {
    lines,
    source: "structure",
    dirty: true,
  });
  store.setDraftSection({ draftSection: nextDraftSection });
  store.setSelectedLineId({ selectedLineId: newLine.id });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    syncPresentationState: true,
    skipAnimations: true,
  });

  const focusTarget = {
    lineId: newLine.id,
    cursorPosition: 0,
  };
  requestAnimationFrame(() => {
    focusLinesEditorLine(refs, focusTarget);
    requestAnimationFrame(() => {
      focusLinesEditorLine(refs, focusTarget);
    });
  });

  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

export const handleLineNavigation = (deps, payload) => {
  const { store, refs, render, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const { targetLineId, mode, direction, targetCursorPosition } =
    payload._event.detail;
  const currentLineId = store.selectSelectedLineId();

  // For block mode, just update the selection and handle scrolling
  if (mode === "block") {
    // Check if we're trying to move up from the first line
    if (direction === "up" && currentLineId === targetLineId) {
      dispatchLineNavigationRender(subject, store, {
        previousLineId: currentLineId,
        nextLineId: targetLineId,
      });
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
    dispatchLineNavigationRender(subject, store, {
      previousLineId: currentLineId,
      nextLineId: targetLineId,
    });
    return;
  }

  // For text-editor mode, handle cursor navigation
  const resolvedCurrentLineId = currentLineId || targetLineId;
  let nextLineId = targetLineId;

  if (
    resolvedCurrentLineId &&
    targetLineId &&
    targetLineId !== resolvedCurrentLineId &&
    (direction === "up" || direction === "down" || direction === "end")
  ) {
    nextLineId = resolvedCurrentLineId;
  }

  // Determine next line based on direction if targetLineId is current line
  if (nextLineId === resolvedCurrentLineId) {
    if (direction === "up" || direction === "end") {
      nextLineId = store.selectPreviousLineId({
        lineId: resolvedCurrentLineId,
      });
    } else if (direction === "down") {
      nextLineId = store.selectNextLineId({ lineId: resolvedCurrentLineId });
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
      dispatchLineNavigationRender(subject, store, {
        previousLineId: currentLineId,
        nextLineId,
      });
    });
  } else if (direction === "up" && currentLineId === targetLineId) {
    dispatchLineNavigationRender(subject, store, {
      previousLineId: currentLineId,
      nextLineId: targetLineId,
    });
  }
};

export const handleSwapLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  cancelSceneEditorDraftFlush(deps);

  const { store, render, refs, subject } = deps;
  const detail = payload?._event?.detail || {};
  const direction =
    detail.direction === "up" || detail.direction === "down"
      ? detail.direction
      : undefined;
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();
  const draftSection =
    store.selectDraftSection() || reconcileCurrentEditorSession(deps);

  if (!direction || !lineId || !draftSection) {
    return;
  }

  const lines = cloneSceneEditorLines(draftSection.lines);
  const currentIndex = lines.findIndex((line) => line.id === lineId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= lines.length) {
    return;
  }

  const [movedLine] = lines.splice(currentIndex, 1);
  lines.splice(targetIndex, 0, movedLine);

  const nextDraftSection = replaceSceneEditorDraftSectionLines(draftSection, {
    lines,
    source: "structure",
    dirty: true,
  });
  store.setDraftSection({ draftSection: nextDraftSection });
  store.setSelectedLineId({ selectedLineId: lineId });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    syncPresentationState: true,
    skipAnimations: true,
  });

  requestAnimationFrame(() => {
    scrollLinesEditorLineIntoView(refs, lineId);
    focusLinesEditorContainer(refs);
  });

  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
};

export const handleSectionTabRightClick = (deps, payload) => {
  const { store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();

  openSectionTabDropdown(deps, payload._event);
};

export const handleActionsDialogClose = (deps) => {
  const { render, store, subject } = deps;
  const lineId = store.selectActionTargetLineId?.();
  if (lineId) {
    store.setSelectedLineId({ selectedLineId: lineId });
  }
  store.clearActionTargetLineId?.();
  clearTemporaryPresentationPreview({ store, subject });
  render();
};

export const handleTemporaryPresentationStateChange = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, subject } = deps;
  store.setTemporaryPresentationState?.({
    presentationState: normalizeTemporaryPresentationState(
      payload?._event?.detail,
    ),
  });
  requestTemporaryPresentationCanvasRender(subject);
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
  } else if (action === "edit-section") {
    store.showSectionEditDialog({
      sectionId,
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
          await runSceneEditorPersistence(
            deps,
            async () => {
              await projectService.updateLineDialogueAction({
                lineId: selectedLineId,
                dialogue: {},
                preserve: ["dialogue.content"],
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

      await refreshSceneEditorStateFromProject(deps);

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

export const handleSceneSettingsClick = (deps) => {
  const { store, render } = deps;
  store.showSceneSettingsDialog();
  render();
};

export const handleSceneSettingsDialogClose = (deps) => {
  const { store, render } = deps;
  store.hideSceneSettingsDialog();
  render();
};

export const handleSceneSettingsFormAction = (deps, payload) => {
  const { store, render, appService, refs, subject } = deps;
  const detail = payload._event.detail || {};
  const action = detail.actionId;

  if (action === "cancel") {
    store.hideSceneSettingsDialog();
    render();
    return;
  }

  if (action !== "save") {
    return;
  }

  const previousIsMuted = store.selectIsMuted();
  const showLineNumbers = detail.values?.showLineNumbers ?? true;
  const isMuted = detail.values?.isMuted ?? false;
  store.setSceneSettings({
    showLineNumbers,
    isMuted,
  });
  appService.setUserConfig(SHOW_LINE_NUMBERS_CONFIG_KEY, showLineNumbers);
  appService.setUserConfig(IS_MUTED_CONFIG_KEY, isMuted);
  store.hideSceneSettingsDialog();
  render();

  requestAnimationFrame(() => {
    refs.linesEditor?.hardRefresh?.();
  });

  if (previousIsMuted !== isMuted) {
    subject.dispatch("sceneEditor.renderCanvas", {});
  }
};

export const handleSectionCreateFormActionClick = async (deps, payload) => {
  const { store, render, projectService } = deps;
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
    const sectionCreateDialog = store.getState().sectionCreateDialog || {};
    const isEditMode = sectionCreateDialog.mode === "edit";
    const sectionId = sectionCreateDialog.sectionId;
    const sceneId = store.selectSceneId();

    store.hideSectionCreateDialog();
    if (isEditMode) {
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
            label: "edit-section",
            meta: {
              sceneId,
              sectionId,
            },
          },
        );

        syncStoreProjectState(store, projectService);
        reconcileCurrentEditorSession(deps);
      }

      render();
      return;
    }

    if (nextSectionName) {
      await createSceneEditorSectionWithName(
        deps,
        nextSectionName,
        syncStoreProjectState,
        {
          inheritPresentationFromSelectedLine:
            values.inheritPresentationFromSelectedLine ?? true,
        },
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

export const handlePreviewClick = (deps, payload) => {
  const openPreview = async () => {
    const { store, render, appService, projectService } = deps;
    let didPersistDraft = false;

    try {
      const sceneId = store.selectSceneId();
      const sectionId = store.selectSelectedSectionId();
      const lineId = store.selectSelectedLineId();
      const liveLinesEditorElement =
        getLiveLinesEditorElementFromPayload(payload) ||
        getLinesEditorRef(deps.refs);
      const liveLines = cloneSceneEditorLines(
        getLiveLinesFromElement(liveLinesEditorElement),
      );

      await flushSceneEditorDrafts(deps, {
        liveLines,
        showErrorAlert: false,
      });
      syncStoreProjectState(store, projectService);
      didPersistDraft = true;
      store.setSkipNextEditorBlurDraftFlush({ value: true });
      appService?.blurActiveElement?.();
      store.showPreviewSceneId({ sceneId, sectionId, lineId });
      store.setSkipNextEditorBlurDraftFlush({ value: false });
      render();
    } catch {
      store.setSkipNextEditorBlurDraftFlush({ value: false });
      appService?.showAlert({
        message: didPersistDraft
          ? "Failed to open preview"
          : "Failed to save scene changes before preview",
        title: "Error",
      });
    }
  };

  void openPreview();
};

export const handleFormatButtonClick = (deps, payload) => {
  const format = payload?._event?.currentTarget?.dataset?.format;
  if (!format) {
    return;
  }

  cancelSceneEditorDraftFlush(deps);
  deps.refs.linesEditor?.applyTextFormat?.({ format });
  const liveLinesEditorElement = getLiveLinesEditorElementFromPayload(payload);
  queueMicrotask(() => {
    syncDraftSectionFromLines(
      deps,
      getLiveLinesFromElement(liveLinesEditorElement),
    );
  });
};

export const handlePreviewShortcut = (deps, payload) => {
  handlePreviewClick(deps, payload);
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

  if (lines.length <= 1) {
    return;
  }

  const draftSection =
    store.selectDraftSection() || reconcileCurrentEditorSession(deps);
  if (!draftSection) {
    return;
  }

  const nextLines = cloneSceneEditorLines(draftSection.lines).filter(
    (line) => line.id !== lineId,
  );
  const nextDraftSection = replaceSceneEditorDraftSectionLines(draftSection, {
    lines: nextLines,
    source: "structure",
    dirty: true,
  });

  store.setDraftSection({ draftSection: nextDraftSection });
  store.setSelectedLineId({ selectedLineId: nextSelectedLineId });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    syncPresentationState: true,
    skipAnimations: true,
  });

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
  await refreshSceneEditorStateFromProject(deps);
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
  await refreshSceneEditorStateFromProject(deps);
  // Trigger re-render
  render();

  subject.dispatch("sceneEditor.renderCanvas", {});
};
