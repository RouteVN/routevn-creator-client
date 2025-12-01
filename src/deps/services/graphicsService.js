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
    initRouteEngine: (projectData) => {
      const handlePendingEffects = (effects) => {
        console.log("Pending Effects:", effects);
      };
      engine = createRouteEngine({ handlePendingEffects });
      // engine.onEvent(({ eventType, payload }) => {
      //   if (eventType === "render") {
      //     routeGraphics.render(payload);
      //   }
      // });
      // engine.init({
      //   projectData,
      //   // ticker: app._app.ticker,
      //   // loadAssets: app.loadAssets,
      //   // captureElement,
      // });
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
