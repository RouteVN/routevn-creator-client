import { generateId, generatePrefixedId } from "../../internal/id.js";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import { createScenesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { recordRecentSceneVisit } from "../../internal/ui/recentScenes.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  SCENE_BOX_HEIGHT,
  SCENE_BOX_VIEWPORT_PADDING,
  SCENE_BOX_WIDTH,
} from "../../internal/whiteboard/constants.js";
import { selectScenesPageCopy } from "./support/scenesPageCopy.js";
import {
  createScenesPageTraceId,
  getScenesPageDurationMs,
  getScenesPageTimingNow,
  logScenesPageTiming,
} from "./support/scenesPageTiming.js";

const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another section.";
const selectCopy = (deps = {}) => selectScenesPageCopy(deps.i18n);
const DEFAULT_SCENES_MAP_VIEWPORT = {
  zoomLevel: 1,
  panX: -80,
  panY: -40,
};
const TOUCH_MINIMAP_HYDRATION_FRAME_COUNT = 6;
const WHITEBOARD_CONNECTIONS_HYDRATION_FRAME_COUNT = 4;
const SCENE_OVERVIEW_HYDRATION_FRAME_COUNT = 8;
const SCENE_OVERVIEW_IDLE_TIMEOUT_MS = 4000;

const getProjectErrorMessage = (result, fallbackMessage) => {
  return (
    result?.error?.message ||
    result?.error?.creatorModelError?.message ||
    result?.message ||
    fallbackMessage
  );
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFiniteNumberOr = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;

const parseNumericConfig = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const isViewportLikelyOffscreen = ({ items, zoomLevel, panX, panY }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }

  const viewportWidth = Number(window?.innerWidth) || 1200;
  const viewportHeight = Number(window?.innerHeight) || 800;
  const itemWidth = SCENE_BOX_WIDTH + SCENE_BOX_VIEWPORT_PADDING;
  const itemHeight = SCENE_BOX_HEIGHT + SCENE_BOX_VIEWPORT_PADDING;

  return items.every((item) => {
    const screenX = item.x * zoomLevel + panX;
    const screenY = item.y * zoomLevel + panY;
    return !(
      screenX + itemWidth > 0 &&
      screenX < viewportWidth &&
      screenY + itemHeight > 0 &&
      screenY < viewportHeight
    );
  });
};

const resolveInitialWhiteboardViewport = ({ appService, items }) => {
  const defaultViewport = {
    ...DEFAULT_SCENES_MAP_VIEWPORT,
    didReset: false,
  };

  const zoomLevel = clamp(
    parseNumericConfig(
      getViewportConfigValue({ appService, field: "zoomLevel" }),
      defaultViewport.zoomLevel,
    ),
    0.2,
    2,
  );
  const panX = parseNumericConfig(
    getViewportConfigValue({ appService, field: "panX" }),
    defaultViewport.panX,
  );
  const panY = parseNumericConfig(
    getViewportConfigValue({ appService, field: "panY" }),
    defaultViewport.panY,
  );

  if (isViewportLikelyOffscreen({ items, zoomLevel, panX, panY })) {
    return { ...defaultViewport, didReset: true };
  }

  return { zoomLevel, panX, panY, didReset: false };
};

const getOrderedSceneIds = (domainState) => {
  const domainScenes = domainState?.scenes || {};
  const fromDomainOrder = Array.isArray(domainState?.story?.sceneOrder)
    ? domainState.story.sceneOrder
    : [];
  const allSceneIds = Object.keys(domainScenes);
  const ordered = [...fromDomainOrder];
  for (const sceneId of allSceneIds) {
    if (!ordered.includes(sceneId)) {
      ordered.push(sceneId);
    }
  }
  return ordered.filter((sceneId) => !!domainScenes[sceneId]);
};

const buildSceneWhiteboardItems = ({
  domainState,
  repositoryState,
  sceneOverviewsById = {},
  currentWhiteboardItems = [],
  traceId,
}) => {
  const startedAt = getScenesPageTimingNow();
  const domainScenes = domainState?.scenes || {};
  const initialSceneId = domainState?.story?.initialSceneId || null;
  const repositoryScenesById = repositoryState?.scenes?.items || {};
  const orderedSceneIds = getOrderedSceneIds(domainState).filter(
    (sceneId) => domainScenes[sceneId]?.type !== "folder",
  );

  const items = orderedSceneIds.map((sceneId) => {
    const scene = domainScenes[sceneId] || {};
    const repositoryScene = repositoryScenesById[sceneId];
    const overview = sceneOverviewsById?.[sceneId];
    const existingWhiteboardItem = currentWhiteboardItems.find(
      (wb) => wb.id === sceneId,
    );

    return {
      id: sceneId,
      name: scene.name || repositoryScene?.name || `Scene ${sceneId}`,
      x: toFiniteNumberOr(
        scene.position?.x,
        toFiniteNumberOr(
          repositoryScene?.position?.x,
          existingWhiteboardItem?.x ?? 200,
        ),
      ),
      y: toFiniteNumberOr(
        scene.position?.y,
        toFiniteNumberOr(
          repositoryScene?.position?.y,
          existingWhiteboardItem?.y ?? 200,
        ),
      ),
      isInit: sceneId === initialSceneId,
      transitions: Array.isArray(overview?.outgoingSceneIds)
        ? [...overview.outgoingSceneIds]
        : [],
    };
  });

  logScenesPageTiming("build-whiteboard-items.complete", {
    traceId,
    durationMs: getScenesPageDurationMs(startedAt),
    orderedSceneCount: orderedSceneIds.length,
    currentWhiteboardItemCount: currentWhiteboardItems.length,
    overviewCount: Object.keys(sceneOverviewsById).length,
  });

  return items;
};

