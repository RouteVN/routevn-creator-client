import { generateId } from "../../internal/id.js";
import {
  createAnimationEditorPayload,
  getAnimationEditorBackPath,
  resolveAnimationEditorPayload,
} from "../../internal/animationEditorRoute.js";
import {
  isTransitionMaskComplete,
  serializeTransitionMask,
} from "../../internal/animationMasks.js";
import { resolveResourceFileType } from "../../internal/resourceFileMetadata.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  addKeyframeDefaultValues,
  AUTO_TWEEN_DEFAULT_DURATION,
  AUTO_TWEEN_DEFAULT_EASING,
  TIMELINE_ZOOM_STEP,
} from "./animationEditor.constants.js";
import {
  clearScheduledAnimationEditorAutosave,
  scheduleAnimationEditorAutosave,
} from "./support/animationEditorAutosave.js";
import { selectAnimationEditorPageCopy } from "./support/animationEditorPageCopy.js";

const normalizeTween = (properties = {}) => {
  return Object.fromEntries(
    Object.entries(properties).map(([property, config]) => {
      if (config?.auto) {
        return [
          property,
          {
            auto: {
              duration:
                Number(config.auto.duration) || AUTO_TWEEN_DEFAULT_DURATION,
              easing: config.auto.easing ?? AUTO_TWEEN_DEFAULT_EASING,
            },
          },
        ];
      }

      const normalizedConfig = {
        keyframes: (config?.keyframes ?? []).map((keyframe) => {
          const normalizedKeyframe = {
            duration: Number(keyframe.duration) || 0,
            value: Number(keyframe.value) || 0,
            easing: keyframe.easing ?? "linear",
            relative: keyframe.relative ?? false,
          };
          const delay = Math.max(0, Number(keyframe.delay) || 0);
          if (delay > 0) {
            normalizedKeyframe.delay = delay;
          }
          return normalizedKeyframe;
        }),
      };

      if (config?.initialValue !== undefined && config.initialValue !== "") {
        normalizedConfig.initialValue = Number(config.initialValue) || 0;
      }

      return [property, normalizedConfig];
    }),
  );
};

const getEditorPayload = (appService) => {
  return resolveAnimationEditorPayload(appService.getPayload() || {});
};

const DEFAULT_NEW_ANIMATION_NAME = "New Animation";

const selectCopy = ({ i18n } = {}) => selectAnimationEditorPageCopy(i18n);

const getDefaultNewAnimationName = (copy = {}) => {
  return copy.newAnimationName ?? DEFAULT_NEW_ANIMATION_NAME;
};

const isSpaceKey = (event) => {
  return (
    event?.code === "Space" || event?.key === " " || event?.key === "Spacebar"
  );
};

const isTextEntryEvent = (event) => {
  const target = event?.composedPath?.()[0] ?? event?.target;
  if (target?.isContentEditable) {
    return true;
  }

  return ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName);
};

const stopPreviewPlaybackIndicator = ({
  preservePlayhead = false,
  store,
} = {}) => {
  const frameId = store.selectPreviewPlaybackFrameId();
  if (frameId !== undefined) {
    globalThis.cancelAnimationFrame(frameId);
  }

  store.stopPreviewPlayback(preservePlayhead ? { preservePlayhead: true } : {});
};

const schedulePreviewPlaybackIndicatorFrame = ({
  graphicsService,
  render,
  store,
} = {}) => {
  const startedAtMs = store.selectPreviewPlaybackStartedAtMs();
  const durationMs = store.selectPreviewPlaybackDurationMs();

  if (startedAtMs === undefined || durationMs === undefined) {
    return;
  }

  const frameId = globalThis.requestAnimationFrame((timestamp) => {
    const elapsedMs = Math.max(0, timestamp - startedAtMs);
    const loopEnabled = store.selectPreviewLoopEnabled();
    const completedCycle = elapsedMs >= durationMs;
    const nextTimeMs = loopEnabled
      ? Math.round(elapsedMs % durationMs)
      : Math.min(durationMs, Math.round(elapsedMs));

    if (loopEnabled && completedCycle) {
      store.startPreviewPlayback({
        startedAtMs: timestamp - nextTimeMs,
        durationMs,
      });
    }

    graphicsService.setAnimationTime(nextTimeMs);
    store.setPreviewPlayhead({
      timeMs: nextTimeMs,
      visible: true,
    });

    if (!loopEnabled && completedCycle) {
      stopPreviewPlaybackIndicator({
        store,
      });
      render();
      return;
    }

    schedulePreviewPlaybackIndicatorFrame({
      graphicsService,
      render,
      store,
    });
    render();
  });

  store.setPreviewPlaybackFrameId({
    frameId,
  });
};

const invalidatePreview = ({ store } = {}) => {
  stopPreviewPlaybackIndicator({
    store,
  });
  store.bumpPreviewRenderVersion({});
};

const collectRuntimeMaskTextureIds = (mask = {}) => {
  if (!mask) {
    return [];
  }

  if (mask.kind === "single") {
    return mask.texture ? [mask.texture] : [];
  }

  if (mask.kind === "sequence") {
    return (mask.textures ?? []).filter(Boolean);
  }

  return (mask.items ?? []).map((item) => item?.texture).filter(Boolean);
};

const collectRuntimeElementTextureIds = (elements = []) => {
  const textureIds = [];

  for (const element of elements ?? []) {
    if (element?.type === "sprite" && element.src) {
      textureIds.push(element.src);
    }

    if (Array.isArray(element?.children)) {
      textureIds.push(...collectRuntimeElementTextureIds(element.children));
    }
  }

  return textureIds;
};

const collectRuntimeRenderStateTextureIds = (renderState = {}) => {
  return [
    ...collectRuntimeElementTextureIds(renderState.elements),
    ...(renderState.animations ?? []).flatMap((animation) =>
      collectRuntimeMaskTextureIds(animation.mask),
    ),
  ];
};

const ensurePreviewAssetsLoaded = async ({
  graphicsService,
  projectService,
  renderState,
} = {}) => {
  if (!graphicsService || !projectService || !renderState) {
    return renderState;
  }

  const renderStates = Array.isArray(renderState) ? renderState : [renderState];
  const textureIds = Array.from(
    new Set(renderStates.flatMap(collectRuntimeRenderStateTextureIds)),
  );

  if (textureIds.length === 0) {
    return renderState;
  }

  const repositoryState = projectService.getRepositoryState() ?? {};
  const imageItems = repositoryState.images?.items ?? {};
  const imageItemsByFileId = new Map(
    Object.values(imageItems)
      .filter((item) => item?.fileId)
      .map((item) => [item.fileId, item]),
  );
  const assets = {};

  for (const fileId of textureIds) {
    const fileResult = await projectService.getFileContent(fileId);
    const imageItem = imageItemsByFileId.get(fileId);
    assets[fileId] = {
      url: fileResult.url,
      type:
        resolveResourceFileType({
          item: imageItem,
          files: repositoryState.files,
        }) ?? "image/png",
    };
  }

  await graphicsService.loadAssets(assets);
  return renderState;
};

