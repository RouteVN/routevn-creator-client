// Storage Adapter Factory - provides project-specific storage adapters
import { createIndexedDBStorageAdapter } from "./indexedDBStorageAdapter";
import { createTauriFileSystemStorageAdapter } from "./tauriFileSystemStorageAdapter";

// For Web version - creates a simple factory with a single adapter
export const createWebStorageAdapterFactory = () => {
  const adapterCache = new Map();

  return {
    async getByProject(projectId) {
      if (!projectId) {
        throw new Error("A projectId is required.");
      }

      if (adapterCache.has(projectId)) {
        return adapterCache.get(projectId);
      }

      const adapter = createIndexedDBStorageAdapter(projectId);
      await adapter.init();

      adapterCache.set(projectId, adapter);
      return adapter;
    },
    // No-op cleanup functions for web consistency
    async clearProject(projectId) {
      if (adapterCache.has(projectId)) {
        adapterCache.delete(projectId);
      }
    },
    async clearAll() {
      adapterCache.clear();
    },
  };
};

// For Tauri version - creates a factory with multi-project support
export const createStorageAdapterFactory = (keyValueStore) => {
  const adapterCache = new Map();

  return {
    async getByProject(projectId) {
      // Get project info from keyValueStore
      const projects = (await keyValueStore.get("projects")) || [];
      const project = projects.find((p) => p.id === projectId);

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const projectPath = project.projectPath;

      // Check cache
      if (adapterCache.has(projectPath)) {
        return adapterCache.get(projectPath);
      }

      // Create new adapter with project-specific path
      const adapter = createTauriFileSystemStorageAdapter(projectPath);
      await adapter.init();

      // Cache the adapter
      adapterCache.set(projectPath, adapter);
      return adapter;
    },

    // Clear specific project adapter
    async clearProject(projectId) {
      const projects = (await keyValueStore.get("projects")) || [];
      const project = projects.find((p) => p.id === projectId);

      if (!project) {
        return;
      }

      const projectPath = project.projectPath;

      if (adapterCache.has(projectPath)) {
        const adapter = adapterCache.get(projectPath);
        if (adapter.cleanup) {
          await adapter.cleanup();
        }
        adapterCache.delete(projectPath);
      }
    },

    // Clear all cached adapters
    async clearAll() {
      for (const [, adapter] of adapterCache.entries()) {
        if (adapter.cleanup) {
          await adapter.cleanup();
        }
      }
      adapterCache.clear();
    },
  };
};
