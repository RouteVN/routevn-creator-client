import createRouteGraphics, {
  Assets,
  AudioAsset,
  createAssetBufferManager,
} from "route-graphics";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import { Ticker } from "pixi.js";
import {
  prepareRenderStateKeyboardForGraphics,
  toRouteGraphicsKeyboardResource,
} from "../../internal/project/layout.js";
import {
  createRuntimeEventContext,
  getRuntimeEventActions,
  isRuntimeRightClickEvent,
  loadGraphicsEnginePlugins,
} from "../../internal/runtime/graphicsEngineRuntime.js";
import { requireProjectResolution } from "../../internal/projectResolution.js";

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

const createNoopRouteEnginePersistence = () => ({
  namespace: "",
  load: async () => ({
    saveSlots: {},
    globalDeviceVariables: {},
    globalAccountVariables: {},
    globalRuntime: {},
  }),
  clear: async () => {},
  saveSlots: async () => {},
  saveGlobalDeviceVariables: async () => {},
  saveGlobalAccountVariables: async () => {},
  saveGlobalRuntime: async () => {},
  applyScopedDataUpdates: async () => {},
});

const DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID = "dialogue-character-sprite";
const INTERACTION_SOUND_KEYS = ["hover", "click", "rightClick"];
const VIDEO_ASSET_READY_TIMEOUT_MS = 3000;
const VIDEO_ASSET_WARMUP_TIMEOUT_MS = 2500;
const VIDEO_ASSET_FRAME_WARMUP_TIMEOUT_MS = 500;

const normalizeGraphicsInteractionSoundVolume = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(Math.max(parsed, 0), 100);
};

const sanitizeGraphicsInteractionSoundVolume = (interaction) => {
  if (
    !interaction ||
    typeof interaction !== "object" ||
    Array.isArray(interaction) ||
    !Object.hasOwn(interaction, "soundVolume")
  ) {
    return interaction;
  }

  const nextInteraction = { ...interaction };
  const nextVolume = normalizeGraphicsInteractionSoundVolume(
    interaction.soundVolume,
  );

  if (nextVolume === undefined) {
    delete nextInteraction.soundVolume;
  } else {
    nextInteraction.soundVolume = nextVolume;
  }

  return nextInteraction;
};

const sanitizeGraphicsElementSoundVolumes = (elements) => {
  if (!Array.isArray(elements) || elements.length === 0) {
    return elements;
  }

  let didChange = false;
  const nextElements = elements.map((element) => {
    if (!element || typeof element !== "object") {
      return element;
    }

    let nextElement = element;

    for (const interactionKey of INTERACTION_SOUND_KEYS) {
      const interaction = element[interactionKey];
      const nextInteraction =
        sanitizeGraphicsInteractionSoundVolume(interaction);
      if (nextInteraction !== interaction) {
        if (nextElement === element) {
          nextElement = { ...element };
        }
        nextElement[interactionKey] = nextInteraction;
        didChange = true;
      }
    }

    const children = element.children;
    const nextChildren = sanitizeGraphicsElementSoundVolumes(children);
    if (nextChildren !== children) {
      if (nextElement === element) {
        nextElement = { ...element };
      }
      nextElement.children = nextChildren;
      didChange = true;
    }

    return nextElement;
  });

  return didChange ? nextElements : elements;
};

const sanitizeRenderStateInteractionSoundVolumes = (renderState) => {
  const elements = renderState?.elements;
  const nextElements = sanitizeGraphicsElementSoundVolumes(elements);

  if (nextElements === elements) {
    return renderState;
  }

  return {
    ...renderState,
    elements: nextElements,
  };
};

const findRenderElementById = (nodes, elementId) => {
  if (!Array.isArray(nodes)) {
    return undefined;
  }

  for (const node of nodes) {
    if (node?.id === elementId) {
      return node;
    }

    const child = findRenderElementById(node?.children, elementId);
    if (child) {
      return child;
    }
  }

  return undefined;
};

let routeEngineDialogueSpriteSupportProbe;