const renderPreviewAnimationState = async ({
  graphicsService,
  projectService,
  store,
  shouldContinue,
} = {}) => {
  if (!graphicsService) {
    return false;
  }

  const resetState = store.selectAnimationResetState();
  const renderState = store.selectAnimationRenderStateWithAnimations();
  await ensurePreviewAssetsLoaded({
    graphicsService,
    projectService,
    renderState: [resetState, renderState],
  });

  if (shouldContinue?.() === false) {
    return false;
  }

  await graphicsService.render(resetState);

  if (shouldContinue?.() === false) {
    return false;
  }

  await graphicsService.render(renderState);
  return true;
};

const clearPreviewCanvas = async ({ graphicsService } = {}) => {
  if (!graphicsService) {
    return;
  }

  graphicsService.setAnimationPlaybackMode("manual");
  graphicsService.setAnimationTime(0);
  await graphicsService.render({
    elements: [],
    animations: [],
  });
};

const waitForPreviewPaint = async () => {
  await new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        globalThis.setTimeout(resolve, 0);
      });
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });
};

const {
  focusKeyboardScope: focusImageSelectorKeyboardScope,
  handleKeyboardScopeClick: handleImageSelectorKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleImageSelectorKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  fileExplorerRefName: "imageSelectorFileExplorer",
  keyboardScopeRefName: "imageSelectorKeyboardScope",
});

const preparePreviewPlaybackAtStart = async ({
  graphicsService,
  projectService,
  startTimeMs = 0,
  store,
  shouldContinue,
} = {}) => {
  if (!graphicsService) {
    return false;
  }

  stopPreviewPlaybackIndicator({
    preservePlayhead: true,
    store,
  });
  graphicsService.setAnimationPlaybackMode("manual");
  graphicsService.setAnimationTime(startTimeMs);
  const rendered = await renderPreviewAnimationState({
    graphicsService,
    projectService,
    store,
    shouldContinue,
  });
  if (!rendered) {
    return false;
  }

  if (shouldContinue?.() === false) {
    return false;
  }

  graphicsService.setAnimationTime(startTimeMs);
  store.setPreviewPlaybackMode({
    mode: "manual",
  });
  store.markPreviewPrepared({});
  return true;
};

const ensureManualPreviewAtTime = async ({
  graphicsService,
  projectService,
  store,
  timeMs,
} = {}) => {
  if (!graphicsService || timeMs === undefined) {
    return;
  }

  const needsPreparation =
    store.selectPreviewPlaybackMode() !== "manual" ||
    store.selectPreviewPreparedVersion() !== store.selectPreviewRenderVersion();

  if (needsPreparation) {
    stopPreviewPlaybackIndicator({
      preservePlayhead: true,
      store,
    });
    graphicsService.setAnimationPlaybackMode("manual");
    graphicsService.setAnimationTime(timeMs);
    await renderPreviewAnimationState({
      graphicsService,
      projectService,
      store,
    });
    store.setPreviewPlaybackMode({
      mode: "manual",
    });
    store.markPreviewPrepared({});
  }

  graphicsService.setAnimationTime(timeMs);
  return needsPreparation;
};

const renderPreviewForThumbnailCapture = async ({
  graphicsService,
  projectService,
  resetCanvas = false,
  store,
} = {}) => {
  if (!graphicsService) {
    return;
  }

  const captureTimeMs = store.selectPreviewPlayheadVisible()
    ? (store.selectPreviewPlayheadTimeMs() ?? 0)
    : 0;

  if (resetCanvas) {
    await clearPreviewCanvas({
      graphicsService,
    });
  }

  await ensureManualPreviewAtTime({
    graphicsService,
    projectService,
    store,
    timeMs: captureTimeMs,
  });
};

const getAnimationItem = ({ repositoryState, animationId } = {}) => {
  const item = repositoryState?.animations?.items?.[animationId];
  return item?.type === "animation" ? item : undefined;
};

const resolvePersistedTransitionMask = ({ store, serializedMask } = {}) => {
  if (store.selectTransitionMaskRemoved()) {
    return undefined;
  }

  if (serializedMask) {
    return serializedMask;
  }

  if (!store.selectEditMode()) {
    return undefined;
  }

  return structuredClone(store.selectEditItemData()?.animation?.mask);
};

const createAnimationPersistSnapshot = ({ copy, store } = {}) => {
  const dialogType = store.selectDialogType();
  let animationData;

  if (dialogType === "transition") {
    const prevTween = normalizeTween(store.selectProperties({ side: "prev" }));
    const nextTween = normalizeTween(store.selectProperties({ side: "next" }));
    const serializedTransitionMask = serializeTransitionMask(
      store.selectTransitionMask(),
    );
    const transitionMask = resolvePersistedTransitionMask({
      store,
      serializedMask: serializedTransitionMask,
    });

    animationData = {
      type: "transition",
    };

    if (Object.keys(prevTween).length > 0) {
      animationData.prev = {
        tween: prevTween,
      };
    }

    if (Object.keys(nextTween).length > 0) {
      animationData.next = {
        tween: nextTween,
      };
    }

    if (transitionMask) {
      animationData.mask = transitionMask;
    }
  } else {
    animationData = {
      type: "update",
      tween: normalizeTween(store.selectProperties({ side: "update" })),
    };
  }

  return {
    editMode: store.selectEditMode(),
    editItemId: store.selectEditItemId(),
    targetGroupId: store.selectTargetGroupId(),
    name:
      store.selectAnimationName().trim() || getDefaultNewAnimationName(copy),
    description: store.selectAnimationDescription(),
    animationData,
  };
};

const persistEditorSnapshot = async ({ deps, snapshot } = {}) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  let savedAnimationId = snapshot.editItemId;
  let mutationAttempt;

  if (snapshot.editMode && savedAnimationId) {
    mutationAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage:
        copy.failedUpdateAnimation ?? "Failed to update animation.",
      action: () =>
        projectService.updateAnimation({
          animationId: savedAnimationId,
          data: {
            name: snapshot.name,
            description: snapshot.description,
            animation: snapshot.animationData,
          },
        }),
    });
  } else {
    savedAnimationId = generateId();
    mutationAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage:
        copy.failedCreateAnimation ?? "Failed to create animation.",
      action: () =>
        projectService.createAnimation({
          animationId: savedAnimationId,
          data: {
            type: "animation",
            name: snapshot.name,
            description: snapshot.description,
            animation: snapshot.animationData,
          },
          parentId: snapshot.targetGroupId,
          position: "last",
        }),
    });
  }

  if (!mutationAttempt.ok) {
    return mutationAttempt;
  }

  if (!snapshot.editMode) {
    store.markAnimationPersisted({
      animationId: savedAnimationId,
    });
    appService.setPayload(
      createAnimationEditorPayload({
        payload: appService.getPayload() || {},
        animationId: savedAnimationId,
      }),
    );
  }

  store.setItems({
    data: projectService.getRepositoryState()?.animations,
  });
  store.setSelectedItemId({
    itemId: savedAnimationId,
  });
  render();

  return {
    ok: true,
  };
};

const createAnimationPersistFingerprint = (snapshot) => {
  return JSON.stringify({
    name: snapshot.name,
    description: snapshot.description,
    animation: snapshot.animationData,
  });
};

const waitForAutosaveIdle = async ({ store } = {}) => {
  while (store.selectAutosaveInFlight()) {
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 10);
    });
  }
};

const scheduleQueuedAutosave = ({ deps } = {}) => {
  const { store } = deps;
  return scheduleAnimationEditorAutosave(store, () =>
    flushQueuedAutosave({
      deps,
    }),
  );
};

