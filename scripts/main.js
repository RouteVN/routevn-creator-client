import { fileTypeFromBuffer } from "file-type";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

const MAX_DIAGNOSTIC_EVENTS = 24;
const MAX_DIAGNOSTIC_TEXT_LENGTH = 12_000;
const diagnosticEvents = [];

const truncateDiagnosticText = (value) => {
  if (value.length <= MAX_DIAGNOSTIC_TEXT_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH)}\n... truncated ...`;
};

const stringifyDiagnosticValue = (value) => {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return formatErrorForDiagnostics(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatErrorForDiagnostics = (error) => {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  const lines = [];
  const name = typeof error.name === "string" ? error.name : "";
  const message =
    typeof error.message === "string" && error.message.length > 0
      ? error.message
      : String(error);

  lines.push(name && name !== "Error" ? `${name}: ${message}` : message);

  if (error.details !== undefined) {
    lines.push(`Details: ${stringifyDiagnosticValue(error.details)}`);
  }

  if (error.stack) {
    lines.push(`Stack: ${error.stack}`);
  }

  if (error.cause) {
    lines.push(`Cause: ${formatErrorForDiagnostics(error.cause)}`);
  }

  return lines.filter(Boolean).join("\n");
};

const createRuntimeError = (message, cause, details) => {
  const error = new Error(message);
  error.cause = cause;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};

const recordDiagnosticStep = (message, details) => {
  const entry = {
    time: new Date().toISOString(),
    message,
    details,
  };
  diagnosticEvents.push(entry);
  if (diagnosticEvents.length > MAX_DIAGNOSTIC_EVENTS) {
    diagnosticEvents.shift();
  }

  console.info("[RouteVN player]", message, details ?? "");
};

const formatDiagnosticEvents = () =>
  diagnosticEvents
    .map((event) => {
      const details = stringifyDiagnosticValue(event.details);
      return details
        ? `[${event.time}] ${event.message}\n${details}`
        : `[${event.time}] ${event.message}`;
    })
    .join("\n\n");

const getBundleProjectTitle = (bundleMetadata) => {
  const title = bundleMetadata?.project?.title?.trim?.();
  if (title) {
    return title;
  }

  const name = bundleMetadata?.project?.name?.trim?.();
  if (name) {
    return name;
  }

  return "";
};

const setNativeWindowTitle = (title) => {
  if (!globalThis.window?.__TAURI_INTERNALS__?.metadata?.currentWindow) {
    return;
  }

  void getCurrentWindow()
    .setTitle(title)
    .catch((error) => {
      console.warn("Failed to set native window title.", error);
    });
};

const setBundleDocumentTitle = (bundleMetadata) => {
  const title = getBundleProjectTitle(bundleMetadata);
  if (!title) {
    return;
  }

  document.title = title;
  setNativeWindowTitle(title);
};

const setBundleFavicon = ({ url, type }) => {
  const head = document.head;
  if (!head || !url) {
    return;
  }

  let link = document.querySelector(
    'link[rel="icon"][data-routevn-bundle-icon="true"]',
  );
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.dataset.routevnBundleIcon = "true";
    head.appendChild(link);
  }

  link.type = type ?? "image/png";
  link.href = url;
};

const readBundleAssetObjectUrl = async ({ bundleReader, assetId }) => {
  const metadata = await bundleReader.readAsset(assetId);
  if (metadata?.encoding === "diced-image") {
    throw new Error("Diced image assets are not supported as favicon images.");
  }

  const content = metadata.buffer;
  const fileType = await fileTypeFromBuffer(content);
  const type = resolveBundleAssetMimeType({
    bundleMime: metadata.mime,
    detectedMime: fileType?.mime,
  });

  return {
    url: URL.createObjectURL(new Blob([content], { type })),
    type,
    size: content.byteLength,
  };
};

const loadBundleFavicon = async ({ bundleMetadata, bundleReader }) => {
  const iconFileId = bundleMetadata?.project?.iconFileId;
  if (!iconFileId || !bundleReader.hasAsset(iconFileId)) {
    return;
  }

  recordDiagnosticStep("Loading project favicon", { assetId: iconFileId });
  try {
    const favicon = await readBundleAssetObjectUrl({
      bundleReader,
      assetId: iconFileId,
    });
    setBundleFavicon({
      url: favicon.url,
      type: favicon.type,
    });
    recordDiagnosticStep("Loaded project favicon", {
      assetId: iconFileId,
      type: favicon.type,
      size: favicon.size,
    });
  } catch (error) {
    console.warn("Failed to load project favicon.", error);
    recordDiagnosticStep("Failed to load project favicon", {
      assetId: iconFileId,
      error: formatErrorForDiagnostics(error),
    });
  }
};

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

  const createAssetBuffer = (content) => {
    if (content instanceof ArrayBuffer) {
      return content.slice(0);
    }

    return content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    );
  };

  const createRuntimeAsset = async (assetId) => {
    recordDiagnosticStep("Reading bundle asset", { assetId });
    let metadata;
    try {
      metadata = await bundleReader.readAsset(assetId);
    } catch (error) {
      throw createRuntimeError(
        `Failed to read bundle asset "${assetId}".`,
        error,
        { assetId },
      );
    }

    if (metadata?.encoding === "diced-image") {
      let atlas;
      if (!dicedAtlasPixelCache.has(metadata.atlasId)) {
        recordDiagnosticStep("Reading diced image atlas", {
          assetId,
          atlasId: metadata.atlasId,
        });
        try {
          atlas = await bundleReader.readAtlas(metadata.atlasId);
        } catch (error) {
          throw createRuntimeError(
            `Failed to read diced atlas "${metadata.atlasId}" for asset "${assetId}".`,
            error,
            { assetId, atlasId: metadata.atlasId },
          );
        }
      }

      try {
        return await createRuntimeAssetFromDicedImage({
          asset: metadata,
          atlases: atlas
            ? {
                [metadata.atlasId]: atlas,
              }
            : {},
          atlasCache: dicedAtlasPixelCache,
        });
      } catch (error) {
        throw createRuntimeError(
          `Failed to reconstruct diced image asset "${assetId}".`,
          error,
          {
            assetId,
            atlasId: metadata.atlasId,
            width: metadata.width,
            height: metadata.height,
          },
        );
      }
    }

    const content = metadata.buffer;
    let fileType;
    try {
      fileType = await fileTypeFromBuffer(content);
    } catch (error) {
      throw createRuntimeError(
        `Failed to inspect bundle asset "${assetId}".`,
        error,
        {
          assetId,
          mime: metadata.mime,
          size: content?.byteLength,
        },
      );
    }
    const detectedType = resolveBundleAssetMimeType({
      bundleMime: metadata.mime,
      detectedMime: fileType?.mime,
    });

    return {
      buffer: createAssetBuffer(content),
      source: "buffer",
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
      try {
        const loadedAssets = await routeGraphics.loadAssets({
          [assetId]: asset,
        });
        recordDiagnosticStep("Loaded route graphics asset", {
          assetId,
          source: asset?.source,
          type: asset?.type,
          size: asset?.size,
          returnedAssetCount: Array.isArray(loadedAssets)
            ? loadedAssets.length
            : undefined,
        });
      } catch (error) {
        throw createRuntimeError(
          `Graphics engine failed to load asset "${assetId}".`,
          error,
          {
            assetId,
            source: asset?.source,
            type: asset?.type,
            size: asset?.size,
          },
        );
      }

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

const setLoadingError = ({
  summary = "Failed to load",
  error,
  details,
} = {}) => {
  const loadingElement = document.getElementById("loading");
  if (!loadingElement) {
    return;
  }

  loadingElement.classList.remove("hidden");
  loadingElement.classList.add("error");
  loadingElement.textContent = "";

  const panel = document.createElement("div");
  panel.className = "loading-error";

  const title = document.createElement("h1");
  title.className = "loading-error-title";
  title.textContent = "Failed to load";

  const summaryElement = document.createElement("p");
  summaryElement.className = "loading-error-summary";
  summaryElement.textContent = summary;

  const detailBlocks = [];
  const detailsText = stringifyDiagnosticValue(details);
  if (detailsText) {
    detailBlocks.push(`Context:\n${detailsText}`);
  }

  const errorText = formatErrorForDiagnostics(error);
  if (errorText) {
    detailBlocks.push(`Error:\n${errorText}`);
  }

  const recentSteps = formatDiagnosticEvents();
  if (recentSteps) {
    detailBlocks.push(`Recent steps:\n${recentSteps}`);
  }

  const detailsElement = document.createElement("pre");
  detailsElement.className = "loading-error-details";
  detailsElement.textContent = truncateDiagnosticText(
    detailBlocks.filter(Boolean).join("\n\n"),
  );

  panel.append(title, summaryElement, detailsElement);
  loadingElement.append(panel);
};

const preloadBundleData = async () => {
  recordDiagnosticStep("Opening package bundle", { url: "./package.bin" });
  const bundleReader = await createPackageBinRangeReader({
    url: "./package.bin",
  }).catch((error) => {
    throw createRuntimeError("Failed to open package.bin.", error, {
      url: "./package.bin",
    });
  });
  recordDiagnosticStep("Reading bundle instructions", {
    totalLength: bundleReader.totalLength,
    assetCount: Object.keys(bundleReader.manifest?.assets ?? {}).length,
    atlasCount: Object.keys(bundleReader.manifest?.atlases ?? {}).length,
  });
  const vnbundleInstructions = await bundleReader
    .readInstructions()
    .catch((error) => {
      throw createRuntimeError("Failed to read bundle instructions.", error, {
        totalLength: bundleReader.totalLength,
      });
    });
  const jsonData = {
    ...vnbundleInstructions.projectData,
  };
  setBundleDocumentTitle(vnbundleInstructions.bundleMetadata);
  void loadBundleFavicon({
    bundleMetadata: vnbundleInstructions.bundleMetadata,
    bundleReader,
  });

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
  recordDiagnosticStep("Preparing graphics runtime", {
    assetCount: Object.keys(bundleReader.manifest?.assets ?? {}).length,
    atlasCount: Object.keys(bundleReader.manifest?.atlases ?? {}).length,
  });
  const plugins = await loadGraphicsEnginePlugins().catch((error) => {
    throw createRuntimeError("Failed to load graphics engine plugins.", error);
  });
  const namespace = createBundleNamespace(bundleMetadata);

  // Create dedicated ticker for auto mode
  const ticker = new Ticker();
  ticker.start();

  const routeGraphics = createRouteGraphics();
  let engine;
  let resolveFirstRender;
  let rejectFirstRender;
  let firstRenderSettled = false;
  let latestPreparedRenderState;
  let renderAssetLoadToken = 0;
  const firstRenderPromise = new Promise((resolve, reject) => {
    resolveFirstRender = resolve;
    rejectFirstRender = reject;
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
    if (firstRenderSettled) {
      return;
    }

    firstRenderSettled = true;
    resolveFirstRender();
  };

  const failFirstRender = (error) => {
    if (firstRenderSettled) {
      return false;
    }

    firstRenderSettled = true;
    rejectFirstRender(error);
    return true;
  };

  const handleRuntimeRenderFailure = (error, details) => {
    const runtimeError = createRuntimeError(
      "Failed to render runtime state.",
      error,
      details,
    );
    console.error("Failed to render runtime state:", runtimeError);

    if (failFirstRender(runtimeError)) {
      return;
    }

    setLoadingError({
      summary: "The player failed while rendering the current scene.",
      error: runtimeError,
    });
  };

  const renderPreparedState = (renderState) => {
    try {
      routeGraphics.render(renderState);
      markFirstRender();
    } catch (error) {
      handleRuntimeRenderFailure(error, {
        hasRenderState: !!renderState,
      });
    }
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
    recordDiagnosticStep("Loading render assets", {
      assetIds: missingAssetIds,
    });

    void bundleAssetLoader
      .ensureAssetsLoaded(missingAssetIds)
      .then(() => {
        if (loadToken !== renderAssetLoadToken || !latestPreparedRenderState) {
          return;
        }

        renderPreparedState(latestPreparedRenderState);
      })
      .catch((error) => {
        const runtimeError = createRuntimeError(
          "Failed to load runtime assets.",
          error,
          {
            assetIds: missingAssetIds,
            renderAssetLoadToken: loadToken,
          },
        );

        console.error("Failed to load runtime assets:", runtimeError);
        if (failFirstRender(runtimeError)) {
          return;
        }

        setLoadingError({
          summary: "Runtime asset loading failed after the player started.",
          error: runtimeError,
        });
      });
  };

  recordDiagnosticStep("Loading runtime save data", { namespace });
  const persistence = createIndexedDbPersistence({ namespace });
  const {
    saveSlots,
    globalDeviceVariables,
    globalAccountVariables,
    globalRuntime,
    accountViewedRegistry,
  } = await persistence.load().catch((error) => {
    throw createRuntimeError("Failed to load runtime save data.", error, {
      namespace,
    });
  });

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

  recordDiagnosticStep("Initializing graphics engine", {
    width: screenWidth,
    height: screenHeight,
  });
  await routeGraphics
    .init({
      width: screenWidth,
      height: screenHeight,
      plugins,
      eventHandler: routeGraphicsEventHandler,
    })
    .catch((error) => {
      throw createRuntimeError("Failed to initialize graphics engine.", error, {
        width: screenWidth,
        height: screenHeight,
      });
    });

  canvasContainer?.appendChild(routeGraphics.canvas);
  canvasContainer?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  engine = createRouteEngine({ handlePendingEffects: effectsHandler });
  const preloadSaveSlotImagesResult = await preloadRuntimeSaveSlotImages(
    routeGraphics,
    saveSlots,
  ).catch((error) => {
    throw createRuntimeError(
      "Failed to preload saved thumbnail images.",
      error,
    );
  });

  if (preloadSaveSlotImagesResult.failed > 0) {
    console.warn(
      `Failed to preload ${preloadSaveSlotImagesResult.failed} saved thumbnail image(s) during bundle startup.`,
    );
  }

  const startEngine = () => {
    recordDiagnosticStep("Starting route engine", { namespace });
    try {
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
    } catch (error) {
      throw createRuntimeError("Failed to start route engine.", error, {
        namespace,
      });
    }
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
    engineRuntime.startEngine();
    await engineRuntime.waitForFirstRender();
    hideLoadingOverlay();
  } catch (error) {
    console.error("Failed to start bundle player:", error);
    setLoadingError({
      summary: "The player could not finish startup.",
      error,
    });
  }
};

await bootstrap();