const buildScenesStateSnapshot = ({
  store,
  projectService,
  sceneOverviewsById = {},
  traceId,
} = {}) => {
  const startedAt = getScenesPageTimingNow();

  let phaseStartedAt = getScenesPageTimingNow();
  const repositoryState = projectService.getRepositoryState();
  const repositoryStateMs = getScenesPageDurationMs(phaseStartedAt);

  phaseStartedAt = getScenesPageTimingNow();
  const domainState = projectService.getDomainState();
  const domainStateMs = getScenesPageDurationMs(phaseStartedAt);

  phaseStartedAt = getScenesPageTimingNow();
  const sceneData = repositoryState?.scenes ?? { tree: [], items: {} };
  const layoutsData = repositoryState?.layouts ?? { tree: [], items: {} };
  const currentWhiteboardItems = store.selectWhiteboardItems() ?? [];
  const selectCurrentItemsMs = getScenesPageDurationMs(phaseStartedAt);

  phaseStartedAt = getScenesPageTimingNow();
  const orderedSceneIds = getOrderedSceneIds(domainState).filter(
    (sceneId) => domainState?.scenes?.[sceneId]?.type !== "folder",
  );
  const orderScenesMs = getScenesPageDurationMs(phaseStartedAt);

  const sceneItems = buildSceneWhiteboardItems({
    domainState,
    repositoryState,
    sceneOverviewsById,
    currentWhiteboardItems,
    traceId,
  });

  logScenesPageTiming("build-state-snapshot.complete", {
    traceId,
    durationMs: getScenesPageDurationMs(startedAt),
    repositoryStateMs,
    domainStateMs,
    selectCurrentItemsMs,
    orderScenesMs,
    sceneCount: orderedSceneIds.length,
    layoutCount: Object.keys(layoutsData?.items ?? {}).length,
  });

  return {
    repositoryState,
    domainState,
    sceneData,
    layoutsData,
    orderedSceneIds,
    sceneItems,
  };
};

const applyScenesStateSnapshot = ({
  store,
  sceneData,
  layoutsData,
  sceneOverviewsById,
  sceneItems,
  traceId,
} = {}) => {
  const startedAt = getScenesPageTimingNow();

  let phaseStartedAt = getScenesPageTimingNow();
  store.setItems({ scenesData: sceneData });
  const setItemsMs = getScenesPageDurationMs(phaseStartedAt);

  phaseStartedAt = getScenesPageTimingNow();
  store.setLayouts({ layoutsData });
  const setLayoutsMs = getScenesPageDurationMs(phaseStartedAt);

  phaseStartedAt = getScenesPageTimingNow();
  store.setSceneOverviews({ sceneOverviewsById });
  const setSceneOverviewsMs = getScenesPageDurationMs(phaseStartedAt);

  phaseStartedAt = getScenesPageTimingNow();
  store.setWhiteboardItems({ items: sceneItems });
  const setWhiteboardItemsMs = getScenesPageDurationMs(phaseStartedAt);

  logScenesPageTiming("apply-state-snapshot.complete", {
    traceId,
    durationMs: getScenesPageDurationMs(startedAt),
    setItemsMs,
    setLayoutsMs,
    setSceneOverviewsMs,
    setWhiteboardItemsMs,
    sceneItemCount: sceneItems.length,
  });
};

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const navigateToSceneEditor = ({
  appService,
  sceneId,
  sectionId,
  route = "/project/scene-editor",
}) => {
  const currentPayload = appService.getPayload();
  const nextPayload = {
    ...currentPayload,
    s: sceneId,
  };
  delete nextPayload.sceneId;
  if (sectionId) {
    nextPayload.sectionId = sectionId;
  }
  appService.navigate(route, nextPayload);
};

const getCurrentProjectId = (appService) => {
  return appService.getPayload()?.p;
};

const getViewportConfigKey = ({ appService, field } = {}) => {
  const projectId = getCurrentProjectId(appService);
  if (!projectId || !field) {
    return undefined;
  }

  return `scenesMap.viewportByProject.${projectId}.${field}`;
};

const getViewportConfigValue = ({ appService, field } = {}) => {
  const configKey = getViewportConfigKey({ appService, field });
  return configKey ? appService.getUserConfig(configKey) : undefined;
};

const persistViewport = ({ appService, zoomLevel, panX, panY } = {}) => {
  const zoomLevelKey = getViewportConfigKey({
    appService,
    field: "zoomLevel",
  });
  const panXKey = getViewportConfigKey({
    appService,
    field: "panX",
  });
  const panYKey = getViewportConfigKey({
    appService,
    field: "panY",
  });

  if (!zoomLevelKey || !panXKey || !panYKey) {
    return;
  }

  appService.setUserConfig(zoomLevelKey, zoomLevel);
  appService.setUserConfig(panXKey, panX);
  appService.setUserConfig(panYKey, panY);
};

const getPersistedSelectedSceneId = ({ appService, sceneItems } = {}) => {
  const projectId = getCurrentProjectId(appService);
  if (!projectId) {
    return undefined;
  }

  const persistedSceneId = appService.getUserConfig(
    `scenesMap.selectedSceneIdByProject.${projectId}`,
  );
  if (typeof persistedSceneId !== "string" || persistedSceneId.length === 0) {
    return undefined;
  }

  const hasScene = Array.isArray(sceneItems)
    ? sceneItems.some((item) => item?.id === persistedSceneId)
    : false;
  return hasScene ? persistedSceneId : undefined;
};

const persistSelectedSceneId = ({ appService, sceneId } = {}) => {
  const projectId = getCurrentProjectId(appService);
  if (!projectId) {
    return;
  }

  const nextSceneId =
    typeof sceneId === "string" && sceneId.length > 0 ? sceneId : undefined;
  appService.setUserConfig(
    `scenesMap.selectedSceneIdByProject.${projectId}`,
    nextSceneId,
  );
};

const setSelectedScene = ({ store, appService, sceneId } = {}) => {
  store.setSelectedItemId({ itemId: sceneId });
  persistSelectedSceneId({ appService, sceneId });
};

const setSelectedFolder = ({ store, appService, folderId } = {}) => {
  store.setSelectedFolderId({ folderId });
  persistSelectedSceneId({ appService, sceneId: undefined });
};

const dismissMapAddHint = ({ store, appService } = {}) => {
  store.hideMapAddHint();
  appService.setUserConfig("scenesMap.hideAddSceneHint", true);
};

