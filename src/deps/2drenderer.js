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

export const create2dRenderer = async () => {
  let app;
  let assetBufferManager;

  return {
    init: async (options = {}) => {
      const { canvas } = options;
      assetBufferManager = createAssetBufferManager();
      app = new RouteGraphics();
      await app.init({
        width: 1920,
        height: 1080,
        eventHandler: (eventType, payload) => {
          //
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
    render: (payload) => app.render(payload),
    destroy: () => {
      if (!app) {
        return;
      }
      app.destroy();
    },
    getStageElementBounds: () => {
      return app.getStageElementBounds();
    },
  };
};