const flushQueuedAutosave = async ({ deps, force = false } = {}) => {
  const { store } = deps;
  let didPersistFail = false;
  clearScheduledAnimationEditorAutosave(store);

  if (store.selectAutosaveInFlight()) {
    if (!force) {
      return {
        ok: true,
        deferred: true,
      };
    }

    await waitForAutosaveIdle({ store });
    return flushQueuedAutosave({ deps, force });
  }

  if (store.selectAutosavePersistedVersion() >= store.selectAutosaveVersion()) {
    return {
      ok: true,
    };
  }

  store.setAutosaveInFlight({
    inFlight: true,
  });

  try {
    do {
      const version = store.selectAutosaveVersion();
      const snapshot = createAnimationPersistSnapshot({
        copy: selectCopy(deps),
        store,
      });
      const fingerprint = createAnimationPersistFingerprint(snapshot);

      if (fingerprint === store.selectAutosavePersistedFingerprint()) {
        store.markAutosavePersisted({ version, fingerprint });
        store.setAutosavePendingSinceAt({ timestamp: undefined });
        continue;
      }

      store.setLastAutosaveFlushStartedAt({
        timestamp: globalThis.performance?.now?.() ?? Date.now(),
      });
      store.setAutosavePendingSinceAt({ timestamp: undefined });
      const mutationAttempt = await persistEditorSnapshot({
        deps,
        snapshot,
      });

      if (!mutationAttempt.ok) {
        didPersistFail = true;
        store.setAutosavePendingSinceAt({
          timestamp: globalThis.performance?.now?.() ?? Date.now(),
        });
        return mutationAttempt;
      }

      store.markAutosavePersisted({
        version,
        fingerprint,
      });
    } while (
      force &&
      store.selectAutosavePersistedVersion() < store.selectAutosaveVersion()
    );

    return {
      ok: true,
    };
  } finally {
    store.setAutosaveInFlight({
      inFlight: false,
    });

    if (
      !force &&
      !didPersistFail &&
      store.selectAutosaveTimerId() === undefined &&
      store.selectAutosavePersistedVersion() < store.selectAutosaveVersion()
    ) {
      scheduleQueuedAutosave({ deps });
    }
  }
};

const queueEditorAutosave = ({ deps } = {}) => {
  const { store } = deps;
  store.queueAutosave();
  if (store.selectAutosavePersistedVersion() < store.selectAutosaveVersion()) {
    scheduleQueuedAutosave({ deps });
  }
};

const initializePreview = async ({ deps } = {}) => {
  const { graphicsService, projectService, refs, store } = deps;
  if (!graphicsService) {
    return;
  }

  const { canvas } = refs;
  if (!canvas) {
    return;
  }

  const projectResolution = store.selectProjectResolution();
  await graphicsService.init({
    canvas,
    width: projectResolution.width,
    height: projectResolution.height,
  });
  stopPreviewPlaybackIndicator({
    store,
  });
  graphicsService.setAnimationPlaybackMode("auto");
  const resetState = store.selectAnimationResetState();
  await ensurePreviewAssetsLoaded({
    graphicsService,
    projectService,
    renderState: resetState,
  });
  graphicsService.render(resetState);
  store.setPreviewPlaybackMode({
    mode: "auto",
  });
};

const syncEditorState = async ({ deps, repositoryState } = {}) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const resolvedRepositoryState =
    repositoryState ?? projectService.getRepositoryState();
  const { animationId, dialogType, targetGroupId, name, description } =
    getEditorPayload(appService);

  store.setItems({
    data: resolvedRepositoryState?.animations,
  });
  store.setImages({
    images: resolvedRepositoryState?.images,
  });
  store.setProjectResolution({
    projectResolution: resolvedRepositoryState?.project?.resolution,
  });

  if (animationId) {
    const itemData = getAnimationItem({
      repositoryState: resolvedRepositoryState,
      animationId,
    });

    if (!itemData) {
      appService.showAlert({
        message: copy.animationNotFound ?? "Animation not found.",
        title: copy.errorTitle ?? "Error",
      });
      appService.navigate(
        getAnimationEditorBackPath(),
        createAnimationEditorPayload({
          payload: appService.getPayload() || {},
        }),
        { historyMode: "replace" },
      );
      return false;
    }

    store.setSelectedItemId({ itemId: animationId });
    store.openDialog({
      editMode: true,
      itemId: animationId,
      itemData,
      dialogType: itemData.animation?.type,
    });
    const snapshot = createAnimationPersistSnapshot({ copy, store });
    store.setAutosavePersistedFingerprint({
      fingerprint: createAnimationPersistFingerprint(snapshot),
    });
  } else {
    store.setSelectedItemId({ itemId: undefined });
    store.openDialog({
      editMode: false,
      targetGroupId,
      dialogType,
    });
    store.setAnimationName({
      name: name ?? getDefaultNewAnimationName(copy),
    });
    store.setAnimationDescription({
      description: description ?? "",
    });
    store.setAutosavePersistedFingerprint({ fingerprint: undefined });
  }

  render();
  await initializePreview({ deps });
  return true;
};

const mountTimelinePanSubscriptions = (deps) => {
  const { browserEventsClient } = deps;
  const cleanupSubscriptions = [
    browserEventsClient.subscribeWindowEvent({
      type: "keydown",
      options: { capture: true },
      listener: (event) =>
        handleTimelinePanKeyDown(deps, {
          _event: event,
        }),
    }),
    browserEventsClient.subscribeWindowEvent({
      type: "keyup",
      options: { capture: true },
      listener: (event) =>
        handleTimelinePanKeyUp(deps, {
          _event: event,
        }),
    }),
    browserEventsClient.subscribeWindowEvent({
      type: "blur",
      listener: () => handleTimelinePanWindowBlur(deps),
    }),
  ];

  return () => {
    cleanupSubscriptions.forEach((cleanup) => cleanup());
  };
};

export const handleBeforeMount = (deps) => {
  const { appService, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  const cleanupTimelinePanSubscriptions = mountTimelinePanSubscriptions(deps);
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async () => {
      const autosaveAttempt = await flushQueuedAutosave({
        deps,
        force: true,
      });
      if (!autosaveAttempt.ok) {
        throw new Error("Failed to save animation changes before navigation.");
      }
    },
  );

  return async () => {
    unregisterBeforeNavigation();
    cleanupTimelinePanSubscriptions();
    clearScheduledAnimationEditorAutosave(store);
    store.setPreviewPlaybackRequestId({ requestId: undefined });
    stopPreviewPlaybackIndicator({ store });
    const autosaveAttempt = await flushQueuedAutosave({
      deps,
      force: true,
    });
    if (!autosaveAttempt.ok) {
      throw new Error("Failed to save animation changes during cleanup.");
    }
  };
};

export const handleAfterMount = async (deps) => {
  const { projectService } = deps;
  await projectService.ensureRepository();
  await syncEditorState({ deps });
};

export const handleBackClick = async (deps) => {
  const { appService, store } = deps;
  stopPreviewPlaybackIndicator({
    store,
  });
  const autosaveAttempt = await flushQueuedAutosave({
    deps,
    force: true,
  });

  if (!autosaveAttempt.ok) {
    return;
  }

  const currentPayload = appService.getPayload() || {};

  appService.navigate(
    getAnimationEditorBackPath(),
    createAnimationEditorPayload({
      payload: currentPayload,
    }),
    { historyMode: "replace" },
  );
};

