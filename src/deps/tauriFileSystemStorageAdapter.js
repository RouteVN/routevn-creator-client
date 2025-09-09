// Tauri File System storage adapter - implements storage operations using native file system
// This adapter replaces IndexedDB with Tauri's native file system API for better performance

import { writeFile, exists } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { nanoid } from "nanoid";

// Create the Tauri File System storage adapter with project-specific path
export const createTauriFileSystemStorageAdapter = (projectPath) => {
  if (!projectPath) {
    throw new Error(
      "projectPath is required for TauriFileSystemStorageAdapter",
    );
  }

  // Use relative path from the project directory
  const FILES_DIR = "files";

  // Get the full files path
  const getFilesPath = async () => {
    return await join(projectPath, FILES_DIR);
  };

  return {
    // Initialize the adapter (no-op since we don't create directories)
    async init() {
      // No initialization needed - directories should already exist
    },

    // Store a file in the file system
    async storeFile(file) {
      try {
        const fileId = nanoid();
        const fileName = fileId;

        // Convert file to Uint8Array
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Write file to disk - flat structure within project directory
        const filesPath = await getFilesPath();
        const filePath = await join(filesPath, fileName);
        await writeFile(filePath, uint8Array);

        // Use Tauri's asset protocol instead of blob URLs
        // This serves files directly from disk without loading into memory
        const downloadUrl = convertFileSrc(filePath);

        return { fileId, downloadUrl };
      } catch (error) {
        console.error("Failed to store file:", error);
        throw error;
      }
    },

    // Get file URL from file system
    async getFileUrl(fileId) {
      try {
        const filesPath = await getFilesPath();
        const filePath = await join(filesPath, fileId);

        // Check if file exists
        const fileExists = await exists(filePath);

        if (!fileExists) {
          throw new Error(`File not found: ${fileId}`);
        }

        const url = convertFileSrc(filePath);

        return { url };
      } catch (error) {
        console.error("Failed to get file URL:", error);
        throw error;
      }
    },

    // Store metadata as JSON file
    async storeMetadata(data) {
      try {
        // Convert metadata to JSON blob
        const jsonString = JSON.stringify(data, null, 2);
        const jsonBlob = new Blob([jsonString], {
          type: "application/json",
        });

        // Generate unique name for each metadata file
        const uniqueName = `metadata_${nanoid()}.json`;

        // Add name property for compatibility
        Object.defineProperty(jsonBlob, "name", {
          value: uniqueName,
          writable: false,
        });

        // Reuse storeFile for metadata
        return await this.storeFile(jsonBlob);
      } catch (error) {
        console.error("Failed to store metadata:", error);
        throw error;
      }
    },

    async deleteFile(fileId) {
      console.log(
        `[TauriFS] File ${fileId} marked as deleted but preserved on disk for versioning`,
      );
    },

    async listFiles() {
      return [];
    },

    // Cleanup resources if needed
    async cleanup() {
      // Optional cleanup logic
    },
  };
};
