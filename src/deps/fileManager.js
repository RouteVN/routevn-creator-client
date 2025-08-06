// Unified file manager that handles all file types with automatic detection
import {
  getImageDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "./fileProcessors";

export const createFileManager = ({ storageAdapter, fontManager }) => {
  // Process file based on its type
  const processFile = async (file, projectId) => {
    const fileType = detectFileType(file);
    const processor = processors[fileType] || processors.generic;
    return processor(file, projectId);
  };

  // All file processors in one place
  const processors = {
    // Image processor - extracts dimensions
    image: async (file, projectId) => {
      try {
        // Get image dimensions
        const dimensions = await getImageDimensions(file);

        // Store the file
        const { fileId, downloadUrl } = await storageAdapter.storeFile(
          file,
          projectId,
        );

        return {
          fileId,
          downloadUrl,
          dimensions,
          type: "image",
        };
      } catch (error) {
        console.error("Image processing error:", error);
        throw error;
      }
    },

    // Audio processor - extracts waveform
    audio: async (file, projectId) => {
      try {
        // Extract waveform data
        const waveformData = await extractWaveformData(file);

        // Store the audio file
        const { fileId, downloadUrl } = await storageAdapter.storeFile(
          file,
          projectId,
        );

        // Store waveform data if extraction was successful
        let waveformDataFileId = null;
        if (waveformData) {
          const waveformResult = await storageAdapter.storeMetadata(
            waveformData,
            projectId,
          );
          waveformDataFileId = waveformResult.fileId;
        }

        return {
          fileId,
          downloadUrl,
          waveformDataFileId,
          waveformData,
          duration: waveformData?.duration,
          type: "audio",
        };
      } catch (error) {
        console.error("Audio processing error:", error);
        throw error;
      }
    },

    // Video processor - extracts thumbnail
    video: async (file, projectId) => {
      try {
        // Extract thumbnail
        const thumbnailData = await extractVideoThumbnail(file, {
          timeOffset: 1,
          width: 240,
          height: 135,
          format: "image/jpeg",
          quality: 0.8,
        });

        // Store both video and thumbnail in parallel
        const [videoResult, thumbnailResult] = await Promise.all([
          storageAdapter.storeFile(file, projectId),
          storageAdapter.storeFile(thumbnailData.blob, projectId),
        ]);

        return {
          fileId: videoResult.fileId,
          downloadUrl: videoResult.downloadUrl,
          thumbnailFileId: thumbnailResult.fileId,
          thumbnailData,
          type: "video",
        };
      } catch (error) {
        console.error("Video processing error:", error);
        throw error;
      }
    },

    // Font processor - validates and loads font
    font: async (file, projectId) => {
      try {
        const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
        const fontUrl = URL.createObjectURL(file);

        // Validate font by trying to load it
        try {
          await fontManager.load(fontName, fontUrl);
        } catch (loadError) {
          URL.revokeObjectURL(fontUrl);
          throw new Error(`Invalid font file: ${loadError.message}`);
        }

        // Store the font file
        const { fileId, downloadUrl } = await storageAdapter.storeFile(
          file,
          projectId,
        );

        return {
          fileId,
          downloadUrl,
          fontName,
          fontUrl,
          type: "font",
        };
      } catch (error) {
        console.error("Font processing error:", error);
        throw error;
      }
    },

    // Generic processor - no special processing
    generic: async (file, projectId) => {
      try {
        const { fileId, downloadUrl } = await storageAdapter.storeFile(
          file,
          projectId,
        );

        return {
          fileId,
          downloadUrl,
          type: "generic",
        };
      } catch (error) {
        console.error("Generic file processing error:", error);
        throw error;
      }
    },
  };

  // Main upload function - handles single or multiple files
  const upload = async (files, projectId) => {
    // Ensure we have an array
    const fileArray = Array.isArray(files) ? files : Array.from(files);

    // Process all files in parallel
    const uploadPromises = fileArray.map(async (file) => {
      try {
        const result = await processFile(file, projectId);

        return {
          success: true,
          file,
          ...result,
        };
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);

        return {
          success: false,
          file,
          error: error.message,
        };
      }
    });

    // Wait for all uploads
    const results = await Promise.all(uploadPromises);

    // Return only successful uploads (matching original behavior)
    return results.filter((r) => r.success);
  };

  // Get file content URL (works for any file type)
  const getFileContent = async ({ fileId, projectId }) => {
    try {
      return await storageAdapter.getFileUrl(fileId, projectId);
    } catch (error) {
      console.error("Failed to get file content:", error);
      throw error;
    }
  };

  // Download metadata (e.g., waveform data)
  const downloadMetadata = async ({ fileId }) => {
    try {
      // Get the metadata file URL
      const { url } = await storageAdapter.getFileUrl(fileId, "someprojectId");

      // Fetch and parse the JSON data
      const response = await fetch(url);

      if (response.ok) {
        return await response.json();
      }

      console.error("Failed to download metadata:", response.statusText);
      return null;
    } catch (error) {
      console.error("Failed to download metadata:", error);
      return null;
    }
  };

  // Load font file (for font manager)
  const loadFontFile = async ({ fontName, fileId, projectId }) => {
    try {
      const { url } = await getFileContent({ fileId, projectId });
      await fontManager.load(fontName, url);
      return { success: true };
    } catch (error) {
      console.error("Failed to load font file:", error);
      return { success: false, error: error.message };
    }
  };

  // Public API
  return {
    // Main methods
    upload, // Upload any file type(s)
    getFileContent, // Get file URL
    downloadMetadata, // Download waveform or other metadata
    loadFontFile, // Load font into font manager

    // Utility methods (optional, for special cases)
    detectFileType, // Expose file type detection
    processFile, // Process single file

    // Storage adapter pass-through (if needed)
    deleteFile: storageAdapter.deleteFile,
    listFiles: storageAdapter.listFiles,
    cleanup: storageAdapter.cleanup,
  };
};