const getSceneItemById = ({ store, sceneId } = {}) => {
  if (!sceneId) {
    return undefined;
  }

  const scenesData = store.selectScenesData();
  const sceneItem = scenesData?.items?.[sceneId];
  if (sceneItem?.type !== "scene") {
    return undefined;
  }
  return sceneItem;
};

const hasTreeNode = ({ nodes, itemId } = {}) => {
  if (!Array.isArray(nodes) || !itemId) {
    return false;
  }

  return nodes.some((node) => {
    if (node?.id === itemId) {
      return true;
    }
    return hasTreeNode({ nodes: node?.children, itemId });
  });
};

const getSceneFolderById = ({ store, folderId } = {}) => {
  if (!folderId) {
    return undefined;
  }

  const item = store.selectSceneItemById({ itemId: folderId });
  if (item && item.type !== "folder") {
    return undefined;
  }
  const scenesData = store.selectScenesData();
  if (!item && !hasTreeNode({ nodes: scenesData?.tree, itemId: folderId })) {
    return undefined;
  }
  return {
    id: folderId,
    ...item,
    type: "folder",
    name: item?.name ?? folderId,
    description: item?.description ?? "",
  };
};

const resolveSceneFormDefaultValues = ({ store } = {}) => {
  const scenesData = store.selectScenesData() ?? { tree: [], items: {} };
  const defaultFolderId = toFlatItems(scenesData).find(
    (item) => item.type === "folder",
  )?.id;

  return {
    name: "",
    folderId: defaultFolderId,
  };
};

const openSceneForm = ({
  deps,
  formPosition,
  whiteboardPosition,
  isWaitingForTransform = false,
} = {}) => {
  const { store, render, refs } = deps;
  const sceneFormValues = resolveSceneFormDefaultValues({ store });

  store.setSceneFormData({ data: sceneFormValues });
  store.setSceneFormPosition({
    position: formPosition,
  });
  store.setSceneWhiteboardPosition({
    position: whiteboardPosition,
  });
  store.setWaitingForTransform({ isWaiting: isWaitingForTransform });
  store.setShowSceneForm({ show: true });
  render();

  const { sceneForm } = refs;
  sceneForm.reset();
  sceneForm.setValues({ values: sceneFormValues });
};

const cancelTouchMinimapHydrationFrame = (store) => {
  const frameId = store.selectTouchMinimapFrameId?.();
  if (frameId === undefined) {
    return;
  }

  cancelScheduledWork(frameId);
  store.clearTouchMinimapFrameId?.();
};

const cancelWhiteboardConnectionsHydrationFrame = (store) => {
  const frameId = store.selectWhiteboardConnectionsFrameId?.();
  if (frameId === undefined) {
    return;
  }

  cancelScheduledWork(frameId);
  store.clearWhiteboardConnectionsFrameId?.();
};

const cancelSceneOverviewRefreshFrame = (store) => {
  const frameId = store.selectSceneOverviewFrameId?.();
  if (frameId === undefined) {
    return;
  }

  cancelScheduledWork(frameId);
  store.clearSceneOverviewFrameId?.();
};

const cancelScheduledWork = (handle) => {
  if (handle === undefined) {
    return;
  }

  if (handle?.type === "idle") {
    globalThis.cancelIdleCallback?.(handle.id);
    return;
  }

  if (handle?.type === "timeout") {
    globalThis.clearTimeout?.(handle.id);
    return;
  }

  if (handle?.type === "animationFrame") {
    globalThis.cancelAnimationFrame?.(handle.id);
    return;
  }

  globalThis.cancelAnimationFrame?.(handle);
};

const scheduleAfterFrames = ({
  frameCount,
  setFrameId,
  clearFrameId,
  callback,
} = {}) => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    callback?.();
    return;
  }

  const scheduleNextFrame = (remainingFrameCount) => {
    const frameId = globalThis.requestAnimationFrame(() => {
      clearFrameId?.();

      if (remainingFrameCount <= 1) {
        callback?.();
        return;
      }

      scheduleNextFrame(remainingFrameCount - 1);
    });

    setFrameId?.(frameId);
  };

  scheduleNextFrame(frameCount);
};

const scheduleIdleWork = ({ setFrameId, clearFrameId, callback } = {}) => {
  if (typeof globalThis.requestIdleCallback === "function") {
    const idleId = globalThis.requestIdleCallback(
      () => {
        clearFrameId?.();
        callback?.();
      },
      { timeout: SCENE_OVERVIEW_IDLE_TIMEOUT_MS },
    );
    setFrameId?.({ type: "idle", id: idleId });
    return;
  }

  callback?.();
};

const scheduleTouchMinimapHydration = ({ store, render } = {}) => {
  if (
    !store.selectIsTouchMode?.() ||
    store.selectIsTouchMinimapReady?.() ||
    store.selectTouchMinimapFrameId?.() !== undefined
  ) {
    return;
  }

  const traceId = createScenesPageTraceId("touch-minimap");
  const scheduledAt = getScenesPageTimingNow();
  logScenesPageTiming("touch-minimap.scheduled", {
    traceId,
    frameCount: TOUCH_MINIMAP_HYDRATION_FRAME_COUNT,
  });

  scheduleAfterFrames({
    frameCount: TOUCH_MINIMAP_HYDRATION_FRAME_COUNT,
    setFrameId: (frameId) => store.setTouchMinimapFrameId?.({ frameId }),
    clearFrameId: () => store.clearTouchMinimapFrameId?.(),
    callback: () => {
      store.setTouchMinimapReady?.({ isReady: true });
      const renderStartedAt = getScenesPageTimingNow();
      render?.();
      logScenesPageTiming("touch-minimap.complete", {
        traceId,
        delayMs: getScenesPageDurationMs(scheduledAt),
        renderMs: getScenesPageDurationMs(renderStartedAt),
      });
    },
  });
};

