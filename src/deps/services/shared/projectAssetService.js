import {
  getImageDimensions,
  extractImageThumbnail,
  getVideoDimensions,
  extractWaveformDataFromArrayBuffer,
  extractVideoThumbnail,
  detectFileType,
} from "../../clients/web/fileProcessors.js";
import { processWithConcurrency } from "../../../internal/processWithConcurrency.js";
import { loadFont } from "./fontLoader.js";

const IMAGE_THUMBNAIL_MAX_WIDTH = 320;
const IMAGE_THUMBNAIL_MAX_HEIGHT = 320;
const MAX_PARALLEL_UPLOADS = 1;

const bufferToHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const getFileRecordMimeType = ({ file }) =>
  file.type || "application/octet-stream";

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
}) => {
  const storeRawFile = async ({ file, bytes, projectId, projectPath } = {}) => {
    return fileAdapter.storeFile({
      file,
      bytes,
      projectId,
      projectPath,
      idGenerator,
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
  } = {}) => {
    const fileBytes = bytes ?? (await file.arrayBuffer());
    const [stored, sha256] = await Promise.all([
      (async () => {
        const storeStartedAt = getNow();
        const result = await storeRawFile({
          file,
          bytes: fileBytes,
          projectId,
          projectPath,
        });
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

    return {
      ...stored,
      fileRecord: {
        id: stored.fileId,
        mimeType: getFileRecordMimeType({ file }),
        size: file.size,
        sha256,
      },
    };
  };

  const getFileContent = async (fileId) => {
    return fileAdapter.getFileContent({
      fileId,
      getCurrentStore,
      getCurrentReference,
      getStoreByProject,
    });
  };

  const processFile = async (file) => {
    const fileType = detectFileType(file);

    if (fileType === "image") {
      const [dimensions, stored] = await Promise.all([
        getImageDimensions(file),
        storeFileWithRecord({ file }),
      ]);

      const thumbnailData = await extractImageThumbnail(file, {
        maxWidth: IMAGE_THUMBNAIL_MAX_WIDTH,
        maxHeight: IMAGE_THUMBNAIL_MAX_HEIGHT,
        preferredFormat: "image/webp",
        quality: 0.85,
      });
      const thumbnailResult = await storeFileWithRecord({
        file: thumbnailData.blob,
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

    const stored = await storeRawFile({ file });
    return {
      ...stored,
      type: "generic",
      fileRecords: [],
    };
  };

  return {
    async storeFile({ file, bytes } = {}) {
      const stored = await storeFileWithRecord({
        file,
        bytes,
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

    async uploadFiles(files) {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const results = await processWithConcurrency(
        fileArray,
        async (file) => {
          try {
            const result = await processFile(file);
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

    async loadFontFile({ fontName, fileId }) {
      if (!fontName || !fileId || fileId === "undefined") {
        throw new Error(
          "Invalid font parameters: fontName and fileId are required.",
        );
      }

      try {
        const content = await getFileContent(fileId);
        await loadFont(fontName, content.url);
        return { success: true };
      } catch (error) {
        console.error("Failed to load font file:", error);
        return { success: false, error: error.message };
      }
    },

    detectFileType,

    ...(typeof fileAdapter.getFileByProjectId === "function"
      ? {
          async getFileByProjectId(projectId, fileId) {
            return fileAdapter.getFileByProjectId({
              projectId,
              fileId,
              getStoreByProject,
            });
          },
        }
      : {}),
  };
};
