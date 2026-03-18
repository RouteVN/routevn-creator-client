import createRouteGraphics, {
  createAssetBufferManager,
  textPlugin,
  rectPlugin,
  spritePlugin,
  sliderPlugin,
  containerPlugin,
  textRevealingPlugin,
  videoPlugin,
  tweenPlugin,
  soundPlugin,
} from "route-graphics";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { Ticker } from "pixi.js";
import { prepareRenderStateKeyboardForGraphics } from "../../internal/project/layout.js";

export const createGraphicsService = async ({ subject }) => {
  const RIGHT_CLICK_EVENT_NAMES = new Set(["rightclick", "rightClick"]);
  let routeGraphics;
  let engine;
  let assetBufferManager;
  let enableGlobalKeyboardBindings = true;
  // Create dedicated ticker for auto mode
  let ticker;
  let beforeHandleActions;
  let actionQueue = Promise.resolve();
  let assetLoadQueue = Promise.resolve();
  let pendingClickInteractionTimeouts = new Map();

  const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

  const loadBuffersWithRetry = async (assets, retryCount = 1) => {
    let attempt = 0;
    while (attempt <= retryCount) {
      try {
        await assetBufferManager.load(assets);
        return;
      } catch (error) {
        if (attempt >= retryCount) {
          throw error;
        }
        attempt += 1;
      }
    }
  };

  const runAssetLoad = async (assets) => {
    const assetEntries = Object.entries(assets || {});
    const newAssetEntries = assetEntries.filter(
      ([key]) => !assetBufferManager.has(key),
    );

    if (newAssetEntries.length === 0) {
      return;
    }

    const newAssets = Object.fromEntries(newAssetEntries);
    const blobUrlsToRevoke = newAssetEntries
      .map(([, asset]) => asset?.url)
      .filter(isBlobUrl);

    try {
      await loadBuffersWithRetry(newAssets);
    } finally {
      blobUrlsToRevoke.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    }

    const fullBufferMap = assetBufferManager.getBufferMap();
    const deltaBufferMap = Object.fromEntries(
      newAssetEntries
        .map(([key]) => [key, fullBufferMap[key]])
        .filter(([, value]) => !!value),
    );

    if (Object.keys(deltaBufferMap).length === 0) {
      return;
    }

    await routeGraphics.loadAssets(deltaBufferMap);
  };

  const runInteractionActions = async (actions, eventContext) => {
    if (beforeHandleActions) {
      await beforeHandleActions(actions, eventContext);
    }

    if (!engine) {
      return;
    }

    engine.handleActions(actions, eventContext);
  };

  const getEventActions = (payload) => {
    if (payload?.actions && typeof payload.actions === "object") {
      return payload.actions;
    }

    if (
      payload?.payload?.actions &&
      typeof payload.payload.actions === "object"
    ) {
      return payload.payload.actions;
    }

    return undefined;
  };

  const renderEngineState = (renderState) => {
    const nextRenderState = prepareRenderStateKeyboardForGraphics({
      renderState,
      enableGlobalKeyboardBindings,
    });
    routeGraphics.render(nextRenderState);
  };

  const enqueueInteractionActions = (actions, eventContext) => {
    actionQueue = actionQueue
      .then(() => {
        return runInteractionActions(actions, eventContext);
      })
      .catch((error) => {
        console.error("[graphicsService] Failed to process interaction", error);
      });
  };

  const clearPendingClickInteraction = (interactionId) => {
    const timeoutId = pendingClickInteractionTimeouts.get(interactionId);
    if (timeoutId === undefined) {
      return;
    }

    clearTimeout(timeoutId);
    pendingClickInteractionTimeouts.delete(interactionId);
  };

  const clearAllPendingClickInteractions = () => {
    for (const timeoutId of pendingClickInteractionTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    pendingClickInteractionTimeouts = new Map();
  };

  const scheduleClickInteraction = (actions, eventContext) => {
    const interactionId = eventContext?._event?.id ?? "__unknown__";
    clearPendingClickInteraction(interactionId);

    // Route Graphics currently emits the generic click path on right mouse
    // release for some element plugins. Delay left-click processing one task
    // so a same-element rightClick can cancel it.
    const timeoutId = setTimeout(() => {
      pendingClickInteractionTimeouts.delete(interactionId);
      enqueueInteractionActions(actions, eventContext);
    }, 0);

    pendingClickInteractionTimeouts.set(interactionId, timeoutId);
  };

  return {
    init: async (options = {}) => {
      if (routeGraphics) {
        routeGraphics.destroy();
        routeGraphics = undefined;
      }

      ticker = new Ticker();
      ticker.start();
      const { canvas, beforeHandleActions: onBeforeHandleActions } = options;
      beforeHandleActions = onBeforeHandleActions;
      actionQueue = Promise.resolve();
      assetLoadQueue = Promise.resolve();
      clearAllPendingClickInteractions();
      assetBufferManager = createAssetBufferManager();
      routeGraphics = createRouteGraphics();

      const plugins = {
        elements: [
          textPlugin,
          rectPlugin,
          spritePlugin,
          sliderPlugin,
          containerPlugin,
          textRevealingPlugin,
          videoPlugin,
        ],
        animations: [tweenPlugin],
        audio: [soundPlugin],
      };

      await routeGraphics.init({
        width: 1920,
        height: 1080,
        plugins,
        eventHandler: (eventName, payload) => {
          if (eventName === "dragMove") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-move", {
                x: Math.round(payload._event.x),
                y: Math.round(payload._event.y),
              });
          } else if (eventName === "dragStart") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-start");
          } else if (eventName === "dragEnd") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-end");
          }

          if (!engine) {
            return;
          }

          if (eventName === "renderComplete") {
            engine.handleActions({
              markLineCompleted: {},
            });
            return;
          }

          const actions = getEventActions(payload);

          if (actions && engine) {
            const eventContext = payload._event
              ? { _event: payload._event }
              : undefined;
            const interactionId = eventContext?._event?.id ?? "__unknown__";

            if (RIGHT_CLICK_EVENT_NAMES.has(eventName)) {
              clearPendingClickInteraction(interactionId);
              enqueueInteractionActions(actions, eventContext);
              return;
            }

            if (eventName === "click") {
              scheduleClickInteraction(actions, eventContext);
              return;
            }

            enqueueInteractionActions(actions, eventContext);
          }
        },
      });

      if (canvas) {
        if (canvas.children.length > 0) {
          canvas.removeChild(canvas.children[0]);
        }
        // Keep Pixi's internal render resolution (1920x1080) but scale display to container.
        routeGraphics.canvas.style.width = "100%";
        routeGraphics.canvas.style.height = "100%";
        routeGraphics.canvas.style.display = "block";
        canvas.appendChild(routeGraphics.canvas);
      }
    },
    loadAssets: async (assets) => {
      const queuedLoad = assetLoadQueue.then(() => runAssetLoad(assets));
      assetLoadQueue = queuedLoad.catch(() => {});
      return queuedLoad;
    },
    initRouteEngine: (projectData, options = {}) => {
      ticker.start();
      enableGlobalKeyboardBindings =
        options.enableGlobalKeyboardBindings ?? true;

      const handlePendingEffects = createEffectsHandler({
        getEngine: () => engine,
        routeGraphics: {
          ...routeGraphics,
          render: renderEngineState,
        },
        ticker,
      });
      engine = createRouteEngine({ handlePendingEffects });
      engine.init({
        initialState: {
          global: {},
          projectData,
        },
      });
    },

    engineSelectPresentationState: () => {
      return engine.selectPresentationState();
    },

    engineSelectRenderState: () => {
      return engine.selectRenderState();
    },

    engineSelectSectionLineChanges: (payload) => {
      return engine.selectSectionLineChanges(payload);
    },

    engineSelectPresentationChanges: () => {
      return engine.selectPresentationChanges();
    },

    engineRenderCurrentState: (options = {}) => {
      const { skipAudio = false, skipAnimations = false } = options;
      let renderState = engine.selectRenderState();
      if (skipAudio) {
        renderState = { ...renderState, audio: [] };
      }
      if (skipAnimations) {
        renderState = { ...renderState, animations: [] };
      }
      renderEngineState(renderState);
    },

    engineHandleActions: (actions, eventContext) => {
      engine.handleActions(actions, eventContext);
    },

    render: (payload) => routeGraphics.render(payload),
    parse: (payload) => routeGraphics.parse(payload),
    destroy: () => {
      if (routeGraphics) {
        routeGraphics.destroy();
        routeGraphics = undefined;
      }
      if (engine) {
        engine = undefined;
      }
      enableGlobalKeyboardBindings = true;
      beforeHandleActions = undefined;
      actionQueue = Promise.resolve();
      assetLoadQueue = Promise.resolve();
      clearAllPendingClickInteractions();
      ticker.stop();
    },
  };
};
