import createRouteGraphics, {
  Assets,
  AudioAsset,
  createAssetBufferManager,
  textPlugin,
  rectPlugin,
  spritePlugin,
  sliderPlugin,
  containerPlugin,
  textRevealingPlugin,
  videoPlugin,
  tweenPlugin,
  soundPlugin,
} from "route-graphics";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { Ticker } from "pixi.js";
import { prepareRenderStateKeyboardForGraphics } from "../../internal/project/layout.js";
import { DEFAULT_PROJECT_RESOLUTION } from "../../internal/projectResolution.js";

const cloneBufferForAudioDecode = (value) => {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }

  return new ArrayBuffer(0);
};

const TAURI_ASSET_URL_PREFIXES = [
  "http://asset.localhost/",
  "asset://localhost/",
];

// Keep this in sync with src-tauri/src/project_file_protocol.rs.
const PIXI_EXTENSION_BY_MIME_TYPE = {
  "image/apng": "apng",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/svg+xml": "svg",
  "image/tiff": "tif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/vnd.microsoft.icon": "ico",
  "image/x-icon": "ico",
  "image/jxl": "jxl",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/avi": "avi",
  "video/x-ms-wmv": "wmv",
  "video/mpeg": "mpeg",
  "video/mp2t": "ts",
  "video/3gpp": "3gp",
  "video/3gpp2": "3g2",
  "video/x-matroska": "mkv",
};

const isTauriAssetUrl = (url) => {
  return (
    typeof url === "string" &&
    TAURI_ASSET_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
  );
};

const getProjectFileProtocolOrigin = (assetUrl) => {
  if (assetUrl.startsWith("http://asset.localhost/")) {
    return "http://project-file.localhost";
  }

  if (assetUrl.startsWith("asset://localhost/")) {
    return "project-file://localhost";
  }

  return undefined;
};

const normalizeMediaAssetUrlForPixi = (asset) => {
  const url = asset?.url;
  const extension = PIXI_EXTENSION_BY_MIME_TYPE[asset?.type];
  const projectFileOrigin = getProjectFileProtocolOrigin(url);
  const assetPath = getTauriAssetFilePath(url);

  if (!extension || !projectFileOrigin || !assetPath) {
    return url;
  }

  return `${projectFileOrigin}/pixi-asset.${extension}?path=${encodeURIComponent(
    assetPath,
  )}`;
};

const getTauriAssetFilePath = (assetUrl) => {
  if (typeof assetUrl !== "string") {
    return undefined;
  }

  const matchingPrefix = TAURI_ASSET_URL_PREFIXES.find((prefix) =>
    assetUrl.startsWith(prefix),
  );
  if (!matchingPrefix) {
    return undefined;
  }

  try {
    let filePath = decodeURIComponent(assetUrl.slice(matchingPrefix.length));

    if (/^\/[A-Za-z]:[\\/]/.test(filePath)) {
      filePath = filePath.slice(1);
    }

    return filePath;
  } catch {
    return undefined;
  }
};

const normalizeGraphicsAssetForLoad = (asset = {}) => {
  const assetType = asset?.type ?? "";
  const isPixiUrlBackedMedia =
    (assetType.startsWith("image/") || assetType.startsWith("video/")) &&
    isTauriAssetUrl(asset.url) &&
    Boolean(PIXI_EXTENSION_BY_MIME_TYPE[assetType]);

  if (!isPixiUrlBackedMedia) {
    return asset;
  }

  return {
    ...asset,
    url: normalizeMediaAssetUrlForPixi(asset),
  };
};

const estimateAudioBufferBytes = (audioBuffer) => {
  if (!audioBuffer) {
    return 0;
  }

  return audioBuffer.length * audioBuffer.numberOfChannels * 4;
};

let managedAudioDecodeContext;
let managedAudioCache = new Map();
let managedAudioPendingLoads = new Map();
let managedAudioResetToken = 0;

const createManagedAudioDecodeContext = () => {
  const AudioContextConstructor =
    globalThis.AudioContext || globalThis.webkitAudioContext;

  if (typeof AudioContextConstructor !== "function") {
    return undefined;
  }

  return new AudioContextConstructor();
};