export const handleSavePreviewClick = async (deps) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const autosaveAttempt = await flushQueuedAutosave({
    deps,
    force: true,
  });

  if (!autosaveAttempt.ok) {
    return;
  }

  const animationId = store.selectEditItemId();
  if (!animationId) {
    appService.showAlert({
      message: copy.animationMissing ?? "Animation is missing.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  try {
    const previewData = store.selectPreviewData();
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage:
        copy.failedSaveAnimationPreview ?? "Failed to save animation preview.",
      action: () =>
        projectService.updateAnimation({
          animationId,
          data: {
            preview: previewData,
          },
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }

    store.setItems({
      data: projectService.getRepositoryState()?.animations,
    });
    if (store.selectIsTouchMode()) {
      store.closePreviewDialog({});
    }
    render();
    appService.showToast({
      message: copy.animationPreviewSaved ?? "Animation preview saved.",
    });
  } catch {
    appService.showAlert({
      message:
        copy.failedSaveAnimationPreview ?? "Failed to save animation preview.",
      title: copy.errorTitle ?? "Error",
    });
  }
};

export const handleClosePopover = (deps) => {
  const { render, store } = deps;
  store.closePopover();
  render();
};

export const handleMobileMaskClick = (deps, payload = {}) => {
  const { render, store } = deps;

  if (store.selectDialogType() !== "transition") {
    return;
  }

  const event = payload._event;
  const popoverPosition = {
    x: event?.clientX ?? 0,
    y: event?.clientY ?? 0,
  };

  if (store.selectHasEffectiveTransitionMask()) {
    store.setSelectedEditorTab({ tab: "mask" });
    render();
    return;
  }

  store.startPendingTransitionMask({});
  store.setPopover({
    mode: "addMask",
    x: popoverPosition.x,
    y: popoverPosition.y,
    payload: {},
  });
  render();
};

export const handleOpenPreviewDialog = (deps) => {
  const { render, store } = deps;
  store.openPreviewDialog({});
  render();
};

export const handleClosePreviewDialog = (deps) => {
  const { render, store } = deps;
  store.closePreviewDialog({});
  render();
};

export const handleAddPropertiesClick = (deps, payload) => {
  const { render, store } = deps;
  const side = payload._event.currentTarget?.dataset?.side;

  if (!side && store.selectDialogType() === "transition") {
    store.setPopover({
      mode: "addPropertySideMenu",
      x: payload._event.clientX,
      y: payload._event.clientY,
      payload: {},
    });
    render();
    return;
  }

  store.setPopover({
    mode: "addProperty",
    x: payload._event.clientX,
    y: payload._event.clientY,
    payload: {
      side: side ?? "update",
    },
  });
  render();
};

export const handleTimelineZoomChange = (deps, payload) => {
  const { render, store } = deps;
  store.setTimelineZoom({ zoom: resolveValueChange(payload) });
  render();
};

export const handleTimelineZoomIn = (deps) => {
  const { render, store } = deps;
  store.nudgeTimelineZoom({ delta: TIMELINE_ZOOM_STEP });
  render();
};

const EDITOR_TAB_IDS = ["tween", "preview"];

const activateEditorTab = (deps, tab) => {
  const { render, store } = deps;
  if (tab === store.selectSelectedEditorTab()) {
    return;
  }

  store.setSelectedEditorTab({ tab });
  render();
};

export const handleEditorTabClick = (deps, payload) => {
  activateEditorTab(deps, payload._event.currentTarget.dataset.tabId);
};

export const handleEditorTabKeyDown = (deps, payload) => {
  const { refs } = deps;
  const event = payload._event;
  const currentTab = event.currentTarget.dataset.tabId;
  const currentIndex = EDITOR_TAB_IDS.indexOf(currentTab);
  if (currentIndex < 0) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    activateEditorTab(deps, currentTab);
    return;
  }

  let targetIndex;
  if (event.key === "ArrowLeft") {
    targetIndex =
      (currentIndex - 1 + EDITOR_TAB_IDS.length) % EDITOR_TAB_IDS.length;
  } else if (event.key === "ArrowRight") {
    targetIndex = (currentIndex + 1) % EDITOR_TAB_IDS.length;
  } else if (event.key === "Home") {
    targetIndex = 0;
  } else if (event.key === "End") {
    targetIndex = EDITOR_TAB_IDS.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const targetTab = EDITOR_TAB_IDS[targetIndex];
  refs.animationEditorTabs
    .querySelector(`[data-tab-id="${targetTab}"]`)
    ?.focus();
  activateEditorTab(deps, targetTab);
};

export const handleTimelineZoomOut = (deps) => {
  const { render, store } = deps;
  store.nudgeTimelineZoom({ delta: -TIMELINE_ZOOM_STEP });
  render();
};

export const handleTimelineScroll = (deps, payload) => {
  const { render, store } = deps;
  const wasPlayheadVisible = store.selectTimelinePlayheadVisible();
  const timelineViewport = payload._event.currentTarget;

  store.setTimelineScrollMetrics({
    scrollLeft: timelineViewport.scrollLeft,
    viewportWidth: timelineViewport.clientWidth,
  });

  if (wasPlayheadVisible !== store.selectTimelinePlayheadVisible()) {
    render();
  }
};

export const handleTimelinePanPointerEnter = (deps) => {
  const { store } = deps;
  store.setTimelinePanHovered({ hovered: true });
};

export const handleTimelinePanPointerLeave = (deps) => {
  const { store } = deps;
  store.setTimelinePanHovered({ hovered: false });
};

export const handleTimelinePanKeyDown = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  if (
    !isSpaceKey(event) ||
    isTextEntryEvent(event) ||
    !store.selectTimelinePanHovered() ||
    store.selectTimelinePanMode()
  ) {
    return;
  }

  event.preventDefault();
  store.setTimelinePanMode({ enabled: true });
  render();
};

const stopTimelinePanGesture = (deps) => {
  const { refs, store } = deps;
  const timelinePan = store.selectTimelinePan();
  if (!timelinePan) {
    return false;
  }

  refs.timelineScrollContainer?.releasePointerCapture?.(timelinePan.pointerId);
  store.stopTimelinePan({});
  return true;
};

export const handleTimelinePanKeyUp = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  if (!isSpaceKey(event) || !store.selectTimelinePanMode()) {
    return;
  }

  event.preventDefault();
  stopTimelinePanGesture(deps);
  store.setTimelinePanMode({ enabled: false });
  render();
};

export const handleTimelinePanWindowBlur = (deps) => {
  const { render, store } = deps;
  const wasPanning = stopTimelinePanGesture(deps);
  if (!store.selectTimelinePanMode() && !wasPanning) {
    return;
  }

  store.setTimelinePanMode({ enabled: false });
  render();
};

export const handleTimelinePanStart = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  if (!store.selectTimelinePanMode() || event.button !== 0) {
    if (store.selectTimelinePanClickSuppressed()) {
      store.clearTimelinePanClickSuppression({});
    }
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  store.startTimelinePan({
    pointerId: event.pointerId,
    startX: event.clientX,
    startScrollLeft: event.currentTarget.scrollLeft,
  });
  render();
};

