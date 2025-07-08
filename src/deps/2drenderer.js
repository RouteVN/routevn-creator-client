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
  const app = new PixiTDR();
  await app.init({
    width: 1920,
    height: 1080,
    assetBufferMap: {},
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

  // document.getElementById("canvas").appendChild(app.canvas);
  // app.render(payload);

  return {
    getCanvas: () => app.canvas,
    render: app.render,
    loadAssets: async (assets) => {
      // const assets = {
      //   "file:lakjf3lka": {
      //     url: "/public/background-1-1.png",
      //     type: "image/png",
      //   },
      // };
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
      await app.loadAssets(Object.keys(assets));
    }
  }
};
