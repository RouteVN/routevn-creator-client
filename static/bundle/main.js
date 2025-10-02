import { fileTypeFromBuffer } from "https://cdn.jsdelivr.net/npm/file-type@19.0.0/+esm";
import createRouteEngine from 'https://cdn.jsdelivr.net/npm/route-engine-js@0.0.2-rc18/+esm'
import RouteGraphics, {
  SpriteRendererPlugin,
  TextRendererPlugin,
  ContainerRendererPlugin,
  TextRevealingRendererPlugin,
  RectRendererPlugin,
  AudioPlugin,
  SliderRendererPlugin,
  KeyframeTransitionPlugin,
  createAssetBufferManager,
} from "https://cdn.jsdelivr.net/npm/route-graphics@0.0.2-rc30/+esm";

async function parseVNBundle(arrayBuffer) {
  const uint8View = new Uint8Array(arrayBuffer);
  const headerSize = 9 + Number(new DataView(uint8View.buffer, 1, 8).getBigUint64(0));
  const index = JSON.parse(new TextDecoder().decode(uint8View.subarray(9, headerSize)));
  const assets = {};
  let instructions = null;
  for (const [id, metadata] of Object.entries(index)) {
    const content = uint8View.subarray(metadata.start + headerSize, metadata.end + headerSize + 1);
    if (id === 'instructions') {
      instructions = JSON.parse(new TextDecoder().decode(content));
    } else {
      const fileType = await fileTypeFromBuffer(content);
      const detectedType = fileType?.mime;
      assets[`file:${id}`] = {
        url: URL.createObjectURL(new Blob([content], { type: detectedType })),
        type: detectedType,
        size: content.byteLength
      };
    }
  }
  return { assets, instructions };
}

const init = async () => {
  const response = await fetch('./package.vnbundle');
  if (!response.ok) throw new Error(`Failed to fetch VNBundle: ${response.statusText}`);
  const { assets: vnbundleAssets, instructions: vnbundleInstructions } = await parseVNBundle(await response.arrayBuffer());
  console.log('VNBundle assets:', vnbundleAssets);
  console.log('VNBundle instructions:', vnbundleInstructions);
  const jsonData = {
    ...vnbundleInstructions.projectData,
    i18n: {
      defaultPackId: "eklekfjwalefj",
      packs: {
        eklekfjwalefj: {
          label: "English",
          lang: "en",
          keys: {}
        }
      }
    }
  };

  jsonData.resources.layouts["storyScreenLayout"] = {
    name: "Story Screen Background",
    elements: [
      {
        "id": "story-screen-bg",
        "type": "rect",
        "x": 0,
        "y": 0,
        "width": 1920,
        "height": 1080,
        "fill": "#000000",
        "clickEventName": "system",
        "clickEventPayload": {
          "actions": {
            "nextLine": {}
          }
        }
      }
    ]
  }

  jsonData.story.scenes["scene-prologue"].sections["section-main"].lines[0].actions.screen = {
    resourceId: "storyScreenLayout",
    resourceType: "layout"
  }

  const assets = vnbundleAssets;

  const assetBufferManager = createAssetBufferManager();
  await assetBufferManager.load(assets);
  const assetBufferMap = assetBufferManager.getBufferMap();

  const app = new RouteGraphics();
  await app.init({
    width: 1920,
    height: 1080,
    assetBufferMap,
    eventHandler: (eventType, payload) => {
      console.log('eventHandler', { eventType, payload })
      if (eventType === "completed") {
        engine.handleEvent({
          payload: {
            actions: {
              handleCompleted: {}
            }
          }
        });
      } else if (eventType === "system") {
        engine.handleEvent({ payload });
      }
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
  await app.loadAssets(assetBufferMap);

  document.getElementById("canvas").appendChild(app.canvas);
  document.getElementById("canvas").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });


  // Recursive function to find element by label
  const findElementByLabel = (container, targetLabel) => {
    // Check if current container has the target label
    if (container.label === targetLabel) {
      return container;
    }

    // If container has children, search recursively
    if (container.children && container.children.length > 0) {
      for (const child of container.children) {
        const found = findElementByLabel(child, targetLabel);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  // Function to capture screenshot of specific element
  const captureElement = async (targetLabel) => {
    console.log(`Searching for element with label: ${targetLabel}`);

    // Find the element with the specified label
    const element = findElementByLabel(app._app.stage, targetLabel);

    if (!element) {
      console.error(`Element with label "${targetLabel}" not found`);
      return null;
    }

    console.log(`Found element:`, element);

    // Extract base64 from the found element
    const base64 = await app._app.renderer.extract.base64(element);

    // Create an image to resize
    const img = new Image();
    img.src = base64;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // Create canvas for resizing (6x smaller)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(img.width / 6);
    canvas.height = Math.floor(img.height / 6);

    // Draw the resized image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Get resized image as base64
    const resizedBase64 = canvas.toDataURL('image/png');

    console.log(`Image of ${targetLabel} captured (${canvas.width}x${canvas.height})`);

    return resizedBase64;
  };

  const engine = createRouteEngine();
  engine.onEvent(({ eventType, payload }) => {
    console.log('onEvent', { eventType, payload })
    if (eventType === "render") {
      app.render(payload);
    }
  });

  engine.init({
    projectData: jsonData,
    ticker: app._app.ticker,
    captureElement,
    loadAssets: app.loadAssets
  });

};

await init();
