// Storage Adapter Factory - provides project-specific storage adapters
import { createIndexedDBStorageAdapter } from "./indexedDBStorageAdapter";
import { createTauriFileSystemStorageAdapter } from "./tauriFileSystemStorageAdapter";

// For Web version - creates a simple factory with a single adapter
export const createWebStorageAdapterFactory = () => {
  let adapter = null;

  return {
    async getByProject(_projectId) {
      // Web version ignores projectId - always returns the same adapter
      if (!adapter) {
        adapter = createIndexedDBStorageAdapter();
        await adapter.init();
      }
      return adapter;
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