export const handleTimelinePanClick = (deps, payload) => {
  const { store } = deps;
  if (!store.selectTimelinePanClickSuppressed()) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();
  store.clearTimelinePanClickSuppression({});
};

export const handleTimelinePanMove = (deps, payload) => {
  const { store } = deps;
  const event = payload._event;
  const timelinePan = store.selectTimelinePan();
  if (!timelinePan || timelinePan.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.scrollLeft = Math.max(
    0,
    timelinePan.startScrollLeft - (event.clientX - timelinePan.startX),
  );
};

export const handleTimelinePanEnd = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  const timelinePan = store.selectTimelinePan();
  if (!timelinePan || timelinePan.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  store.stopTimelinePan({});
  render();
};

export const handleAddPropertySideMenuItemClick = (deps, payload) => {
  const { render, store } = deps;
  const side = payload._event.detail.item?.value;
  const popover = store.selectPopover();

  if (side === "mask") {
    store.startPendingTransitionMask({});
    store.setPopover({
      mode: "addMask",
      x: popover.x,
      y: popover.y,
      payload: {},
    });
    render();
    return;
  }

  if (side !== "prev" && side !== "next") {
    return;
  }

  store.setPopover({
    mode: "addProperty",
    x: popover.x,
    y: popover.y,
    payload: {
      side,
    },
  });
  render();
};

export const handleAddPropertyFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const {
    payload: { side },
  } = popover;
  const trackedValues = popover.formValues ?? {};
  const mergedValues = mergeSubmittedFormValues({
    popover,
    payload,
  });
  const {
    property,
    useInitialValue,
    tweenMode,
    duration,
    easing,
    side: submittedSide,
  } = mergedValues;
  const targetSide = submittedSide ?? side;
  const defaultInitialValue = store.selectDefaultInitialValue({ property });
  const useAutoTween = targetSide === "update" && tweenMode === "auto";
  const submittedInitialValue = hasOwnFormValue(trackedValues, "initialValue")
    ? trackedValues.initialValue
    : defaultInitialValue;

  const finalInitialValue = useAutoTween
    ? undefined
    : useInitialValue
      ? submittedInitialValue !== undefined && submittedInitialValue !== ""
        ? submittedInitialValue
        : defaultInitialValue
      : undefined;

  store.addProperty({
    side: targetSide,
    property,
    initialValue: finalInitialValue,
    tweenMode,
    autoDuration: duration,
    autoEasing: easing,
  });
  invalidatePreview({
    store,
  });
  store.closePopover();
  render();
  queueEditorAutosave({
    deps,
  });
};

export const handleAddKeyframeFromTimeline = (deps, payload) => {
  const { render, store } = deps;
  const { delay, duration, followingDelay, index, property } =
    payload._event.detail;
  const side =
    payload._event.detail.side ??
    (store.selectDialogType() === "transition" ? "prev" : "update");

  const keyframe = {
    ...addKeyframeDefaultValues,
    side,
    property,
    index,
  };
  if (duration !== undefined) {
    keyframe.duration = duration;
  }
  if (delay !== undefined) {
    keyframe.delay = delay;
  }
  if (followingDelay !== undefined) {
    keyframe.followingDelay = followingDelay;
  }

  store.addKeyframe(keyframe);
  store.setSelectedKeyframe({ side, property, index });
  invalidatePreview({ store });
  render();
  queueEditorAutosave({ deps });
};

export const handleAddKeyframeFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const {
    payload: { side, property, index },
  } = popover;
  const trackedValues = popover.formValues ?? {};

  const formValues = {
    ...mergeSubmittedFormValues({
      popover,
      payload,
    }),
  };
  if (!hasOwnFormValue(trackedValues, "value")) {
    formValues.value = addKeyframeDefaultValues.value;
  }

  if (formValues.duration < 1) {
    formValues.duration = 1;
  }

  store.addKeyframe({
    ...formValues,
    side,
    property,
    index,
  });
  invalidatePreview({
    store,
  });
  store.closePopover();
  render();
  queueEditorAutosave({
    deps,
  });
};

export const handleKeyframeRightClick = (deps, payload) => {
  const { render, store } = deps;
  store.setSelectedKeyframe({
    side: payload._event.detail.side,
    property: payload._event.detail.property,
    index: payload._event.detail.index,
  });
  store.setPopover({
    mode: "keyframeMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side: payload._event.detail.side,
      property: payload._event.detail.property,
      index: payload._event.detail.index,
    },
  });
  render();
};

const openSelectedKeyframeEditDialog = (deps, { x = 0, y = 0 } = {}) => {
  const { refs, render, store } = deps;
  const selectedKeyframe = store.selectSelectedKeyframe();
  const values = store.selectSelectedKeyframeFormValues();
  if (!selectedKeyframe || !values) {
    return false;
  }

  store.setPopover({
    mode: "editKeyframe",
    x,
    y,
    payload: selectedKeyframe,
  });
  render();
  refs.editKeyframeForm.reset();
  refs.editKeyframeForm.setValues({ values });
  return true;
};

export const handleSelectedKeyframeEditClick = (deps, payload) => {
  const { clientX: x, clientY: y } = payload._event;
  openSelectedKeyframeEditDialog(deps, { x, y });
};

export const handleKeyframeClick = (deps, payload) => {
  const { render, store } = deps;
  const { index, property, side, x, y } = payload._event.detail;
  store.setSelectedKeyframe({
    side,
    property,
    index,
  });
  if (store.selectIsTouchMode()) {
    openSelectedKeyframeEditDialog(deps, {
      x,
      y,
    });
    return;
  }

  store.closePopover();
  render();
};

export const handleKeyframeSelect = (deps, payload) => {
  const { render, store } = deps;
  const { index, property, side } = payload._event.detail;
  store.setSelectedKeyframe({ side, property, index });
  store.closePopover();
  render();
};

export const handleEditorSurfaceClick = (deps, payload) => {
  const { render, store } = deps;
  if (!store.selectTimelineSelection()) {
    return;
  }

  const selectionSurfaceClicked = payload._event
    .composedPath()
    .some(
      (element) =>
        element?.dataset?.keyframe === "true" ||
        element?.dataset?.timelineSelectionSurface === "true",
    );
  if (selectionSurfaceClicked) {
    return;
  }

  store.clearTimelineSelection({});
  render();
};

export const handleKeyframeDurationChange = (deps, payload) => {
  const { store } = deps;
  const { delay, duration, followingDelay, index, property, side } =
    payload._event.detail;
  store.setSelectedKeyframe({ side, property, index });
  store.setSelectedKeyframeTiming({ delay, duration, followingDelay });
  commitSelectedKeyframeChange(deps);
};

const commitSelectedKeyframeChange = (deps) => {
  const { render, store } = deps;
  invalidatePreview({ store });
  render();
  queueEditorAutosave({ deps });
};

const openSelectedMaskNumberPopover = (deps, payload, { mode, value } = {}) => {
  const { render, store } = deps;
  store.setPopover({
    mode,
    x: payload._event.clientX,
    y: payload._event.clientY,
    payload: {},
  });
  store.updatePopoverFormValues({
    formValues: { value },
  });
  render();
};

export const handleSelectedMaskSoftnessClick = (deps, payload) => {
  const { store } = deps;
  openSelectedMaskNumberPopover(deps, payload, {
    mode: "editSelectedMaskSoftness",
    value: store.selectMaskEditorTransitionMask()?.softness,
  });
};

