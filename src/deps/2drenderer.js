import {
  PixiTDR,
  SpriteRendererPlugin,
  TextRendererPlugin,
  ContainerRendererPlugin,
  TextRevealingRendererPlugin,
  GraphicsRendererPlugin,
  SoundPlugin,
  SliderRendererPlugin,
  KeyframeTransitionPlugin,
} from "./renderer.js";

export const create2dRenderer = async () => {
  let app;

  // document.getElementById("canvas").appendChild(app.canvas);
  // app.render(payload);

  return {
    init: async (options = {}) => {
      const { assets, canvas } = options;

      const assetBufferMap = {};
      await Promise.all(
        Object.entries(assets).map(async ([key, value]) => {
          const resp = await fetch(value.url);
          const buffer = await resp.arrayBuffer();
          assetBufferMap[key] = {
            buffer,
            type: value.type,
          };
        })
      );

      app = new PixiTDR();
      await app.init({
        width: 1920,
        height: 1080,
        assetBufferMap,
        eventHandler: (eventType, payload) => {
          //
        },
        plugins: [
          new SpriteRendererPlugin(),
          new TextRendererPlugin(),
          new ContainerRendererPlugin(),
          new TextRevealingRendererPlugin(),
          new GraphicsRendererPlugin(),
          new SoundPlugin(),
          new SliderRendererPlugin(),
          new KeyframeTransitionPlugin(),
        ],
      });
      await app.loadAssets(Object.keys(assets));

      if (canvas) {
        console.log('canvas', canvas)
        // remove child first if there is
        if (canvas.children.length > 0) {
          canvas.removeChild(canvas.children[0])
        }
        canvas.appendChild(app.canvas);
      }
    },
    // getCanvas: () => app.canvas,
    render: (payload) => app.render(payload),
  }
};
