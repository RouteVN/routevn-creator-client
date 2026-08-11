import {
  getImageDimensions,
  extractImageThumbnail,
  getVideoDimensions,
  extractWaveformDataFromArrayBuffer,
  extractVideoThumbnail,
  detectFileType,
} from "../../clients/web/fileProcessors.js";
import { processWithConcurrency } from "../../../internal/processWithConcurrency.js";
import { getFileType as getFontFileType } from "../../../internal/fileTypes.js";
import { loadFont } from "./fontLoader.js";

const IMAGE_THUMBNAIL_MAX_WIDTH = 320;
const IMAGE_THUMBNAIL_MAX_HEIGHT = 320;
const MAX_PARALLEL_UPLOADS = 1;

const bufferToHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const getFileRecordMimeType = ({ file, bytes } = {}) => {
  if (detectFileType(file) === "font") {
    try {
      return getFontFileType({
        file,
        arrayBuffer: bytes,
      });
    } catch {
      return file.type || "application/octet-stream";
    }
  }

  return file.type || "application/octet-stream";
};

const getNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

const getDurationMs = (startedAt) => Number((getNow() - startedAt).toFixed(2));

const computeSha256 = async (bytes) => {
  if (!crypto?.subtle?.digest) {
    throw new Error("SHA-256 hashing is unavailable in this runtime.");
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bufferToHex(digest);
};

const storeMetadata = async ({ data, storeFile, idGenerator }) => {
  const jsonString = JSON.stringify(data, null, 2);
  const jsonBlob = new Blob([jsonString], { type: "application/json" });
  const uniqueName = `metadata_${idGenerator()}.json`;
  Object.defineProperty(jsonBlob, "name", {
    value: uniqueName,
    writable: false,
  });
  return storeFile(jsonBlob);
};

export const createProjectAssetService = ({
  idGenerator,
  fileAdapter,
  getCurrentStore,
  getCurrentReference,
  getStoreByProject,
  resolveFileMetadata,
}) => {
  const resourceImportFileIdsByPlan = new Map();

  const getResourceImportFileEntry = (planId, projectReference) => {
    if (!planId) return undefined;
    let entry = resourceImportFileIdsByPlan.get(planId);
    if (!entry) {
      entry = {
        fileIds: new Set(),
        projectReference: projectReference
          ? { ...projectReference }
          : undefined,
      };
      resourceImportFileIdsByPlan.set(planId, entry);
    }
    return entry;
  };

  const trackResourceImportFileId = (planId, fileId, projectReference) => {
    if (!fileId) return;
    getResourceImportFileEntry(planId, projectReference)?.fileIds.add(fileId);
  };

  const shouldSkipImageThumbnail = (options = {}) =>
    options?.skipImageThumbnail === true;

  const storeRawFile = async ({
    file,
    bytes,
    projectId,
    projectPath,
    targetFileId,
  } = {}) => {
    return fileAdapter.storeFile({
      file,
      bytes,
      projectId,
      projectPath,
      idGenerator: targetFileId ? () => targetFileId : idGenerator,
      getCurrentStore,
      getCurrentReference,
      getStoreByProject,
    });
  };

  const storeFileWithRecord = async ({
    file,
    bytes,
    timings,
    projectId,
    projectPath,
    targetFileId,
    onStoredFileId,
  } = {}) => {
    const fileBytes = bytes ?? (await file.arrayBuffer());
    const [storedResult, hashResult] = await Promise.allSettled([
      (async () => {
        const storeStartedAt = getNow();
        const result = await storeRawFile({
          file,
          bytes: fileBytes,
          projectId,
          projectPath,
          targetFileId,
        });
        onStoredFileId?.(result.fileId);
        if (timings) {
          timings.storeDurationMs = getDurationMs(storeStartedAt);
        }
        return result;
      })(),
      (async () => {
        const hashStartedAt = getNow();
        const result = await computeSha256(fileBytes);
        if (timings) {
          timings.hashDurationMs = getDurationMs(hashStartedAt);
        }
        return result;
      })(),
    ]);
    if (storedResult.status === "rejected") throw storedResult.reason;
    if (hashResult.status === "rejected") throw hashResult.reason;
    const stored = storedResult.value;
    const sha256 = hashResult.value;

    return {
      ...stored,
      fileRecord: {
        id: stored.fileId,
        mimeType: getFileRecordMimeType({
          file,
          bytes: fileBytes,
        }),
        size: file.size,
        sha256,
      },
    };
  };

  const getFileContent = async (fileId) => {
    const payload = {
      fileId,
      getCurrentStore,
      getCurrentReference,
      getStoreByProject,
    };
    if (
      fileAdapter.requiresFileMetadata === true &&
      typeof resolveFileMetadata === "function"
    ) {
      payload.fileMetadata = resolveFileMetadata(fileId);
    }

    return fileAdapter.getFileContent(payload);
  };

  const processFile = async (file, options = {}) => {
    const fileType = detectFileType(file);

    if (fileType === "image") {
      const [dimensionsResult, storedResult] = await Promise.allSettled([
        getImageDimensions(file),
        storeFileWithRecord({
          file,
          projectId: options.projectId,
          projectPath: options.projectPath,
          targetFileId: options.targetFileId,
          onStoredFileId: options.onStoredFileId,
        }),
      ]);
      if (storedResult.status === "rejected") throw storedResult.reason;
      if (dimensionsResult.status === "rejected") {
        throw dimensionsResult.reason;
      }
      const stored = storedResult.value;
      const dimensions = dimensionsResult.value;

      if (shouldSkipImageThumbnail(options)) {
        return {
          ...stored,
          dimensions,
          type: "image",
          fileRecords: [stored.fileRecord],
        };
      }

      const thumbnailData = await extractImageThumbnail(file, {
        maxWidth: IMAGE_THUMBNAIL_MAX_WIDTH,
        maxHeight: IMAGE_THUMBNAIL_MAX_HEIGHT,
        preferredFormat: "image/webp",
        quality: 0.85,
      });
      const thumbnailResult = await storeFileWithRecord({
        file: thumbnailData.blob,
        projectId: options.projectId,
        projectPath: options.projectPath,
        targetFileId: options.targetThumbnailFileId,
        onStoredFileId: options.onStoredFileId,
      });
      return {
        ...stored,
        thumbnailFileId: thumbnailResult.fileId,
        thumbnailData,
        dimensions,
        type: "image",
        fileRecords: [stored.fileRecord, thumbnailResult.fileRecord],
      };
    }

    if (fileType === "audio") {
      const arrayBuffer = await file.arrayBuffer();

      const [waveformData, stored] = await Promise.all([
        extractWaveformDataFromArrayBuffer(arrayBuffer),
        storeFileWithRecord({
          file,
          bytes: arrayBuffer,
          timings: {},
        }),
      ]);

      let waveformDataFileId = null;
      let waveformResult = null;
      if (waveformData) {
        const compressedWaveformData = {
          ...waveformData,
          amplitudes: waveformData.amplitudes.map((value) =>
            Math.round(value * 255),
          ),
        };
        waveformResult = await storeMetadata({
          data: compressedWaveformData,
          storeFile: (metadataFile) =>
            storeFileWithRecord({
              file: metadataFile,
            }),
          idGenerator,
        });
        waveformDataFileId = waveformResult.fileId;
      }

      return {
        ...stored,
        waveformDataFileId,
        waveformData,
        duration: waveformData?.duration,
        type: "audio",
        fileRecords: [
          stored.fileRecord,
          ...(waveformResult ? [waveformResult.fileRecord] : []),
        ],
      };
    }

    if (fileType === "video") {
      const [videoResult, videoMetadata, thumbnailPayload] = await Promise.all([
        storeFileWithRecord({ file }),
        getVideoDimensions(file),
        (async () => {
          try {
            const thumbnailData = await extractVideoThumbnail(file, {
              timeOffset: 1,
              maxWidth: IMAGE_THUMBNAIL_MAX_WIDTH,
              maxHeight: IMAGE_THUMBNAIL_MAX_HEIGHT,
              format: "image/jpeg",
              quality: 0.8,
            });
            const thumbnailResult = await storeFileWithRecord({
              file: thumbnailData.blob,
            });
            return {
              thumbnailData,
              thumbnailResult,
            };
          } catch (error) {
            console.warn("[videoUpload] thumbnail.failed", {
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type,
              error: error?.message ?? "Unknown error",
            });
            return undefined;
          }
        })(),
      ]);

      return {
        ...videoResult,
        thumbnailFileId: thumbnailPayload?.thumbnailResult?.fileId,
        thumbnailData: thumbnailPayload?.thumbnailData,
        dimensions: videoMetadata
          ? {
              width: videoMetadata.width,
              height: videoMetadata.height,
            }
          : undefined,
        duration: videoMetadata?.duration,
        type: "video",
        fileRecords: [
          videoResult.fileRecord,
          ...(thumbnailPayload?.thumbnailResult
            ? [thumbnailPayload.thumbnailResult.fileRecord]
            : []),
        ],
      };
    }

    if (fileType === "font") {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
      const fontUrl = URL.createObjectURL(file);

      try {
        await loadFont(fontName, fontUrl);
      } catch (loadError) {
        URL.revokeObjectURL(fontUrl);
        throw new Error(`Invalid font file: ${loadError.message}`);
      }

      const stored = await storeFileWithRecord({
        file,
      });
      return {
        ...stored,
        fontName,
        fontUrl,
        type: "font",
        fileRecords: [stored.fileRecord],
      };
    }

    const stored = await storeRawFile({
      file,
      targetFileId: options.targetFileId,
    });
    return {
      ...stored,
      type: "generic",
      fileRecords: [],
    };
  };

  return {
    async validateResourceImportFile({ file, validationKind } = {}) {
      if (validationKind === "image") {
        const dimensions = await getImageDimensions(file);
        if (!dimensions) {
          throw new Error("Unable to decode image file.");
        }
        return;
      }
      if (validationKind === "audio") {
        await extractWaveformDataFromArrayBuffer(await file.arrayBuffer());
        return;
      }
      if (validationKind === "video") {
        const metadata = await getVideoDimensions(file);
        if (!metadata) {
          throw new Error("Unable to decode video file.");
        }
        return;
      }
      if (validationKind === "font") {
        const bytes = await file.arrayBuffer();
        const fontType = getFontFileType({ file, arrayBuffer: bytes });
        if (!fontType) {
          throw new Error("Unable to identify font file.");
        }
        const fontName = file.name.replace(/\.(ttf|otf|woff2)$/i, "");
        const fontUrl = URL.createObjectURL(file);
        try {
          await loadFont(fontName, fontUrl);
        } finally {
          URL.revokeObjectURL(fontUrl);
        }
        return;
      }
      if (validationKind === "json") {
        JSON.parse(new TextDecoder().decode(await file.arrayBuffer()));
        return;
      }
      throw new Error(`Unsupported import file kind '${validationKind}'.`);
    },

    async storeFile({ file, bytes, targetFileId } = {}) {
      const stored = await storeFileWithRecord({
        file,
        bytes,
        targetFileId,
      });

      return {
        ...stored,
        fileRecords: [stored.fileRecord],
      };
    },

    async storeFileForProject({ projectId, projectPath, file, bytes } = {}) {
      return storeFileWithRecord({
        file,
        bytes,
        projectId,
        projectPath,
      });
    },

    async uploadFiles(files, options = {}) {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const results = await processWithConcurrency(
        fileArray,
        async (file) => {
          try {
            const result = await processFile(file, options);
            return {
              success: true,
              file,
              displayName: file.name.replace(/\.[^.]+$/, ""),
              ...result,
            };
          } catch (error) {
            if (fileAdapter.continueOnUploadError === false) {
              throw error;
            }
            console.error(`Failed to upload ${file.name}:`, error);
            return { success: false, file, error: error.message };
          }
        },
        {
          concurrency: MAX_PARALLEL_UPLOADS,
          stopOnError: fileAdapter.continueOnUploadError === false,
        },
      );
      return results.filter((result) => result.success);
    },

    async stageResourceImportFile({
      planId,
      projectId: targetProjectId,
      file,
      fileId,
      thumbnailFileId,
      processImage = false,
    } = {}) {
      const currentProjectReference = planId
        ? getCurrentReference?.()
        : undefined;
      const projectReference = currentProjectReference
        ? { ...currentProjectReference }
        : targetProjectId
          ? {
              projectId: targetProjectId,
              repositoryProjectId: targetProjectId,
            }
          : undefined;
      const projectId =
        targetProjectId ??
        projectReference?.repositoryProjectId ??
        projectReference?.projectId;
      const projectPath = projectReference?.projectPath;
      getResourceImportFileEntry(planId, projectReference);
      if (processImage) {
        const result = await processFile(file, {
          projectId,
          projectPath,
          targetFileId: fileId,
          targetThumbnailFileId: thumbnailFileId,
          onStoredFileId: (storedFileId) =>
            trackResourceImportFileId(planId, storedFileId, projectReference),
        });
        const staged = {
          success: true,
          file,
          displayName: file.name.replace(/\.[^.]+$/, ""),
          ...result,
        };
        for (const record of staged.fileRecords ?? []) {
          trackResourceImportFileId(planId, record.id, projectReference);
        }
        return staged;
      }

      const stored = await storeFileWithRecord({
        file,
        projectId,
        projectPath,
        targetFileId: fileId,
        onStoredFileId: (storedFileId) =>
          trackResourceImportFileId(planId, storedFileId, projectReference),
      });
      const staged = {
        success: true,
        file,
        displayName: file.name.replace(/\.[^.]+$/, ""),
        ...stored,
        type: "generic",
        fileRecords: [stored.fileRecord],
      };
      trackResourceImportFileId(planId, stored.fileRecord.id, projectReference);
      return staged;
    },

    async discardResourceImportFiles({ planId, fileIds = [] } = {}) {
      const entry = planId
        ? resourceImportFileIdsByPlan.get(planId)
        : undefined;
      const trackedFileIds = [...(entry?.fileIds ?? [])];
      const resolvedFileIds = [...new Set([...fileIds, ...trackedFileIds])];
      if (typeof fileAdapter.deleteStoredFiles !== "function") {
        return { deletedFileIds: [], retainedFileIds: resolvedFileIds };
      }
      await fileAdapter.deleteStoredFiles({
        fileIds: resolvedFileIds,
        projectReference: entry?.projectReference,
        getCurrentStore,
        getCurrentReference,
        getStoreByProject,
      });
      if (planId) resourceImportFileIdsByPlan.delete(planId);
      return { deletedFileIds: resolvedFileIds, retainedFileIds: [] };
    },

    finalizeResourceImportFiles({ planId } = {}) {
      if (planId) resourceImportFileIdsByPlan.delete(planId);
    },

    async getFileContent(fileId) {
      return getFileContent(fileId);
    },

    async downloadMetadata(fileId) {
      try {
        const content = await getFileContent(fileId);
        const response = await fetch(content.url);
        if (response.ok) {
          const data = await response.json();
          content.revoke?.();
          return data;
        }
        content.revoke?.();
        console.error("Failed to download metadata:", response.statusText);
        return null;
      } catch (error) {
        console.error("Failed to download metadata:", error);
        return null;
      }
    },

    async loadFontFile({ fontName, fileId, fontWeightDescriptor }) {
      if (!fontName || !fileId || fileId === "undefined") {
        throw new Error(
          "Invalid font parameters: fontName and fileId are required.",
        );
      }

      try {
        const content = await getFileContent(fileId);
        await loadFont(fontName, content.url, {
          weight: fontWeightDescriptor,
        });
        return { success: true };
      } catch (error) {
        console.error("Failed to load font file:", error);
        return { success: false, error: error.message };
      }
    },

    detectFileType,
    async getFileByProjectId(projectId, fileId) {
      return fileAdapter.getFileByProjectId({
        projectId,
        fileId,
        getStoreByProject,
      });
    },
  };
};
