import { generateId } from "../../internal/id.js";
import {
  createAnimationEditorPayload,
  getAnimationEditorBackPath,
  resolveAnimationEditorPayload,
} from "../../internal/animationEditorRoute.js";
import { serializeTransitionMask } from "../../internal/animationMasks.js";
import { resolveResourceFileType } from "../../internal/resourceFileMetadata.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  addKeyframeDefaultValues,
  AUTO_TWEEN_DEFAULT_DURATION,
  AUTO_TWEEN_DEFAULT_EASING,
} from "./animationEditor.constants.js";
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
        keyframes: (config?.keyframes ?? []).map((keyframe) => ({
          duration: Number(keyframe.duration) || 0,
          value: Number(keyframe.value) || 0,
          easing: keyframe.easing ?? "linear",
          relative: keyframe.relative ?? false,
        })),
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

const stopPreviewPlaybackIndicator = ({ store } = {}) => {
  const frameId = store.selectPreviewPlaybackFrameId();
  if (frameId !== undefined) {
    globalThis.cancelAnimationFrame(frameId);
  }

  store.stopPreviewPlayback({});
};

const schedulePreviewPlaybackIndicatorFrame = ({ render, store } = {}) => {
  const startedAtMs = store.selectPreviewPlaybackStartedAtMs();
  const durationMs = store.selectPreviewPlaybackDurationMs();

  if (startedAtMs === undefined || durationMs === undefined) {
    return;
  }

  const frameId = globalThis.requestAnimationFrame((timestamp) => {
    const elapsedMs = Math.max(0, timestamp - startedAtMs);
    const nextTimeMs = Math.min(durationMs, Math.round(elapsedMs));

    store.setPreviewPlayhead({
      timeMs: nextTimeMs,
      visible: true,
    });

    if (nextTimeMs >= durationMs) {
      stopPreviewPlaybackIndicator({
        store,
      });
      render();
      return;
    }

    schedulePreviewPlaybackIndicatorFrame({
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
  store,
  shouldContinue,
} = {}) => {
  if (!graphicsService) {
    return false;
  }

  stopPreviewPlaybackIndicator({
    store,
  });
  graphicsService.setAnimationPlaybackMode("manual");
  graphicsService.setAnimationTime(0);
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

  graphicsService.setAnimationTime(0);
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

const waitForAutosaveIdle = async ({ store } = {}) => {
  while (store.selectAutosaveInFlight()) {
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 10);
    });
  }
};

const flushQueuedAutosave = async ({ deps } = {}) => {
  const { store } = deps;

  if (store.selectAutosaveInFlight()) {
    await waitForAutosaveIdle({
      store,
    });
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
    while (
      store.selectAutosavePersistedVersion() < store.selectAutosaveVersion()
    ) {
      const version = store.selectAutosaveVersion();
      const snapshot = createAnimationPersistSnapshot({
        copy: selectCopy(deps),
        store,
      });
      const mutationAttempt = await persistEditorSnapshot({
        deps,
        snapshot,
      });

      if (!mutationAttempt.ok) {
        return mutationAttempt;
      }

      store.markAutosavePersisted({
        version,
      });
    }

    return {
      ok: true,
    };
  } finally {
    store.setAutosaveInFlight({
      inFlight: false,
    });
  }
};

const queueEditorAutosave = ({ deps } = {}) => {
  const { store } = deps;
  store.queueAutosave();
  void flushQueuedAutosave({
    deps,
  });
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
  }

  render();
  await initializePreview({ deps });
  return true;
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
  );
};