const scheduleWhiteboardConnectionsHydration = ({ store, render } = {}) => {
  if (
    !store.selectIsTouchMode?.() ||
    store.selectIsWhiteboardConnectionsReady?.() ||
    store.selectWhiteboardConnectionsFrameId?.() !== undefined
  ) {
    return;
  }

  const traceId = createScenesPageTraceId("whiteboard-connections");
  const scheduledAt = getScenesPageTimingNow();
  logScenesPageTiming("whiteboard-connections.scheduled", {
    traceId,
    frameCount: WHITEBOARD_CONNECTIONS_HYDRATION_FRAME_COUNT,
  });

  scheduleAfterFrames({
    frameCount: WHITEBOARD_CONNECTIONS_HYDRATION_FRAME_COUNT,
    setFrameId: (frameId) =>
      store.setWhiteboardConnectionsFrameId?.({ frameId }),
    clearFrameId: () => store.clearWhiteboardConnectionsFrameId?.(),
    callback: () => {
      store.setWhiteboardConnectionsReady?.({ isReady: true });
      const renderStartedAt = getScenesPageTimingNow();
      render?.();
      logScenesPageTiming("whiteboard-connections.complete", {
        traceId,
        delayMs: getScenesPageDurationMs(scheduledAt),
        renderMs: getScenesPageDurationMs(renderStartedAt),
      });
    },
  });
};

const scheduleSceneOverviewRefresh = ({
  store,
  render,
  projectService,
  orderedSceneIds = [],
  requestId,
} = {}) => {
  if (orderedSceneIds.length === 0) {
    return;
  }

  if (store.selectSceneOverviewFrameId?.() !== undefined) {
    return;
  }

  const traceId = `scene-overviews-${requestId}`;
  const scheduledAt = getScenesPageTimingNow();
  logScenesPageTiming("scene-overviews.scheduled", {
    traceId,
    requestId,
    sceneCount: orderedSceneIds.length,
    frameCount: SCENE_OVERVIEW_HYDRATION_FRAME_COUNT,
    idleTimeoutMs: SCENE_OVERVIEW_IDLE_TIMEOUT_MS,
  });

  scheduleAfterFrames({
    frameCount: SCENE_OVERVIEW_HYDRATION_FRAME_COUNT,
    setFrameId: (frameId) => store.setSceneOverviewFrameId?.({ frameId }),
    clearFrameId: () => store.clearSceneOverviewFrameId?.(),
    callback: () => {
      logScenesPageTiming("scene-overviews.frames-complete", {
        traceId,
        delayMs: getScenesPageDurationMs(scheduledAt),
      });
      scheduleIdleWork({
        setFrameId: (frameId) => store.setSceneOverviewFrameId?.({ frameId }),
        clearFrameId: () => store.clearSceneOverviewFrameId?.(),
        callback: () => {
          logScenesPageTiming("scene-overviews.idle-start", {
            traceId,
            delayMs: getScenesPageDurationMs(scheduledAt),
          });
          void refreshSceneOverviews({
            store,
            render,
            projectService,
            orderedSceneIds,
            requestId,
            traceId,
          });
        },
      });
    },
  });
};

const setInitialWhiteboardHydrationState = ({ store } = {}) => {
  if (store.selectIsTouchMode?.()) {
    store.setTouchMinimapReady?.({ isReady: false });
    store.setWhiteboardConnectionsReady?.({ isReady: false });
    return;
  }

  store.setTouchMinimapReady?.({ isReady: true });
  store.setWhiteboardConnectionsReady?.({ isReady: true });
};

const cancelDeferredWhiteboardWork = (store) => {
  cancelTouchMinimapHydrationFrame(store);
  cancelWhiteboardConnectionsHydrationFrame(store);
  cancelSceneOverviewRefreshFrame(store);
};

const hydrateDeferredWhiteboardWork = ({
  store,
  render,
  projectService,
  orderedSceneIds = [],
  requestId,
} = {}) => {
  scheduleWhiteboardConnectionsHydration({ store, render });
  scheduleTouchMinimapHydration({ store, render });

  scheduleSceneOverviewRefresh({
    store,
    render,
    projectService,
    orderedSceneIds,
    requestId,
  });
};

const selectFileExplorerItemAfterRender = ({ refs, itemId, traceId } = {}) => {
  if (!itemId) {
    return;
  }

  const selectItem = () => {
    const startedAt = getScenesPageTimingNow();
    refs.fileexplorer?.selectItem?.({ itemId });
    logScenesPageTiming("file-explorer.restore-selection.complete", {
      traceId,
      durationMs: getScenesPageDurationMs(startedAt),
      itemId,
    });
  };

  if (typeof globalThis.requestAnimationFrame !== "function") {
    selectItem();
    return;
  }

  globalThis.requestAnimationFrame(selectItem);
};

const syncScenesState = ({
  store,
  render,
  projectService,
  shouldRender = true,
  traceId = createScenesPageTraceId("sync"),
} = {}) => {
  const startedAt = getScenesPageTimingNow();
  logScenesPageTiming("sync-state.start", {
    traceId,
    shouldRender,
  });

  const baseSnapshot = buildScenesStateSnapshot({
    store,
    projectService,
    sceneOverviewsById: {},
    traceId,
  });

  applyScenesStateSnapshot({
    store,
    sceneData: baseSnapshot.sceneData,
    layoutsData: baseSnapshot.layoutsData,
    sceneOverviewsById: {},
    sceneItems: baseSnapshot.sceneItems,
    traceId,
  });

  const requestId = store.selectSceneOverviewRequestId() + 1;
  store.setSceneOverviewRequestId({ requestId });
  let renderMs = 0;
  if (shouldRender) {
    const renderStartedAt = getScenesPageTimingNow();
    render?.();
    renderMs = getScenesPageDurationMs(renderStartedAt);
  }

  logScenesPageTiming("sync-state.complete", {
    traceId,
    durationMs: getScenesPageDurationMs(startedAt),
    renderMs,
    sceneCount: baseSnapshot.orderedSceneIds.length,
    requestId,
  });

  return {
    ...baseSnapshot,
    requestId,
  };
};

