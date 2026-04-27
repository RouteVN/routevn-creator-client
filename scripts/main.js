import { fileTypeFromBuffer } from "file-type";
import createRouteEngine, {
  createEffectsHandler,
  createIndexedDbPersistence,
} from "route-engine-js";
import { Ticker } from "pixi.js";

import createRouteGraphics, { createAssetBufferManager } from "route-graphics";
import { createRuntimeAssetFromDicedImage } from "../src/internal/bundleRuntimeDicedImages.js";
import { prepareRenderStateKeyboardForGraphics } from "../src/internal/project/layout.js";
import {
  createRuntimeEventContext,
  getRuntimeEventActions,
  loadGraphicsEnginePlugins,
  preloadRuntimeSaveSlotImages,
  prepareRuntimeInteractionExecution,
} from "../src/internal/runtime/graphicsEngineRuntime.js";
import { resolveBundleAssetMimeType } from "../src/internal/bundleRuntimeAssets.js";
import { parseBundle } from "../src/deps/services/shared/projectExportService.js";

async function parseVNBundle(arrayBuffer) {
  const parsedBundle = await parseBundle(arrayBuffer);
  const assets = {};
  const atlasCache = new Map();

  for (const [id, metadata] of Object.entries(parsedBundle.assets || {})) {
    if (metadata?.encoding === "diced-image") {
      assets[id] = await createRuntimeAssetFromDicedImage({
        asset: metadata,
        atlases: parsedBundle.atlases,
        atlasCache,
      });
      continue;
    }

    const content = metadata.buffer;
    const fileType = await fileTypeFromBuffer(content);
    const detectedType = resolveBundleAssetMimeType({
      bundleMime: metadata.mime,
      detectedMime: fileType?.mime,
    });
    assets[id] = {
      url: URL.createObjectURL(new Blob([content], { type: detectedType })),
      type: detectedType,
      size: content.byteLength,
    };
  }

  return {
    assets,
    instructions: parsedBundle.instructions,
  };
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

  return {
    jsonData,
    assetBufferMap,
    bundleMetadata: vnbundleInstructions.bundleMetadata,
  };
};

const createBundleNamespace = (bundleMetadata) => {
  const metadataNamespace = bundleMetadata?.project?.namespace;
  if (typeof metadataNamespace === "string" && metadataNamespace.length > 0) {
    return metadataNamespace;
  }

  const pathname =
    typeof window?.location?.pathname === "string" &&
    window.location.pathname.length > 0
      ? window.location.pathname
      : "/";

  return `bundle:${pathname}`;
};

const prepareEngine = async ({ jsonData, assetBufferMap, bundleMetadata }) => {
  const plugins = await loadGraphicsEnginePlugins();
  const namespace = createBundleNamespace(bundleMetadata);

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

  const persistence = createIndexedDbPersistence({ namespace });
  const {
    saveSlots,
    globalDeviceVariables,
    globalAccountVariables,
    globalRuntime,
    accountViewedRegistry,
  } = await persistence.load();

  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    persistence,
    routeGraphics: {
      render: renderEngineState,
    },
    ticker,
  });

  const routeGraphicsEventHandler =
    effectsHandler.createRouteGraphicsEventHandler({
      preprocessPayload: async (eventName, payload) => {
        const actions = getRuntimeEventActions(payload);
        if (!actions) {
          return payload;
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

        return {
          ...payload,
          actions: preparedActions,
        };
      },
    });

  await routeGraphics.init({
    width: screenWidth,
    height: screenHeight,
    plugins,
    eventHandler: routeGraphicsEventHandler,
  });
  await routeGraphics.loadAssets(assetBufferMap);

  canvasContainer?.appendChild(routeGraphics.canvas);
  canvasContainer?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  engine = createRouteEngine({ handlePendingEffects: effectsHandler });
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
      namespace,
      initialState: {
        global: {
          saveSlots,
          variables: {
            ...globalDeviceVariables,
            ...globalAccountVariables,
          },
          runtime: globalRuntime,
          accountViewedRegistry,
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
