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
import { nanoid } from "nanoid";

// Create the Tauri File System storage adapter
export const createTauriFileSystemStorageAdapter = () => {
  const urlCache = new Map();

  const PROJECT_PATH = "routevn-creator/projects/default";
  const FILES_PATH = `${PROJECT_PATH}/files`;

  // Ensure directories exist
  const ensureDirectories = async () => {
    try {
      await mkdir(FILES_PATH, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      });
    } catch (error) {
      console.error("Failed to create directories:", error);
    }
  };

  return {
    // Store a file in the file system
    async storeFile(file, projectId) {
      try {
        await ensureDirectories();

        const fileId = nanoid();
        const fileName = fileId;

        // Convert file to Uint8Array
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Write file to disk - flat structure
        const filePath = `${FILES_PATH}/${fileName}`;
        await writeFile(filePath, uint8Array, {
          baseDir: BaseDirectory.AppData,
        });

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
    async getFileUrl(fileId) {
      try {
        // Check cache first
        if (urlCache.has(fileId)) {
          return { url: urlCache.get(fileId) };
        }

        // Read file from disk and create blob URL
        const filePath = `${FILES_PATH}/${fileId}`;

        // Check if file exists
        const fileExists = await exists(filePath, {
          baseDir: BaseDirectory.AppData,
        });

        if (!fileExists) {
          throw new Error(`File not found: ${fileId}`);
        }

        const fileContent = await readFile(filePath, {
          baseDir: BaseDirectory.AppData,
        });

        // Create blob from file content
        // Since we don't store the mime type, use a generic one
        const blob = new Blob([fileContent]);
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

    async deleteFile(fileId) {
      if (urlCache.has(fileId)) {
        const url = urlCache.get(fileId);
        // Clean up blob URL if it exists
        if (url && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
        urlCache.delete(fileId);
      }

      console.log(
        `[TauriFS] File ${fileId} marked as deleted but preserved on disk for versioning`,
      );
    },

    async listFiles(projectId) {
      return [];
    },

    cleanup() {
      for (const url of urlCache.values()) {
        if (url && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      }
      urlCache.clear();
    },
  };
};
