import { filter, fromEvent, tap } from "rxjs";
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
  createActionItemWithInlineTransform,
  createBackgroundWithInlineTransform,
  normalizeBackgroundTransformEditorTransform,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  createSceneEditorSectionWithName,
  isSectionsOverviewOpen,
  reconcileSceneEditorSelection,
  scrollSceneEditorSectionTabIntoView,
  selectSceneEditorSection,
} from "../../internal/ui/sceneEditor/sectionOperations.js";
const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another section.";
const MISSING_PROJECT_RESOLUTION_MESSAGE =
  "Project is missing required resolution settings.";
const SHOW_LINE_NUMBERS_CONFIG_KEY = "sceneEditor.showLineNumbers";
const IS_MUTED_CONFIG_KEY = "sceneEditor.isMuted";
const FONT_SIZE_CONFIG_KEY = "sceneEditor.fontSize";
const SCENE_EDITOR_FONT_SIZES = new Set(["xs", "sm", "md", "lg", "xl"]);
const BACKGROUND_TRANSFORM_RESIZE_TARGET_PREFIX = "selected-border-resize-";
const MIN_BACKGROUND_TRANSFORM_SCALE = 0.01;
const BACKGROUND_TRANSFORM_KEYBOARD_NUDGE = 1;
const BACKGROUND_TRANSFORM_KEYBOARD_LARGE_NUDGE = 10;
const SCENE_EDITOR_SELECTION_URL_SYNC_THROTTLE_MS = 250;

const normalizeSceneEditorFontSize = (fontSize) =>
  SCENE_EDITOR_FONT_SIZES.has(fontSize) ? fontSize : "md";

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

const flattenRefs = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRefs(item));
  }

  if (typeof value === "object") {
    return [value];
  }

  return [];
};

const getRefElements = (refs) => {
  return Object.values(refs || {}).flatMap((value) => flattenRefs(value));
};

const isLinesEditorRef = (element) => {
  return !!(
    element?.focusLine ||
    element?.scrollLineIntoView ||
    element?.focusContainer ||
    element?.getLines ||
    element?.getLinesSnapshot
  );
};

const getLinesEditorRef = (refs, { sectionId, lineId } = {}) => {
  const refElements = getRefElements(refs).filter(isLinesEditorRef);

  if (sectionId) {
    const sectionEditor = refElements.find(
      (element) => element?.dataset?.sectionId === sectionId,
    );
    if (sectionEditor) {
      return sectionEditor;
    }
  }

  if (lineId) {
    const lineEditor = refElements.find((element) => {
      const editorLines =
        element?.getLines?.() ||
        element?.getLinesSnapshot?.() ||
        element?.lines;
      return Array.isArray(editorLines)
        ? editorLines.some((line) => line?.id === lineId)
        : false;
    });
    if (lineEditor) {
      return lineEditor;
    }
  }

  return refs?.linesEditor || refElements[0];
};

const forEachLinesEditorRef = (refs, callback) => {
  getRefElements(refs).filter(isLinesEditorRef).forEach(callback);
};

const getSectionIdFromPayload = (payload) => {
  const event = payload?._event;
  return (
    event?.currentTarget?.dataset?.sectionId ||
    event?.target?.closest?.("[data-section-id]")?.dataset?.sectionId ||
    undefined
  );
};

const findSectionIdForLine = (store, lineId) => {
  if (!lineId) {
    return undefined;
  }

  const scene = store.selectScene?.();
  return scene?.sections?.find((section) =>
    section.lines?.some((line) => line.id === lineId),
  )?.id;
};

const findNextSectionFirstLineTarget = (store, { sectionId, lineId } = {}) => {
  if (!sectionId || !lineId) {
    return undefined;
  }

  const scene = store.selectScene?.();
  const sections = Array.isArray(scene?.sections) ? scene.sections : [];
  const sectionIndex = sections.findIndex(
    (section) => section.id === sectionId,
  );
  if (sectionIndex < 0) {
    return undefined;
  }

  const currentLines = Array.isArray(sections[sectionIndex]?.lines)
    ? sections[sectionIndex].lines
    : [];
  const lineIndex = currentLines.findIndex((line) => line.id === lineId);
  if (lineIndex < 0 || lineIndex < currentLines.length - 1) {
    return undefined;
  }

  for (const nextSection of sections.slice(sectionIndex + 1)) {
    const firstLine = Array.isArray(nextSection?.lines)
      ? nextSection.lines[0]
      : undefined;
    if (nextSection?.id && firstLine?.id) {
      return {
        sectionId: nextSection.id,
        lineId: firstLine.id,
      };
    }
  }

  return undefined;
};

const findPreviousSectionLastLineTarget = (
  store,
  { sectionId, lineId } = {},
) => {
  if (!sectionId || !lineId) {
    return undefined;
  }

  const scene = store.selectScene?.();
  const sections = Array.isArray(scene?.sections) ? scene.sections : [];
  const sectionIndex = sections.findIndex(
    (section) => section.id === sectionId,
  );
  if (sectionIndex < 0) {
    return undefined;
  }

  const currentLines = Array.isArray(sections[sectionIndex]?.lines)
    ? sections[sectionIndex].lines
    : [];
  const lineIndex = currentLines.findIndex((line) => line.id === lineId);
  if (lineIndex !== 0) {
    return undefined;
  }

  for (let index = sectionIndex - 1; index >= 0; index -= 1) {
    const previousSection = sections[index];
    const previousLines = Array.isArray(previousSection?.lines)
      ? previousSection.lines
      : [];
    const lastLine = previousLines[previousLines.length - 1];
    if (previousSection?.id && lastLine?.id) {
      return {
        sectionId: previousSection.id,
        lineId: lastLine.id,
      };
    }
  }

  return undefined;
};

const selectEditorTarget = (
  deps,
  { sectionId, lineId, payloadThrottleMs } = {},
) => {
  const { appService, store } = deps;
  const nextSectionId = sectionId || findSectionIdForLine(store, lineId);

  if (nextSectionId && nextSectionId !== store.selectSelectedSectionId?.()) {
    store.setSelectedSectionId?.({ selectedSectionId: nextSectionId });
  }

  if (lineId) {
    store.setSelectedLineId?.({ selectedLineId: lineId });
  }

  if (
    appService?.getPayload &&
    appService?.setPayload &&
    (nextSectionId || lineId)
  ) {
    const nextPayload = {
      ...appService.getPayload(),
      sectionId: nextSectionId || store.selectSelectedSectionId?.(),
    };

    if (lineId) {
      nextPayload.lineId = lineId;
    } else {
      delete nextPayload.lineId;
    }

    if (payloadThrottleMs > 0) {
      appService.setPayload(nextPayload, { throttleMs: payloadThrottleMs });
    } else {
      appService.setPayload(nextPayload);
    }
  }

  return nextSectionId;
};

const createDocumentDraftLine = ({ lineId, sectionId } = {}) => {
  const actions = {
    dialogue: {
      content: createEmptyContent(),
    },
  };

  return {
    id: lineId || generateId(),
    sectionId,
    actions,
  };
};

