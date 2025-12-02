import createRouteGraphics, {
  createAssetBufferManager,
  textPlugin,
  rectPlugin,
  spritePlugin,
  sliderPlugin,
  containerPlugin,
  textRevealingPlugin,
  tweenPlugin,
  soundPlugin,
} from "route-graphics";
import createRouteEngine from "route-engine-js";

export const createGraphicsService = async () => {
  let routeGraphics;
  let engine;
  let assetBufferManager;
  return {
    init: async (options = {}) => {
      if (routeGraphics) {
        routeGraphics.destroy();
        routeGraphics = undefined;
      }

      const { canvas } = options;
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
        ],
        animations: [tweenPlugin],
        audios: [soundPlugin],
      };

      await routeGraphics.init({
        width: 1920,
        height: 1080,
        plugins,
        eventHandler: (eventName, payload) => {
          if (payload.actions) {
            engine.handleActions(payload.actions);
          }
        },
      });

      // app.assignStageEvent("globalpointermove", (event) => {
      //   subject.dispatch("2drendererEvent", {
      //     x: Math.round(event.global.x),
      //     y: Math.round(event.global.y),
      //   });
      // });

      if (canvas) {
        if (canvas.children.length > 0) {
          canvas.removeChild(canvas.children[0]);
        }
        canvas.appendChild(routeGraphics.canvas);
      }
    },
    loadAssets: async (assets) => {
      await assetBufferManager.load(assets);
      await routeGraphics.loadAssets(assetBufferManager.getBufferMap());
    },
    initRouteEngine: (projectData, options = {}) => {
      const { handleEffects = false } = options;
      const handlePendingEffects = (effects) => {
        if (!handleEffects) return;

        // Deduplicate effects by name, keeping only the last occurrence
        const deduplicatedEffects = effects.reduce((acc, effect) => {
          acc[effect.name] = effect;
          return acc;
        }, {});

        // Convert back to array and process deduplicated effects
        const uniqueEffects = Object.values(deduplicatedEffects);

        for (const effect of uniqueEffects) {
          if (effect.name === "render") {
            const renderState = engine.selectRenderState();
            routeGraphics.render(renderState);
          } else if (effect.name === "handleLineActions") {
            engine.handleLineActions();
          }
        }
      };
      engine = createRouteEngine({ handlePendingEffects });
      engine.init({
        initialState: {
          global: {
            currentLocalizationPackageId: "abcd",
          },
          projectData,
        },
      });

      // eventHandler = (eventType, payload) => {
      //   if (eventType === "completed") {
      //     engine.handleEvent({
      //       payload: {
      //         actions: {
      //           handleCompleted: {},
      //         },
      //       },
      //     });
      //   } else if (eventType === "system") {
      //     engine.handleEvent({ payload });
      //   }
      // };
    },

    engineRenderCurrentState: () => {
      const renderState = engine.selectRenderState();
      console.log("renderState", renderState);
      routeGraphics.render(renderState);
    },

    engineHandleActions: (actions) => {
      engine.handleActions(actions);
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
    },
    getStageElementBounds: () => {
      return routeGraphics.getStageElementBounds();
    },
  };
};