const getManagedAudioDecodeContext = () => {
  if (
    managedAudioDecodeContext &&
    managedAudioDecodeContext.state !== "closed"
  ) {
    return managedAudioDecodeContext;
  }

  managedAudioDecodeContext = createManagedAudioDecodeContext();
  return managedAudioDecodeContext;
};

const closeManagedAudioDecodeContext = async () => {
  const currentContext = managedAudioDecodeContext;
  managedAudioDecodeContext = undefined;

  if (!currentContext || currentContext.state === "closed") {
    return;
  }

  try {
    await currentContext.close();
  } catch (error) {
    console.error(
      "[graphicsService] Failed to close managed audio decode context",
      error,
    );
  }
};

const installManagedAudioAsset = () => {
  if (AudioAsset?.__rvnManaged === true) {
    return;
  }

  const load = async (key, arrayBuffer) => {
    if (managedAudioCache.has(key)) {
      return managedAudioCache.get(key);
    }

    const pendingLoad = managedAudioPendingLoads.get(key);
    if (pendingLoad) {
      return await pendingLoad;
    }

    const decodeContext = getManagedAudioDecodeContext();
    if (!decodeContext) {
      return undefined;
    }

    const decodeSource = cloneBufferForAudioDecode(arrayBuffer);
    if (decodeSource.byteLength === 0) {
      return undefined;
    }

    const currentResetToken = managedAudioResetToken;
    const nextPendingLoad = decodeContext
      .decodeAudioData(decodeSource)
      .then((audioBuffer) => {
        if (managedAudioResetToken !== currentResetToken) {
          return undefined;
        }

        managedAudioCache.set(key, audioBuffer);
        return audioBuffer;
      })
      .catch((error) => {
        console.error(`AudioAsset.load: Failed to decode ${key}:`, error);
        return undefined;
      })
      .finally(() => {
        managedAudioPendingLoads.delete(key);
      });

    managedAudioPendingLoads.set(key, nextPendingLoad);
    return await nextPendingLoad;
  };

  const getAsset = (key) => {
    return managedAudioCache.get(key);
  };

  const unload = async (key) => {
    managedAudioCache.delete(key);
    managedAudioPendingLoads.delete(key);

    if (managedAudioCache.size === 0 && managedAudioPendingLoads.size === 0) {
      await closeManagedAudioDecodeContext();
    }
  };

  const clear = async () => {
    managedAudioResetToken += 1;
    managedAudioCache = new Map();
    managedAudioPendingLoads = new Map();
    await closeManagedAudioDecodeContext();
  };

  const getStats = () => {
    return Array.from(managedAudioCache.entries()).map(
      ([key, audioBuffer]) => ({
        key,
        duration: audioBuffer.duration,
        channels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        estimatedBytes: estimateAudioBufferBytes(audioBuffer),
      }),
    );
  };

  AudioAsset.load = load;
  AudioAsset.getAsset = getAsset;
  AudioAsset.unload = unload;
  AudioAsset.remove = unload;
  AudioAsset.clear = clear;
  AudioAsset.reset = clear;
  AudioAsset.getStats = getStats;
  AudioAsset.__rvnManaged = true;
};

installManagedAudioAsset();