const getLiveLinesEditorElementFromPayload = (payload) => {
  const findEditorElement = (node) => {
    if (!node) {
      return undefined;
    }

    if (node.matches?.("rvn-lexical-scene-document-editor")) {
      return node;
    }

    const wrapper = node.matches?.("rvn-scene-document-editor-lexical")
      ? node
      : node.querySelector?.("rvn-scene-document-editor-lexical");
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

const getNestedPrimitiveEditor = (element) => {
  if (!element || typeof element.querySelector !== "function") {
    return undefined;
  }

  return (
    element.shadowRoot?.querySelector?.("rvn-lexical-scene-document-editor") ||
    element.querySelector?.("rvn-lexical-scene-document-editor")
  );
};

const getLiveLinesFromElement = (element) => {
  const editorElement = getNestedPrimitiveEditor(element) || element;
  return (
    editorElement?.getLines?.() ||
    editorElement?.getLinesSnapshot?.() ||
    editorElement?.lines
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

const reconcileDraftSectionForSection = (deps, sectionId) => {
  const { store } = deps;
  const selectedDraftSection = store.selectDraftSection?.();
  const targetSectionId =
    sectionId ||
    store.selectSelectedSectionId?.() ||
    selectedDraftSection?.sectionId;
  const existingDraftSection =
    store.selectDraftSectionBySectionId?.({ sectionId: targetSectionId }) ||
    (selectedDraftSection?.sectionId === targetSectionId
      ? selectedDraftSection
      : undefined);
  const sceneId = store.selectSceneId?.() || existingDraftSection?.sceneId;

  if (!sceneId || !targetSectionId) {
    store.clearDraftSection?.();
    return undefined;
  }

  const committedScene = store.selectCommittedScene?.();
  const committedSection = committedScene?.sections?.find(
    (section) => section.id === targetSectionId,
  );
  const draftSourceSection =
    committedSection ||
    (existingDraftSection ? { lines: existingDraftSection.lines } : undefined);
  const nextDraftSection = ensureSceneEditorDraftSection({
    draftSection: existingDraftSection,
    sceneId,
    sectionId: targetSectionId,
    section: draftSourceSection,
    revision: store.selectRepositoryRevision?.(),
  });
  store.setDraftSection({ draftSection: nextDraftSection });
  return nextDraftSection;
};

const syncDraftSectionFromLines = (deps, liveLines, { sectionId } = {}) => {
  const { store } = deps;
  const targetSectionId = sectionId || store.selectSelectedSectionId?.();
  const draftSection =
    store.selectDraftSectionBySectionId?.({ sectionId: targetSectionId }) ||
    reconcileDraftSectionForSection(deps, targetSectionId);

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

const syncDraftSectionFromLiveEditor = (deps, { sectionId } = {}) => {
  const { refs } = deps;
  const linesEditorRef = getLinesEditorRef(refs, { sectionId });
  const liveLines = getLiveLinesFromElement(linesEditorRef);
  return syncDraftSectionFromLines(deps, liveLines, { sectionId });
};

const focusLinesEditorLine = (refs, payload = {}) => {
  const linesEditorRef = getLinesEditorRef(refs, payload);
  if (!linesEditorRef) {
    return;
  }

  linesEditorRef.focusLine(payload);
};

const scrollLinesEditorLineIntoView = (
  refs,
  lineId,
  sectionId,
  options = {},
) => {
  const linesEditorRef = getLinesEditorRef(refs, { lineId, sectionId });
  if (!linesEditorRef || !lineId) {
    return;
  }

  linesEditorRef.scrollLineIntoView({ lineId, ...options });
};

const scheduleFrame = (callback) => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }

  globalThis.setTimeout?.(callback, 0);
};

const scrollEntrySelectionIntoView = (deps, payload = {}) => {
  const { refs, store } = deps;
  if (!payload.sectionId && !payload.lineId) {
    return;
  }

  const selectedSectionId = store.selectSelectedSectionId?.();
  const selectedLineId = store.selectSelectedLineId?.();

  if (payload.lineId && selectedLineId) {
    scheduleFrame(() => {
      scrollLinesEditorLineIntoView(refs, selectedLineId, selectedSectionId, {
        block: "start",
      });
    });
    return;
  }

  if (selectedSectionId) {
    scrollSceneEditorSectionTabIntoView(deps, selectedSectionId);
  }
};

const focusLinesEditorContainer = (refs, sectionId) => {
  const linesEditorRef = getLinesEditorRef(refs, { sectionId });
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
    (section) => section.id === store.selectSelectedSectionId?.(),
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
  return reconcileDraftSectionForSection(
    deps,
    deps.store.selectSelectedSectionId?.(),
  );
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
  const pendingDraftSections = store.selectPendingDraftSections?.() || [];
  const hadPendingSessionChanges =
    pendingDraftSections.length > 0 ||
    hasPendingSceneEditorDraftChanges(store.selectDraftSection());
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

const BACKGROUND_TRANSFORM_EDITOR_RENDER_PAYLOAD = {
  skipRender: true,
  skipAnimations: true,
  skipAudio: true,
};

const requestBackgroundTransformEditorCanvasRender = (subject) => {
  subject?.dispatch?.(
    "sceneEditor.renderCanvas",
    BACKGROUND_TRANSFORM_EDITOR_RENDER_PAYLOAD,
  );
};

const renderBackgroundTransformEditorCanvasNow = (deps) => {
  void renderSceneEditorState(
    deps,
    BACKGROUND_TRANSFORM_EDITOR_RENDER_PAYLOAD,
  ).catch((error) => {
    console.error(
      "[sceneEditor] Background transform preview render failed",
      error,
    );
  });
};

const getRepositoryItemById = (collection, itemId) => {
  if (!itemId) {
    return undefined;
  }

  return collection?.items?.[itemId] ?? collection?.[itemId];
};

const getBackgroundResourceDimensions = (repositoryState = {}, resourceId) => {
  const resource =
    getRepositoryItemById(repositoryState.images, resourceId) ??
    getRepositoryItemById(repositoryState.videos, resourceId);
  const width = Number(resource?.width);
  const height = Number(resource?.height);

  return {
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
  };
};

const getDefaultBackgroundTransform = (store, background = {}) => {
  const repositoryState = store.selectRepositoryState?.() ?? {};
  const resolution = repositoryState.project?.resolution;
  const resourceId = background.resourceId;
  const isLayoutBackground =
    !!resourceId &&
    !!getRepositoryItemById(repositoryState.layouts, resourceId);
  const width = Number(resolution?.width);
  const height = Number(resolution?.height);
  const dimensions = getBackgroundResourceDimensions(
    repositoryState,
    resourceId,
  );
  const defaultOriginX = isLayoutBackground
    ? 0
    : (dimensions.width ?? (Number.isFinite(width) ? width : 0)) / 2;
  const defaultOriginY = isLayoutBackground
    ? 0
    : (dimensions.height ?? (Number.isFinite(height) ? height : 0)) / 2;

  return normalizeBackgroundTransformEditorTransform({
    x: isLayoutBackground ? 0 : Number.isFinite(width) ? width / 2 : 0,
    y: isLayoutBackground ? 0 : Number.isFinite(height) ? height / 2 : 0,
    anchorX: isLayoutBackground ? 0 : 0.5,
    anchorY: isLayoutBackground ? 0 : 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    originX: defaultOriginX,
    originY: defaultOriginY,
  });
};

const selectTransformResourceById = (store, transformId) => {
  if (!transformId) {
    return undefined;
  }

  const transforms = store.selectRepositoryState?.()?.transforms;
  return transforms?.items?.[transformId] ?? transforms?.[transformId];
};

const reopenBackgroundCommandLine = ({ refs, store, background } = {}) => {
  const selectedLine = store.selectSelectedLine?.();
  const actions = {
    ...toPlainObject(selectedLine?.actions),
    background: toPlainObject(background),
  };

  refs?.systemActions?.transformedHandlers?.open?.({
    mode: "background",
    actions,
  });
};

const getDuplicateActionItemIds = (items = []) => {
  const counts = new Map();
  for (const item of items) {
    if (item?.id) {
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    }
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  );
};

const getCharacterTransformEditorTargetId = (
  item = {},
  index = 0,
  items = [],
) => {
  const duplicateIds = getDuplicateActionItemIds(items);
  if (!duplicateIds.has(item.id)) {
    return `character-container-${item.id}`;
  }

  const spritePartIds = item.sprites?.map(({ resourceId }) => resourceId) || [];
  return spritePartIds.length > 0
    ? `character-container-${item.id}-${index}-${spritePartIds.join("-")}`
    : `character-container-${item.id}`;
};

const getActionTransformEditorTargetId = ({
  targetType,
  item,
  itemIndex,
  action,
} = {}) => {
  if (targetType === "visual") {
    return item?.id ? `visual-${item.id}` : undefined;
  }

  if (targetType === "character") {
    return getCharacterTransformEditorTargetId(
      item,
      itemIndex,
      action?.items ?? [],
    );
  }

  return undefined;
};

const replaceActionItem = ({ action, itemIndex, item } = {}) => {
  const items = Array.isArray(action?.items) ? [...action.items] : [];
  if (!Number.isInteger(itemIndex) || !items[itemIndex]) {
    return toPlainObject(action);
  }

  items[itemIndex] = item;
  return {
    ...toPlainObject(action),
    items,
  };
};

const selectEditorActionSnapshot = (store, editor = {}) => {
  const actionKey = editor?.actionKey === "character" ? "character" : "visual";
  return toPlainObject(
    editor?.action ?? store.selectSelectedLine?.()?.actions?.[actionKey],
  );
};

const reopenActionTransformCommandLine = ({
  refs,
  store,
  actionKey,
  itemIndex,
  item,
  action,
} = {}) => {
  const selectedLine = store.selectSelectedLine?.();
  const actions = {
    ...toPlainObject(selectedLine?.actions),
  };
  actions[actionKey] = action
    ? toPlainObject(action)
    : replaceActionItem({
        action: actions[actionKey],
        itemIndex,
        item,
      });

  refs?.systemActions?.transformedHandlers?.open?.({
    mode: actionKey,
    actions,
  });
};

const selectInitialBackgroundTransformEditorTransform = (
  store,
  background = {},
) => {
  const selectedLine = store.selectSelectedLine?.();
  const transformId =
    background.transformId ?? selectedLine?.actions?.background?.transformId;
  const transform = selectTransformResourceById(store, transformId);
  const inlineBackground = transformId ? {} : toPlainObject(background);

  return normalizeBackgroundTransformEditorTransform({
    ...getDefaultBackgroundTransform(store, background),
    ...toPlainObject(transform),
    ...inlineBackground,
  });
};

const selectInitialActionTransformEditorTransform = (store, item = {}) => {
  const transform = selectTransformResourceById(store, item.transformId);

  return normalizeBackgroundTransformEditorTransform({
    ...toPlainObject(transform),
    ...toPlainObject(item),
  });
};

const getBackgroundTransformDragModeFromTargetId = (targetId) => {
  if (targetId === "selected-border") {
    return "move";
  }

  if (targetId?.startsWith(BACKGROUND_TRANSFORM_RESIZE_TARGET_PREFIX)) {
    return targetId.slice(BACKGROUND_TRANSFORM_RESIZE_TARGET_PREFIX.length);
  }

  return undefined;
};

const isBackgroundTransformResizeMode = (dragMode) => {
  return (
    dragMode === "left" ||
    dragMode === "right" ||
    dragMode === "top" ||
    dragMode === "bottom"
  );
};

const getPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getBackgroundTransformUniformScale = (transform = {}) => {
  return Math.max(
    Math.abs(getPositiveNumber(transform.scaleX, 1)),
    Math.abs(getPositiveNumber(transform.scaleY, 1)),
    MIN_BACKGROUND_TRANSFORM_SCALE,
  );
};

const getPositiveScale = (value) => {
  return getPositiveNumber(Math.abs(Number(value)), 1);
};

const getResizeScaleDenominator = (
  resizeEdge,
  metrics = {},
  { scaleX = 1, scaleY = 1 } = {},
) => {
  const width = getPositiveNumber(metrics.width, 1) / getPositiveScale(scaleX);
  const height =
    getPositiveNumber(metrics.height, 1) / getPositiveScale(scaleY);
  const anchorX = Number.isFinite(metrics.anchorX) ? metrics.anchorX : 0.5;
  const anchorY = Number.isFinite(metrics.anchorY) ? metrics.anchorY : 0.5;
  let distance = 1;

  if (resizeEdge === "left") {
    distance = width * anchorX;
  } else if (resizeEdge === "right") {
    distance = width * (1 - anchorX);
  } else if (resizeEdge === "top") {
    distance = height * anchorY;
  } else if (resizeEdge === "bottom") {
    distance = height * (1 - anchorY);
  }

  return distance > 0 ? distance : undefined;
};

const getResizePointerDelta = (resizeEdge, dragStartPosition, x, y) => {
  if (resizeEdge === "left") {
    return dragStartPosition.x - x;
  }

  if (resizeEdge === "right") {
    return x - dragStartPosition.x;
  }

  if (resizeEdge === "top") {
    return dragStartPosition.y - y;
  }

  if (resizeEdge === "bottom") {
    return y - dragStartPosition.y;
  }

  return 0;
};

export const applyBackgroundTransformResizeChange = ({
  transform,
  dragStartPosition,
  x,
  y,
} = {}) => {
  const resizeEdge = dragStartPosition?.resizeEdge;
  if (
    !isBackgroundTransformResizeMode(resizeEdge) ||
    typeof x !== "number" ||
    typeof y !== "number"
  ) {
    return transform;
  }

  const startScale = getBackgroundTransformUniformScale({
    scaleX: dragStartPosition.transformStartScaleX,
    scaleY: dragStartPosition.transformStartScaleY,
  });
  const denominator = getResizeScaleDenominator(
    resizeEdge,
    dragStartPosition.selectedElementMetrics,
    {
      scaleX: dragStartPosition.transformStartScaleX,
      scaleY: dragStartPosition.transformStartScaleY,
    },
  );
  if (!denominator) {
    return transform;
  }

  const scaleDelta =
    getResizePointerDelta(resizeEdge, dragStartPosition, x, y) / denominator;
  const nextScale = Math.max(
    MIN_BACKGROUND_TRANSFORM_SCALE,
    startScale + scaleDelta,
  );

  return normalizeBackgroundTransformEditorTransform({
    ...transform,
    scaleX: nextScale,
    scaleY: nextScale,
  });
};

const applyBackgroundTransformDragChange = ({
  transform,
  dragStartPosition,
  x,
  y,
} = {}) => {
  if (!dragStartPosition || typeof x !== "number" || typeof y !== "number") {
    return transform;
  }

  return normalizeBackgroundTransformEditorTransform({
    ...transform,
    x: dragStartPosition.transformStartX + x - dragStartPosition.x,
    y: dragStartPosition.transformStartY + y - dragStartPosition.y,
  });
};

const isBackgroundTransformKeyboardMoveKey = (key) => {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  );
};

export const applyBackgroundTransformKeyboardPositionChange = ({
  transform,
  key,
  unit = BACKGROUND_TRANSFORM_KEYBOARD_NUDGE,
} = {}) => {
  if (!isBackgroundTransformKeyboardMoveKey(key)) {
    return transform;
  }

  const normalizedTransform =
    normalizeBackgroundTransformEditorTransform(transform);
  const moveUnit = Number.isFinite(Number(unit))
    ? Number(unit)
    : BACKGROUND_TRANSFORM_KEYBOARD_NUDGE;

  if (key === "ArrowUp") {
    return normalizeBackgroundTransformEditorTransform({
      ...normalizedTransform,
      y: normalizedTransform.y - moveUnit,
    });
  }

  if (key === "ArrowDown") {
    return normalizeBackgroundTransformEditorTransform({
      ...normalizedTransform,
      y: normalizedTransform.y + moveUnit,
    });
  }

  if (key === "ArrowLeft") {
    return normalizeBackgroundTransformEditorTransform({
      ...normalizedTransform,
      x: normalizedTransform.x - moveUnit,
    });
  }

  return normalizeBackgroundTransformEditorTransform({
    ...normalizedTransform,
    x: normalizedTransform.x + moveUnit,
  });
};

export const handleBackgroundTransformEditorKeyDown = (deps, event) => {
  const { render, store } = deps;
  if (!store.selectIsBackgroundTransformEditorOpen?.()) {
    return false;
  }

  if (
    event?.defaultPrevented ||
    event?.isComposing ||
    event?.ctrlKey ||
    event?.metaKey ||
    event?.altKey ||
    !isBackgroundTransformKeyboardMoveKey(event?.key)
  ) {
    return false;
  }

  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();

  const editor = store.selectBackgroundTransformEditor?.();
  const updatedTransform = applyBackgroundTransformKeyboardPositionChange({
    transform: editor?.transform,
    key: event.key,
    unit: event.shiftKey
      ? BACKGROUND_TRANSFORM_KEYBOARD_LARGE_NUDGE
      : BACKGROUND_TRANSFORM_KEYBOARD_NUDGE,
  });

  store.clearBackgroundTransformEditorDragStartPosition?.();
  store.setBackgroundTransformEditorTransform?.({
    transform: updatedTransform,
  });
  render();
  requestBackgroundTransformEditorCanvasRender(deps.subject);
  return true;
};

const handleBackgroundTransformBorderDragStart = (deps, payload = {}) => {
  if (!deps.store.selectIsBackgroundTransformEditorOpen?.()) {
    return;
  }

  if (!getBackgroundTransformDragModeFromTargetId(payload.targetId)) {
    return;
  }

  deps.store.clearBackgroundTransformEditorDragStartPosition?.();
};

const handleBackgroundTransformBorderDragMove = (deps, payload = {}) => {
  const { store, render } = deps;
  if (!store.selectIsBackgroundTransformEditorOpen?.()) {
    return;
  }

  if (typeof payload.x !== "number" || typeof payload.y !== "number") {
    return;
  }

  const dragMode = getBackgroundTransformDragModeFromTargetId(payload.targetId);
  if (!dragMode) {
    return;
  }

  const editor = store.selectBackgroundTransformEditor?.();
  const transform = normalizeBackgroundTransformEditorTransform(
    editor?.transform,
  );
  if (!editor?.dragStartPosition) {
    if (
      isBackgroundTransformResizeMode(dragMode) &&
      !editor?.selectedElementMetrics
    ) {
      return;
    }

    store.setBackgroundTransformEditorDragStartPosition?.({
      dragStartPosition: {
        x: payload.x,
        y: payload.y,
        resizeEdge: isBackgroundTransformResizeMode(dragMode)
          ? dragMode
          : undefined,
        selectedElementMetrics: editor?.selectedElementMetrics,
        transformStartX: transform.x,
        transformStartY: transform.y,
        transformStartScaleX: transform.scaleX,
        transformStartScaleY: transform.scaleY,
      },
    });
    return;
  }

  const updatedTransform = editor.dragStartPosition.resizeEdge
    ? applyBackgroundTransformResizeChange({
        transform,
        dragStartPosition: editor.dragStartPosition,
        x: payload.x,
        y: payload.y,
      })
    : applyBackgroundTransformDragChange({
        transform,
        dragStartPosition: editor.dragStartPosition,
        x: payload.x,
        y: payload.y,
      });

  store.setBackgroundTransformEditorTransform?.({
    transform: updatedTransform,
  });
  render();
  renderBackgroundTransformEditorCanvasNow(deps);
};

const handleBackgroundTransformBorderDragEnd = (deps) => {
  if (!deps.store.selectIsBackgroundTransformEditorOpen?.()) {
    return;
  }

  deps.store.clearBackgroundTransformEditorDragStartPosition?.();
  requestBackgroundTransformEditorCanvasRender(deps.subject);
};

const mountBackgroundTransformEditorSubscriptions = (deps) => {
  const { subject } = deps;
  const streams = [
    fromEvent(window, "keydown", { capture: true }).pipe(
      tap((event) => handleBackgroundTransformEditorKeyDown(deps, event)),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-start"),
      tap(({ payload }) =>
        handleBackgroundTransformBorderDragStart(deps, payload),
      ),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-move"),
      tap(({ payload }) =>
        handleBackgroundTransformBorderDragMove(deps, payload),
      ),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-end"),
      tap(() => handleBackgroundTransformBorderDragEnd(deps)),
    ),
  ];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBackgroundTransformCustomize = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { refs, store, render, subject } = deps;
  const background = toPlainObject(payload?._event?.detail?.background);
  const transform = selectInitialBackgroundTransformEditorTransform(
    store,
    background,
  );

  store.setTemporaryPresentationState?.({
    presentationState: {
      background,
    },
  });
  store.openBackgroundTransformEditor?.({
    background,
    transform,
  });
  render();
  reopenBackgroundCommandLine({ refs, store, background });
  requestBackgroundTransformEditorCanvasRender(subject);
};

const closeActionTransformEditor = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { refs, store, render, subject } = deps;
  store.suppressNextActionsDialogClose?.();
  const editor = store.selectBackgroundTransformEditor?.();
  const actionKey = editor?.actionKey === "character" ? "character" : "visual";
  const nextItem = createActionItemWithInlineTransform(
    editor?.item,
    editor?.transform,
    { preserveTransformId: true },
  );
  const nextAction = replaceActionItem({
    action: selectEditorActionSnapshot(store, editor),
    itemIndex: editor?.itemIndex,
    item: nextItem,
  });

  refs?.systemActions?.transformedHandlers?.handleSetActionCustomTransform?.({
    targetType: editor?.targetType,
    itemIndex: editor?.itemIndex,
    item: editor?.item,
    transform: editor?.transform,
  });
  store.closeBackgroundTransformEditor?.();
  render();
  reopenActionTransformCommandLine({
    refs,
    store,
    actionKey,
    action: nextAction,
  });
  requestBackgroundTransformEditorCanvasRender(subject);
  globalThis.setTimeout?.(() => {
    store.clearSuppressNextActionsDialogClose?.();
    render();
  }, 50);
};

export const handleBackgroundTransformEditorCloseClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { refs, store, render, subject } = deps;
  const editor = store.selectBackgroundTransformEditor?.();
  if (editor?.targetType && editor.targetType !== "background") {
    closeActionTransformEditor(deps, payload);
    return;
  }

  store.suppressNextActionsDialogClose?.();
  const nextBackground = createBackgroundWithInlineTransform(
    editor?.background,
    editor?.transform,
  );
  store.setTemporaryPresentationState?.({
    presentationState: {
      background: nextBackground,
    },
  });
  refs?.systemActions?.transformedHandlers?.handleSetBackgroundCustomTransform?.(
    {
      background: editor?.background,
      transform: editor?.transform,
    },
  );
  store.closeBackgroundTransformEditor?.();
  render();
  reopenBackgroundCommandLine({
    refs,
    store,
    background: nextBackground,
  });
  requestBackgroundTransformEditorCanvasRender(subject);
  globalThis.setTimeout?.(() => {
    store.clearSuppressNextActionsDialogClose?.();
    render();
  }, 50);
};

export const handleBackgroundTransformEditorDone = (deps, payload) => {
  handleBackgroundTransformEditorCloseClick(deps, payload);
};

export const handleBackgroundTransformEditorCancel = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { refs, render, store, subject } = deps;
  const editor = store.selectBackgroundTransformEditor?.();

  store.suppressNextActionsDialogClose?.();
  store.closeBackgroundTransformEditor?.();

  if (!editor?.targetType || editor.targetType === "background") {
    const background = toPlainObject(editor?.background);
    store.setTemporaryPresentationState?.({
      presentationState: {
        background,
      },
    });
    render();
    reopenBackgroundCommandLine({ refs, store, background });
    requestTemporaryPresentationCanvasRender(subject);
    globalThis.setTimeout?.(() => {
      store.clearSuppressNextActionsDialogClose?.();
      render();
    }, 50);
    return;
  }

  const actionKey = editor?.actionKey === "character" ? "character" : "visual";
  const action = selectEditorActionSnapshot(store, editor);
  store.setTemporaryPresentationState?.({
    presentationState: {
      [actionKey]: action,
    },
  });
  render();
  reopenActionTransformCommandLine({
    refs,
    store,
    actionKey,
    action,
  });
  requestTemporaryPresentationCanvasRender(subject);
  globalThis.setTimeout?.(() => {
    store.clearSuppressNextActionsDialogClose?.();
    render();
  }, 50);
};

