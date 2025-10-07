import RouteGraphics, {
  createAssetBufferManager,
  SpriteRendererPlugin,
  TextRendererPlugin,
  ContainerRendererPlugin,
  TextRevealingRendererPlugin,
  RectRendererPlugin,
  AudioPlugin,
  SliderRendererPlugin,
  KeyframeTransitionPlugin,
} from "route-graphics";
import createRouteEngine from "route-engine-js";

export const create2dRenderer = async ({ subject }) => {
  let app;
  let assetBufferManager;
  let eventHandler = () => {};

  return {
    init: async (options = {}) => {
      if (app) {
        app.destroy();
        app = undefined;
      }

      const { canvas } = options;
      assetBufferManager = createAssetBufferManager();
      app = new RouteGraphics();

      eventHandler = (eventName, payload) => {
        subject.dispatch("2drendererEvent", {
          eventName,
          payload,
        });
      };

      await app.init({
        width: 1920,
        height: 1080,
        eventHandler: (eventName, payload) => {
          eventHandler(eventName, payload);
        },
        plugins: [
          new SpriteRendererPlugin(),
          new TextRendererPlugin(),
          new ContainerRendererPlugin(),
          new TextRevealingRendererPlugin(),
          new RectRendererPlugin(),
          new AudioPlugin(),
          new SliderRendererPlugin(),
          new KeyframeTransitionPlugin(),
        ],
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
        ticker: app._app.ticker,
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