const refreshSceneOverviews = async ({
  store,
  render,
  projectService,
  orderedSceneIds = [],
  requestId,
  traceId = `scene-overviews-${requestId}`,
} = {}) => {
  if (orderedSceneIds.length === 0) {
    return;
  }

  const startedAt = getScenesPageTimingNow();
  logScenesPageTiming("scene-overviews.refresh-start", {
    traceId,
    requestId,
    sceneCount: orderedSceneIds.length,
  });

  try {
    let phaseStartedAt = getScenesPageTimingNow();
    const sceneOverviewsById = await projectService.loadSceneOverviews({
      sceneIds: orderedSceneIds,
    });
    const loadOverviewsMs = getScenesPageDurationMs(phaseStartedAt);
    if (store.selectSceneOverviewRequestId() !== requestId) {
      logScenesPageTiming("scene-overviews.refresh-stale", {
        traceId,
        durationMs: getScenesPageDurationMs(startedAt),
        loadOverviewsMs,
        requestId,
        currentRequestId: store.selectSceneOverviewRequestId(),
      });
      return;
    }

    phaseStartedAt = getScenesPageTimingNow();
    const resolvedSnapshot = buildScenesStateSnapshot({
      store,
      projectService,
      sceneOverviewsById,
      traceId,
    });
    const buildSnapshotMs = getScenesPageDurationMs(phaseStartedAt);

    phaseStartedAt = getScenesPageTimingNow();
    applyScenesStateSnapshot({
      store,
      sceneData: resolvedSnapshot.sceneData,
      layoutsData: resolvedSnapshot.layoutsData,
      sceneOverviewsById,
      sceneItems: resolvedSnapshot.sceneItems,
      traceId,
    });
    const applySnapshotMs = getScenesPageDurationMs(phaseStartedAt);

    phaseStartedAt = getScenesPageTimingNow();
    render?.();
    const renderMs = getScenesPageDurationMs(phaseStartedAt);

    logScenesPageTiming("scene-overviews.refresh-complete", {
      traceId,
      durationMs: getScenesPageDurationMs(startedAt),
      loadOverviewsMs,
      buildSnapshotMs,
      applySnapshotMs,
      renderMs,
      sceneCount: orderedSceneIds.length,
      overviewCount: Object.keys(sceneOverviewsById ?? {}).length,
    });
  } catch (error) {
    logScenesPageTiming("scene-overviews.refresh-failed", {
      traceId,
      durationMs: getScenesPageDurationMs(startedAt),
      error: error?.message ?? "unknown",
    });
    return;
  }
};