export const handleActionTransformCustomize = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { refs, store, render, subject } = deps;
  const detail = toPlainObject(payload?._event?.detail);
  const targetType = detail.targetType === "character" ? "character" : "visual";
  const actionKey = detail.actionKey === "character" ? "character" : "visual";
  const selectedLine = store.selectSelectedLine?.();
  const action = toPlainObject(
    detail.action ?? selectedLine?.actions?.[actionKey],
  );
  const itemIndex = detail.itemIndex;
  const item = toPlainObject(detail.item ?? action.items?.[itemIndex]);
  const transform = selectInitialActionTransformEditorTransform(store, item);
  const targetId = getActionTransformEditorTargetId({
    targetType,
    item,
    itemIndex,
    action,
  });

  store.setTemporaryPresentationState?.({
    presentationState: {
      [actionKey]: action,
    },
  });
  store.openBackgroundTransformEditor?.({
    targetType,
    actionKey,
    action,
    itemIndex,
    item,
    targetId,
    transform,
  });
  render();
  reopenActionTransformCommandLine({
    refs,
    store,
    actionKey,
    action,
  });
  requestBackgroundTransformEditorCanvasRender(subject);
};

export const handleActionTransformEditorDone = (deps, payload) => {
  closeActionTransformEditor(deps, payload);
};

