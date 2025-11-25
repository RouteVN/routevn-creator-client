import {
  createRepository,
  toFlatItems,
  toFlatGroups,
  toTreeStructure,
} from "insieme";
import { createInsiemeTauriStoreAdapter } from "./tauriRepositoryAdapter";

// Re-export utility functions from insieme for backward compatibility
export { toFlatItems, toFlatGroups, toTreeStructure };

export const createWebRepositoryFactory = (
  initialState,
  createRepositoryAdapter,
) => {
  const repositoryCache = new Map();

  return {
    async getByProject(projectId) {
      if (repositoryCache.has(projectId)) {
        return repositoryCache.get(projectId);
      }

      const repositoryAdapter = createRepositoryAdapter(projectId);
      const repository = createRepository({ originStore: repositoryAdapter });
      await repository.init({ initialState });

      repositoryCache.set(projectId, repository);
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
    // TODO: remove this
    repository.app = store.app;
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