const openEditDialogWithValues = ({ deps, sceneId } = {}) => {
  const { store, refs, render, appService } = deps;
  if (!sceneId) {
    return;
  }

  const sceneItem = getSceneItemById({ store, sceneId });
  if (!sceneItem) {
    return;
  }

  const editValues = {
    name: sceneItem.name ?? "",
    description: sceneItem.description ?? "",
  };

  setSelectedScene({ store, appService, sceneId });
  const { fileexplorer, editForm } = refs;
  fileexplorer?.selectItem({ itemId: sceneId });
  store.openEditDialog({
    itemId: sceneId,
    itemType: "scene",
    defaultValues: editValues,
  });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

const openFolderEditDialogWithValues = ({ deps, folderId } = {}) => {
  const { store, refs, render } = deps;
  const folder = getSceneFolderById({ store, folderId });
  if (!folder) {
    return false;
  }

  const editValues = {
    name: folder.name ?? "",
    description: folder.description ?? "",
  };

  refs.fileexplorer?.selectItem?.({ itemId: folderId });
  store.openEditDialog({
    itemId: folderId,
    itemType: "folder",
    defaultValues: editValues,
  });
  render();
  refs.editForm?.reset?.();
  refs.editForm?.setValues?.({ values: editValues });
  return true;
};

export const handleBeforeMount = (deps) => {
  const traceId = createScenesPageTraceId("before-mount");
  const startedAt = getScenesPageTimingNow();
  const { store, uiConfig } = deps;
  logScenesPageTiming("before-mount.start", { traceId });

  store.setUiConfig({ uiConfig });

  const subscriptionStartedAt = getScenesPageTimingNow();
  const subscription = createCollabRemoteRefreshStream({
    deps,
    matches: matchesRemoteTargets(["scenes", "layouts", "story"]),
    refresh: refreshScenesData,
  }).subscribe();
  const subscribeMs = getScenesPageDurationMs(subscriptionStartedAt);

  logScenesPageTiming("before-mount.complete", {
    traceId,
    durationMs: getScenesPageDurationMs(startedAt),
    subscribeMs,
    isTouchMode: store.selectIsTouchMode?.() === true,
  });

  return () => {
    const cleanupStartedAt = getScenesPageTimingNow();
    subscription.unsubscribe();
    cancelDeferredWhiteboardWork(store);
    logScenesPageTiming("before-mount.cleanup", {
      traceId,
      durationMs: getScenesPageDurationMs(cleanupStartedAt),
    });
  };
};

export const handleAfterMount = async (deps) => {
  const traceId = createScenesPageTraceId("after-mount");
  const startedAt = getScenesPageTimingNow();
  const { store, projectService, render, refs, appService } = deps;

  logScenesPageTiming("after-mount.start", { traceId });

  let phaseStartedAt = getScenesPageTimingNow();
  await projectService.ensureRepository();
  const projectInfo = await projectService.getCurrentProjectInfo();
  store.setProjectLanguage({ language: projectInfo.language });
  const ensureRepositoryMs = getScenesPageDurationMs(phaseStartedAt);
  logScenesPageTiming("after-mount.repository-ready", {
    traceId,
    ensureRepositoryMs,
  });

  phaseStartedAt = getScenesPageTimingNow();
  setInitialWhiteboardHydrationState({ store });
  const initialSnapshot = syncScenesState({
    store,
    render,
    projectService,
    shouldRender: false,
    traceId: `${traceId}:initial-sync`,
  });
  const sceneItems = initialSnapshot?.sceneItems ?? [];
  const initialStateMs = getScenesPageDurationMs(phaseStartedAt);

  phaseStartedAt = getScenesPageTimingNow();
  const shouldHideMapAddHint =
    appService.getUserConfig("scenesMap.hideAddSceneHint") === true;
  if (shouldHideMapAddHint) {
    store.hideMapAddHint();
  }

  const persistedSelectedSceneId = getPersistedSelectedSceneId({
    appService,
    sceneItems,
  });
  if (persistedSelectedSceneId) {
    setSelectedScene({
      store,
      appService,
      sceneId: persistedSelectedSceneId,
    });
  }

  const initialViewport = resolveInitialWhiteboardViewport({
    appService,
    items: sceneItems,
  });
  const restoreUiStateMs = getScenesPageDurationMs(phaseStartedAt);

  const { whiteboard } = refs;

  phaseStartedAt = getScenesPageTimingNow();
  whiteboard.transformedHandlers.handleInitialZoomAndPanSetup({
    panX: initialViewport.panX,
    panY: initialViewport.panY,
    zoomLevel: initialViewport.zoomLevel,
  });
  const setupViewportMs = getScenesPageDurationMs(phaseStartedAt);

  if (initialViewport.didReset) {
    persistViewport({
      appService,
      zoomLevel: initialViewport.zoomLevel,
      panX: initialViewport.panX,
      panY: initialViewport.panY,
    });
  }

  phaseStartedAt = getScenesPageTimingNow();
  render();
  const renderMs = getScenesPageDurationMs(phaseStartedAt);
  logScenesPageTiming("after-mount.initial-render-complete", {
    traceId,
    renderMs,
    sceneCount: sceneItems.length,
    persistedSelection: Boolean(persistedSelectedSceneId),
  });

  if (persistedSelectedSceneId && !store.selectIsTouchMode?.()) {
    selectFileExplorerItemAfterRender({
      refs,
      itemId: persistedSelectedSceneId,
      traceId,
    });
  }
  hydrateDeferredWhiteboardWork({
    store,
    render,
    projectService,
    orderedSceneIds: initialSnapshot?.orderedSceneIds ?? [],
    requestId: initialSnapshot?.requestId,
  });

  phaseStartedAt = getScenesPageTimingNow();
  focusFileExplorerKeyboardScope(deps);
  const focusKeyboardScopeMs = getScenesPageDurationMs(phaseStartedAt);

  logScenesPageTiming("after-mount.complete", {
    traceId,
    durationMs: getScenesPageDurationMs(startedAt),
    ensureRepositoryMs,
    initialStateMs,
    restoreUiStateMs,
    setupViewportMs,
    renderMs,
    focusKeyboardScopeMs,
    sceneCount: sceneItems.length,
  });
};

export const handleSetInitialScene = async (sceneId, deps) => {
  const { projectService } = deps;
  await projectService.setInitialScene({ sceneId });
};

const refreshScenesData = async (deps) => {
  const traceId = createScenesPageTraceId("refresh");
  const startedAt = getScenesPageTimingNow();
  const { store, render, projectService } = deps;
  logScenesPageTiming("refresh.start", { traceId });

  cancelDeferredWhiteboardWork(store);
  setInitialWhiteboardHydrationState({ store });
  const snapshot = syncScenesState({
    store,
    render,
    projectService,
    traceId: `${traceId}:sync`,
  });
  hydrateDeferredWhiteboardWork({
    store,
    render,
    projectService,
    orderedSceneIds: snapshot?.orderedSceneIds ?? [],
    requestId: snapshot?.requestId,
  });

  logScenesPageTiming("refresh.complete", {
    traceId,
    durationMs: getScenesPageDurationMs(startedAt),
    sceneCount: snapshot?.orderedSceneIds?.length ?? 0,
    requestId: snapshot?.requestId,
  });
};

const {
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged,
} = createScenesFileExplorerHandlers({
  refresh: refreshScenesData,
  copy: selectCopy,
});
const {
  focusKeyboardScope: focusFileExplorerKeyboardScope,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  fileExplorerRefName: "fileexplorer",
});

export {
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
};

export const handleFileExplorerAction = async (deps, payload) => {
  const detail = payload?._event?.detail ?? {};
  const action = (detail.item || detail)?.value;
  const itemId = resolveDetailItemId(detail);

  if (
    action === "rename-item" &&
    openFolderEditDialogWithValues({
      deps,
      folderId: itemId,
    })
  ) {
    return;
  }

  await handleBaseFileExplorerAction(deps, payload);
};

export const handleDataChanged = refreshScenesData;

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render, refs, appService } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  const isFolder = detail.isFolder === true || detail.item?.type === "folder";

  if (isFolder) {
    setSelectedFolder({ store, appService, folderId: itemId });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  if (!itemId) {
    return;
  }

  setSelectedScene({ store, appService, sceneId: itemId });
  if (store.selectIsMobileFileExplorerOpen?.()) {
    store.closeMobileFileExplorer?.();
  }
  render();
  refs.whiteboard?.ensureItemVisible?.({
    itemId,
    behavior: "smooth",
    durationMs: 160,
  });
  focusFileExplorerKeyboardScope(deps);
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, appService } = deps;
  const detail = payload?._event?.detail ?? {};
  const itemId = resolveDetailItemId(detail);
  const isFolder =
    detail.isFolder === true ||
    detail.item?.type === "folder" ||
    detail.itemType === "folder";

  if (isFolder || !itemId) {
    return;
  }

  setSelectedScene({ store, appService, sceneId: itemId });
  navigateToSceneEditor({ appService, sceneId: itemId });
};

export const handleFileExplorerClickItem = (deps) => {
  const { appService } = deps;
  const currentPayload = appService.getPayload();
  appService.navigate("/project/scene-editor", currentPayload);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const handleWhiteboardItemPositionUpdating = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId, x, y } = payload._event.detail;

  // Only update local whiteboard state for real-time feedback
  // Don't update repository during drag (too expensive)
  store.updateItemPosition({ itemId, x, y });
  render();
};

export const handleWhiteboardItemPositionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId, x, y } = payload._event.detail;
  const nextX = Number(x);
  const nextY = Number(y);

  if (!itemId || !Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    console.error("[scenes] invalid position payload from whiteboard", {
      itemId,
      x,
      y,
    });
    return;
  }

  const currentScene = store.selectScenesData()?.items?.[itemId];
  const currentX = Number(currentScene?.position?.x);
  const currentY = Number(currentScene?.position?.y);

  if (currentX === nextX && currentY === nextY) {
    return;
  }

  await projectService.updateSceneItem({
    sceneId: itemId,
    data: {
      position: { x: nextX, y: nextY },
    },
  });

  // Keep local UI and the last persisted scene snapshot aligned.
  store.updatePersistedScenePosition({ itemId, x: nextX, y: nextY });
  store.updateItemPosition({ itemId, x: nextX, y: nextY });
  render();
};

export const handleWhiteboardItemSelected = (deps, payload) => {
  const { store, render, appService } = deps;
  const { itemId } = payload._event.detail;

  // Update selected item for detail panel
  setSelectedScene({ store, appService, sceneId: itemId });
  render();
};

export const handleWhiteboardItemDoubleClick = (deps, payload) => {
  const { store, appService } = deps;
  const itemId = resolveDetailItemId(payload?._event?.detail);

  if (!itemId) {
    console.error("ERROR: itemId is missing in double-click event");
    return;
  }

  setSelectedScene({ store, appService, sceneId: itemId });
  navigateToSceneEditor({ appService, sceneId: itemId });
};

export const handleAddSceneClick = (deps) => {
  const { store, render } = deps;

  // Start waiting for transform
  store.setWaitingForTransform({ isWaiting: true });
  render();
};

export const handleWhiteboardClick = (deps, payload) => {
  const { store } = deps;
  const isWaitingForTransform = store.selectIsWaitingForTransform();

  if (isWaitingForTransform) {
    // Get click position relative to whiteboard
    const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;
    openSceneForm({
      deps,
      formPosition: { x: formX, y: formY },
      whiteboardPosition: { x: whiteboardX, y: whiteboardY },
      isWaitingForTransform: false,
    });
  }
};

export const handleWhiteboardCanvasContextMenu = (deps, payload) => {
  const { formX, formY, whiteboardX, whiteboardY } = payload._event.detail;
  openSceneForm({
    deps,
    formPosition: { x: formX, y: formY },
    whiteboardPosition: { x: whiteboardX, y: whiteboardY },
  });
};

export const handleSceneFormClose = (deps) => {
  const { store, render } = deps;
  store.resetSceneForm();
  render();
};

export const handleSceneFormAction = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const copy = selectCopy(deps);
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    if (!store.selectShowSceneForm()) {
      return;
    }

    const sceneWhiteboardPosition = store.selectSceneWhiteboardPosition() || {
      x: 0,
      y: 0,
    };

    // Get form values from the event detail (same pattern as text styles)
    const formData = payload._event.detail.values;

    store.resetSceneForm();
    render();

    // Use a simple ID generator instead of nanoid
    const newSceneId = generatePrefixedId("scene-");

    const sectionId = generateId();
    const stepId = generateId();

    // Get repository resources to find first dialogue layout and control
    const { layouts, controls } = projectService.getRepositoryState();
    let dialogueLayoutId = null;
    let controlId = null;

    if (layouts && layouts.items) {
      // Find first dialogue layout
      for (const [layoutId, layout] of Object.entries(layouts.items)) {
        if (!dialogueLayoutId && layout.layoutType === "dialogue-adv") {
          dialogueLayoutId = layoutId;
        }
        if (dialogueLayoutId) {
          break;
        }
      }
    }

    if (controls && controls.items) {
      for (const [itemId, control] of Object.entries(controls.items)) {
        if (control.type === "control") {
          controlId = itemId;
          break;
        }
      }
    }

    // Create actions object with dialogue and control layouts if found
    const actions = {
      dialogue: dialogueLayoutId
        ? {
            ui: {
              resourceId: dialogueLayoutId,
            },
            mode: "adv",
            content: [{ text: "" }],
          }
        : {
            mode: "adv",
            content: [{ text: "" }],
          },
    };

    if (controlId) {
      actions.control = {
        resourceId: controlId,
        resourceType: "control",
      };
    }

    try {
      const createSceneResult =
        await projectService.createSceneWithInitialContent({
          sceneId: newSceneId,
          parentId: formData.folderId || null,
          position: "last",
          data: {
            name:
              formData.name ||
              formatI18nCopy(copy.sceneFallback ?? "Scene {time}", {
                time: new Date().toLocaleTimeString(),
              }),
            position: {
              x: sceneWhiteboardPosition.x,
              y: sceneWhiteboardPosition.y,
            },
          },
          sectionId,
          sectionData: {
            name: formatI18nCopy(copy.sectionFallback ?? "Section {index}", {
              index: 1,
            }),
          },
          lineId: stepId,
          lineData: {
            actions,
          },
        });
      if (createSceneResult?.valid === false) {
        throw createSceneResult;
      }

      // Add to whiteboard items for visual display
      store.addWhiteboardItem({
        newItem: {
          id: newSceneId,
          name: formData.name,
          x: sceneWhiteboardPosition.x,
          y: sceneWhiteboardPosition.y,
        },
      });
      dismissMapAddHint({ store, appService });
      recordRecentSceneVisit({
        appService,
        projectId: getCurrentProjectId(appService),
        sceneId: newSceneId,
      });

      await refreshScenesData(deps);
      render();
    } catch (error) {
      appService.showAlert({
        message: getProjectErrorMessage(
          error,
          copy.failedCreateScene ?? "Failed to create scene.",
        ),
      });
      await refreshScenesData(deps);
      render();
    }
  }
};