export const handleSavePreviewClick = async (deps) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const autosaveAttempt = await flushQueuedAutosave({
    deps,
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

export const handleAddPropertySideMenuItemClick = (deps, payload) => {
  const { render, store } = deps;
  const side = payload._event.detail.item?.value;

  if (side !== "prev" && side !== "next") {
    return;
  }

  const popover = store.selectPopover();
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
  const { property, useInitialValue, tweenMode, duration, easing } =
    mergedValues;
  const defaultInitialValue = store.selectDefaultInitialValue({ property });
  const useAutoTween = side === "update" && tweenMode === "auto";
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
    side,
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

export const handleAddKeyframeInDialog = (deps, payload) => {
  const { render, store } = deps;
  const side =
    payload._event.detail.side ??
    (store.selectDialogType() === "transition" ? "prev" : "update");

  store.setPopover({
    mode: "addKeyframe",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side,
      property: payload._event.detail.property,
      index: payload._event.detail.index,
    },
  });
  render();
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

export const handleKeyframeClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editKeyframe",
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
  store.setPopover({
    mode: "propertyNameMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side: payload._event.detail.side,
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handleKeyframeDropdownItemClick = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const { side, property, index } = popover.payload;
  const { x, y } = popover;
  const value = payload._event.detail.item.value;
  let didMutate = false;

  if (value === "edit") {
    store.setPopover({
      mode: "editKeyframe",
      x,
      y,
      payload: {
        side,
        property,
        index,
      },
    });
  } else if (value === "delete-property") {
    store.deleteProperty({ side, property });
    store.closePopover();
    didMutate = true;
  } else if (value === "delete-keyframe") {
    store.deleteKeyframe({ side, property, index });
    store.closePopover();
    didMutate = true;
  } else if (value === "add-right") {
    store.setPopover({
      mode: "addKeyframe",
      x,
      y,
      payload: {
        side,
        property,
        index: Number(index) + 1,
      },
    });
  } else if (value === "add-left") {
    store.setPopover({
      mode: "addKeyframe",
      x,
      y,
      payload: {
        side,
        property,
        index,
      },
    });
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

export const handleRulerTimeHover = async (deps, payload) => {
  const { graphicsService, projectService, render, store } = deps;
  const timeMs = payload._event.detail.timeMs;
  store.setPreviewPlayhead({
    timeMs,
    visible: true,
  });
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

export const handleRulerTimeLeave = () => {};

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

export const handleEditMaskClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editMask",
    x: payload._event.clientX,
    y: payload._event.clientY,
    payload: {},
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
  const { store } = deps;
  store.commitPendingTransitionMask({});
  store.closePopover();
  commitMaskChange(deps);
};

export const handleDisableMaskClick = (deps) => {
  const { store } = deps;
  store.disableTransitionMask({});
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

export const handleSingleMaskImageRightClick = async (deps, payload) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  const event = payload?._event;
  event?.preventDefault?.();

  if (!store.selectMaskEditorTransitionMask()?.imageId) {
    return;
  }

  const result = await appService.showDropdownMenu({
    items: [
      {
        type: "item",
        label: copy.removeMenuItem ?? "Remove",
        key: "remove",
      },
    ],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });

  if (!result || result.item?.key !== "remove") {
    return;
  }

  store.clearTransitionMaskImage({});
  commitMaskChange(deps);
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

  const playbackRequestId = generateId();
  store.setPreviewPlaybackRequestId({
    requestId: playbackRequestId,
  });
  const isCurrentPlaybackRequest = () =>
    store.selectPreviewPlaybackRequestId() === playbackRequestId;

  const prepared = await preparePreviewPlaybackAtStart({
    graphicsService,
    projectService,
    store,
    shouldContinue: isCurrentPlaybackRequest,
  });
  if (!prepared || !isCurrentPlaybackRequest()) {
    return;
  }

  render();

  const durationMs = store.selectPreviewDurationMs();

  if (durationMs <= 0) {
    return;
  }

  await waitForPreviewPaint();
  if (!isCurrentPlaybackRequest()) {
    return;
  }

  graphicsService.setAnimationPlaybackMode("auto");
  store.setPreviewPlaybackMode({
    mode: "auto",
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

  store.startPreviewPlayback({
    startedAtMs: performance.now(),
    durationMs,
  });
  schedulePreviewPlaybackIndicatorFrame({
    render,
    store,
  });
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