export const handleSelectedMaskProgressDurationClick = (deps, payload) => {
  const { store } = deps;
  openSelectedMaskNumberPopover(deps, payload, {
    mode: "editSelectedMaskProgressDuration",
    value: store.selectMaskEditorTransitionMask()?.progressDuration,
  });
};

export const handleSelectedMaskNumberFieldKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (event.currentTarget.dataset.maskNumberField === "softness") {
    handleSelectedMaskSoftnessClick(deps, payload);
  } else if (
    event.currentTarget.dataset.maskNumberField === "progress-duration"
  ) {
    handleSelectedMaskProgressDurationClick(deps, payload);
  }
};

export const handleEditorPopoverPositioned = (deps) => {
  const { refs, store } = deps;
  if (
    ["editSelectedMaskSoftness", "editSelectedMaskProgressDuration"].includes(
      store.selectPopover().mode,
    )
  ) {
    refs.selectedMaskNumberInput.focus();
  }
};

const commitSelectedMaskNumberInput = (deps, value) => {
  const { store } = deps;
  if (value === undefined || value === null || value === "") {
    return;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return;
  }

  const { mode } = store.selectPopover();
  if (mode === "editSelectedMaskSoftness") {
    if (numericValue < 0) {
      return;
    }
    store.setTransitionMaskSoftness({ softness: numericValue });
  } else if (mode === "editSelectedMaskProgressDuration") {
    if (numericValue < 1) {
      return;
    }
    store.setTransitionMaskProgressDuration({ duration: numericValue });
  } else {
    return;
  }

  store.closePopover();
  commitMaskChange(deps);
};

export const handleSelectedMaskNumberInputChange = (deps, payload) => {
  const { store } = deps;
  store.updatePopoverFormValues({
    formValues: {
      value: resolveValueChange(payload),
    },
  });
};

export const handleSelectedMaskNumberConfirmClick = (deps) => {
  const { store } = deps;
  commitSelectedMaskNumberInput(deps, store.selectPopover().formValues.value);
};

export const handleSelectedMaskNumberInputKeyDown = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    commitSelectedMaskNumberInput(deps, event.currentTarget.value);
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    store.closePopover();
    render();
  }
};

export const handleAutoTrackClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editAuto",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side: payload._event.detail.side,
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handlePropertyNameClick = (deps, payload) => {
  const { render, store } = deps;
  const { property, side, x, y } = payload._event.detail;
  store.setSelectedProperty({ side, property });
  if (store.selectIsTouchMode()) {
    store.setPopover({
      mode: "propertyNameMenu",
      x,
      y,
      payload: {
        side,
        property,
      },
    });
  } else {
    store.closePopover();
  }
  render();
};

export const handlePropertyNameRightClick = (deps, payload) => {
  const { render, store } = deps;
  const { property, side, x, y } = payload._event.detail;
  store.setSelectedProperty({ side, property });
  store.setPopover({
    mode: "propertyNameMenu",
    x,
    y,
    payload: {
      side,
      property,
    },
  });
  render();
};

const selectMaskTimelineRow = (deps, event) => {
  const { render, store } = deps;
  store.setSelectedMask({});
  if (store.selectIsTouchMode()) {
    store.setPopover({
      mode: "editMask",
      x: event.clientX,
      y: event.clientY,
      payload: {},
    });
  } else {
    store.closePopover();
  }
  render();
};

export const handleMaskTimelineRowClick = (deps, payload) => {
  selectMaskTimelineRow(deps, payload._event);
};

export const handleMaskTimelineRowKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  selectMaskTimelineRow(deps, event);
};

export const handleKeyframeDropdownItemClick = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const { side, property, index } = popover.payload;
  const { x, y } = popover;
  const value = payload._event.detail.item.value;
  let didMutate = false;

  if (value === "edit") {
    openSelectedKeyframeEditDialog(deps, { x, y });
    return;
  } else if (value === "delete-property") {
    store.deleteProperty({ side, property });
    store.closePopover();
    didMutate = true;
  } else if (value === "delete-keyframe") {
    store.deleteKeyframe({ side, property, index });
    store.closePopover();
    didMutate = true;
  } else if (value === "add-right") {
    const addedIndex = Number(index) + 1;
    store.addKeyframe({
      ...addKeyframeDefaultValues,
      side,
      property,
      index: addedIndex,
    });
    store.setSelectedKeyframe({ side, property, index: addedIndex });
    store.closePopover();
    didMutate = true;
  } else if (value === "add-left") {
    const addedIndex = Number(index);
    store.addKeyframe({
      ...addKeyframeDefaultValues,
      side,
      property,
      index: addedIndex,
    });
    store.setSelectedKeyframe({ side, property, index: addedIndex });
    store.closePopover();
    didMutate = true;
  } else if (value === "move-right") {
    store.moveKeyframeRight({ side, property, index });
    store.closePopover();
    didMutate = true;
  } else if (value === "move-left") {
    store.moveKeyframeLeft({ side, property, index });
    store.closePopover();
    didMutate = true;
  }

  if (didMutate) {
    invalidatePreview({
      store,
    });
  }

  render();

  if (didMutate) {
    queueEditorAutosave({
      deps,
    });
  }
};

export const handleEditKeyframeFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { side, property, index },
  } = store.selectPopover();

  const formValues = {
    ...payload._event.detail.values,
  };

  if (formValues.delay < 0) {
    formValues.delay = 0;
  }
  if (formValues.duration < 1) {
    formValues.duration = 1;
  }

  store.updateKeyframe({
    keyframe: formValues,
    side,
    index,
    property,
  });
  invalidatePreview({
    store,
  });
  store.closePopover();
  render();
  queueEditorAutosave({
    deps,
  });
};

export const handleEditAutoFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { side, property },
  } = store.selectPopover();
  const formValues = {
    ...payload._event.detail.values,
  };

  if (formValues.duration < 1) {
    formValues.duration = 1;
  }

  store.updateAutoProperty({
    side,
    property,
    duration: formValues.duration,
    easing: formValues.easing,
  });
  invalidatePreview({
    store,
  });
  store.closePopover();
  render();
  queueEditorAutosave({
    deps,
  });
};

export const handleRulerTimeScrub = async (deps, payload) => {
  const { graphicsService, projectService, render, store } = deps;
  const { timeMs } = payload._event.detail;
  store.setPreviewPlaybackRequestId({ requestId: undefined });
  if (store.selectPreviewPlaying()) {
    stopPreviewPlaybackIndicator({ preservePlayhead: true, store });
  }
  store.setPreviewPlayhead({
    timeMs,
    visible: true,
  });
  render();
  const didChangePreviewState = await ensureManualPreviewAtTime({
    graphicsService,
    projectService,
    store,
    timeMs,
  });

  if (didChangePreviewState) {
    render();
  }
};

export const handleInitialValueClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editInitialValue",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side: payload._event.detail.side,
      property: payload._event.detail.property,
    },
  });
  render();
};

const updatePopoverFieldValue = ({ store, detail } = {}) => {
  const { name, value } = detail;
  const currentFormValues = store.selectPopover().formValues ?? {};
  store.updatePopoverFormValues({
    formValues: {
      ...currentFormValues,
      [name]: value,
    },
  });
};

