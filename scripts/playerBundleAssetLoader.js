// Loads the assets of a player package into the graphics engine and tracks
// which ones are loaded, so a screen can wait for exactly what it still needs.
import { fileTypeFromBuffer } from "file-type";
import { createRuntimeAssetFromDicedImage } from "../src/internal/bundleRuntimeDicedImages.js";
import { resolveBundleAssetMimeType } from "../src/internal/bundleRuntimeAssets.js";

export const createRuntimeError = (message, cause, details) => {
  const error = new Error(message);
  error.cause = cause;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
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

export const createBundleAssetLoader = ({
  bundleReader,
  routeGraphics,
  recordDiagnosticStep,
}) => {
  const loadedAssetIds = new Set();
  // The type found in an asset's bytes when it was loaded. The package can
  // list a picture under a generic type.
  const detectedAssetTypes = new Map();
  const assetLoadPromises = new Map();
  const assetUnloadPromises = new Map();
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
      // The graphics engine may still be freeing this asset.
      await assetUnloadPromises.get(assetId);
      const asset = await createRuntimeAsset(assetId);
      if (asset?.type) {
        detectedAssetTypes.set(assetId, asset.type);
      }
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

  const getAssetMime = (assetId) =>
    detectedAssetTypes.get(assetId) ??
    bundleReader.manifest.assets?.[assetId]?.mime ??
    "";
  const isImageAsset = (assetId) => getAssetMime(assetId).startsWith("image/");

  return {
    loadAsset,

    collectMissingAssetIds(renderState) {
      const assetIds = collectBundleAssetIds({
        value: renderState,
        hasAsset: (assetId) => bundleReader.hasAsset(assetId),
      });

      return Array.from(assetIds).filter(
        (assetId) => !loadedAssetIds.has(assetId),
      );
    },

    collectImageAssetIds(renderState) {
      return Array.from(
        collectBundleAssetIds({ value: renderState, hasAsset: isImageAsset }),
      );
    },

    getLoadedImageAssetIds() {
      return Array.from(loadedAssetIds).filter(isImageAsset);
    },

    isAssetLoaded: (assetId) => loadedAssetIds.has(assetId),

    // Marks the assets as missing at once, so a screen that needs one again
    // waits for it to reload instead of drawing without it. They stay missing
    // when the graphics engine fails to free them: it forgets an asset before
    // it releases the memory, so the asset cannot be drawn either way, and
    // loading it again is safe.
    unloadAssets(assetIds) {
      assetIds.forEach((assetId) => loadedAssetIds.delete(assetId));
      const unloadPromise = routeGraphics
        .unloadAssets(assetIds)
        .catch((error) => {
          console.warn("Failed to unload runtime assets.", error);
          recordDiagnosticStep("Failed to unload runtime assets", {
            assetIds,
            error: error?.message,
          });
        })
        .finally(() => {
          assetIds.forEach((assetId) => {
            if (assetUnloadPromises.get(assetId) === unloadPromise) {
              assetUnloadPromises.delete(assetId);
            }
          });
        });
      assetIds.forEach((assetId) => {
        assetUnloadPromises.set(assetId, unloadPromise);
      });
    },

    async ensureAssetsLoaded(assetIds = [], onProgress) {
      const uniqueAssetIds = Array.from(
        new Set(assetIds.filter((assetId) => bundleReader.hasAsset(assetId))),
      );
      let loaded = 0;
      const total = uniqueAssetIds.length;
      onProgress?.({ loaded, total });
      await Promise.all(
        uniqueAssetIds.map(async (assetId) => {
          // A load already under way was started in the background. If it
          // fails, the screen that needs the asset gets a load of its own.
          const joinsLoad = assetLoadPromises.has(assetId);
          try {
            await loadAsset(assetId);
          } catch (error) {
            if (!joinsLoad) {
              throw error;
            }
            await loadAsset(assetId);
          }
          loaded += 1;
          onProgress?.({ loaded, total });
        }),
      );
    },
  };
};