export const handleWhiteboardItemDelete = async (deps, payload) => {
  const { store, projectService, appService } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;

  const deleteResult = await projectService.deleteSceneIfUnused({
    sceneId: itemId,
  });
  if (!deleteResult.deleted) {
    appService.showAlert({
      message: deleteResult.usage?.isUsed
        ? (copy.cannotDeleteResourceInUse ??
          "Cannot delete resource, it is currently in use.")
        : (copy.failedDeleteResource ?? "Failed to delete resource."),
    });
    return;
  }

  // Clear selection if the deleted item was selected
  const selectedItemId = store.selectSelectedItemId();
  if (selectedItemId === itemId) {
    setSelectedScene({ store, appService, sceneId: undefined });
  }
  await refreshScenesData(deps);
};

export const handleWhiteboardItemContextMenu = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, x, y } = payload._event.detail;

  // Show dropdown menu at the provided position
  store.showDropdownMenu({
    position: { x, y },
    itemId,
  });

  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleMapAddHintClose = (deps) => {
  const { store, render, appService } = deps;
  dismissMapAddHint({ store, appService });
  render();
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  const selectedFolderId = store.selectSelectedFolderId();
  if (selectedFolderId) {
    openFolderEditDialogWithValues({ deps, folderId: selectedFolderId });
    return;
  }

  openEditDialogWithValues({ deps, sceneId: selectedItemId });
};

export const handleDetailPreviewClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  store.showPreviewSceneId({ sceneId: selectedItemId });
  render();
};

export const handleMobileFileExplorerOpen = (deps) => {
  const { store, render, refs } = deps;
  const selectedItemId = store.selectSelectedItemId();
  const selectedFolderId = store.selectSelectedFolderId();
  const selectedExplorerItemId = selectedItemId ?? selectedFolderId;

  store.openMobileFileExplorer();
  render();

  if (selectedExplorerItemId) {
    requestAnimationFrame(() => {
      refs.fileexplorer?.selectItem?.({ itemId: selectedExplorerItemId });
    });
  }
};

export const handleMobileFileExplorerClose = (deps) => {
  const { store, render } = deps;

  store.closeMobileFileExplorer();
  render();
  focusFileExplorerKeyboardScope(deps);
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const copy = selectCopy(deps);
  const detail = payload._event.detail;
  const itemId = store.selectDropdownMenuItemId();

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  // Hide dropdown
  store.hideDropdownMenu();
  render();

  if (item.value === "open-item" && itemId) {
    navigateToSceneEditor({ appService, sceneId: itemId });
    return;
  }

  if (item.value === "preview-item" && itemId) {
    store.showPreviewSceneId({ sceneId: itemId });
    render();
    return;
  }

  if (item.value === "edit-item" && itemId) {
    openEditDialogWithValues({ deps, sceneId: itemId });
    return;
  }

  // Handle set initial scene action
  if (item.value === "set-initial" && itemId) {
    await projectService.setInitialScene({ sceneId: itemId });
    await refreshScenesData(deps);
  }

  // Handle delete action
  if (item.value === "delete-item" && itemId) {
    const deleteResult = await projectService.deleteSceneIfUnused({
      sceneId: itemId,
    });
    if (!deleteResult.deleted) {
      appService.showAlert({
        message: deleteResult.usage?.isUsed
          ? (copy.cannotDeleteResourceInUse ??
            "Cannot delete resource, it is currently in use.")
          : (copy.failedDeleteResource ?? "Failed to delete resource."),
      });
      return;
    }

    // Clear selection if the deleted item was selected
    const selectedItemId = store.selectSelectedItemId();
    if (selectedItemId === itemId) {
      setSelectedScene({ store, appService, sceneId: undefined });
    }
    await refreshScenesData(deps);
  }
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, render, appService, projectService } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  const editItem = store.selectEditItem();
  const editItemType = editItem.itemType ?? "scene";
  if (!name) {
    appService.showAlert({
      message:
        editItemType === "folder"
          ? (copy.folderNameRequired ?? "Folder name is required.")
          : (copy.sceneNameRequired ?? "Scene name is required."),
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const editItemId = editItem.itemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const updateResult = await projectService.updateSceneItem({
    sceneId: editItemId,
    data: {
      name,
      description: values?.description ?? "",
    },
  });

  if (updateResult?.valid === false) {
    appService.showAlert({
      message: getProjectErrorMessage(
        updateResult,
        editItemType === "folder"
          ? (copy.failedUpdateFolder ?? "Failed to update folder.")
          : (copy.failedUpdateScene ?? "Failed to update scene."),
      ),
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  store.closeEditDialog();
  await refreshScenesData(deps);
};

export const handleSectionsListToggle = (deps) => {
  const { store, render } = deps;
  store.toggleSectionsList();
  store.hideDeadEndTooltip();
  render();
};

export const handleDeadEndWarningMouseEnter = (deps, payload) => {
  const { store, render } = deps;
  const copy = selectCopy(deps);
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showDeadEndTooltip({
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    content: copy.deadEndTooltipContent ?? DEAD_END_TOOLTIP_CONTENT,
  });
  render();
};

export const handleDeadEndWarningMouseLeave = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  render();
};

export const handleSectionsListItemClick = (deps, payload) => {
  const { appService } = deps;
  const sceneId = payload._event.currentTarget.dataset.sceneId;
  const sectionId = payload._event.currentTarget.dataset.sectionId;

  if (!sceneId || !sectionId) {
    return;
  }

  navigateToSceneEditor({ appService, sceneId, sectionId });
};

export const handleWhiteboardZoomChanged = (deps, payload) => {
  const { appService } = deps;
  const { zoomLevel } = payload._event.detail;
  const configKey = getViewportConfigKey({
    appService,
    field: "zoomLevel",
  });
  if (!configKey) {
    return;
  }

  appService.setUserConfig(configKey, zoomLevel);
};

export const handleWhiteboardPanChanged = (deps, payload) => {
  const { appService } = deps;
  const { panX, panY } = payload._event.detail;
  const panXKey = getViewportConfigKey({
    appService,
    field: "panX",
  });
  const panYKey = getViewportConfigKey({
    appService,
    field: "panY",
  });
  if (!panXKey || !panYKey) {
    return;
  }

  appService.setUserConfig(panXKey, panX);
  appService.setUserConfig(panYKey, panY);
};
