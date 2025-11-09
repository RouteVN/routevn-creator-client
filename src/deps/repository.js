import {
  createRepository,
  toFlatItems,
  toFlatGroups,
  toTreeStructure,
} from "insieme";
import { createInsiemeTauriStoreAdapter } from "./tauriRepositoryAdapter";

// Re-export utility functions from insieme for backward compatibility
export { toFlatItems, toFlatGroups, toTreeStructure };

// Web store adapter (temporary placeholder)
const createWebStore = () => {
  // TODO: Implement proper web store using localStorage or IndexedDB
  // For now, return a mock that stores events in memory
  let events = [];

  return {
    async getEvents() {
      return events;
    },

    async appendEvent(event) {
      events.push(event);
    },

    app: {
      get: async (key) => {
        const value = localStorage.getItem(`app_${key}`);
        return value ? JSON.parse(value) : null;
      },
      set: async (key, value) => {
        localStorage.setItem(`app_${key}`, JSON.stringify(value));
      },
      remove: async (key) => {
        localStorage.removeItem(`app_${key}`);
      },
    },
  };
};

// For web version - creates a simple factory with a single repository
export const createWebRepositoryFactory = (initialState) => {
  let repository = null;

  return {
    async getByProject(_projectId) {
      // Web version ignores projectId - always returns the same repository
      if (!repository) {
        const store = createWebStore();
        repository = createRepository({ originStore: store });
        await repository.init({ initialState });
      }
      return repository;
    },
  };
};

// For Tauri version - creates a factory with multi-project support
export const createRepositoryFactory = (initialState, keyValueStore) => {
  const repositoriesByProject = new Map();
  const repositoriesByPath = new Map();

  const getOrCreateRepositoryByPath = async (projectPath) => {
    if (repositoriesByPath.has(projectPath)) {
      return repositoriesByPath.get(projectPath);
    }

    const store = await createInsiemeTauriStoreAdapter(projectPath);
    const repository = createRepository({ originStore: store });
    await repository.init({ initialState });
    repositoriesByPath.set(projectPath, repository);
    return repository;
  };

  const repositoryFactory = {
    getByProject: async (projectId) => {
      if (repositoriesByProject.has(projectId)) {
        return repositoriesByProject.get(projectId);
      }

      const projects = (await keyValueStore.get("projects")) || [];
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        throw new Error("project not found");
      }

      const repository = await getOrCreateRepositoryByPath(project.projectPath);
      repositoriesByProject.set(projectId, repository);
      return repository;
    },
    getByPath: async (projectPath) => {
      return await getOrCreateRepositoryByPath(projectPath);
    },
  };

  return repositoryFactory;
};