const mergeSubmittedFormValues = ({ popover, payload } = {}) => {
  return Object.assign(
    {},
    payload?._event?.detail?.values,
    popover?.formValues,
  );
};

const hasOwnFormValue = (values, name) => {
  return Object.prototype.hasOwnProperty.call(values ?? {}, name);
};

const resolveValueChange = (payload) => {
  return (
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value
  );
};

const resolveIndexFromDataset = (payload) => {
  return Number.parseInt(
    payload._event.currentTarget?.dataset?.index ?? "",
    10,
  );
};

const commitMaskChange = (deps) => {
  const { render, store } = deps;
  if (store.selectPopover().mode === "addMask") {
    render();
    return;
  }

  invalidatePreview({
    store,
  });
  render();
  queueEditorAutosave({
    deps,
  });
};

const openMaskImageSelector = ({
  render,
  store,
  target,
  index,
  selectedImageId,
} = {}) => {
  store.showImageSelectorDialog({
    target,
    index,
    selectedImageId,
  });
  render();
};

const PREVIEW_IMAGE_SELECTOR_TARGETS = new Set([
  "preview-background",
  "preview-outgoing",
  "preview-incoming",
  "preview-target",
]);

const isPreviewImageSelectorTarget = (target) => {
  return PREVIEW_IMAGE_SELECTOR_TARGETS.has(target);
};

export const handleAddPropertyFormChange = (deps, payload) => {
  const { render, store } = deps;
  const { name, value } = payload._event.detail ?? {};
  if (name === "side") {
    const currentFormValues = store.selectPopover().formValues ?? {};
    store.updatePopoverFormValues({
      formValues: {
        ...currentFormValues,
        side: value,
        property: undefined,
        initialValue: undefined,
      },
    });
    render();
    return;
  }

  if (name === "property") {
    const currentFormValues = store.selectPopover().formValues ?? {};
    const initialValue = store.selectDefaultInitialValue({
      property: value,
    });
    const nextFormValues = {
      ...currentFormValues,
      property: value,
      initialValue,
    };
    store.updatePopoverFormValues({
      formValues: nextFormValues,
    });
    render();
    return;
  }

  updatePopoverFieldValue({
    store,
    detail: payload._event.detail,
  });

  if (name === "tweenMode" && value === "auto") {
    const currentFormValues = store.selectPopover().formValues ?? {};
    store.updatePopoverFormValues({
      formValues: {
        ...currentFormValues,
        duration: currentFormValues.duration ?? AUTO_TWEEN_DEFAULT_DURATION,
        easing: currentFormValues.easing ?? AUTO_TWEEN_DEFAULT_EASING,
      },
    });
  }

  render();
};

export const handleAddKeyframeFormChange = (deps, payload) => {
  const { render, store } = deps;
  updatePopoverFieldValue({
    store,
    detail: payload._event.detail,
  });
  render();
};

export const handleEditInitialValueFormChange = (deps, payload) => {
  const { render, store } = deps;
  updatePopoverFieldValue({
    store,
    detail: payload._event.detail,
  });
  render();
};

export const handleOpenAddMaskClick = (deps, payload) => {
  const { render, store } = deps;
  store.startPendingTransitionMask({});
  store.setPopover({
    mode: "addMask",
    x: payload._event.clientX,
    y: payload._event.clientY,
    payload: {},
  });
  render();
};

export const handleAddMaskClick = (deps) => {
  const { appService, store } = deps;
  if (!isTransitionMaskComplete(store.selectMaskEditorTransitionMask())) {
    appService.showToast({
      message:
        selectCopy(deps).maskImageRequired ?? "Select an image for the mask.",
    });
    return;
  }

  store.commitPendingTransitionMask({});
  store.setSelectedMask({});
  store.closePopover();
  commitMaskChange(deps);
};

export const handleDisableMaskClick = (deps) => {
  const { store } = deps;
  store.disableTransitionMask({});
  store.closePopover();
  commitMaskChange(deps);
};

export const handleMaskRemoveConfirmDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeMaskRemoveConfirmDialog({});
  render();
};

export const handleMaskRemoveConfirmClick = (deps) => {
  const { store } = deps;
  store.disableTransitionMask({});
  store.closeMaskRemoveConfirmDialog({});
  store.closePopover();
  commitMaskChange(deps);
};

