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

export const createGraphicsService = async ({ subject }) => {
  let routeGraphics;
  let engine;
  let assetBufferManager;
  // Create dedicated ticker for auto mode
  let ticker;
  let beforeHandleActions;
  let actionQueue = Promise.resolve();
  let assetLoadQueue = Promise.resolve();

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

  const enqueueInteractionActions = (actions, eventContext) => {
    actionQueue = actionQueue
      .then(() => {
        return runInteractionActions(actions, eventContext);
      })
      .catch((error) => {
        console.error("[graphicsService] Failed to process interaction", error);
      });
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
          if (eventName === "drag-move") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-move", {
                x: Math.round(payload._event.x),
                y: Math.round(payload._event.y),
              });
          } else if (eventName === "drag-start") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-start");
          } else if (eventName === "drag-end") {
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

          if (payload.actions && engine) {
            enqueueInteractionActions(
              payload.actions,
              payload._event ? { _event: payload._event } : undefined,
            );
          }
        },
      });

      if (canvas) {
        if (canvas.children.length > 0) {
          canvas.removeChild(canvas.children[0]);
        }
        canvas.appendChild(routeGraphics.canvas);
      }
    },
    loadAssets: async (assets) => {
      const queuedLoad = assetLoadQueue.then(() => runAssetLoad(assets));
      assetLoadQueue = queuedLoad.catch(() => {});
      return queuedLoad;
    },
    initRouteEngine: (projectData) => {
      ticker.start();

      const handlePendingEffects = createEffectsHandler({
        getEngine: () => engine,
        routeGraphics,
        ticker,
      });
      engine = createRouteEngine({ handlePendingEffects });
      engine.init({
        initialState: {
          global: {
            currentLocalizationPackageId: "abcd",
          },
          projectData,
        },
      });
    },

    engineSelectPresentationState: () => {
      return engine.selectPresentationState();
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
      routeGraphics.render(renderState);
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
      beforeHandleActions = undefined;
      actionQueue = Promise.resolve();
      assetLoadQueue = Promise.resolve();
      ticker.stop();
    },
  };
};
