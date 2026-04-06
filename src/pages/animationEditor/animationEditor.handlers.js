import { nanoid } from "nanoid";
import {
  createAnimationEditorPayload,
  getAnimationEditorBackPath,
  resolveAnimationEditorPayload,
} from "../../internal/animationEditorRoute.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";

const normalizeTween = (properties = {}) => {
  return Object.fromEntries(
    Object.entries(properties).map(([property, config]) => {
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

const resetPreviewPlayback = ({ graphicsService, store } = {}) => {
  if (!graphicsService) {
    return;
  }

  stopPreviewPlaybackIndicator({
    store,
  });
  graphicsService.setAnimationPlaybackMode("auto");
  graphicsService.render(store.selectAnimationResetState());
  store.setPreviewPlaybackMode({
    mode: "auto",
  });
};

const ensureManualPreviewAtTime = ({ graphicsService, store, timeMs } = {}) => {
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
    graphicsService.render(store.selectAnimationRenderStateWithAnimations());
    store.setPreviewPlaybackMode({
      mode: "manual",
    });
    store.markPreviewPrepared({});
  }

  graphicsService.setAnimationTime(timeMs);
  return needsPreparation;
};

const getAnimationItem = ({ repositoryState, animationId } = {}) => {
  const item = repositoryState?.animations?.items?.[animationId];
  return item?.type === "animation" ? item : undefined;
};

const createAnimationPersistSnapshot = ({ store } = {}) => {
  const dialogType = store.selectDialogType();
  let animationData;

  if (dialogType === "transition") {
    const prevTween = normalizeTween(store.selectProperties({ side: "prev" }));
    const nextTween = normalizeTween(store.selectProperties({ side: "next" }));

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
    name: store.selectAnimationName().trim() || DEFAULT_NEW_ANIMATION_NAME,
    description: store.selectAnimationDescription(),
    animationData,
  };
};

const persistEditorSnapshot = async ({ deps, snapshot } = {}) => {
  const { appService, projectService, render, store } = deps;
  let savedAnimationId = snapshot.editItemId;
  let mutationAttempt;

  if (snapshot.editMode && savedAnimationId) {
    mutationAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update animation.",
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
    savedAnimationId = nanoid();
    mutationAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create animation.",
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
  const { graphicsService, refs, store } = deps;
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
  graphicsService.render(store.selectAnimationResetState());
  store.setPreviewPlaybackMode({
    mode: "auto",
  });
};

const syncEditorState = async ({ deps, repositoryState } = {}) => {
  const { appService, projectService, render, store } = deps;
  const resolvedRepositoryState =
    repositoryState ?? projectService.getRepositoryState();
  const { animationId, dialogType, targetGroupId } =
    getEditorPayload(appService);

  store.setItems({
    data: resolvedRepositoryState?.animations,
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
      appService.showToast("Animation not found.", { title: "Error" });
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
      name: DEFAULT_NEW_ANIMATION_NAME,
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
  const {
    payload: { side },
  } = store.selectPopover();
  const { property, initialValue, useInitialValue } =
    payload._event.detail.values;
  const defaultInitialValue = store.selectDefaultInitialValue({ property });

  const finalInitialValue = useInitialValue
    ? initialValue !== undefined
      ? initialValue
      : defaultInitialValue
    : defaultInitialValue;

  store.addProperty({
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
  const {
    payload: { side, property, index },
  } = store.selectPopover();

  const formValues = {
    ...payload._event.detail.values,
  };

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

export const handleRulerTimeHover = (deps, payload) => {
  const { graphicsService, render, store } = deps;
  const didChangePreviewState = ensureManualPreviewAtTime({
    graphicsService,
    store,
    timeMs: payload._event.detail.timeMs,
  });

  if (didChangePreviewState) {
    render();
  }
};

export const handleRulerTimeLeave = (deps) => {
  const { graphicsService, render, store } = deps;
  resetPreviewPlayback({
    graphicsService,
    store,
  });
  render();
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

export const handleAddPropertyFormChange = (deps, payload) => {
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

export const handleReplayAnimation = async (deps) => {
  const { graphicsService, render, store } = deps;
  if (!graphicsService) {
    return;
  }

  stopPreviewPlaybackIndicator({
    store,
  });
  graphicsService.setAnimationPlaybackMode("auto");
  store.setPreviewPlaybackMode({
    mode: "auto",
  });
  await graphicsService.render(
    store.selectAnimationRenderStateWithAnimations(),
  );

  const durationMs = store.selectPreviewDurationMs();

  if (durationMs <= 0) {
    render();
    return;
  }

  store.startPreviewPlayback({
    startedAtMs: globalThis.performance.now(),
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
  const {
    payload: { side, property },
  } = store.selectPopover();

  const { initialValue, valueSource } = payload._event.detail.values;
  const defaultInitialValue = store.selectDefaultInitialValue({ property });
  const finalInitialValue =
    valueSource === "default" || initialValue === undefined
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
