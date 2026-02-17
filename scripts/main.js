import { fileTypeFromBuffer } from "file-type";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { Ticker } from "pixi.js";

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
  videoPlugin,
  particlesPlugin,
  animatedSpritePlugin,
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
    const content = new Uint8Array(
      arrayBuffer,
      contentStart,
      contentEnd - contentStart,
    );
    if (id === "instructions") {
      instructions = JSON.parse(new TextDecoder().decode(content));
    } else {
      const fileType = await fileTypeFromBuffer(content);
      const detectedType = fileType?.mime;
      assets[id] = {
        url: URL.createObjectURL(new Blob([content], { type: detectedType })),
        type: detectedType,
        size: content.byteLength,
      };
    }
  }
  return { assets, instructions };
}

const hideLoadingOverlay = () => {
  const loadingElement = document.getElementById("loading");
  if (loadingElement) {
    loadingElement.classList.add("hidden");
  }
};

const setLoadingText = (text) => {
  const loadingElement = document.getElementById("loading");
  if (loadingElement) {
    loadingElement.textContent = text;
  }
};

const setLoadingReadyForClick = () => {
  const loadingElement = document.getElementById("loading");
  if (loadingElement) {
    loadingElement.textContent = "Click to start";
    loadingElement.classList.add("ready");
  }
};

const waitForClickToStart = async ({ onClick } = {}) => {
  const loadingElement = document.getElementById("loading");
  if (!loadingElement) return;

  await new Promise((resolve, reject) => {
    const handleClick = async () => {
      loadingElement.removeEventListener("click", handleClick);
      loadingElement.classList.remove("ready");

      try {
        if (onClick) {
          await onClick();
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    loadingElement.addEventListener("click", handleClick);
  });
};

const preloadBundleData = async () => {
  const response = await fetch("./package.bin");
  if (!response.ok)
    throw new Error(`Failed to fetch BIN bundle: ${response.statusText}`);
  const { assets: vnbundleAssets, instructions: vnbundleInstructions } =
    await parseVNBundle(await response.arrayBuffer());
  const jsonData = {
    ...vnbundleInstructions.projectData,
  };

  const assets = vnbundleAssets;

  const assetBufferManager = createAssetBufferManager();
  await assetBufferManager.load(assets);
  const assetBufferMap = assetBufferManager.getBufferMap();

  return { jsonData, assetBufferMap };
};

const createInitialState = (jsonData) => {
  const saveSlots = JSON.parse(localStorage.getItem("saveSlots")) || {};
  const globalDeviceVariables =
    JSON.parse(localStorage.getItem("globalDeviceVariables")) || {};
  const globalAccountVariables =
    JSON.parse(localStorage.getItem("globalAccountVariables")) || {};

  return {
    global: {
      currentLocalizationPackageId: "eklekfjwalefj",
      saveSlots,
      variables: { ...globalDeviceVariables, ...globalAccountVariables },
    },
    projectData: jsonData,
  };
};

const prepareRuntime = async () => {
  const { jsonData, assetBufferMap } = await preloadBundleData();
  const plugins = {
    elements: [
      textPlugin,
      rectPlugin,
      spritePlugin,
      sliderPlugin,
      containerPlugin,
      textRevealingPlugin,
      videoPlugin,
      particlesPlugin,
      animatedSpritePlugin,
    ],
    animations: [tweenPlugin],
    audio: [soundPlugin],
  };

  // Create dedicated ticker for auto mode
  const ticker = new Ticker();
  ticker.start();

  const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(
      base64.replace(/^data:image\/[a-z]+;base64,/, ""),
    );
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const routeGraphics = createRouteGraphics();
  let engine;
  await routeGraphics.init({
    width: 1920,
    height: 1080,
    plugins,
    eventHandler: async (eventName, payload) => {
      if (!engine) {
        return;
      }

      if (eventName === "renderComplete") {
        engine.handleActions({
          markLineCompleted: {},
        });
        return;
      }

      if (payload.actions) {
        if (payload.actions.saveSaveSlot) {
          const url = await routeGraphics.extractBase64("story");
          const assets = {
            [`saveThumbnailImage:${payload.actions.saveSaveSlot.slot}`]: {
              buffer: base64ToArrayBuffer(url),
              type: "image/png",
            },
          };
          await routeGraphics.loadAssets(assets);
          payload.actions.saveSaveSlot.thumbnailImage = url;
        }
        engine.handleActions(payload.actions);
      }
    },
  });
  await routeGraphics.loadAssets(assetBufferMap);

  document.getElementById("canvas").appendChild(routeGraphics.canvas);
  document.getElementById("canvas").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics,
    ticker,
  });
  engine = createRouteEngine({ handlePendingEffects: effectsHandler });

  return {
    engine,
    routeGraphics,
    initialState: createInitialState(jsonData),
    started: false,
  };
};

const startRuntime = async (preparedRuntime) => {
  if (preparedRuntime.started) {
    return;
  }

  if (preparedRuntime.routeGraphics?.resumeAudioContext) {
    await preparedRuntime.routeGraphics.resumeAudioContext();
  }
  preparedRuntime.engine.init({
    initialState: preparedRuntime.initialState,
  });
  preparedRuntime.started = true;
  hideLoadingOverlay();
};

const bootstrap = async () => {
  try {
    const preparedRuntime = await prepareRuntime();
    setLoadingReadyForClick();
    await waitForClickToStart({
      onClick: () => startRuntime(preparedRuntime),
    });
  } catch (error) {
    console.error("Failed to start bundle player:", error);
    setLoadingText("Failed to load");
  }
};

await bootstrap();
