import { assertV2State, createProjectRepository } from "./projectRepository.js";
import { getOrCreateLocked } from "./getOrCreateLocked.js";

export const createProjectRepositoryService = ({
  router,
  db,
  storageAdapter,
  collabAdapter,
}) => {
  const repositoriesByCacheKey = new Map();
  const storesByCacheKey = new Map();
  const storesByProject = new Map();
  const referencesByProject = new Map();
  const storeLocksByCacheKey = new Map();
  const repositoryLocksByCacheKey = new Map();

  let currentRepository;
  let currentProjectId;
  let currentStore;
  let currentReference;

  const getCurrentProjectId = () => {
    return router.getPayload()?.p;
  };

  const getProjectMetadataFromEntries = async (projectId) => {
    if (!db || typeof db.get !== "function") {
      return {
        name: "",
        description: "",
      };
    }

    const entries = (await db.get("projectEntries")) || [];
    const entry = Array.isArray(entries)
      ? entries.find((item) => item?.id === projectId)
      : undefined;

    return {
      name: entry?.name || "",
      description: entry?.description || "",
    };
  };

  const normalizeReference = (reference, projectId) => {
    if (!reference || typeof reference !== "object") {
      throw new Error(`Project reference not found for '${projectId}'`);
    }

    return {
      ...reference,
      projectId,
      cacheKey: reference.cacheKey || projectId,
      repositoryProjectId: reference.repositoryProjectId || projectId,
    };
  };

  const resolveProjectReferenceByProjectId = async (projectId) => {
    if (!projectId) {
      throw new Error("projectId is required");
    }

    const cached = referencesByProject.get(projectId);
    if (cached) {
      return cached;
    }

    const reference = normalizeReference(
      await storageAdapter.resolveProjectReferenceByProjectId({
        db,
        projectId,
      }),
      projectId,
    );
    referencesByProject.set(projectId, reference);
    return reference;
  };

  const getStoreByReference = async (reference) => {
    return getOrCreateLocked({
      cache: storesByCacheKey,
      locks: storeLocksByCacheKey,
      key: reference.cacheKey,
      create: async () => {
        const store = await storageAdapter.createStore({ reference, db });
        if (reference.projectId) {
          storesByProject.set(reference.projectId, store);
          referencesByProject.set(reference.projectId, reference);
        }
        return store;
      },
    });
  };

  const getStoreByProject = async (projectId) => {
    const reference = await resolveProjectReferenceByProjectId(projectId);
    const store = await getStoreByReference(reference);
    storesByProject.set(projectId, store);
    return store;
  };

  const getRepositoryByReference = async (reference) => {
    return getOrCreateLocked({
      cache: repositoriesByCacheKey,
      locks: repositoryLocksByCacheKey,
      key: reference.cacheKey,
      create: async () => {
        const store = await getStoreByReference(reference);
        let events = (await store.getEvents()) || [];

        if (typeof collabAdapter?.beforeCreateRepository === "function") {
          const nextEvents = await collabAdapter.beforeCreateRepository({
            projectId: reference.projectId,
            reference,
            store,
            events,
          });
          if (Array.isArray(nextEvents)) {
            events = nextEvents;
          }
        }

        const repository = await createProjectRepository({
          projectId: reference.repositoryProjectId,
          store,
          events,
        });
        assertV2State(repository.getState());

        if (reference.projectId) {
          storesByProject.set(reference.projectId, store);
          referencesByProject.set(reference.projectId, reference);
        }

        if (typeof collabAdapter?.afterCreateRepository === "function") {
          await collabAdapter.afterCreateRepository({
            projectId: reference.projectId,
            reference,
            store,
            repository,
          });
        }

        return repository;
      },
    });
  };

  const getRepositoryByProject = async (projectId) => {
    const reference = await resolveProjectReferenceByProjectId(projectId);
    return getRepositoryByReference(reference);
  };

  const getRepositoryByPath =
    typeof storageAdapter.resolveProjectReferenceByPath === "function"
      ? async (projectPath) => {
          const reference = normalizeReference(
            await storageAdapter.resolveProjectReferenceByPath({
              db,
              projectPath,
            }),
            projectPath,
          );
          return getRepositoryByReference(reference);
        }
      : undefined;

  const ensureRepository = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }

    const reference = await resolveProjectReferenceByProjectId(projectId);
    const repository = await getRepositoryByReference(reference);
    const store = await getStoreByReference(reference);

    currentProjectId = projectId;
    currentRepository = repository;
    currentStore = store;
    currentReference = reference;

    return repository;
  };

  const getCachedRepository = () => {
    const projectId = getCurrentProjectId();
    if (!currentRepository || currentProjectId !== projectId) {
      throw new Error(
        "Repository not initialized. Call ensureRepository() first.",
      );
    }
    return currentRepository;
  };

  const getCachedStore = () => {
    const projectId = getCurrentProjectId();
    if (!currentStore || currentProjectId !== projectId) {
      throw new Error(
        "Adapter not initialized. Call ensureRepository() first.",
      );
    }
    return currentStore;
  };

  const getCachedReference = () => {
    const projectId = getCurrentProjectId();
    if (!currentReference || currentProjectId !== projectId) {
      throw new Error(
        "Project reference not initialized. Call ensureRepository() first.",
      );
    }
    return currentReference;
  };

  return {
    getCurrentProjectId,
    getProjectMetadataFromEntries,
    resolveProjectReferenceByProjectId,
    getStoreByProject,
    getStoreByProjectSync(projectId) {
      return storesByProject.get(projectId);
    },
    getCurrentRepository: ensureRepository,
    getCachedRepository,
    getCachedStore,
    getCachedReference,
    async getRepository() {
      return ensureRepository();
    },
    async getRepositoryById(projectId) {
      return getRepositoryByProject(projectId);
    },
    getRepositoryByProject,
    getAdapterById(projectId) {
      return storesByProject.get(projectId);
    },
    async ensureRepository() {
      return ensureRepository();
    },
    ...(typeof getRepositoryByPath === "function"
      ? {
          async getRepositoryByPath(projectPath) {
            return getRepositoryByPath(projectPath);
          },
        }
      : {}),
  };
};
