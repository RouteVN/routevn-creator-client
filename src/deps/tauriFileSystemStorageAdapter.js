// Tauri File System storage adapter - implements storage operations using native file system
// This adapter replaces IndexedDB with Tauri's native file system API for better performance

import {
  readFile,
  writeFile,
  exists,
  mkdir,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { detectFileType } from "./fileProcessors";

// Generate unique file ID
const generateFileId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Get file extension from filename
const getExtension = (filename) => {
  if (!filename) return "bin";
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "bin";
};

// Get subdirectory based on file type
// Maps detectFileType results to directory names
const getFileSubdir = (file) => {
  const fileType = detectFileType(file);

  const typeToDir = {
    image: "images",
    audio: "audio",
    video: "video",
    font: "fonts",
    generic: "misc",
  };

  return typeToDir[fileType] || "misc";
};

// Create the Tauri File System storage adapter
export const createTauriFileSystemStorageAdapter = () => {
  const urlCache = new Map();

  // For now use hard coded path, in the future this func can receive parameter like `projectManager` to handle more paths
  const PROJECT_PATH = "routevn-creator/projects/default";
  const ASSETS_PATH = `${PROJECT_PATH}/assets`;
  const MANIFEST_PATH = `${PROJECT_PATH}/manifest.json`;

  // Ensure directories exist
  const ensureDirectories = async (subdir = null) => {
    try {
      // Create specific subdirectory if provided
      if (subdir) {
        await mkdir(`${ASSETS_PATH}/${subdir}`, {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        });
      } else {
        // Create base assets directory
        await mkdir(ASSETS_PATH, {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        });
      }
    } catch (error) {
      console.error("Failed to create directories:", error);
    }
  };

  // Read manifest file
  const readManifest = async () => {
    try {
      const manifestExists = await exists(MANIFEST_PATH, {
        baseDir: BaseDirectory.AppData,
      });

      if (!manifestExists) {
        return { version: "1.0.0", files: {} };
      }

      const content = await readFile(MANIFEST_PATH, {
        baseDir: BaseDirectory.AppData,
      });

      const text =
        typeof content === "string"
          ? content
          : new TextDecoder().decode(content);

      return JSON.parse(text);
    } catch (error) {
      console.error("Failed to read manifest:", error);
      return { version: "1.0.0", files: {} };
    }
  };

  // Save manifest file
  const saveManifest = async (manifest) => {
    try {
      manifest.lastModified = Date.now();
      // writeFile expects path and contents as separate parameters
      await writeFile(
        MANIFEST_PATH,
        new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
        { baseDir: BaseDirectory.AppData },
      );
    } catch (error) {
      console.error("Failed to save manifest:", error);
    }
  };

  return {
    // Store a file in the file system
    async storeFile(file, projectId) {
      try {
        // Determine subdirectory based on file type
        const subdir = getFileSubdir(file);
        await ensureDirectories(subdir);

        const fileId = generateFileId();
        const ext = getExtension(file.name);
        const fileName = `${fileId}.${ext}`;

        // Convert file to Uint8Array
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Write file to disk in appropriate subdirectory
        const filePath = `${ASSETS_PATH}/${subdir}/${fileName}`;
        await writeFile(filePath, uint8Array, {
          baseDir: BaseDirectory.AppData,
        });

        // Update manifest with subdirectory info
        const manifest = await readManifest();
        manifest.files[fileId] = {
          fileName,
          originalName: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          subdir: subdir, // Store subdirectory for later retrieval
          createdAt: Date.now(),
          projectId,
        };
        await saveManifest(manifest);

        // Generate access URL - use blob URL for now to match indexedDBStorageAdapter
        const downloadUrl = URL.createObjectURL(file);

        // Cache the URL
        urlCache.set(fileId, downloadUrl);

        return { fileId, downloadUrl };
      } catch (error) {
        console.error("Failed to store file:", error);
        throw error;
      }
    },

    // Get file URL from file system
    async getFileUrl(fileId, projectId) {
      try {
        // Check cache first
        if (urlCache.has(fileId)) {
          return { url: urlCache.get(fileId) };
        }

        // Get file info from manifest
        const manifest = await readManifest();
        const fileInfo = manifest.files[fileId];

        if (!fileInfo) {
          throw new Error(`File not found: ${fileId}`);
        }

        // Read file from disk and create blob URL
        // Use subdirectory from manifest
        const filePath = `${ASSETS_PATH}/${fileInfo.subdir || "misc"}/${fileInfo.fileName}`;
        const fileContent = await readFile(filePath, {
          baseDir: BaseDirectory.AppData,
        });

        // Create blob from file content
        const blob = new Blob([fileContent], { type: fileInfo.type });
        const url = URL.createObjectURL(blob);

        // Cache for future use
        urlCache.set(fileId, url);

        return { url };
      } catch (error) {
        console.error("Failed to get file URL:", error);
        throw error;
      }
    },

    // Store metadata as JSON file
    async storeMetadata(data, projectId) {
      try {
        // Convert metadata to JSON blob
        const jsonString = JSON.stringify(data, null, 2);
        const jsonBlob = new Blob([jsonString], {
          type: "application/json",
        });

        // Add name property for compatibility
        Object.defineProperty(jsonBlob, "name", {
          value: "metadata.json",
          writable: false,
        });

        // Reuse storeFile for metadata
        return await this.storeFile(jsonBlob, projectId);
      } catch (error) {
        console.error("Failed to store metadata:", error);
        throw error;
      }
    },

    // Delete file from file system
    async deleteFile(fileId) {
      console.log(`[TauriFS] deleteFile called with fileId: ${fileId}`);
      try {
        // Clear cache
        if (urlCache.has(fileId)) {
          const url = urlCache.get(fileId);
          // Clean up blob URL if it exists
          if (url && url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
          urlCache.delete(fileId);
        }

        // Get file info from manifest
        const manifest = await readManifest();
        const fileInfo = manifest.files[fileId];

        if (!fileInfo) {
          console.log(`[TauriFS] File not found in manifest: ${fileId}`);
          return; // File doesn't exist, nothing to delete
        }

        console.log(`[TauriFS] Found file info:`, fileInfo);

        // Delete physical file using correct subdirectory
        const filePath = `${ASSETS_PATH}/${fileInfo.subdir || "misc"}/${fileInfo.fileName}`;
        console.log(`[TauriFS] Attempting to delete file at: ${filePath}`);

        try {
          await remove(filePath, {
            baseDir: BaseDirectory.AppData,
          });
          console.log(`[TauriFS] Successfully deleted file: ${filePath}`);
        } catch (error) {
          console.error(`[TauriFS] Failed to delete physical file:`, error);
          // Continue to remove from manifest even if file deletion fails
        }

        // Update manifest
        delete manifest.files[fileId];
        await saveManifest(manifest);
        console.log(`[TauriFS] Removed file from manifest: ${fileId}`);
      } catch (error) {
        console.error("Failed to delete file:", error);
        throw error;
      }
    },

    // List all files for a project
    async listFiles(projectId) {
      try {
        const manifest = await readManifest();

        // Filter files by projectId if needed
        const files = Object.entries(manifest.files)
          .filter(([_, info]) => !projectId || info.projectId === projectId)
          .map(([fileId, info]) => ({
            fileId,
            projectId: info.projectId || projectId,
            blob: null, // Not returning blob for file system adapter
            uploadedAt: info.createdAt,
            metadata: {
              name: info.originalName,
              type: info.type,
              size: info.size,
            },
          }));

        return files;
      } catch (error) {
        console.error("Failed to list files:", error);
        return [];
      }
    },

    // Clean up all cached URLs
    cleanup() {
      // Clean up any blob URLs if they exist
      for (const url of urlCache.values()) {
        if (url && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      }
      urlCache.clear();
    },
  };
};