const getRouteEngineDialogueSpriteSupportProbe = () => {
  if (routeEngineDialogueSpriteSupportProbe) {
    return routeEngineDialogueSpriteSupportProbe;
  }

  try {
    const probeProjectData = {
      screen: {
        width: 100,
        height: 100,
      },
      resources: {
        images: {
          probeImage: {
            fileId: "probe-image",
            width: 10,
            height: 10,
          },
        },
        transforms: {
          probeTransform: {
            x: 1,
            y: 2,
          },
        },
        layouts: {
          probeLayout: {
            elements: [],
          },
        },
        animations: {},
        characters: {},
        controls: {},
        colors: {},
        fonts: {},
        sounds: {},
        textStyles: {},
        variables: {},
        videos: {},
      },
      story: {
        initialSceneId: "probeScene",
        scenes: {
          probeScene: {
            initialSectionId: "probeSection",
            sections: {
              probeSection: {
                initialLineId: "probeLine",
                lines: [
                  {
                    id: "probeLine",
                    actions: {
                      dialogue: {
                        mode: "adv",
                        ui: {
                          resourceId: "probeLayout",
                        },
                        character: {
                          sprite: {
                            transformId: "probeTransform",
                            items: [
                              {
                                id: "base",
                                resourceId: "probeImage",
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };
    const probeEngine = createRouteEngine({
      handlePendingEffects() {},
    });
    probeEngine.init({
      initialState: {
        global: {},
        projectData: probeProjectData,
      },
    });
    const presentationSprite =
      probeEngine.selectPresentationState()?.dialogue?.character?.sprite;
    const renderElement = findRenderElementById(
      probeEngine.selectRenderState()?.elements,
      DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID,
    );

    routeEngineDialogueSpriteSupportProbe = {
      presentationSpritePresent: Boolean(presentationSprite),
      renderElementFound: Boolean(renderElement),
    };
  } catch (error) {
    routeEngineDialogueSpriteSupportProbe = {
      presentationSpritePresent: false,
      renderElementFound: false,
      error: error?.message || String(error),
    };
  }

  return routeEngineDialogueSpriteSupportProbe;
};

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/x-mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/ogg",
  "audio/x-ogg",
  "application/ogg",
]);

// Keep this in sync with src-tauri/src/project_file_protocol.rs.
const PIXI_EXTENSION_BY_MIME_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
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

const normalizeMediaAssetUrlForPixi = (asset, options = {}) => {
  const { projectMediaOrigin } = options;
  const url = asset?.url;
  const extension = PIXI_EXTENSION_BY_MIME_TYPE[asset?.type];
  const mediaOrigin =
    typeof projectMediaOrigin === "string" && projectMediaOrigin.length > 0
      ? projectMediaOrigin
      : getProjectFileProtocolOrigin(url);
  const assetPath = getTauriAssetFilePath(url);

  if (!extension || !mediaOrigin || !assetPath) {
    return url;
  }

  return `${mediaOrigin}/pixi-asset.${extension}?path=${encodeURIComponent(
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

const normalizeGraphicsAssetForLoad = (asset = {}, options = {}) => {
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
    url: normalizeMediaAssetUrlForPixi(asset, options),
  };
};

const isDataUrl = (value) =>
  typeof value === "string" && value.startsWith("data:");

const getDataUrlMimeType = (value) => {
  if (!isDataUrl(value)) {
    return undefined;
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    return undefined;
  }

  const header = value.slice(0, commaIndex);
  const mimeMatch = header.match(/^data:([^;,]+)?(?:;base64)?$/);
  return mimeMatch?.[1] ?? undefined;
};

const decodeDataUrlToArrayBuffer = (value) => {
  if (!isDataUrl(value)) {
    throw new Error("Asset URL is not a data URL");
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Asset data URL is invalid");
  }

  const header = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1);
  const isBase64 = header.includes(";base64");

  if (!isBase64) {
    return new TextEncoder().encode(decodeURIComponent(body)).buffer;
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
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

export const createGraphicsService = async ({
  subject,
  projectMediaOrigin,
} = {}) => {
  let routeGraphics;
  let routeGraphicsInitPromise;
  let destroyRuntimePromise;
  let engine;
  let assetBufferManager;
  let loadedAssetTypes = new Map();
  let enableGlobalKeyboardBindings = true;
  let routeEngineProjectData;
  // Create dedicated ticker for auto mode
  let ticker;
  let beforeHandleActions;
  let actionQueue = Promise.resolve();
  let assetLoadQueue = Promise.resolve();
  let assetLoadRuntimeVersion = 0;
  let pendingClickInteractionTimeouts = new Map();
  let deferredAudioRenderToken = 0;
  let deferredAudioRenderKeySignature = "";
  let suppressedEngineRenderEffects = 0;
  let isEngineAudioMuted = false;
  let runtimeInteractionsEnabled = true;

  const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

  const classifyAsset = (mimeType) => {
    if (!mimeType) {
      return "texture";
    }

    if (SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
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

    if (mimeType === "video/mp4") {
      return "video";
    }

    return "texture";
  };

  const normalizeFontFamily = (value) => {
    return value?.replace(/^["']|["']$/g, "");
  };

  const getAudioAssetLoadPromise = (key, bufferEntry) => {
    if (!bufferEntry || AudioAsset.getAsset?.(key)) {
      return undefined;
    }

    return (
      managedAudioPendingLoads.get(key) ??
      AudioAsset.load(key, bufferEntry.buffer)
    );
  };

  const decodeAudioAssetEntries = async (audioEntries = []) => {
    const loadPromises = audioEntries
      .map(([key, bufferEntry]) => getAudioAssetLoadPromise(key, bufferEntry))
      .filter(Boolean);

    if (loadPromises.length === 0) {
      return;
    }

    await Promise.all(loadPromises);
  };

  const setRuntimeInteractionsEnabled = (value) => {
    const nextRuntimeInteractionsEnabled = value !== false;

    if (runtimeInteractionsEnabled === nextRuntimeInteractionsEnabled) {
      return;
    }

    runtimeInteractionsEnabled = nextRuntimeInteractionsEnabled;
    if (!nextRuntimeInteractionsEnabled) {
      clearAllPendingClickInteractions();
    }
  };

  const ensureTicker = () => {
    if (!ticker) {
      ticker = new Ticker();
    }

    ticker.start();
    return ticker;
  };

  const ensureAudioAssetsLoaded = async (assetKeys = []) => {
    const uniqueAudioKeys = Array.from(
      new Set(assetKeys.filter((key) => typeof key === "string" && key)),
    );
    const bufferMap = assetBufferManager?.getBufferMap?.() ?? {};
    await decodeAudioAssetEntries(
      uniqueAudioKeys.map((key) => [key, bufferMap[key]]),
    );
  };

  const invalidateDeferredAudioRender = () => {
    deferredAudioRenderToken += 1;
    deferredAudioRenderKeySignature = "";
  };

  const setEngineAudioMuted = (value) => {
    const nextIsMuted = value === true;

    if (isEngineAudioMuted === nextIsMuted) {
      return;
    }

    isEngineAudioMuted = nextIsMuted;
    if (nextIsMuted) {
      invalidateDeferredAudioRender();
    }
  };

  const collectAudioKeys = (audioElements = [], keys = []) => {
    for (const audioElement of audioElements) {
      const key = audioElement?.src;
      if (typeof key === "string" && key) {
        keys.push(key);
      }

      if (Array.isArray(audioElement?.children)) {
        collectAudioKeys(audioElement.children, keys);
      }
    }

    return keys;
  };

  const collectElementAudioKeys = (elements = [], keys = []) => {
    for (const element of elements) {
      if (!element || typeof element !== "object") {
        continue;
      }

      for (const interactionKey of INTERACTION_SOUND_KEYS) {
        const interaction = element[interactionKey];
        const soundKey = interaction?.soundSrc ?? interaction?.sound;
        if (typeof soundKey === "string" && soundKey) {
          keys.push(soundKey);
        }
      }

      const revealSoundKey = element.revealSound?.src;
      if (typeof revealSoundKey === "string" && revealSoundKey) {
        keys.push(revealSoundKey);
      }

      if (Array.isArray(element.children)) {
        collectElementAudioKeys(element.children, keys);
      }
    }

    return keys;
  };

  const getRenderStateAudioKeys = (renderState) => {
    return Array.from(
      new Set([
        ...collectAudioKeys(renderState?.audio ?? []),
        ...collectElementAudioKeys(renderState?.elements ?? []),
      ]),
    );
  };

  const collectElementVideoKeys = (elements = [], keys = []) => {
    for (const element of elements) {
      if (!element || typeof element !== "object") {
        continue;
      }

      const key = element.src;
      if (
        typeof key === "string" &&
        key &&
        (element.type === "video" || loadedAssetTypes.get(key) === "video")
      ) {
        keys.push(key);
      }

      if (Array.isArray(element.children)) {
        collectElementVideoKeys(element.children, keys);
      }
    }

    return keys;
  };

  const getRenderStateVideoKeys = (renderState) => {
    return Array.from(
      new Set(collectElementVideoKeys(renderState?.elements ?? [])),
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
      return !!AudioAsset.getAsset?.(key);
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

  const isVideoReadyForPlayback = (video) => {
    if (!video) {
      return true;
    }

    const haveFutureData =
      typeof video.HAVE_FUTURE_DATA === "number" ? video.HAVE_FUTURE_DATA : 3;

    return (
      video.readyState >= haveFutureData &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    );
  };

  const getVideoLoadError = (key, video) => {
    const error = video?.error;
    if (!error) {
      return new Error(`Video asset "${key}" failed to load.`);
    }

    const details =
      typeof error.message === "string" && error.message.length > 0
        ? error.message
        : `media error code ${error.code}`;
    return new Error(`Video asset "${key}" failed to load (${details}).`);
  };

  const waitForVideoReadyForPlayback = async (key, video) => {
    if (!video || isVideoReadyForPlayback(video)) {
      return;
    }

    await new Promise((resolve, reject) => {
      let timeoutId;
      const cleanup = () => {
        clearTimeout(timeoutId);
        video.removeEventListener("loadeddata", handleReady);
        video.removeEventListener("canplay", handleReady);
        video.removeEventListener("canplaythrough", handleReady);
        video.removeEventListener("playing", handleReady);
        video.removeEventListener("error", handleError);
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      const fail = (error) => {
        cleanup();
        reject(error);
      };
      const handleReady = () => {
        if (isVideoReadyForPlayback(video)) {
          finish();
        }
      };
      const handleError = () => {
        fail(getVideoLoadError(key, video));
      };

      video.addEventListener("loadeddata", handleReady);
      video.addEventListener("canplay", handleReady);
      video.addEventListener("canplaythrough", handleReady);
      video.addEventListener("playing", handleReady);
      video.addEventListener("error", handleError);
      timeoutId = setTimeout(() => {
        fail(
          new Error(`Timed out waiting for video asset "${key}" to preload.`),
        );
      }, VIDEO_ASSET_READY_TIMEOUT_MS);

      try {
        video.preload = "auto";
        video.load();
      } catch {}

      handleReady();
    });
  };

  const waitForVideoWarmFrame = async (key, video) => {
    if (
      !video ||
      video.paused ||
      typeof video.requestVideoFrameCallback !== "function"
    ) {
      return;
    }

    await new Promise((resolve, reject) => {
      let timeoutId;
      let callbackId;
      const cleanup = () => {
        clearTimeout(timeoutId);
        video.removeEventListener("error", handleError);
        if (
          callbackId !== undefined &&
          typeof video.cancelVideoFrameCallback === "function"
        ) {
          video.cancelVideoFrameCallback(callbackId);
        }
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      const fail = (error) => {
        cleanup();
        reject(error);
      };
      const handleError = () => {
        fail(getVideoLoadError(key, video));
      };

      video.addEventListener("error", handleError);
      timeoutId = setTimeout(() => {
        fail(new Error(`Timed out warming video asset "${key}".`));
      }, VIDEO_ASSET_FRAME_WARMUP_TIMEOUT_MS);
      callbackId = video.requestVideoFrameCallback(() => {
        callbackId = undefined;
        finish();
      });
    });
  };

  const resetVideoPlaybackPosition = (video) => {
    try {
      if (Number.isFinite(video.currentTime) && video.currentTime !== 0) {
        video.currentTime = 0;
      }
    } catch {}
  };

  const startVideoPlaybackWarmup = async (key, video) => {
    const playResult = video.play?.();
    if (!playResult || typeof playResult.then !== "function") {
      return;
    }

    await new Promise((resolve, reject) => {
      let timeoutId;
      const cleanup = () => {
        clearTimeout(timeoutId);
        video.removeEventListener("playing", finish);
        video.removeEventListener("error", handleError);
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      const fail = (error) => {
        cleanup();
        reject(error);
      };
      const handleError = () => {
        fail(getVideoLoadError(key, video));
      };

      video.addEventListener("playing", finish);
      video.addEventListener("error", handleError);
      timeoutId = setTimeout(() => {
        fail(new Error(`Timed out starting video asset "${key}".`));
      }, VIDEO_ASSET_WARMUP_TIMEOUT_MS);
      playResult.then(finish, fail);
    });
  };

  const warmVideoForPlayback = async (key) => {
    const video = getVideoResourceForKey(key);
    if (!video) {
      return;
    }

    if (
      video.__routevnPlaybackWarmed === true ||
      video.__routevnPlaybackWarmupAttempted === true ||
      video.__routevnPlaybackWarmupStarted === true
    ) {
      return;
    }

    video.__routevnPlaybackWarmupStarted = true;
    video.__routevnPlaybackWarmupAttempted = true;
    let previousMuted = video.muted;
    let previousVolume = video.volume;
    let previousLoop = video.loop;
    let shouldRestorePlaybackProperties = false;
    let didWarmPlayback = false;
    try {
      await waitForVideoReadyForPlayback(key, video);

      if (getVideoResourceForKey(key) !== video) {
        return;
      }

      previousMuted = video.muted;
      previousVolume = video.volume;
      previousLoop = video.loop;
      shouldRestorePlaybackProperties = true;

      video.muted = true;
      video.volume = 0;
      video.loop = true;
      await startVideoPlaybackWarmup(key, video);
      await waitForVideoWarmFrame(key, video);
      didWarmPlayback = true;
    } catch {
    } finally {
      if (getVideoResourceForKey(key) === video) {
        try {
          video.pause?.();
        } catch {}
        resetVideoPlaybackPosition(video);

        if (shouldRestorePlaybackProperties) {
          video.muted = previousMuted;
          video.volume = previousVolume;
          video.loop = previousLoop;
        }

        video.__routevnPlaybackWarmed = didWarmPlayback;
        video.__routevnPlaybackWarmupStarted = false;
      }
    }
  };

  const warmVideoAssetsForPlayback = async (assetEntries = []) => {
    const videoAssetKeys = assetEntries
      .filter(([, value]) => classifyAsset(value?.type) === "video")
      .map(([key]) => key);

    if (videoAssetKeys.length === 0) {
      return;
    }

    await Promise.all(videoAssetKeys.map(warmVideoForPlayback));
  };

  const warmRenderStateVideoAssets = async (renderState) => {
    const videoAssetKeys = getRenderStateVideoKeys(renderState);
    if (videoAssetKeys.length === 0) {
      return;
    }

    await Promise.all(videoAssetKeys.map(warmVideoForPlayback));
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
        if (!Assets.cache?.has || Assets.cache.has(key)) {
          await Assets.unload(key).catch((error) => {
            console.error(
              `[graphicsService] Failed to unload asset ${key}`,
              error,
            );
          });
        }
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
    assetLoadRuntimeVersion += 1;
    ticker?.stop();
    invalidateDeferredAudioRender();
    clearAllPendingClickInteractions();

    const activeRouteGraphics = routeGraphics;
    routeGraphics = undefined;
    engine = undefined;
    routeEngineProjectData = undefined;
    enableGlobalKeyboardBindings = true;
    beforeHandleActions = undefined;
    actionQueue = Promise.resolve();
    assetLoadQueue = Promise.resolve();

    const trackedVideoEntries = getTrackedVideoEntries();

    releaseTrackedVideoResources(trackedVideoEntries);
    if (activeRouteGraphics) {
      activeRouteGraphics.setAnimationPlaybackMode?.("manual");
      activeRouteGraphics.destroy();
    }

    await unloadTrackedPixiAssets();
    await unloadTrackedAudioAssets();
    clearLoadedFonts();
    loadedAssetTypes = new Map();
    assetBufferManager?.clear();
    assetBufferManager = undefined;

    ticker = undefined;
  };

  const runDestroyRuntime = () => {
    if (!destroyRuntimePromise) {
      destroyRuntimePromise = destroyRuntime().finally(() => {
        destroyRuntimePromise = undefined;
      });
    }

    return destroyRuntimePromise;
  };

  const loadBuffersWithRetry = async (
    bufferManager,
    assets,
    retryCount = 1,
  ) => {
    let attempt = 0;
    while (attempt <= retryCount) {
      try {
        await bufferManager.load(assets);
        return;
      } catch (error) {
        if (attempt >= retryCount) {
          throw error;
        }
        attempt += 1;
      }
    }
  };

  const runAssetLoad = async (assets, runtimeVersion) => {
    const activeBufferManager = assetBufferManager;
    if (!activeBufferManager || runtimeVersion !== assetLoadRuntimeVersion) {
      return;
    }

    const normalizedAssetEntries = Object.entries(assets || {}).map(
      ([key, asset]) => [
        key,
        normalizeGraphicsAssetForLoad(asset, { projectMediaOrigin }),
      ],
    );
    const assetEntriesToLoad = normalizedAssetEntries.filter(([key, asset]) => {
      if (isDataUrl(asset?.url)) {
        return !hasLoadedAsset(key);
      }

      return !activeBufferManager.has(key) || !hasLoadedAsset(key);
    });

    if (assetEntriesToLoad.length === 0) {
      return;
    }

    const dataUrlAssetEntries = assetEntriesToLoad.filter(([, asset]) =>
      isDataUrl(asset?.url),
    );
    const bufferedAssetEntries = assetEntriesToLoad.filter(
      ([, asset]) => !isDataUrl(asset?.url),
    );
    const bufferedAssetEntriesToFetch = bufferedAssetEntries.filter(
      ([key]) => !activeBufferManager.has(key),
    );

    const directBufferMap = Object.fromEntries(
      dataUrlAssetEntries.map(([key, asset]) => [
        key,
        {
          buffer: decodeDataUrlToArrayBuffer(asset.url),
          type: asset.type ?? getDataUrlMimeType(asset.url),
        },
      ]),
    );
    const bufferedAssets = Object.fromEntries(bufferedAssetEntriesToFetch);
    const blobUrlsToRevoke = bufferedAssetEntriesToFetch
      .map(([, asset]) => asset?.url)
      .filter(isBlobUrl);

    try {
      if (bufferedAssetEntriesToFetch.length > 0) {
        await loadBuffersWithRetry(activeBufferManager, bufferedAssets);
      }
    } finally {
      blobUrlsToRevoke.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    }

    if (
      runtimeVersion !== assetLoadRuntimeVersion ||
      assetBufferManager !== activeBufferManager
    ) {
      return;
    }

    const fullBufferMap = activeBufferManager.getBufferMap();
    const loadedBufferMap = Object.fromEntries(
      bufferedAssetEntries
        .map(([key]) => [key, fullBufferMap[key]])
        .filter(([, value]) => !!value),
    );
    const deltaBufferMap = {
      ...loadedBufferMap,
      ...directBufferMap,
    };

    if (Object.keys(deltaBufferMap).length === 0) {
      return;
    }

    const audioAssetEntries = Object.entries(deltaBufferMap).filter(
      ([, value]) => classifyAsset(value?.type) === "audio",
    );
    if (audioAssetEntries.length > 0) {
      await decodeAudioAssetEntries(audioAssetEntries);

      if (
        runtimeVersion !== assetLoadRuntimeVersion ||
        assetBufferManager !== activeBufferManager
      ) {
        return;
      }
    }

    const renderAssetEntries = Object.entries(deltaBufferMap).filter(
      ([, value]) => classifyAsset(value?.type) !== "audio",
    );
    const renderAssetBufferMap = Object.fromEntries(renderAssetEntries);

    if (Object.keys(renderAssetBufferMap).length > 0) {
      const activeRouteGraphics = routeGraphics;
      if (!activeRouteGraphics) {
        return;
      }
      await activeRouteGraphics.loadAssets(renderAssetBufferMap);

      if (
        runtimeVersion !== assetLoadRuntimeVersion ||
        routeGraphics !== activeRouteGraphics
      ) {
        return;
      }

      await warmVideoAssetsForPlayback(renderAssetEntries);

      if (
        runtimeVersion !== assetLoadRuntimeVersion ||
        routeGraphics !== activeRouteGraphics
      ) {
        return;
      }
    }

    assetEntriesToLoad.forEach(([key, asset]) => {
      loadedAssetTypes.set(key, classifyAsset(asset?.type));
    });
  };

  const runInteractionActions = async (actions, eventContext) => {
    let nextActions = actions;

    if (beforeHandleActions) {
      const preparedActions = await beforeHandleActions(actions, eventContext);
      if (preparedActions !== undefined) {
        nextActions = preparedActions;
      }
    }

    if (!engine) {
      return;
    }

    engine.handleActions(nextActions, eventContext);
    return {
      actions: nextActions,
      eventContext,
    };
  };

  const getActiveControlKeyboard = () => {
    const presentationState = engine?.selectPresentationState?.();
    const controlResourceId = presentationState?.control?.resourceId;
    if (!controlResourceId) {
      return;
    }

    const control =
      routeEngineProjectData?.resources?.controls?.[controlResourceId];
    const keyboard = toRouteGraphicsKeyboardResource(
      control?.keyboard,
      control?.keyup,
    );
    return Object.keys(keyboard).length > 0 ? keyboard : undefined;
  };

  const withActiveControlKeyboard = (renderState) => {
    if (!enableGlobalKeyboardBindings) {
      return renderState;
    }

    const keyboard = getActiveControlKeyboard();
    if (!keyboard || typeof keyboard !== "object") {
      return renderState;
    }

    const global =
      renderState?.global && typeof renderState.global === "object"
        ? renderState.global
        : {};

    return {
      ...renderState,
      global: {
        ...global,
        keyboard,
      },
    };
  };

  const syncRouteEngineProjectDataFromActions = (actions) => {
    const projectData = actions?.updateProjectData?.projectData;
    if (projectData && typeof projectData === "object") {
      routeEngineProjectData = projectData;
    }
  };

  const renderEngineState = (renderState, options = {}) => {
    const { allowDeferredAudio = true, skipAudio = false } = options;
    let nextRenderState = prepareRenderStateKeyboardForGraphics({
      renderState: withActiveControlKeyboard(renderState),
      enableGlobalKeyboardBindings,
    });
    nextRenderState =
      sanitizeRenderStateInteractionSoundVolumes(nextRenderState);
    const effectiveSkipAudio = skipAudio || isEngineAudioMuted;

    if (
      effectiveSkipAudio &&
      Array.isArray(nextRenderState?.audio) &&
      nextRenderState.audio.length > 0
    ) {
      invalidateDeferredAudioRender();
      nextRenderState = {
        ...nextRenderState,
        audio: [],
      };
    }

    const requestedAudioKeys = getRenderStateAudioKeys(nextRenderState);
    let retainedAudioKeys = requestedAudioKeys;
    let missingAudioKeys = [];

    if (allowDeferredAudio && !effectiveSkipAudio) {
      const splitAudio = splitRenderableAudio(nextRenderState.audio);
      const { renderableAudio } = splitAudio;
      missingAudioKeys = getMissingDecodedAudioKeys(requestedAudioKeys);

      if (splitAudio.missingAudioKeys.length > 0) {
        nextRenderState = {
          ...nextRenderState,
          audio: renderableAudio,
        };
        retainedAudioKeys = getRenderStateAudioKeys(nextRenderState);
      }

      if (missingAudioKeys.length > 0) {
        scheduleDeferredAudioRender(missingAudioKeys);
      }
    }

    nextRenderState = {
      ...nextRenderState,
      animations: nextRenderState?.animations || [],
    };
    if (!routeGraphics) {
      return;
    }

    routeGraphics.render(nextRenderState);
    void pruneDecodedAudioCache(retainedAudioKeys);
  };

  const disableTextRevealingEffects = (elements = []) => {
    if (!Array.isArray(elements) || elements.length === 0) {
      return elements;
    }

    return elements.map((element) => {
      if (!element || typeof element !== "object") {
        return element;
      }

      const nextElement = {
        ...element,
      };

      if (nextElement.type === "text-revealing") {
        nextElement.revealEffect = "none";
      }

      if (
        Array.isArray(nextElement.children) &&
        nextElement.children.length > 0
      ) {
        nextElement.children = disableTextRevealingEffects(
          nextElement.children,
        );
      }

      return nextElement;
    });
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

  const waitUntilReady = async () => {
    if (!routeGraphicsInitPromise) {
      return;
    }

    await routeGraphicsInitPromise;
  };

  const runWithNonPassiveWheelListeners = async (callback) => {
    const addEventListener =
      typeof EventTarget === "undefined"
        ? undefined
        : EventTarget.prototype?.addEventListener;

    if (!addEventListener) {
      return await callback();
    }

    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      if (
        type === "wheel" &&
        options &&
        typeof options === "object" &&
        options.passive === true &&
        options.capture === true
      ) {
        return addEventListener.call(this, type, listener, {
          ...options,
          passive: false,
        });
      }

      return addEventListener.call(this, type, listener, options);
    };

    try {
      return await callback();
    } finally {
      EventTarget.prototype.addEventListener = addEventListener;
    }
  };

  const attachCanvas = async (canvas) => {
    if (!routeGraphics?.canvas || !canvas) {
      return;
    }

    const currentParent = routeGraphics.canvas.parentNode;
    if (currentParent && currentParent !== canvas) {
      currentParent.removeChild(routeGraphics.canvas);
    }

    if (
      canvas.children.length > 0 &&
      canvas.children[0] !== routeGraphics.canvas
    ) {
      canvas.removeChild(canvas.children[0]);
    }

    routeGraphics.canvas.style.width = "100%";
    routeGraphics.canvas.style.height = "100%";
    routeGraphics.canvas.style.display = "block";

    if (routeGraphics.canvas.parentNode !== canvas) {
      canvas.appendChild(routeGraphics.canvas);
    }
  };

  return {
    init: async (options = {}) => {
      if (routeGraphicsInitPromise) {
        await routeGraphicsInitPromise;
      }

      if (destroyRuntimePromise) {
        await destroyRuntimePromise;
      }

      if (routeGraphics) {
        await runDestroyRuntime();
      }

      routeGraphicsInitPromise = (async () => {
        ticker = new Ticker();
        ticker.start();
        const { canvas, beforeHandleActions: onBeforeHandleActions } = options;
        const { width: renderWidth, height: renderHeight } =
          requireProjectResolution(
            {
              width: options.width,
              height: options.height,
            },
            "Graphics runtime resolution",
          );
        beforeHandleActions = onBeforeHandleActions;
        actionQueue = Promise.resolve();
        assetLoadQueue = Promise.resolve();
        assetLoadRuntimeVersion += 1;
        invalidateDeferredAudioRender();
        clearAllPendingClickInteractions();
        runtimeInteractionsEnabled = true;
        loadedAssetTypes = new Map();
        assetBufferManager = createAssetBufferManager();
        routeGraphics = createRouteGraphics();

        const plugins = await loadGraphicsEnginePlugins();

        await runWithNonPassiveWheelListeners(() =>
          routeGraphics.init({
            width: renderWidth,
            height: renderHeight,
            plugins,
            eventHandler: (eventName, payload) => {
              const eventId = payload?._event?.id;
              const actions = getRuntimeEventActions(payload);
              const layoutEditorDragTarget =
                eventId === "selected-border" ||
                eventId?.startsWith("selected-border-resize-");
              if (eventName === "dragMove") {
                if (layoutEditorDragTarget) {
                  subject.dispatch("border-drag-move", {
                    x: Math.round(payload._event.x),
                    y: Math.round(payload._event.y),
                    targetId: eventId,
                  });
                }
              } else if (eventName === "dragStart") {
                if (layoutEditorDragTarget) {
                  subject.dispatch("border-drag-start", {
                    targetId: eventId,
                  });
                }
              } else if (eventName === "dragEnd") {
                if (layoutEditorDragTarget) {
                  subject.dispatch("border-drag-end", {
                    targetId: eventId,
                  });
                }
              }

              if (!runtimeInteractionsEnabled) {
                return;
              }

              if (!engine) {
                return;
              }

              if (eventName === "renderComplete") {
                if (payload?.aborted === true) {
                  return;
                }
                engine.handleActions({
                  markLineCompleted: {},
                });
                return;
              }

              if (actions && engine) {
                const eventContext = createRuntimeEventContext(payload);

                const interactionId = eventContext?._event?.id ?? "__unknown__";

                if (isRuntimeRightClickEvent(eventName)) {
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
          }),
        );

        if (canvas) {
          await attachCanvas(canvas);
        }
      })();

      try {
        await routeGraphicsInitPromise;
      } finally {
        routeGraphicsInitPromise = undefined;
      }
    },
    loadAssets: async (assets) => {
      await waitUntilReady();
      const runtimeVersion = assetLoadRuntimeVersion;
      const queuedLoad = assetLoadQueue.then(() =>
        runAssetLoad(assets, runtimeVersion),
      );
      assetLoadQueue = queuedLoad.catch(() => {});
      return queuedLoad;
    },
    extractBase64: async (label) => {
      if (!routeGraphics || typeof routeGraphics.extractBase64 !== "function") {
        return;
      }

      return await routeGraphics.extractBase64(label);
    },
    hasLoadedAsset,
    initRouteEngine: (projectData, options = {}) => {
      const routeEngineTicker = ensureTicker();
      routeEngineProjectData = projectData;
      enableGlobalKeyboardBindings =
        options.enableGlobalKeyboardBindings ?? true;
      const suppressRenderEffects = options.suppressRenderEffects === true;
      const onRenderState =
        typeof options.onRenderState === "function"
          ? options.onRenderState
          : undefined;
      const initialGlobal = options.initialGlobal ?? {};
      const namespace =
        typeof options.namespace === "string" && options.namespace.length > 0
          ? options.namespace
          : undefined;
      const persistence =
        options.persistence === false
          ? createNoopRouteEnginePersistence()
          : (options.persistence ??
            (namespace ? undefined : createNoopRouteEnginePersistence()));

      const handlePendingEffects = createEffectsHandler({
        getEngine: () => engine,
        routeGraphics: {
          render: (renderState) => {
            if (suppressedEngineRenderEffects > 0) {
              return;
            }
            renderEngineState(renderState);
            onRenderState?.({
              renderState,
              systemState: engine?.selectSystemState?.(),
            });
          },
        },
        namespace,
        persistence,
        ticker: routeEngineTicker,
      });
      engine = createRouteEngine({ handlePendingEffects });
      const initEngine = () => {
        engine.init({
          initialState: {
            global: initialGlobal,
            projectData,
          },
          namespace,
        });
      };

      if (suppressRenderEffects) {
        runWithSuppressedEngineRenderEffects(initEngine);
        return;
      }

      initEngine();
    },

    engineSelectPresentationState: () => {
      if (!engine) {
        return undefined;
      }
      return engine.selectPresentationState();
    },

    debugRouteEngineDialogueSpriteSupport: () => {
      return getRouteEngineDialogueSpriteSupportProbe();
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
    collectRenderStateAudioKeys: getRenderStateAudioKeys,
    warmRenderStateVideoAssets,

    engineRenderCurrentState: (options = {}) => {
      if (!engine || !routeGraphics) {
        return;
      }
      const {
        preserveAnimationPlayback = false,
        skipAudio = false,
        skipAnimations = false,
      } = options;
      routeGraphics.setAnimationPlaybackMode?.(
        skipAnimations && !preserveAnimationPlayback ? "manual" : "auto",
      );
      const effectiveSkipAudio = skipAudio || isEngineAudioMuted;
      let renderState = engine.selectRenderState();
      if (skipAnimations) {
        renderState = {
          ...renderState,
          animations: [],
          elements: disableTextRevealingEffects(renderState?.elements),
        };
      }
      renderEngineState(renderState, {
        skipAudio: effectiveSkipAudio,
      });
    },

    engineHandleActions: (actions, eventContext, options = {}) => {
      if (!engine) {
        return;
      }
      syncRouteEngineProjectDataFromActions(actions);
      if (options.suppressRenderEffects) {
        return runWithSuppressedEngineRenderEffects(() => {
          engine.handleActions(actions, eventContext);
        });
      }
      engine.handleActions(actions, eventContext);
    },
    setEngineAudioMuted,
    setRuntimeInteractionsEnabled,

    setAnimationPlaybackMode: (mode) => {
      routeGraphics?.setAnimationPlaybackMode?.(mode);
    },
    setAnimationTime: (timeMs) => {
      routeGraphics?.setAnimationTime?.(timeMs);
    },
    waitUntilReady,
    attachCanvas,
    render: (payload) => {
      return routeGraphics?.render(
        sanitizeRenderStateInteractionSoundVolumes(payload),
      );
    },
    parse: (payload) => routeGraphics?.parse(payload),
    destroy: async () => {
      if (routeGraphicsInitPromise) {
        await routeGraphicsInitPromise.catch(() => {});
      }

      await runDestroyRuntime();
    },
  };
};
