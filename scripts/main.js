import { fileTypeFromBuffer } from "file-type";
import createRouteEngine, {
  createEffectsHandler,
  createIndexedDbPersistence,
} from "route-engine-js";
import { Ticker } from "pixi.js";

import createRouteGraphics from "route-graphics";
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
import { createBundleRangeReader as createPackageBinRangeReader } from "../src/deps/services/shared/projectExportService.js";

const collectBundleAssetIds = ({ value, hasAsset, result = new Set() }) => {
  if (typeof value === "string") {
    if (hasAsset(value)) {
      result.add(value);
    }
    return result;
  }

  if (!value || typeof value !== "object") {
    return result;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      collectBundleAssetIds({ value: item, hasAsset, result });
    });
    return result;
  }

  Object.values(value).forEach((item) => {
    collectBundleAssetIds({ value: item, hasAsset, result });
  });

  return result;
};

const createBundleAssetLoader = ({ bundleReader, routeGraphics }) => {
  const loadedAssetIds = new Set();
  const assetLoadPromises = new Map();
  const dicedAtlasPixelCache = new Map();

  const shouldBufferAsset = (mimeType = "") => {
    return (
      mimeType.startsWith("audio/") ||
      mimeType.startsWith("font/") ||
      [
        "application/font-woff",
        "application/font-woff2",
        "application/x-font-ttf",
        "application/x-font-otf",
      ].includes(mimeType)
    );
  };

  const createRuntimeAsset = async (assetId) => {
    const metadata = await bundleReader.readAsset(assetId);

    if (metadata?.encoding === "diced-image") {
      let atlas;
      if (!dicedAtlasPixelCache.has(metadata.atlasId)) {
        atlas = await bundleReader.readAtlas(metadata.atlasId);
      }

      return createRuntimeAssetFromDicedImage({
        asset: metadata,
        atlases: atlas
          ? {
              [metadata.atlasId]: atlas,
            }
          : {},
        atlasCache: dicedAtlasPixelCache,
      });
    }

    const content = metadata.buffer;
    const fileType = await fileTypeFromBuffer(content);
    const detectedType = resolveBundleAssetMimeType({
      bundleMime: metadata.mime,
      detectedMime: fileType?.mime,
    });
    if (shouldBufferAsset(detectedType)) {
      return {
        buffer: content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength,
        ),
        source: "buffer",
        type: detectedType,
      };
    }

    return {
      source: "url",
      url: URL.createObjectURL(new Blob([content], { type: detectedType })),
      type: detectedType,
      size: content.byteLength,
    };
  };

  const loadAsset = async (assetId) => {
    if (loadedAssetIds.has(assetId)) {
      return;
    }

    if (assetLoadPromises.has(assetId)) {
      return assetLoadPromises.get(assetId);
    }

    const loadPromise = (async () => {
      const asset = await createRuntimeAsset(assetId);
      await routeGraphics.loadAssets({
        [assetId]: asset,
      });

      loadedAssetIds.add(assetId);
    })().finally(() => {
      assetLoadPromises.delete(assetId);
    });

    assetLoadPromises.set(assetId, loadPromise);
    return loadPromise;
  };

  return {
    collectMissingAssetIds(renderState) {
      const assetIds = collectBundleAssetIds({
        value: renderState,
        hasAsset: (assetId) => bundleReader.hasAsset(assetId),
      });

      return Array.from(assetIds).filter(
        (assetId) => !loadedAssetIds.has(assetId),
      );
    },

    async ensureAssetsLoaded(assetIds = []) {
      const uniqueAssetIds = Array.from(
        new Set(assetIds.filter((assetId) => bundleReader.hasAsset(assetId))),
      );
      await Promise.all(uniqueAssetIds.map(loadAsset));
    },
  };
};

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
  const bundleReader = await createPackageBinRangeReader({
    url: "./package.bin",
  });
  const vnbundleInstructions = await bundleReader.readInstructions();
  const jsonData = {
    ...vnbundleInstructions.projectData,
  };

  return {
    jsonData,
    bundleReader,
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

const prepareEngine = async ({ jsonData, bundleReader, bundleMetadata }) => {
  const plugins = await loadGraphicsEnginePlugins();
  const namespace = createBundleNamespace(bundleMetadata);

  // Create dedicated ticker for auto mode
  const ticker = new Ticker();
  ticker.start();

  const routeGraphics = createRouteGraphics();
  let engine;
  let resolveFirstRender;
  let firstRenderResolved = false;
  let latestPreparedRenderState;
  let renderAssetLoadToken = 0;
  const firstRenderPromise = new Promise((resolve) => {
    resolveFirstRender = resolve;
  });
  const bundleAssetLoader = createBundleAssetLoader({
    bundleReader,
    routeGraphics,
  });
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

  const markFirstRender = () => {
    if (firstRenderResolved) {
      return;
    }

    firstRenderResolved = true;
    resolveFirstRender();
  };

  const renderPreparedState = (renderState) => {
    routeGraphics.render(renderState);
    markFirstRender();
  };

  const renderEngineState = (renderState) => {
    latestPreparedRenderState = prepareRenderStateKeyboardForGraphics({
      renderState,
    });
    const missingAssetIds = bundleAssetLoader.collectMissingAssetIds(
      latestPreparedRenderState,
    );

    if (missingAssetIds.length === 0) {
      renderAssetLoadToken += 1;
      renderPreparedState(latestPreparedRenderState);
      return;
    }

    const loadToken = renderAssetLoadToken + 1;
    renderAssetLoadToken = loadToken;
    setLoadingText("Loading assets...");

    void bundleAssetLoader
      .ensureAssetsLoaded(missingAssetIds)
      .then(() => {
        if (loadToken !== renderAssetLoadToken || !latestPreparedRenderState) {
          return;
        }

        renderPreparedState(latestPreparedRenderState);
      })
      .catch((error) => {
        console.error("Failed to load runtime assets:", error);
        setLoadingText("Failed to load");
      });
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

  return {
    startEngine,
    waitForFirstRender: () => firstRenderPromise,
  };
};

const bootstrap = async () => {
  try {
    const preloadedData = await preloadBundleData();
    const engineRuntime = await prepareEngine(preloadedData);
    setLoadingReadyForClick();
    await waitForClickToStart();
    engineRuntime.startEngine();
    await engineRuntime.waitForFirstRender();
    hideLoadingOverlay();
  } catch (error) {
    console.error("Failed to start bundle player:", error);
    setLoadingText("Failed to load");
  }
};

await bootstrap();