export const handleBeforeMount = (deps) => {
  const { projectService, appService, store } = deps;
  store.setScenePageLoading({ isLoading: true });
  const showLineNumbers =
    appService.getUserConfig(SHOW_LINE_NUMBERS_CONFIG_KEY) ?? true;
  const isMuted = appService.getUserConfig(IS_MUTED_CONFIG_KEY) ?? false;
  const fontSize = normalizeSceneEditorFontSize(
    appService.getUserConfig(FONT_SIZE_CONFIG_KEY),
  );
  store.setSceneSettings({
    showLineNumbers,
    isMuted,
    fontSize,
  });

  const cleanupRuntimeSubscriptions = mountSceneEditorSubscriptions(deps);
  const cleanupBackgroundTransformEditorSubscriptions =
    mountBackgroundTransformEditorSubscriptions(deps);
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
    cleanupBackgroundTransformEditorSubscriptions();
    await flushSceneEditorDrafts(deps, { force: true });
    await projectService.clearActiveSceneId().catch(() => {});
    await resetSceneEditorRuntime(deps);
  };
};

export const handleAfterMount = async (deps) => {
  try {
    const entryPayload = deps.appService?.getPayload?.() || {};
    await initializeSceneEditorPage({
      ...deps,
      syncProjectState: syncStoreProjectState,
    });
    reconcileCurrentEditorSession(deps);
    deps.render();
    scrollEntrySelectionIntoView(deps, entryPayload);
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

  const event = payload?._event;
  const sectionId =
    event?.currentTarget?.dataset?.sectionId ||
    event?.currentTarget?.id?.replace("sectionTab", "") ||
    "";
  if (!sectionId) {
    return;
  }

  await flushSceneEditorDrafts(deps, { force: true });
  await selectSceneEditorSection(deps, sectionId);
  reconcileCurrentEditorSession(deps);
  deps.render();
};

export const handleSectionHeaderClick = handleSectionTabClick;

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
  const { refs, render, subject, store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const nextLines = payload?._event?.detail?.lines;
  if (!Array.isArray(nextLines)) {
    return;
  }
  const changeReason = payload?._event?.detail?.reason || "text";
  const sectionId =
    getSectionIdFromPayload(payload) ||
    nextLines.find((line) => line?.sectionId)?.sectionId ||
    store.selectSelectedSectionId?.();

  const draftSection = reconcileDraftSectionForSection(deps, sectionId);
  if (!draftSection) {
    return;
  }

  const nextDraftSection = replaceSceneEditorDraftSectionLines(draftSection, {
    lines: nextLines,
    source: changeReason,
    dirty: true,
  });
  store.setDraftSection({ draftSection: nextDraftSection });
  const detailSelectedLineId = payload?._event?.detail?.selectedLineId;
  const selectedLineId =
    detailSelectedLineId ||
    (sectionId === store.selectSelectedSectionId?.()
      ? store.selectSelectedLineId()
      : undefined) ||
    nextLines[0]?.id;
  selectEditorTarget(deps, {
    sectionId,
    lineId: selectedLineId,
  });
  render();
  const focusTarget = payload?._event?.detail?.focusTarget;
  if (
    focusTarget?.lineId &&
    changeReason === "structure" &&
    focusTarget.skipPageRestore !== true
  ) {
    const focusPayload = {
      ...focusTarget,
      sectionId,
    };
    requestAnimationFrame(() => {
      focusLinesEditorLine(refs, focusPayload);
      requestAnimationFrame(() => {
        focusLinesEditorLine(refs, focusPayload);
      });
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
  const sectionId = getSectionIdFromPayload(payload);
  const draftSection =
    store.selectDraftSectionBySectionId?.({ sectionId }) ||
    reconcileDraftSectionForSection(deps, sectionId);
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

    scheduleSceneEditorDraftFlush(deps, { reason: "text" });
  }, 0);
};

export const handleSelectedLineChanged = (deps, payload) => {
  const { store, refs, render, subject } = deps;
  const detail = payload?._event?.detail || {};
  const lineId = detail.lineId;
  const sectionId =
    getSectionIdFromPayload(payload) || findSectionIdForLine(store, lineId);
  const previousLineId = store.selectSelectedLineId();
  const previousSectionId = store.selectSelectedSectionId?.();
  const isSameSelection =
    lineId === previousLineId && sectionId === previousSectionId;
  let adjacentSectionTarget;
  const canCrossSectionFromCurrentMode =
    detail.mode === "block" ||
    (detail.mode === "text-editor" && detail.isBoundaryNavigation === true);
  if (isSameSelection && canCrossSectionFromCurrentMode) {
    if (detail.navigationDirection === "down") {
      adjacentSectionTarget = findNextSectionFirstLineTarget(store, {
        sectionId,
        lineId,
      });
    } else if (detail.navigationDirection === "up") {
      adjacentSectionTarget = findPreviousSectionLastLineTarget(store, {
        sectionId,
        lineId,
      });
    }
  }

  if (!lineId || (isSameSelection && !adjacentSectionTarget)) {
    return;
  }

  const target = adjacentSectionTarget || { sectionId, lineId };
  selectEditorTarget(deps, {
    sectionId: target.sectionId,
    lineId: target.lineId,
    payloadThrottleMs: SCENE_EDITOR_SELECTION_URL_SYNC_THROTTLE_MS,
  });

  render();

  if (adjacentSectionTarget) {
    requestAnimationFrame(() => {
      const currentSectionId = store.selectSelectedSectionId?.();
      const currentLineId = store.selectSelectedLineId?.();
      if (
        currentSectionId !== adjacentSectionTarget.sectionId ||
        currentLineId !== adjacentSectionTarget.lineId
      ) {
        return;
      }

      scrollLinesEditorLineIntoView(
        refs,
        adjacentSectionTarget.lineId,
        adjacentSectionTarget.sectionId,
      );
      if (detail.mode === "text-editor") {
        focusLinesEditorLine(refs, {
          sectionId: adjacentSectionTarget.sectionId,
          lineId: adjacentSectionTarget.lineId,
          cursorPosition: detail.cursorPosition,
          goalColumn: detail.cursorPosition,
          direction: detail.navigationDirection,
        });
      } else {
        focusLinesEditorContainer(refs, adjacentSectionTarget.sectionId);
      }
    });
  }

  dispatchLineNavigationRender(subject, store, {
    previousLineId,
    nextLineId: target.lineId,
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

  const sectionId =
    getSectionIdFromPayload(payload) ||
    findSectionIdForLine(store, lineId) ||
    store.selectSelectedSectionId?.();
  selectEditorTarget(deps, { sectionId, lineId });
  const currentSection = store
    .selectScene()
    ?.sections?.find((section) => section.id === sectionId);
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

export const handleSectionAddClick = (deps, payload) => {
  const { store, render } = deps;
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const scene = store.selectScene();
  const sectionCount = scene?.sections?.length || 0;
  const defaultName = `Section ${sectionCount + 1}`;
  store.showSectionCreateDialog({ defaultName });
  render();
};

export const handleSectionMenuClick = (deps, payload) => {
  const { store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  openSectionTabDropdown(deps, payload._event);
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
  await flushSceneEditorDrafts(deps, { force: true });
  await selectSceneEditorSection(deps, sectionId);
  reconcileCurrentEditorSession(deps);
  deps.render();
};

export const handleNewLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  cancelSceneEditorDraftFlush(deps);

  const { store, render, subject, refs } = deps;
  const detail = payload?._event?.detail || {};
  const sectionId =
    getSectionIdFromPayload(payload) || store.selectSelectedSectionId?.();
  const draftSection = reconcileDraftSectionForSection(deps, sectionId);
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
  const newLine = createDocumentDraftLine({
    sectionId: draftSection.sectionId || baseLine?.sectionId,
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
  selectEditorTarget(deps, {
    sectionId: draftSection.sectionId,
    lineId: newLine.id,
  });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    syncPresentationState: true,
    skipAnimations: true,
  });

  const focusTarget = {
    sectionId: draftSection.sectionId,
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
  const sectionId =
    getSectionIdFromPayload(payload) ||
    findSectionIdForLine(store, targetLineId) ||
    store.selectSelectedSectionId?.();
  const currentLineId = store.selectSelectedLineId();

  if (mode === "block") {
    if (direction === "up" && currentLineId === targetLineId) {
      dispatchLineNavigationRender(subject, store, {
        previousLineId: currentLineId,
        nextLineId: targetLineId,
      });
      return;
    }

    selectEditorTarget(deps, { sectionId, lineId: targetLineId });
    render();

    if (targetLineId) {
      requestAnimationFrame(() => {
        scrollLinesEditorLineIntoView(refs, targetLineId, sectionId);
      });
    }

    dispatchLineNavigationRender(subject, store, {
      previousLineId: currentLineId,
      nextLineId: targetLineId,
    });
    return;
  }

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

  if (nextLineId === resolvedCurrentLineId) {
    if (direction === "up" || direction === "end") {
      nextLineId = store.selectPreviousLineId({
        lineId: resolvedCurrentLineId,
      });
    } else if (direction === "down") {
      nextLineId = store.selectNextLineId({ lineId: resolvedCurrentLineId });
    }
  }

  if (nextLineId && nextLineId !== currentLineId) {
    const nextSectionId = findSectionIdForLine(store, nextLineId) || sectionId;
    const linesEditorRef = getLinesEditorRef(refs, {
      sectionId: nextSectionId,
      lineId: nextLineId,
    });

    selectEditorTarget(deps, { sectionId: nextSectionId, lineId: nextLineId });
    render();

    requestAnimationFrame(() => {
      if (linesEditorRef) {
        const isEndNavigation = targetCursorPosition === -1;
        focusLinesEditorLine(refs, {
          sectionId: nextSectionId,
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
  const sectionId =
    getSectionIdFromPayload(payload) || store.selectSelectedSectionId?.();
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();
  const draftSection = reconcileDraftSectionForSection(deps, sectionId);

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
  selectEditorTarget(deps, {
    sectionId: draftSection.sectionId,
    lineId,
  });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    syncPresentationState: true,
    skipAnimations: true,
  });

  requestAnimationFrame(() => {
    scrollLinesEditorLineIntoView(refs, lineId, draftSection.sectionId);
    focusLinesEditorContainer(refs, draftSection.sectionId);
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
  const suppressNext = store.selectSuppressNextActionsDialogClose?.() === true;
  const editorOpen = store.selectIsBackgroundTransformEditorOpen?.() === true;
  if (suppressNext) {
    store.clearSuppressNextActionsDialogClose?.();
    return;
  }

  if (editorOpen) {
    return;
  }

  const lineId = store.selectActionTargetLineId?.();
  if (lineId) {
    store.setSelectedLineId({ selectedLineId: lineId });
  }
  store.clearActionTargetLineId?.();
  store.closeBackgroundTransformEditor?.();
  clearTemporaryPresentationPreview({ store, subject });
  render();
};

export const handleTemporaryPresentationStateChange = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, subject } = deps;
  const presentationState = normalizeTemporaryPresentationState(
    payload?._event?.detail,
  );
  store.setTemporaryPresentationState?.({
    presentationState,
  });
  requestTemporaryPresentationCanvasRender(subject);
};

export const handleDropdownMenuClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

const getDefaultSectionName = (store) => {
  const scene = store.selectScene();
  const sectionCount = scene?.sections?.length || 0;
  return `Section ${sectionCount + 1}`;
};

const moveSceneEditorSectionWithinScene = async (
  deps,
  { sectionId, direction } = {},
) => {
  const { store, projectService, appService } = deps;
  const scene = store.selectScene();
  const sections = Array.isArray(scene?.sections) ? scene.sections : [];
  const sectionIndex = sections.findIndex(
    (section) => section.id === sectionId,
  );
  const targetSection =
    direction === "up"
      ? sections[sectionIndex - 1]
      : sections[sectionIndex + 1];

  if (!sectionId || !targetSection?.id) {
    return;
  }

  await flushSceneEditorDrafts(deps, { force: true });
  await runSceneEditorPersistence(
    deps,
    async () => {
      assertSceneEditorCommandResult(
        await projectService.moveSectionItem({
          sectionId,
          position: direction === "up" ? "before" : "after",
          positionTargetId: targetSection.id,
        }),
        {
          appService,
          fallbackMessage: "Failed to move section",
        },
      );
    },
    {
      label: direction === "up" ? "move-section-up" : "move-section-down",
      meta: {
        sectionId,
        targetSectionId: targetSection.id,
      },
    },
  );

  await refreshSceneEditorStateFromProject(deps);
  await selectSceneEditorSection(deps, sectionId);
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, subject, appService } = deps;
  const item = payload._event.detail.item || payload._event.detail;
  const action = item?.value;
  const dropdownState = store.selectDropdownMenu();
  const sectionId = dropdownState.sectionId;
  if (item?.disabled === true) {
    render();
    return;
  }
  const actionsType = dropdownState.actionsType;
  const lineId = dropdownState.lineId;
  const sceneId = store.selectSceneId();

  store.hideDropdownMenu();

  if (typeof action === "string" && action.startsWith("go-to-section:")) {
    const nextSectionId = action.replace("go-to-section:", "");
    if (nextSectionId) {
      await flushSceneEditorDrafts(deps, { force: true });
      await selectSceneEditorSection(deps, nextSectionId);
      reconcileCurrentEditorSession(deps);
      render();
      return;
    }
  }

  if (action === "add-section-above" || action === "add-section-below") {
    store.showSectionCreateDialog({
      defaultName: getDefaultSectionName(store),
      placementPosition: action === "add-section-above" ? "before" : "after",
      placementTargetSectionId: sectionId,
    });
    render();
    return;
  }

  if (action === "move-section-up" || action === "move-section-down") {
    await moveSceneEditorSectionWithinScene(deps, {
      sectionId,
      direction: action === "move-section-up" ? "up" : "down",
    });
    render();
    return;
  }

  if (action === "delete-section") {
    await flushSceneEditorDrafts(deps, { force: true });
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
  } else if (action === "duplicate-section") {
    await flushSceneEditorDrafts(deps, { force: true });
    let duplicateSectionId;
    await runSceneEditorPersistence(
      deps,
      async () => {
        duplicateSectionId = assertSceneEditorCommandResult(
          await projectService.duplicateSectionItem({
            sectionId,
          }),
          {
            appService,
            fallbackMessage: "Failed to duplicate section",
          },
        );
      },
      {
        label: "duplicate-section",
        meta: {
          sceneId,
          sectionId,
        },
      },
    );

    await refreshSceneEditorStateFromProject(deps);

    if (typeof duplicateSectionId === "string") {
      await selectSceneEditorSection(deps, duplicateSectionId);
    } else {
      subject.dispatch("sceneEditor.renderCanvas", {});
    }
  } else if (action === "move-section-scene") {
    store.showSectionMoveSceneDialog({
      sectionId,
    });
  } else if (action === "edit-section") {
    store.showSectionEditDialog({
      sectionId,
    });
  } else if (action === "delete-line") {
    await deleteSceneEditorLine(deps, lineId);
  } else if (action === "delete-actions") {
    const selectedLineId = store.selectSelectedLineId();
    const selectedSectionId = store.selectSelectedSectionId?.();
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

export const handleSectionMoveSceneDialogClose = (deps) => {
  const { store, render } = deps;
  store.hideSectionMoveSceneDialog();
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
  const fontSize = normalizeSceneEditorFontSize(detail.values?.fontSize);
  store.setSceneSettings({
    showLineNumbers,
    isMuted,
    fontSize,
  });
  appService.setUserConfig(SHOW_LINE_NUMBERS_CONFIG_KEY, showLineNumbers);
  appService.setUserConfig(IS_MUTED_CONFIG_KEY, isMuted);
  appService.setUserConfig(FONT_SIZE_CONFIG_KEY, fontSize);
  store.hideSceneSettingsDialog();
  render();

  requestAnimationFrame(() => {
    forEachLinesEditorRef(refs, (linesEditorRef) => {
      linesEditorRef?.hardRefresh?.();
    });
  });

  if (previousIsMuted !== isMuted) {
    subject.dispatch("sceneEditor.renderCanvas", {});
  }
};

export const handleSectionMoveSceneFormActionClick = async (deps, payload) => {
  const { store, render, projectService, appService, subject } = deps;
  const detail = payload._event.detail || {};
  const action = detail.actionId;
  const values = detail.values || {};

  if (action === "cancel") {
    store.hideSectionMoveSceneDialog();
    render();
    return;
  }

  if (action !== "submit") {
    return;
  }

  const dialog = store.selectSectionMoveSceneDialog();
  const sectionId = dialog.sectionId;
  const sceneId = store.selectSceneId();
  const targetSceneId = values.sceneId;

  if (!sectionId || !sceneId || !targetSceneId) {
    appService?.showAlert({
      message: "Select a scene to move this section.",
      title: "Error",
    });
    return;
  }

  if (targetSceneId === sceneId) {
    appService?.showAlert({
      message: "Select a different scene.",
      title: "Error",
    });
    return;
  }

  const sourceScene = store.selectCommittedScene();
  if ((sourceScene?.sections?.length ?? 0) <= 1) {
    appService?.showAlert({
      message: "This scene must keep at least one section.",
      title: "Error",
    });
    return;
  }

  store.hideSectionMoveSceneDialog();

  await runSceneEditorPersistence(
    deps,
    async () => {
      assertSceneEditorCommandResult(
        await projectService.moveSectionItem({
          sectionId,
          sceneId: targetSceneId,
          position: "last",
        }),
        {
          appService,
          fallbackMessage: "Failed to move section",
        },
      );
    },
    {
      label: "move-section-scene",
      meta: {
        sceneId,
        targetSceneId,
        sectionId,
      },
    },
  );

  await refreshSceneEditorStateFromProject(deps);
  subject.dispatch("sceneEditor.renderCanvas", {});
  render();
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
    const sectionCreateDialog = store.selectSectionCreateDialog();
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
          position: sectionCreateDialog.placementPosition || "last",
          positionTargetId: sectionCreateDialog.placementTargetSectionId,
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
    const popoverState = store.selectPopover();
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
      const sectionId = store.selectSelectedSectionId?.();
      const lineId = store.selectSelectedLineId();
      const liveLinesEditorElement =
        getLiveLinesEditorElementFromPayload(payload) ||
        getLinesEditorRef(deps.refs, { sectionId });
      const liveLines = cloneSceneEditorLines(
        getLiveLinesFromElement(liveLinesEditorElement),
      );

      await flushSceneEditorDrafts(deps, {
        sectionId,
        liveLines,
        showErrorAlert: false,
        force: true,
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
  const sectionId =
    getSectionIdFromPayload(payload) || deps.store.selectSelectedSectionId?.();
  const linesEditorRef = getLinesEditorRef(deps.refs, { sectionId });
  linesEditorRef?.applyTextFormat?.({ format });
  const liveLinesEditorElement =
    getLiveLinesEditorElementFromPayload(payload) || linesEditorRef;
  queueMicrotask(() => {
    syncDraftSectionFromLines(
      deps,
      getLiveLinesFromElement(liveLinesEditorElement),
      { sectionId },
    );
  });
};

export const handlePreviewShortcut = (deps, payload) => {
  handlePreviewClick(deps, payload);
};

const deleteSceneEditorLine = async (deps, lineId) => {
  const { store, render, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return false;
  }
  cancelSceneEditorDraftFlush(deps);

  const sectionId =
    findSectionIdForLine(store, lineId) || store.selectSelectedSectionId?.();

  if (!lineId || !sectionId) {
    return false;
  }

  const scene = store.selectScene();
  const section = scene?.sections?.find((item) => item.id === sectionId);
  const lines = Array.isArray(section?.lines) ? section.lines : [];
  const currentIndex = lines.findIndex((line) => line.id === lineId);
  if (currentIndex < 0) {
    return false;
  }

  const nextSelectedLineId =
    lines[currentIndex + 1]?.id || lines[currentIndex - 1]?.id;

  if (lines.length <= 1) {
    return false;
  }

  const draftSection =
    store.selectDraftSectionBySectionId?.({ sectionId }) ||
    reconcileDraftSectionForSection(deps, sectionId);
  if (!draftSection) {
    return false;
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
  selectEditorTarget(deps, {
    sectionId,
    lineId: nextSelectedLineId,
  });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    syncPresentationState: true,
    skipAnimations: true,
  });

  if (nextSelectedLineId) {
    focusLinesEditorContainer(deps.refs, sectionId);
    requestAnimationFrame(() => {
      scrollLinesEditorLineIntoView(deps.refs, nextSelectedLineId, sectionId);
      focusLinesEditorContainer(deps.refs, sectionId);
    });
  } else {
    focusLinesEditorContainer(deps.refs, sectionId);
  }
  scheduleSceneEditorDraftFlush(deps, {
    reason: "structure",
  });
  return true;
};

export const handleDeleteLineShortcut = async (deps, payload) => {
  const { store } = deps;
  const detail = payload?._event?.detail || {};
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();

  await deleteSceneEditorLine(deps, lineId);
};

export const handleLineContextMenuRequest = (deps, payload) => {
  const { store, render } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const detail = payload?._event?.detail || {};
  const lineId = detail.lineId;
  if (!lineId) {
    return;
  }

  selectEditorTarget(deps, {
    sectionId:
      getSectionIdFromPayload(payload) || findSectionIdForLine(store, lineId),
    lineId,
  });
  store.showLineDropdownMenu({
    position: detail.position || { x: 0, y: 0 },
    lineId,
  });
  render();
};

export const handleLineContextMenuDismiss = (deps) => {
  const { store, render } = deps;
  const dropdownState = store.selectDropdownMenu();
  if (!dropdownState.lineId) {
    return;
  }

  store.hideDropdownMenu();
  render();
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

export const handlePreviewCurrentLineChanged = (deps, payload) => {
  const { subject } = deps;
  const detail = payload?._event?.detail ?? {};
  const { sectionId, lineId } = detail;
  if (!lineId) {
    return;
  }

  subject.dispatch("sceneEditor.runtimeCurrentLineChanged", {
    sectionId,
    lineId,
  });
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  await flushSceneEditorDrafts(deps, { force: true });
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
