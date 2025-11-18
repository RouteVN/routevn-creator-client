import { fileTypeFromBuffer } from "file-type";
import createRouteEngine from 'route-engine-js'
import createRouteGraphics, {
  textPlugin,
  rectPlugin,
  spritePlugin,
  sliderPlugin,
  containerPlugin,
  textRevealingPlugin,
  tweenPlugin,
  soundPlugin,
  createAssetBufferManager
} from "route-graphics";

async function parseVNBundle(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);

  // Read version (byte 0)
  const version = dataView.getUint8(0);
  if (version !== 1) {
    throw new Error(`Unsupported bundle version: ${version}`);
  }

  // Read index length (bytes 1-4, big-endian)
  const indexLength = dataView.getUint32(1, false);

  // Fixed header size is 16 bytes
  const headerSize = 16;

  // Read index (starts after 16-byte header)
  const indexBuffer = new Uint8Array(arrayBuffer, headerSize, indexLength);
  const index = JSON.parse(new TextDecoder().decode(indexBuffer));
  const assets = {};
  let instructions = null;

  // Data block starts after header and index
  const dataBlockOffset = headerSize + indexLength;

  for (const [id, metadata] of Object.entries(index)) {
    const contentStart = metadata.start + dataBlockOffset;
    const contentEnd = metadata.end + dataBlockOffset + 1;
    const content = new Uint8Array(arrayBuffer, contentStart, contentEnd - contentStart);
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
  const response = await fetch('./package.bin');
  if (!response.ok) throw new Error(`Failed to fetch BIN bundle: ${response.statusText}`);
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

  const plugins = {
    elements: [
      textPlugin,
      rectPlugin,
      spritePlugin,
      sliderPlugin,
      containerPlugin,
      textRevealingPlugin
    ],
    animations: [
      tweenPlugin
    ],
    audios: [
      soundPlugin
    ]  
  }

  const app = createRouteGraphics();
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
    plugins,
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