export const handleMaskKindChange = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskKind({
    kind: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleMaskChannelChange = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskChannel({
    channel: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleMaskInvertChange = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskInvert({
    invert: resolveValueChange(payload) === "on",
  });
  commitMaskChange(deps);
};

export const handleMaskSampleChange = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskSample({
    sample: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleMaskCombineChange = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskCombine({
    combine: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleMaskSoftnessInput = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskSoftness({
    softness: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleMaskProgressDurationInput = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskProgressDuration({
    duration: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleMaskProgressEasingChange = (deps, payload) => {
  const { store } = deps;
  store.setTransitionMaskProgressEasing({
    easing: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleSingleMaskImageClick = (deps) => {
  const { render, store } = deps;
  openMaskImageSelector({
    render,
    store,
    target: "single",
    selectedImageId: store.selectMaskEditorTransitionMask()?.imageId,
  });
};

export const handleSingleMaskImageKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  handleSingleMaskImageClick(deps);
};

export const handleSequenceMaskAddClick = (deps) => {
  const { render, store } = deps;
  openMaskImageSelector({
    render,
    store,
    target: "sequence-add",
  });
};

export const handleSequenceMaskImageClick = (deps, payload) => {
  const { render, store } = deps;
  const index = resolveIndexFromDataset(payload);
  const transitionMask = store.selectMaskEditorTransitionMask();
  openMaskImageSelector({
    render,
    store,
    target: "sequence-item",
    index,
    selectedImageId: transitionMask?.imageIds?.[index],
  });
};

export const handleSequenceMaskRemoveClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store } = deps;
  store.removeTransitionMaskSequenceImage({
    index: resolveIndexFromDataset(payload),
  });
  commitMaskChange(deps);
};

export const handleSequenceMaskMoveUpClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store } = deps;
  store.moveTransitionMaskSequenceImageUp({
    index: resolveIndexFromDataset(payload),
  });
  commitMaskChange(deps);
};

export const handleSequenceMaskMoveDownClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store } = deps;
  store.moveTransitionMaskSequenceImageDown({
    index: resolveIndexFromDataset(payload),
  });
  commitMaskChange(deps);
};

export const handleCompositeMaskAddClick = (deps) => {
  const { render, store } = deps;
  openMaskImageSelector({
    render,
    store,
    target: "composite-add",
  });
};

export const handleCompositeMaskImageClick = (deps, payload) => {
  const { render, store } = deps;
  const index = resolveIndexFromDataset(payload);
  const transitionMask = store.selectMaskEditorTransitionMask();
  openMaskImageSelector({
    render,
    store,
    target: "composite-item",
    index,
    selectedImageId: transitionMask?.items?.[index]?.imageId,
  });
};

export const handleCompositeMaskRemoveClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store } = deps;
  store.removeTransitionMaskCompositeItem({
    index: resolveIndexFromDataset(payload),
  });
  commitMaskChange(deps);
};

export const handleCompositeMaskMoveUpClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store } = deps;
  store.moveTransitionMaskCompositeItemUp({
    index: resolveIndexFromDataset(payload),
  });
  commitMaskChange(deps);
};

export const handleCompositeMaskMoveDownClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store } = deps;
  store.moveTransitionMaskCompositeItemDown({
    index: resolveIndexFromDataset(payload),
  });
  commitMaskChange(deps);
};

export const handleCompositeMaskChannelChange = (deps, payload) => {
  const { store } = deps;
  store.updateTransitionMaskCompositeItemChannel({
    index: resolveIndexFromDataset(payload),
    channel: resolveValueChange(payload),
  });
  commitMaskChange(deps);
};

export const handleCompositeMaskInvertChange = (deps, payload) => {
  const { store } = deps;
  store.updateTransitionMaskCompositeItemInvert({
    index: resolveIndexFromDataset(payload),
    invert: resolveValueChange(payload) === "on",
  });
  commitMaskChange(deps);
};

export const handlePreviewImageClick = (deps, payload) => {
  const { render, store } = deps;
  const target = payload._event.currentTarget?.dataset?.target;
  if (!isPreviewImageSelectorTarget(target)) {
    return;
  }

  openMaskImageSelector({
    render,
    store,
    target,
    selectedImageId: store.selectPreviewImageId({ target }),
  });
};

export const handleMaskImageSelected = (deps, payload) => {
  const { render, store } = deps;
  store.setImageSelectorSelectedImageId({
    imageId: payload._event.detail?.imageId,
  });
  render();
};

export const handleMaskImageDoubleClick = (deps, payload) => {
  const imageId = payload?._event?.detail?.imageId;
  if (!imageId) {
    return;
  }

  deps.store.showFullImagePreview({ imageId });
  deps.render();
};

export const handleMaskImageFileExplorerClickItem = (deps, payload) => {
  const itemId = payload?._event?.detail?.itemId;
  if (!itemId) {
    return;
  }

  deps.refs.imageSelector?.transformedHandlers?.handleScrollToItem?.({
    itemId,
  });
  focusImageSelectorKeyboardScope(deps);
};

export {
  handleImageSelectorKeyboardScopeClick,
  handleImageSelectorKeyboardScopeKeyDown,
};

export const handleConfirmMaskImageSelection = async (deps) => {
  const { appService, graphicsService, projectService, render, store } = deps;
  const imageSelectorDialog = store.selectImageSelectorDialog();
  const { index, selectedImageId, target } = imageSelectorDialog;
  const isPreviewImageSelection = isPreviewImageSelectorTarget(target);

  if (target === "single" && !selectedImageId) {
    appService.showToast({
      message:
        selectCopy(deps).maskImageRequired ?? "Select an image for the mask.",
    });
    return;
  }

  if (target === "single") {
    store.setTransitionMaskImage({
      imageId: selectedImageId,
    });
  } else if (target === "sequence-add" && selectedImageId) {
    store.addTransitionMaskSequenceImage({
      imageId: selectedImageId,
    });
  } else if (target === "sequence-item") {
    store.updateTransitionMaskSequenceImage({
      index,
      imageId: selectedImageId,
    });
  } else if (target === "composite-add" && selectedImageId) {
    store.addTransitionMaskCompositeItem({
      imageId: selectedImageId,
    });
  } else if (target === "composite-item") {
    store.updateTransitionMaskCompositeItemImage({
      index,
      imageId: selectedImageId,
    });
  } else if (isPreviewImageSelection) {
    store.setPreviewImage({
      target,
      imageId: selectedImageId,
    });
  }

  store.hideImageSelectorDialog({});
  if (isPreviewImageSelection) {
    invalidatePreview({
      store,
    });
    render();
    try {
      await renderPreviewForThumbnailCapture({
        graphicsService,
        projectService,
        resetCanvas: true,
        store,
      });
    } catch {
      appService?.showToast?.({
        message:
          selectCopy(deps).failedUpdatePreviewImage ??
          "Failed to update preview image.",
      });
    }
    return;
  }

  commitMaskChange({
    ...deps,
    render,
    store,
  });
};

export const handleCancelMaskImageSelection = (deps) => {
  const { render, store } = deps;
  store.hideImageSelectorDialog({});
  render();
};

export const handleCloseMaskImageSelectorDialog = (deps) => {
  const { render, store } = deps;
  store.hideImageSelectorDialog({});
  render();
};

export const handleMaskImagePreviewOverlayClick = (deps) => {
  deps.store.hideFullImagePreview();
  deps.render();
};

export const handleReplayAnimation = async (deps) => {
  const { graphicsService, projectService, render, store } = deps;
  if (!graphicsService) {
    return;
  }

  if (store.selectPreviewPlaying()) {
    store.setPreviewPlaybackRequestId({ requestId: undefined });
    stopPreviewPlaybackIndicator({ preservePlayhead: true, store });
    render();
    return;
  }

  const durationMs = store.selectPreviewDurationMs();
  if (durationMs <= 0) {
    return;
  }

  const currentTimeMs = Number(store.selectPreviewPlayheadTimeMs());
  const startTimeMs = Number.isFinite(currentTimeMs)
    ? Math.min(Math.max(0, currentTimeMs), durationMs)
    : 0;
  const resolvedStartTimeMs = startTimeMs >= durationMs ? 0 : startTimeMs;

  const playbackRequestId = generateId();
  store.setPreviewPlaybackRequestId({
    requestId: playbackRequestId,
  });
  const isCurrentPlaybackRequest = () =>
    store.selectPreviewPlaybackRequestId() === playbackRequestId;

  const prepared = await preparePreviewPlaybackAtStart({
    graphicsService,
    projectService,
    startTimeMs: resolvedStartTimeMs,
    store,
    shouldContinue: isCurrentPlaybackRequest,
  });
  if (!prepared || !isCurrentPlaybackRequest()) {
    return;
  }

  render();

  await waitForPreviewPaint();
  if (!isCurrentPlaybackRequest()) {
    return;
  }

  graphicsService.setAnimationPlaybackMode("manual");
  store.setPreviewPlaybackMode({
    mode: "manual",
  });
  const rendered = await renderPreviewAnimationState({
    graphicsService,
    projectService,
    store,
    shouldContinue: isCurrentPlaybackRequest,
  });
  if (!rendered || !isCurrentPlaybackRequest()) {
    return;
  }

  graphicsService.setAnimationTime(resolvedStartTimeMs);

  store.startPreviewPlayback({
    startedAtMs: performance.now() - resolvedStartTimeMs,
    durationMs,
    timeMs: resolvedStartTimeMs,
  });
  schedulePreviewPlaybackIndicatorFrame({
    graphicsService,
    render,
    store,
  });
  render();
};

export const handleTogglePreviewLoop = (deps) => {
  const { render, store } = deps;
  store.togglePreviewLoop({});
  render();
};

export const handleEditInitialValueFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const {
    payload: { side, property },
  } = popover;

  const { initialValue, valueSource } = mergeSubmittedFormValues({
    popover,
    payload,
  });
  const defaultInitialValue = store.selectDefaultInitialValue({ property });
  const finalInitialValue =
    valueSource === "default"
      ? undefined
      : initialValue === undefined || initialValue === ""
        ? defaultInitialValue
        : initialValue;

  store.updateInitialValue({
    side,
    property,
    initialValue: finalInitialValue,
  });
  invalidatePreview({
    store,
  });
  store.closePopover();
  render();
  queueEditorAutosave({
    deps,
  });
};
