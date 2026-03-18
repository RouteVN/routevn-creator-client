import {
  getImageDimensions,
  extractImageThumbnail,
  getVideoDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "../../clients/web/fileProcessors.js";
import { loadFont } from "./fontLoader.js";

const IMAGE_THUMBNAIL_MAX_WIDTH = 320;
const IMAGE_THUMBNAIL_MAX_HEIGHT = 320;

const bufferToHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const getFileRecordMimeType = ({ file }) =>
  file.type || "application/octet-stream";

const computeSha256 = async (file) => {
  if (!crypto?.subtle?.digest) {
    throw new Error("SHA-256 hashing is unavailable in this runtime.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
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
  const storeFile = async (file) => {
    return fileAdapter.storeFile({
      file,
      idGenerator,
      getCurrentStore,
      getCurrentReference,
      getStoreByProject,
    });
  };

  const storeFileWithRecord = async ({ file }) => {
    const [stored, sha256] = await Promise.all([
      storeFile(file),
      computeSha256(file),
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
      const fileForWaveform = new File([arrayBuffer], file.name, {
        type: file.type,
      });
      const fileForStorage = new File([arrayBuffer], file.name, {
        type: file.type,
      });

      const waveformData = await extractWaveformData(fileForWaveform);
      const stored = await storeFileWithRecord({
        file: fileForStorage,
      });

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
      const [dimensions, thumbnailData] = await Promise.all([
        getVideoDimensions(file),
        extractVideoThumbnail(file, {
          timeOffset: 1,
          width: 240,
          height: 135,
          format: "image/jpeg",
          quality: 0.8,
        }),
      ]);
      const [videoResult, thumbnailResult] = await Promise.all([
        storeFileWithRecord({ file }),
        storeFileWithRecord({
          file: thumbnailData.blob,
        }),
      ]);
      return {
        ...videoResult,
        thumbnailFileId: thumbnailResult.fileId,
        thumbnailData,
        dimensions,
        type: "video",
        fileRecords: [videoResult.fileRecord, thumbnailResult.fileRecord],
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

    const stored = await storeFile(file);
    return {
      ...stored,
      type: "generic",
      fileRecords: [],
    };
  };

  return {
    async uploadFiles(files) {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const uploadPromises = fileArray.map(async (file) => {
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
      });

      const results = await Promise.all(uploadPromises);
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
