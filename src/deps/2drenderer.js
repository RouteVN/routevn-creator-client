import createRouteGraphics, {
  parse,
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

export const create2dRenderer = async ({ subject }) => {
  let app;
  let assetBufferManager;
  return {
    init: async (options = {}) => {
      if (app) {
        app.destroy();
        app = undefined;
      }

      const { canvas } = options;
      assetBufferManager = createAssetBufferManager();
      app = createRouteGraphics();

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

      await app.init({
        width: 1920,
        height: 1080,
        plugins,
      });

      app.assignStageEvent("globalpointermove", (event) => {
        subject.dispatch("2drendererEvent", {
          x: Math.round(event.global.x),
          y: Math.round(event.global.y),
        });
      });

      if (canvas) {
        if (canvas.children.length > 0) {
          canvas.removeChild(canvas.children[0]);
        }
        canvas.appendChild(app.canvas);
      }
    },
    loadAssets: async (assets) => {
      await assetBufferManager.load(assets);
      await app.loadAssets(assetBufferManager.getBufferMap());
    },
    initRouteEngine: (projectData) => {
      const engine = createRouteEngine();
      engine.onEvent(({ eventType, payload }) => {
        if (eventType === "render") {
          app.render(payload);
        }
      });

      engine.init({
        projectData,
        // ticker: app._app.ticker,
        // captureElement,
        loadAssets: app.loadAssets,
      });

      eventHandler = (eventType, payload) => {
        if (eventType === "completed") {
          engine.handleEvent({
            payload: {
              actions: {
                handleCompleted: {},
              },
            },
          });
        } else if (eventType === "system") {
          engine.handleEvent({ payload });
        }
      };
    },
    render: (payload) => app.render(payload),
    parse: parse,
    destroy: () => {
      if (!app) {
        return;
      }
      app.destroy();
      app = undefined;
    },
    getStageElementBounds: () => {
      return app.getStageElementBounds();
    },
  };
};
