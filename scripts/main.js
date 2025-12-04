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
      assets[id] = {
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
  const jsonData = {
    ...vnbundleInstructions.projectData,
  };


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
      if (payload.actions) {
        engine.handleActions(payload.actions);
      }
    },
    plugins,
  });
  await app.loadAssets(assetBufferMap);

  document.getElementById("canvas").appendChild(app.canvas);
  document.getElementById("canvas").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });


  const handlePendingEffects = (effects) => {
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
        app.render(renderState);
      } else if (effect.name === "handleLineActions") {
        engine.handleLineActions();
      }
    }
  };

  const engine = createRouteEngine({ handlePendingEffects });
  engine.init({
    initialState: {
      global: {
        currentLocalizationPackageId: "eklekfjwalefj",
      },
      projectData: jsonData,
    },
  });

};

await init();
