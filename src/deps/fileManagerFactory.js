// File Manager Factory - provides project-specific file managers
import { createFileManager } from "./fileManager";

// For Web version - creates a simple factory with a single file manager
export const createWebFileManagerFactory = (
  fontManager,
  storageAdapterFactory,
) => {
  let manager = null;

  return {
    async getByProject(_projectId) {
      // Web version ignores projectId - always returns the same manager
      if (!manager) {
        const storageAdapter = await storageAdapterFactory.getByProject();
        manager = createFileManager({ storageAdapter, fontManager });
      }
      return manager;
    },
  };
};

// For Tauri version - creates a factory with multi-project support
export const createFileManagerFactory = (
  fontManager,
  storageAdapterFactory,
) => {
  const managerCache = new Map();

  return {
    async getByProject(projectId) {
      // Check cache first
      if (managerCache.has(projectId)) {
        return managerCache.get(projectId);
      }

      // Get project-specific storage adapter
      const storageAdapter =
        await storageAdapterFactory.getByProject(projectId);

      // Create file manager with project-specific adapter
      const manager = createFileManager({
        storageAdapter,
        fontManager,
      });

      // Cache the manager
      managerCache.set(projectId, manager);
      return manager;
    },

    // Clear specific project manager and its adapter
    async clearProject(projectId) {
      if (managerCache.has(projectId)) {
        const manager = managerCache.get(projectId);
        // Call cleanup if it exists on the manager
        if (manager.cleanup) {
          await manager.cleanup();
        }
        managerCache.delete(projectId);
      }
      // Also clear the storage adapter
      await storageAdapterFactory.clearProject(projectId);
    },

    // Clear all cached managers
    async clearAll() {
      for (const [projectId, manager] of managerCache.entries()) {
        if (manager.cleanup) {
          await manager.cleanup();
        }
      }
      managerCache.clear();
      await storageAdapterFactory.clearAll();
    },
  };
};
