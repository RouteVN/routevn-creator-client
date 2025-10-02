// IndexedDB storage adapter - implements storage operations locally in browser

// IndexedDB storage adapter for web platform
import { nanoid } from "nanoid";

const DB_NAME = "RouteVNCreatorFiles";
const DB_VERSION = 1;
const STORE_NAME = "files";

// Initialize and get database connection
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "fileId" });

        // Create indexes for efficient querying
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("uploadedAt", "uploadedAt", { unique: false });
      }
    };
  });
};

// Store file in IndexedDB
const storeInIndexedDB = async (fileId, blob, projectId, metadata = {}) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const fileData = {
      fileId,
      projectId,
      blob,
      uploadedAt: Date.now(),
      metadata: {
        name: blob.name || metadata.name || "unnamed",
        type: blob.type || "application/octet-stream",
        size: blob.size,
        ...metadata,
      },
    };

    const request = store.put(fileData);

    request.onsuccess = () => {
      resolve(fileId);
    };

    request.onerror = () => {
      reject(new Error("Failed to store file in IndexedDB"));
    };
  });
};

// Retrieve file from IndexedDB
const getFromIndexedDB = async (fileId) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(fileId);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve(result.blob);
      } else {
        reject(new Error(`File not found: ${fileId}`));
      }
    };

    request.onerror = () => {
      reject(new Error("Failed to retrieve file from IndexedDB"));
    };
  });
};

// Delete file from IndexedDB
const deleteFromIndexedDB = async (fileId) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(fileId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Failed to delete file from IndexedDB"));
    };
  });
};

// List all files for a project
const listFilesInIndexedDB = async (projectId) => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("projectId");
    const request = index.getAll(projectId);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error("Failed to list files from IndexedDB"));
    };
  });
};

// Create the IndexedDB storage adapter
export const createIndexedDBStorageAdapter = () => {
  // Track blob URLs to clean them up when needed
  const blobUrls = new Map();

  return {
    // Initialize the adapter
    async init() {
      // Ensure database is initialized
      await initDB();
    },

    // Store a file locally in IndexedDB
    storeFile: async (file) => {
      try {
        // Extract fileId from filename - must match template file naming
        if (!file.name) {
          throw new Error("File must have a name");
        }

        // Remove extension to get fileId
        const fileId = file.name.replace(/\.[^/.]+$/, "");

        if (!fileId) {
          throw new Error("Invalid file name - cannot extract fileId");
        }

        // Store the file
        await storeInIndexedDB(fileId, file, null, {
          name: file.name,
          type: file.type,
        });

        // Create a blob URL for immediate access
        const downloadUrl = URL.createObjectURL(file);

        // Track for cleanup
        blobUrls.set(fileId, downloadUrl);

        return { fileId, downloadUrl };
      } catch (error) {
        console.error("IndexedDB storage error:", error);
        throw error;
      }
    },

    // Get file content URL from IndexedDB
    getFileUrl: async (fileId) => {
      try {
        // Check if we already have a blob URL
        if (blobUrls.has(fileId)) {
          return { url: blobUrls.get(fileId) };
        }

        // Otherwise, retrieve from IndexedDB
        const blob = await getFromIndexedDB(fileId);
        const url = URL.createObjectURL(blob);

        // Track for cleanup
        blobUrls.set(fileId, url);

        return { url };
      } catch (error) {
        console.error("Failed to get file URL from IndexedDB:", error);
        throw error;
      }
    },

    // Store metadata as JSON blob
    storeMetadata: async function (data) {
      try {
        const jsonBlob = new Blob([JSON.stringify(data)], {
          type: "application/json",
        });

        // Generate unique name for each metadata file
        const uniqueName = `metadata_${nanoid()}.json`;

        // Add name property for better tracking
        Object.defineProperty(jsonBlob, "name", {
          value: uniqueName,
          writable: false,
        });

        // Reuse storeFile for metadata
        const result = await this.storeFile(jsonBlob);
        return result;
      } catch (error) {
        console.error("Failed to store metadata in IndexedDB:", error);
        throw error;
      }
    },

    // Additional utility methods
    deleteFile: async (fileId) => {
      // Clean up blob URL if exists
      if (blobUrls.has(fileId)) {
        URL.revokeObjectURL(blobUrls.get(fileId));
        blobUrls.delete(fileId);
      }

      return deleteFromIndexedDB(fileId);
    },

    listFiles: async (_projectId) => {
      return listFilesInIndexedDB(null);
    },

    // Clean up all blob URLs (call on unmount/cleanup)
    cleanup: () => {
      for (const url of blobUrls.values()) {
        URL.revokeObjectURL(url);
      }
      blobUrls.clear();
    },
  };
};