export const createGraphicsService = async ({ subject }) => {
  const RIGHT_CLICK_EVENT_NAMES = new Set(["rightclick", "rightClick"]);
  let routeGraphics;
  let engine;
  let assetBufferManager;
  let loadedAssetTypes = new Map();
  let enableGlobalKeyboardBindings = true;
  // Create dedicated ticker for auto mode
  let ticker;
  let beforeHandleActions;
  let actionQueue = Promise.resolve();
  let assetLoadQueue = Promise.resolve();
  let pendingClickInteractionTimeouts = new Map();
  let deferredAudioRenderToken = 0;
  let deferredAudioRenderKeySignature = "";
  let suppressedEngineRenderEffects = 0;

  const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

  const classifyAsset = (mimeType) => {
    if (!mimeType) {
      return "texture";
    }

    if (mimeType.startsWith("audio/")) {
      return "audio";
    }

    if (
      mimeType.startsWith("font/") ||
      [
        "application/font-woff",
        "application/font-woff2",
        "application/x-font-ttf",
        "application/x-font-otf",
      ].includes(mimeType)
    ) {
      return "font";
    }

    if (mimeType.startsWith("video/")) {
      return "video";
    }

    return "texture";
  };

  const normalizeFontFamily = (value) => {
    return value?.replace(/^["']|["']$/g, "");
  };

  const ensureAudioAssetsLoaded = async (assetKeys = []) => {
    const uniqueAudioKeys = Array.from(
      new Set(assetKeys.filter((key) => typeof key === "string" && key)),
    );

    if (uniqueAudioKeys.length === 0) {
      return;
    }

    const bufferMap = assetBufferManager?.getBufferMap?.() ?? {};
    const keysToDecode = uniqueAudioKeys.filter((key) => {
      if (!bufferMap[key]) {
        return false;
      }

      if (managedAudioPendingLoads.has(key)) {
        return false;
      }

      return !AudioAsset.getAsset?.(key);
    });

    if (keysToDecode.length === 0) {
      return;
    }

    await Promise.all(
      keysToDecode.map((key) => AudioAsset.load(key, bufferMap[key].buffer)),
    );
  };

  const invalidateDeferredAudioRender = () => {
    deferredAudioRenderToken += 1;
    deferredAudioRenderKeySignature = "";
  };

  const getRenderStateAudioKeys = (renderState) => {
    return Array.from(
      new Set(
        (renderState?.audio ?? [])
          .map((audioElement) => audioElement?.src)
          .filter((key) => typeof key === "string" && key),
      ),
    );
  };

  const getMissingDecodedAudioKeys = (assetKeys = []) => {
    const uniqueAudioKeys = Array.from(
      new Set(assetKeys.filter((key) => typeof key === "string" && key)),
    );

    return uniqueAudioKeys.filter((key) => !AudioAsset.getAsset?.(key));
  };

  const getDecodableAudioKeys = (assetKeys = []) => {
    const bufferMap = assetBufferManager?.getBufferMap?.() ?? {};
    return Array.from(
      new Set(
        assetKeys.filter(
          (key) => typeof key === "string" && key && !!bufferMap[key],
        ),
      ),
    );
  };

  const splitRenderableAudio = (audioElements = []) => {
    const renderableAudio = [];
    const missingAudioKeys = [];

    audioElements.forEach((audioElement) => {
      const key = audioElement?.src;
      if (typeof key !== "string" || !key) {
        renderableAudio.push(audioElement);
        return;
      }

      if (AudioAsset.getAsset?.(key)) {
        renderableAudio.push(audioElement);
        return;
      }

      missingAudioKeys.push(key);
    });

    return {
      renderableAudio,
      missingAudioKeys: Array.from(new Set(missingAudioKeys)),
    };
  };

  const pruneDecodedAudioCache = async (retainedAudioKeys = []) => {
    const retainedAudioKeySet = new Set(
      retainedAudioKeys.filter((key) => typeof key === "string" && key),
    );
    const keysToUnload = Array.from(managedAudioCache.keys()).filter(
      (key) => !retainedAudioKeySet.has(key),
    );

    if (keysToUnload.length === 0) {
      return;
    }

    await Promise.all(keysToUnload.map((key) => AudioAsset.unload?.(key)));
  };

  const scheduleDeferredAudioRender = (audioKeys = []) => {
    const uniqueAudioKeys = getDecodableAudioKeys(audioKeys);
    const nextSignature = uniqueAudioKeys.slice().sort().join("|");

    if (uniqueAudioKeys.length === 0) {
      return;
    }

    if (nextSignature === deferredAudioRenderKeySignature) {
      return;
    }

    const scheduledToken = deferredAudioRenderToken + 1;
    deferredAudioRenderToken = scheduledToken;
    deferredAudioRenderKeySignature = nextSignature;

    void ensureAudioAssetsLoaded(uniqueAudioKeys)
      .then(() => {
        if (
          scheduledToken !== deferredAudioRenderToken ||
          !engine ||
          !routeGraphics
        ) {
          return;
        }

        const nextRenderState = engine.selectRenderState();
        const remainingMissingAudioKeys = getDecodableAudioKeys(
          getMissingDecodedAudioKeys(getRenderStateAudioKeys(nextRenderState)),
        );

        if (remainingMissingAudioKeys.length > 0) {
          scheduleDeferredAudioRender(remainingMissingAudioKeys);
          return;
        }

        if (scheduledToken === deferredAudioRenderToken) {
          deferredAudioRenderKeySignature = "";
        }
        renderEngineState(nextRenderState, {
          allowDeferredAudio: false,
        });
      })
      .catch((error) => {
        if (scheduledToken === deferredAudioRenderToken) {
          deferredAudioRenderKeySignature = "";
        }
        console.error(
          "[graphicsService] Failed to decode deferred audio render assets",
          error,
        );
      });
  };

  const getCachedPixiAsset = (key) => {
    if (!Assets.cache?.has?.(key)) {
      return undefined;
    }

    return Assets.cache.get(key);
  };

  const isUsableCachedPixiAsset = (asset) => {
    if (!asset) {
      return false;
    }

    const texture =
      typeof asset?.destroy === "function" ? asset : asset?.texture;
    const source =
      texture?.source ??
      texture?._source ??
      texture?.baseTexture ??
      asset?.source ??
      asset?.baseTexture;

    if (texture?.destroyed === true || source?.destroyed === true) {
      return false;
    }

    return true;
  };

  const hasLoadedFontFace = (key) => {
    if (typeof document === "undefined" || !document.fonts) {
      return false;
    }

    for (const fontFace of document.fonts) {
      if (normalizeFontFamily(fontFace.family) === key) {
        return true;
      }
    }

    return false;
  };

  const hasLoadedAsset = (key) => {
    const assetType = loadedAssetTypes.get(key);

    if (!assetType) {
      return false;
    }

    if (assetType === "texture" || assetType === "video") {
      return isUsableCachedPixiAsset(getCachedPixiAsset(key));
    }

    if (assetType === "font") {
      return hasLoadedFontFace(key);
    }

    if (assetType === "audio") {
      return assetBufferManager?.has?.(key) === true;
    }

    return false;
  };

  const getVideoResourceForKey = (key) => {
    const asset = getCachedPixiAsset(key);
    const resource =
      asset?.source?.resource ??
      asset?.baseTexture?.resource ??
      asset?.resource ??
      asset;

    if (
      typeof HTMLVideoElement !== "undefined" &&
      resource instanceof HTMLVideoElement
    ) {
      return resource;
    }

    return undefined;
  };

  const getTrackedVideoEntries = () => {
    const videoKeys = Array.from(loadedAssetTypes.entries())
      .filter(([, type]) => type === "video")
      .map(([key]) => key);

    return videoKeys.map((key) => ({
      key,
      video: getVideoResourceForKey(key),
    }));
  };

  const releaseVideoElementResource = (video) => {
    if (!video) {
      return;
    }

    try {
      video.pause();
    } catch {}

    try {
      video.currentTime = 0;
    } catch {}

    try {
      video.muted = true;
      video.loop = false;
      video.preload = "none";
      video.autoplay = false;
    } catch {}

    try {
      video.srcObject = null;
    } catch {}

    try {
      Array.from(video.querySelectorAll("source")).forEach((sourceElement) => {
        sourceElement.removeAttribute("src");
        sourceElement.remove();
      });
    } catch {}

    try {
      video.src = "";
    } catch {}

    try {
      video.removeAttribute("src");
    } catch {}

    try {
      video.removeAttribute("poster");
    } catch {}

    try {
      video.load();
    } catch {}
  };

  const releaseTrackedVideoResources = (entries = getTrackedVideoEntries()) => {
    if (entries.length === 0) {
      return;
    }

    entries.forEach(({ video }) => {
      releaseVideoElementResource(video);
    });
  };

  const clearLoadedFonts = () => {
    if (typeof document === "undefined" || !document.fonts) {
      return;
    }

    const fontKeys = new Set(
      Array.from(loadedAssetTypes.entries())
        .filter(([, type]) => type === "font")
        .map(([key]) => key),
    );

    if (fontKeys.size === 0) {
      return;
    }

    for (const fontFace of document.fonts) {
      const family = normalizeFontFamily(fontFace.family);
      if (family && fontKeys.has(family)) {
        document.fonts.delete(fontFace);
      }
    }
  };

  const unloadTrackedPixiAssets = async () => {
    const pixiAssetKeys = Array.from(loadedAssetTypes.entries())
      .filter(([, type]) => type === "texture" || type === "video")
      .map(([key]) => key);

    if (pixiAssetKeys.length === 0) {
      return;
    }

    const destroyCachedPixiAsset = (key) => {
      const asset = getCachedPixiAsset(key);
      if (!asset) {
        return;
      }

      const texture =
        typeof asset?.destroy === "function" ? asset : asset?.texture;
      const source = texture?.source ?? texture?._source;
      const resource = source?.resource;

      if (
        typeof HTMLVideoElement !== "undefined" &&
        resource instanceof HTMLVideoElement
      ) {
        releaseVideoElementResource(resource);
      }

      if (
        typeof ImageBitmap !== "undefined" &&
        resource instanceof ImageBitmap &&
        typeof resource.close === "function"
      ) {
        try {
          resource.close();
        } catch {}
      }

      if (
        texture &&
        typeof texture.destroy === "function" &&
        texture.destroyed !== true
      ) {
        texture.destroy(true);
      } else if (
        source &&
        typeof source.destroy === "function" &&
        source.destroyed !== true
      ) {
        source.destroy();
      }

      if (Assets.cache?.has?.(key)) {
        Assets.cache.remove(key);
      }
    };

    await Promise.all(
      pixiAssetKeys.map(async (key) => {
        await Assets.unload(key).catch((error) => {
          console.error(
            `[graphicsService] Failed to unload asset ${key}`,
            error,
          );
        });
        destroyCachedPixiAsset(key);
      }),
    );
  };

  const unloadTrackedAudioAssets = async () => {
    const audioKeys = Array.from(loadedAssetTypes.entries())
      .filter(([, type]) => type === "audio")
      .map(([key]) => key);

    if (audioKeys.length === 0) {
      return { count: 0, strategy: "none" };
    }

    if (typeof AudioAsset?.unload === "function") {
      await Promise.all(audioKeys.map((key) => AudioAsset.unload(key)));
      return { count: audioKeys.length, strategy: "unload" };
    }

    if (typeof AudioAsset?.remove === "function") {
      audioKeys.forEach((key) => AudioAsset.remove(key));
      return { count: audioKeys.length, strategy: "remove" };
    }

    if (typeof AudioAsset?.clear === "function") {
      AudioAsset.clear();
      return { count: audioKeys.length, strategy: "clear" };
    }

    if (typeof AudioAsset?.reset === "function") {
      AudioAsset.reset();
      return { count: audioKeys.length, strategy: "reset" };
    }

    return {
      count: audioKeys.length,
      strategy: "unsupported",
      availableMethods: Object.keys(AudioAsset ?? {}),
      keys: audioKeys,
    };
  };

  const destroyRuntime = async () => {
    const trackedVideoEntries = getTrackedVideoEntries();

    releaseTrackedVideoResources(trackedVideoEntries);
    await unloadTrackedPixiAssets();

    if (routeGraphics) {
      routeGraphics.destroy();
      routeGraphics = undefined;
    }

    await unloadTrackedAudioAssets();
    clearLoadedFonts();
    loadedAssetTypes = new Map();
    assetBufferManager?.clear();
    assetBufferManager = undefined;

    if (engine) {
      engine = undefined;
    }
    enableGlobalKeyboardBindings = true;
    beforeHandleActions = undefined;
    actionQueue = Promise.resolve();
    assetLoadQueue = Promise.resolve();
    invalidateDeferredAudioRender();
    clearAllPendingClickInteractions();
    ticker?.stop();
    ticker = undefined;
  };

  const loadBuffersWithRetry = async (assets, retryCount = 1) => {
    let attempt = 0;
    while (attempt <= retryCount) {
      try {
        await assetBufferManager.load(assets);
        return;
      } catch (error) {
        if (attempt >= retryCount) {
          throw error;
        }
        attempt += 1;
      }
    }
  };

  const runAssetLoad = async (assets) => {
    const assetEntries = Object.entries(assets || {});
    const newAssetEntries = assetEntries.filter(
      ([key]) => !assetBufferManager.has(key) || !hasLoadedAsset(key),
    );

    if (newAssetEntries.length === 0) {
      return;
    }

    const newAssets = Object.fromEntries(
      newAssetEntries.map(([key, asset]) => [
        key,
        normalizeGraphicsAssetForLoad(asset),
      ]),
    );
    const blobUrlsToRevoke = newAssetEntries
      .map(([, asset]) => asset?.url)
      .filter(isBlobUrl);

    try {
      await loadBuffersWithRetry(newAssets);
    } finally {
      blobUrlsToRevoke.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    }

    const fullBufferMap = assetBufferManager.getBufferMap();
    const deltaBufferMap = Object.fromEntries(
      newAssetEntries
        .map(([key]) => [key, fullBufferMap[key]])
        .filter(([, value]) => !!value),
    );

    if (Object.keys(deltaBufferMap).length === 0) {
      return;
    }

    const renderAssetEntries = Object.entries(deltaBufferMap).filter(
      ([, value]) => classifyAsset(value?.type) !== "audio",
    );
    const renderAssetBufferMap = Object.fromEntries(renderAssetEntries);

    if (Object.keys(renderAssetBufferMap).length > 0) {
      await routeGraphics.loadAssets(renderAssetBufferMap);
    }

    newAssetEntries.forEach(([key, asset]) => {
      loadedAssetTypes.set(key, classifyAsset(asset?.type));
    });
  };

  const runInteractionActions = async (actions, eventContext) => {
    if (beforeHandleActions) {
      await beforeHandleActions(actions, eventContext);
    }

    if (!engine) {
      return;
    }

    engine.handleActions(actions, eventContext);
  };

  const getEventActions = (payload) => {
    if (payload?.actions && typeof payload.actions === "object") {
      return payload.actions;
    }

    if (
      payload?.payload?.actions &&
      typeof payload.payload.actions === "object"
    ) {
      return payload.payload.actions;
    }

    return undefined;
  };

  const summarizeRenderAnimations = (animations = []) => {
    return animations.map((animation) => ({
      id: animation?.id,
      type: animation?.type,
      targetId: animation?.targetId,
      hasTween: Boolean(animation?.tween),
      hasPrev: Boolean(animation?.prev),
      hasNext: Boolean(animation?.next),
      hasMask: Boolean(animation?.mask),
      tweenProperties: Object.keys(animation?.tween || {}),
      prevTweenProperties: Object.keys(animation?.prev?.tween || {}),
      nextTweenProperties: Object.keys(animation?.next?.tween || {}),
    }));
  };

  const summarizeRenderAnimationsJson = (animations = []) => {
    return JSON.stringify(summarizeRenderAnimations(animations));
  };

  const normalizeLifecycleTransitionAnimation = (animation) => {
    if (!animation || animation.type !== "transition") {
      return animation;
    }

    if (typeof animation.id !== "string" || animation.id.length === 0) {
      return animation;
    }

    if (animation.id.endsWith("-animation-in")) {
      const normalized = structuredClone(animation);
      delete normalized.prev;
      return normalized;
    }

    if (animation.id.endsWith("-animation-out")) {
      const normalized = structuredClone(animation);
      delete normalized.next;
      return normalized;
    }

    return animation;
  };

  const normalizeRenderAnimationsForGraphics = (animations = []) => {
    return animations.map((animation) =>
      normalizeLifecycleTransitionAnimation(animation),
    );
  };

  const renderEngineState = (renderState, options = {}) => {
    const { allowDeferredAudio = true } = options;
    let nextRenderState = prepareRenderStateKeyboardForGraphics({
      renderState,
      enableGlobalKeyboardBindings,
    });
    const requestedAudioKeys = getRenderStateAudioKeys(nextRenderState);
    let retainedAudioKeys = requestedAudioKeys;

    if (allowDeferredAudio) {
      const { renderableAudio, missingAudioKeys } = splitRenderableAudio(
        nextRenderState.audio,
      );

      if (missingAudioKeys.length > 0) {
        nextRenderState = {
          ...nextRenderState,
          audio: renderableAudio,
        };
        retainedAudioKeys = getRenderStateAudioKeys(nextRenderState);
        scheduleDeferredAudioRender(missingAudioKeys);
      }
    }

    nextRenderState = {
      ...nextRenderState,
      animations: normalizeRenderAnimationsForGraphics(
        nextRenderState?.animations || [],
      ),
    };

    const storyChildIds =
      nextRenderState?.elements
        ?.find((element) => element?.id === "story")
        ?.children?.map((child) => child?.id) || [];
    console.info("[graphicsService] render route-graphics", {
      renderId: nextRenderState?.id,
      storyChildIds,
      animations: summarizeRenderAnimations(nextRenderState?.animations || []),
      animationsJson: summarizeRenderAnimationsJson(
        nextRenderState?.animations || [],
      ),
    });
    routeGraphics.render(nextRenderState);
    void pruneDecodedAudioCache(retainedAudioKeys);
  };

  const runWithSuppressedEngineRenderEffects = (callback) => {
    suppressedEngineRenderEffects += 1;
    try {
      return callback();
    } finally {
      suppressedEngineRenderEffects -= 1;
    }
  };

  const enqueueInteractionActions = (actions, eventContext) => {
    actionQueue = actionQueue
      .then(() => {
        return runInteractionActions(actions, eventContext);
      })
      .catch((error) => {
        console.error("[graphicsService] Failed to process interaction", error);
      });
  };

  const clearPendingClickInteraction = (interactionId) => {
    const timeoutId = pendingClickInteractionTimeouts.get(interactionId);
    if (timeoutId === undefined) {
      return;
    }

    clearTimeout(timeoutId);
    pendingClickInteractionTimeouts.delete(interactionId);
  };

  const clearAllPendingClickInteractions = () => {
    for (const timeoutId of pendingClickInteractionTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    pendingClickInteractionTimeouts = new Map();
  };

  const scheduleClickInteraction = (actions, eventContext) => {
    const interactionId = eventContext?._event?.id ?? "__unknown__";
    clearPendingClickInteraction(interactionId);

    // Route Graphics currently emits the generic click path on right mouse
    // release for some element plugins. Delay left-click processing one task
    // so a same-element rightClick can cancel it.
    const timeoutId = setTimeout(() => {
      pendingClickInteractionTimeouts.delete(interactionId);
      enqueueInteractionActions(actions, eventContext);
    }, 0);

    pendingClickInteractionTimeouts.set(interactionId, timeoutId);
  };

  return {
    init: async (options = {}) => {
      if (routeGraphics) {
        await destroyRuntime();
      }

      ticker = new Ticker();
      ticker.start();
      const { canvas, beforeHandleActions: onBeforeHandleActions } = options;
      const renderWidth = options.width ?? DEFAULT_PROJECT_RESOLUTION.width;
      const renderHeight = options.height ?? DEFAULT_PROJECT_RESOLUTION.height;
      beforeHandleActions = onBeforeHandleActions;
      actionQueue = Promise.resolve();
      assetLoadQueue = Promise.resolve();
      invalidateDeferredAudioRender();
      clearAllPendingClickInteractions();
      loadedAssetTypes = new Map();
      assetBufferManager = createAssetBufferManager();
      routeGraphics = createRouteGraphics();

      const plugins = {
        elements: [
          textPlugin,
          rectPlugin,
          spritePlugin,
          sliderPlugin,
          containerPlugin,
          textRevealingPlugin,
          videoPlugin,
        ],
        animations: [tweenPlugin],
        audio: [soundPlugin],
      };

      await routeGraphics.init({
        width: renderWidth,
        height: renderHeight,
        plugins,
        eventHandler: (eventName, payload) => {
          if (eventName === "dragMove") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-move", {
                x: Math.round(payload._event.x),
                y: Math.round(payload._event.y),
              });
          } else if (eventName === "dragStart") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-start");
          } else if (eventName === "dragEnd") {
            if (payload._event.id === "selected-border")
              subject.dispatch("border-drag-end");
          }

          if (!engine) {
            return;
          }

          if (eventName === "renderComplete") {
            const wasAborted = payload?.aborted === true;
            console.info("[graphicsService] renderComplete", {
              renderId: payload?.id,
              aborted: wasAborted,
              renderStateId: engine.selectRenderState()?.id,
              animations: summarizeRenderAnimations(
                engine.selectRenderState()?.animations || [],
              ),
              animationsJson: summarizeRenderAnimationsJson(
                engine.selectRenderState()?.animations || [],
              ),
            });
            if (wasAborted) {
              return;
            }
            engine.handleActions({
              markLineCompleted: {},
            });
            return;
          }

          const actions = getEventActions(payload);

          if (actions && engine) {
            const eventContext = payload._event
              ? { _event: payload._event }
              : undefined;
            const interactionId = eventContext?._event?.id ?? "__unknown__";

            if (RIGHT_CLICK_EVENT_NAMES.has(eventName)) {
              clearPendingClickInteraction(interactionId);
              enqueueInteractionActions(actions, eventContext);
              return;
            }

            if (eventName === "click") {
              scheduleClickInteraction(actions, eventContext);
              return;
            }

            enqueueInteractionActions(actions, eventContext);
          }
        },
      });

      if (canvas) {
        if (canvas.children.length > 0) {
          canvas.removeChild(canvas.children[0]);
        }
        // Keep Pixi's internal render resolution synced to the project screen,
        // then scale the displayed canvas to the container.
        routeGraphics.canvas.style.width = "100%";
        routeGraphics.canvas.style.height = "100%";
        routeGraphics.canvas.style.display = "block";
        canvas.appendChild(routeGraphics.canvas);
      }
    },
    loadAssets: async (assets) => {
      const queuedLoad = assetLoadQueue.then(() => runAssetLoad(assets));
      assetLoadQueue = queuedLoad.catch(() => {});
      return queuedLoad;
    },
    hasLoadedAsset,
    initRouteEngine: (projectData, options = {}) => {
      ticker.start();
      enableGlobalKeyboardBindings =
        options.enableGlobalKeyboardBindings ?? true;

      const handlePendingEffects = createEffectsHandler({
        getEngine: () => engine,
        routeGraphics: {
          ...routeGraphics,
          render: (renderState) => {
            if (suppressedEngineRenderEffects > 0) {
              return;
            }
            renderEngineState(renderState);
          },
        },
        ticker,
      });
      engine = createRouteEngine({ handlePendingEffects });
      engine.init({
        initialState: {
          global: {},
          projectData,
        },
      });
    },

    engineSelectPresentationState: () => {
      if (!engine) {
        return undefined;
      }
      return engine.selectPresentationState();
    },

    engineSelectRenderState: () => {
      if (!engine) {
        return undefined;
      }
      return engine.selectRenderState();
    },

    engineSelectSectionLineChanges: (payload) => {
      if (!engine) {
        return [];
      }
      return engine.selectSectionLineChanges(payload);
    },

    engineSelectPresentationChanges: () => {
      if (!engine) {
        return undefined;
      }
      return engine.selectPresentationChanges();
    },

    ensureAudioAssetsLoaded,

    engineRenderCurrentState: (options = {}) => {
      if (!engine || !routeGraphics) {
        return;
      }
      const { skipAudio = false, skipAnimations = false } = options;
      if (skipAudio) {
        invalidateDeferredAudioRender();
      }
      let renderState = engine.selectRenderState();
      if (skipAudio) {
        renderState = { ...renderState, audio: [] };
      }
      if (skipAnimations) {
        renderState = { ...renderState, animations: [] };
      }
      renderEngineState(renderState);
    },

    engineHandleActions: (actions, eventContext, options = {}) => {
      if (!engine) {
        return;
      }
      if (options.suppressRenderEffects) {
        return runWithSuppressedEngineRenderEffects(() => {
          engine.handleActions(actions, eventContext);
        });
      }
      engine.handleActions(actions, eventContext);
    },

    render: (payload) => routeGraphics.render(payload),
    parse: (payload) => routeGraphics.parse(payload),
    destroy: destroyRuntime,
  };
};
