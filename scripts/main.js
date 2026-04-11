import { fileTypeFromBuffer } from "file-type";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { Ticker } from "pixi.js";

import createRouteGraphics, { createAssetBufferManager } from "route-graphics";
import { prepareRenderStateKeyboardForGraphics } from "../src/internal/project/layout.js";
import {
  createRuntimeEventContext,
  getRuntimeEventActions,
  loadGraphicsEnginePlugins,
  preloadRuntimeSaveSlotImages,
  prepareRuntimeInteractionExecution,
} from "../src/internal/runtime/graphicsEngineRuntime.js";
import { BUNDLE_FORMAT_VERSION } from "../src/deps/services/shared/projectExportService.js";

async function parseVNBundle(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);

  // Read version (byte 0)
  const version = dataView.getUint8(0);
  if (version !== BUNDLE_FORMAT_VERSION) {
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

const waitForClickToStart = async () => {
  const loadingElement = document.getElementById("loading");
  if (!loadingElement) return;

  await new Promise((resolve) => {
    const handleClick = () => {
      loadingElement.removeEventListener("click", handleClick);
      loadingElement.classList.remove("ready");
      resolve();
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

const readStoredJson = (key, fallbackKey) => {
  const rawValue =
    localStorage.getItem(key) ??
    (fallbackKey ? localStorage.getItem(fallbackKey) : undefined);

  if (!rawValue) {
    return {};
  }

  try {
    return JSON.parse(rawValue) || {};
  } catch {
    return {};
  }
};

const prepareEngine = async ({ jsonData, assetBufferMap }) => {
  const plugins = await loadGraphicsEnginePlugins();

  // Create dedicated ticker for auto mode
  const ticker = new Ticker();
  ticker.start();

  const routeGraphics = createRouteGraphics();
  let engine;
  const screenWidth = Number(jsonData?.screen?.width);
  const screenHeight = Number(jsonData?.screen?.height);

  if (!Number.isFinite(screenWidth) || screenWidth <= 0) {
    throw new Error(
      "Bundle projectData.screen.width is required and must be a positive number.",
    );
  }

  if (!Number.isFinite(screenHeight) || screenHeight <= 0) {
    throw new Error(
      "Bundle projectData.screen.height is required and must be a positive number.",
    );
  }

  const canvasContainer = document.getElementById("canvas");
  if (canvasContainer) {
    canvasContainer.style.setProperty(
      "--project-screen-width",
      String(screenWidth),
    );
    canvasContainer.style.setProperty(
      "--project-screen-height",
      String(screenHeight),
    );
  }

  const renderEngineState = (renderState) => {
    const nextRenderState = prepareRenderStateKeyboardForGraphics({
      renderState,
    });
    routeGraphics.render(nextRenderState);
  };

  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: {
      render: renderEngineState,
    },
    ticker,
  });

  await routeGraphics.init({
    width: screenWidth,
    height: screenHeight,
    plugins,
    eventHandler: async (eventName, payload = {}) => {
      if (eventName === "renderComplete") {
        engine.handleActions({
          markLineCompleted: {},
        });
        return;
      }

      const actions = getRuntimeEventActions(payload);
      if (!actions) {
        return;
      }

      const eventContext = createRuntimeEventContext(payload);
      const { preparedActions, thumbnailPreloadError } =
        await prepareRuntimeInteractionExecution({
          actions,
          eventContext,
          graphicsService: routeGraphics,
          canvasRoot: routeGraphics.canvas,
          swallowThumbnailPreloadError: true,
        });

      if (thumbnailPreloadError) {
        console.warn(
          "Failed to preload save thumbnail image.",
          thumbnailPreloadError,
        );
      }

      engine.handleActions(preparedActions, eventContext);
    },
  });
  await routeGraphics.loadAssets(assetBufferMap);

  canvasContainer?.appendChild(routeGraphics.canvas);
  canvasContainer?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  engine = createRouteEngine({ handlePendingEffects: effectsHandler });
  const saveSlots = readStoredJson("saveSlots");
  const deviceVariables = readStoredJson(
    "deviceVariables",
    "globalDeviceVariables",
  );
  const accountVariables = readStoredJson(
    "accountVariables",
    "globalAccountVariables",
  );
  const preloadSaveSlotImagesResult = await preloadRuntimeSaveSlotImages(
    routeGraphics,
    saveSlots,
  );

  if (preloadSaveSlotImagesResult.failed > 0) {
    console.warn(
      `Failed to preload ${preloadSaveSlotImagesResult.failed} saved thumbnail image(s) during bundle startup.`,
    );
  }

  const startEngine = () => {
    engine.init({
      initialState: {
        global: {
          saveSlots,
          variables: { ...deviceVariables, ...accountVariables },
        },
        projectData: jsonData,
      },
    });
  };

  return { startEngine };
};

const bootstrap = async () => {
  try {
    const preloadedData = await preloadBundleData();
    const engineRuntime = await prepareEngine(preloadedData);
    setLoadingReadyForClick();
    await waitForClickToStart();
    engineRuntime.startEngine();
    hideLoadingOverlay();
  } catch (error) {
    console.error("Failed to start bundle player:", error);
    setLoadingText("Failed to load");
  }
};

await bootstrap();
