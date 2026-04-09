import {
  assertSupportedProjectState,
  createProjectRepository,
} from "./projectRepository.js";
import { getOrCreateLocked } from "./getOrCreateLocked.js";

export const createProjectRepositoryService = ({
  router,
  db,
  creatorVersion,
  storageAdapter,
  collabAdapter,
}) => {
  const CURRENT_CREATOR_VERSION = creatorVersion;
  const CREATOR_VERSION_KEY = "creatorVersion";
  const PROJECT_INFO_KEY = "projectInfo";
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

  const createEmptyProjectInfo = () => ({
    name: "",
    description: "",
    iconFileId: null,
  });

  const createIncompatibleProjectVersionError = (projectVersion) => {
    const displayedProjectVersion =
      Number.isFinite(projectVersion) && projectVersion > 0
        ? String(projectVersion)
        : "0";

    return new Error(
      `You're trying to open an incompatible project with version ${displayedProjectVersion} using RouteVN Creator project format ${CURRENT_CREATOR_VERSION}. For assistance, please reach out to RouteVN staff for support.`,
    );
  };

  const normalizeProjectInfo = (projectInfo) => ({
    name: projectInfo?.name ?? "",
    description: projectInfo?.description ?? "",
    iconFileId: projectInfo?.iconFileId ?? null,
  });

  const mergeProjectInfo = (currentProjectInfo, patch = {}) => {
    const nextProjectInfo = {
      ...currentProjectInfo,
    };

    if (Object.hasOwn(patch, "name")) {
      nextProjectInfo.name = patch.name ?? "";
    }

    if (Object.hasOwn(patch, "description")) {
      nextProjectInfo.description = patch.description ?? "";
    }

    if (Object.hasOwn(patch, "iconFileId")) {
      nextProjectInfo.iconFileId = patch.iconFileId ?? null;
    }

    return normalizeProjectInfo(nextProjectInfo);
  };

  const getCurrentProjectId = () => {
    return router.getPayload()?.p;
  };

  const getEnsuredProjectId = () => {
    return currentProjectId;
  };

  const syncProjectEntryProjectInfo = async (projectId, projectInfo) => {
    if (!db || typeof db.get !== "function" || typeof db.set !== "function") {
      return;
    }

    const entries = (await db.get("projectEntries")) || [];
    if (!Array.isArray(entries)) {
      return;
    }

    const entryIndex = entries.findIndex((entry) => entry?.id === projectId);
    if (entryIndex < 0) {
      return;
    }

    entries[entryIndex] = {
      ...entries[entryIndex],
      name: projectInfo.name,
      description: projectInfo.description,
      iconFileId: projectInfo.iconFileId,
    };
    await db.set("projectEntries", entries);
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

  const getStoreByPath =
    typeof storageAdapter.resolveProjectReferenceByPath === "function"
      ? async (projectPath) => {
          const reference = normalizeReference(
            await storageAdapter.resolveProjectReferenceByPath({
              projectPath,
            }),
            projectPath,
          );
          return getStoreByReference(reference);
        }
      : undefined;

  const readCreatorVersionFromStore = async (store) => {
    if (!store?.app || typeof store.app.get !== "function") {
      return undefined;
    }

    const storedCreatorVersion = await store.app.get(CREATOR_VERSION_KEY);
    if (!Number.isFinite(storedCreatorVersion)) {
      return undefined;
    }

    return storedCreatorVersion;
  };

  const ensureCompatibleCreatorVersion = async (store) => {
    const creatorVersion = await readCreatorVersionFromStore(store);

    if (creatorVersion !== CURRENT_CREATOR_VERSION) {
      throw createIncompatibleProjectVersionError(creatorVersion);
    }

    return creatorVersion;
  };

  const readProjectInfoFromStore = async (store) => {
    if (!store?.app || typeof store.app.get !== "function") {
      return createEmptyProjectInfo();
    }

    const storedProjectInfo = await store.app.get(PROJECT_INFO_KEY);
    return normalizeProjectInfo(storedProjectInfo);
  };

  const writeProjectInfoToStore = async ({ store, projectId, patch }) => {
    const currentProjectInfo = await readProjectInfoFromStore(store);
    const nextProjectInfo = mergeProjectInfo(currentProjectInfo, patch);

    if (!store?.app || typeof store.app.set !== "function") {
      throw new Error("Project store does not support app.set()");
    }

    await store.app.set(PROJECT_INFO_KEY, nextProjectInfo);

    if (projectId) {
      await syncProjectEntryProjectInfo(projectId, nextProjectInfo);
    }

    return nextProjectInfo;
  };

  const getProjectInfoByProjectId = async (projectId) => {
    const store = await getStoreByProject(projectId);
    await ensureCompatibleCreatorVersion(store);
    return readProjectInfoFromStore(store);
  };

  const ensureProjectCompatibleByProjectId = async (projectId) => {
    const store = await getStoreByProject(projectId);
    await ensureCompatibleCreatorVersion(store);
  };

  const updateProjectInfoByProjectId = async (projectId, patch) => {
    const store = await getStoreByProject(projectId);
    await ensureCompatibleCreatorVersion(store);
    return writeProjectInfoToStore({
      store,
      projectId,
      patch,
    });
  };

  const getCurrentProjectInfo = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }

    return getProjectInfoByProjectId(projectId);
  };

  const updateCurrentProjectInfo = async (patch) => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }

    return updateProjectInfoByProjectId(projectId, patch);
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
        await ensureCompatibleCreatorVersion(store);
        assertSupportedProjectState(repository.getState());

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

    if (
      currentProjectId === projectId &&
      currentRepository &&
      currentStore &&
      currentReference
    ) {
      assertSupportedProjectState(currentRepository.getState());
      return currentRepository;
    }

    const reference = await resolveProjectReferenceByProjectId(projectId);
    const repository = await getRepositoryByReference(reference);
    const store = await getStoreByReference(reference);

    currentProjectId = projectId;
    currentRepository = repository;
    currentStore = store;
    currentReference = reference;
    const projectInfo = await readProjectInfoFromStore(store);
    await syncProjectEntryProjectInfo(projectId, projectInfo);

    return repository;
  };

  const subscribeProjectState = (
    listener,
    { projectId, emitCurrent = true } = {},
  ) => {
    const targetProjectId = projectId || getCurrentProjectId();
    if (!targetProjectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }

    let repository =
      targetProjectId === currentProjectId ? currentRepository : undefined;

    if (!repository) {
      const reference = referencesByProject.get(targetProjectId);
      if (reference) {
        repository = repositoriesByCacheKey.get(reference.cacheKey);
      }
    }

    if (!repository) {
      throw new Error(
        "Repository not initialized. App must ensure it before subscribing.",
      );
    }

    return repository.subscribe(listener, { emitCurrent });
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
    getEnsuredProjectId,
    ensureProjectCompatibleByProjectId,
    getProjectInfoByProjectId,
    getCurrentProjectInfo,
    updateCurrentProjectInfo,
    updateProjectInfoByProjectId,
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
    subscribeProjectState(listener, options) {
      return subscribeProjectState(listener, options);
    },
    ...(typeof getRepositoryByPath === "function"
      ? {
          async getRepositoryByPath(projectPath) {
            return getRepositoryByPath(projectPath);
          },
        }
      : {}),
    ...(typeof getStoreByPath === "function"
      ? {
          async ensureProjectCompatibleByPath(projectPath) {
            const store = await getStoreByPath(projectPath);
            await ensureCompatibleCreatorVersion(store);
          },
          async getProjectInfoByPath(projectPath) {
            const store = await getStoreByPath(projectPath);
            await ensureCompatibleCreatorVersion(store);
            return readProjectInfoFromStore(store);
          },
          async updateProjectInfoByPath(projectPath, patch) {
            const store = await getStoreByPath(projectPath);
            await ensureCompatibleCreatorVersion(store);
            return writeProjectInfoToStore({
              store,
              patch,
            });
          },
        }
      : {}),
  };
};
