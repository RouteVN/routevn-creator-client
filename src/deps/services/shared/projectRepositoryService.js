import {
  assertSupportedProjectState,
  createProjectRepository,
} from "./projectRepository.js";
import { getOrCreateLocked } from "./getOrCreateLocked.js";
import { generateId as generateBaseId } from "../../../internal/id.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
} from "./projectRepositoryViews/shared.js";

export const createProjectRepositoryService = ({
  router,
  db,
  creatorVersion,
  idGenerator,
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

  const generateId = () => {
    if (typeof idGenerator === "function") {
      return idGenerator();
    }
    return generateBaseId();
  };

  const createEmptyProjectInfo = () => ({
    id: "",
    namespace: "",
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
    id: projectInfo?.id ?? "",
    namespace: projectInfo?.namespace ?? "",
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

    if (Object.hasOwn(patch, "id")) {
      nextProjectInfo.id = patch.id ?? "";
    }

    if (Object.hasOwn(patch, "namespace")) {
      nextProjectInfo.namespace = patch.namespace ?? "";
    }

    return normalizeProjectInfo(nextProjectInfo);
  };

  const getCurrentProjectId = () => {
    return router.getPayload()?.p;
  };

  const getEnsuredProjectId = () => {
    return currentProjectId;
  };

  const emitRepositoryLoadStage = (onLoadStage, payload = {}) => {
    if (typeof onLoadStage !== "function") {
      return;
    }

    onLoadStage(structuredClone(payload));
  };

  const isClosedPoolError = (error) =>
    String(error?.message || "")
      .toLowerCase()
      .includes("closed pool");

  const evictCachedReference = async (reference) => {
    const cacheKey = reference?.cacheKey;
    if (!cacheKey) {
      return;
    }

    repositoriesByCacheKey.delete(cacheKey);
    storesByCacheKey.delete(cacheKey);
    repositoryLocksByCacheKey.delete(cacheKey);
    storeLocksByCacheKey.delete(cacheKey);

    for (const [projectId, cachedReference] of referencesByProject.entries()) {
      if (cachedReference?.cacheKey !== cacheKey) {
        continue;
      }
      referencesByProject.delete(projectId);
      storesByProject.delete(projectId);
    }

    if (currentReference?.cacheKey === cacheKey) {
      currentRepository = undefined;
      currentProjectId = undefined;
      currentStore = undefined;
      currentReference = undefined;
    }

    if (typeof storageAdapter?.evictStoreByReference === "function") {
      await storageAdapter.evictStoreByReference({ reference });
    }
  };

  const withRecoveredStore = async (reference, run) => {
    let hasRetriedClosedPool = false;

    while (true) {
      const store = await getStoreByReference(reference);

      try {
        return await run(store);
      } catch (error) {
        if (hasRetriedClosedPool || !isClosedPoolError(error)) {
          throw error;
        }

        hasRetriedClosedPool = true;
        await evictCachedReference(reference);
      }
    }
  };

  const loadReusableMainCheckpoint = async ({
    store,
    cacheKey,
    onLoadStage,
  } = {}) => {
    if (
      typeof store?.loadMaterializedViewCheckpoint !== "function" ||
      typeof store?.getRepositoryHistoryStats !== "function" ||
      typeof store?.isRepositoryHistoryStatsEqual !== "function"
    ) {
      return undefined;
    }

    emitRepositoryLoadStage(onLoadStage, {
      stage: "load_main_checkpoint",
      label: "Loading project state checkpoint...",
      cacheKey,
    });
    const checkpoint = await store.loadMaterializedViewCheckpoint({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });

    if (
      !checkpoint ||
      checkpoint.viewVersion !== MAIN_VIEW_VERSION ||
      !Number.isFinite(Number(checkpoint?.lastCommittedId))
    ) {
      return undefined;
    }

    const currentHistoryStats = await store.getRepositoryHistoryStats();
    const checkpointHistoryStats = checkpoint?.meta?.historyStats;
    const hasCheckpointHistoryStats =
      checkpointHistoryStats &&
      typeof checkpointHistoryStats === "object" &&
      !Array.isArray(checkpointHistoryStats);

    if (hasCheckpointHistoryStats) {
      if (
        !store.isRepositoryHistoryStatsEqual(
          checkpointHistoryStats,
          currentHistoryStats,
        )
      ) {
        return undefined;
      }
    } else {
      const currentHistoryLength =
        Number(currentHistoryStats?.committedCount || 0) +
        Number(currentHistoryStats?.draftCount || 0);
      const checkpointRevision = Math.max(
        0,
        Math.floor(Number(checkpoint.lastCommittedId) || 0),
      );

      if (checkpointRevision !== currentHistoryLength) {
        return undefined;
      }

      emitRepositoryLoadStage(onLoadStage, {
        stage: "backfill_main_checkpoint_metadata",
        label: "Updating project state checkpoint...",
        cacheKey,
        revision: checkpointRevision,
      });
      await store.saveMaterializedViewCheckpoint({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
        viewVersion: checkpoint.viewVersion,
        lastCommittedId: checkpointRevision,
        value: checkpoint.value,
        updatedAt: checkpoint.updatedAt || Date.now(),
      });
    }

    return {
      checkpoint,
      currentHistoryStats,
      initialRevision: Math.max(
        0,
        Math.floor(Number(checkpoint.lastCommittedId) || 0),
      ),
    };
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
        await ensureCompatibleCreatorVersionForReference(reference);
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

  const readCreatorVersionFromReference =
    typeof storageAdapter.readCreatorVersionByReference === "function"
      ? async (reference) => {
          const storedCreatorVersion =
            await storageAdapter.readCreatorVersionByReference({
              reference,
              db,
            });
          if (!Number.isFinite(storedCreatorVersion)) {
            return undefined;
          }

          return storedCreatorVersion;
        }
      : undefined;

  const ensureCompatibleCreatorVersion = async (store) => {
    const creatorVersion = await readCreatorVersionFromStore(store);

    if (creatorVersion !== CURRENT_CREATOR_VERSION) {
      throw createIncompatibleProjectVersionError(creatorVersion);
    }

    return creatorVersion;
  };

  const ensureCompatibleCreatorVersionForReference =
    typeof readCreatorVersionFromReference === "function"
      ? async (reference) => {
          const creatorVersion =
            await readCreatorVersionFromReference(reference);

          if (
            creatorVersion !== undefined &&
            creatorVersion !== CURRENT_CREATOR_VERSION
          ) {
            throw createIncompatibleProjectVersionError(creatorVersion);
          }
        }
      : async () => {};

  const readProjectInfoFromStore = async (
    store,
    { fallbackProjectId } = {},
  ) => {
    if (!store?.app || typeof store.app.get !== "function") {
      return createEmptyProjectInfo();
    }

    const storedProjectInfo = await store.app.get(PROJECT_INFO_KEY);
    const normalizedProjectInfo = normalizeProjectInfo(storedProjectInfo);
    if (normalizedProjectInfo.id && normalizedProjectInfo.namespace) {
      return normalizedProjectInfo;
    }

    const nextProjectInfo = normalizeProjectInfo({
      ...normalizedProjectInfo,
      id: normalizedProjectInfo.id || fallbackProjectId || generateId(),
      namespace: normalizedProjectInfo.namespace || generateId(),
    });
    await store.app.set(PROJECT_INFO_KEY, nextProjectInfo);
    return nextProjectInfo;
  };

  const writeProjectInfoToStore = async ({ store, projectId, patch }) => {
    const currentProjectInfo = await readProjectInfoFromStore(store, {
      fallbackProjectId: projectId,
    });
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
    return readProjectInfoFromStore(store, { fallbackProjectId: projectId });
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

  const getRepositoryByReference = async (
    reference,
    { onHydrationProgress, onLoadStage, onEventLoadProgress } = {},
  ) => {
    if (
      !repositoriesByCacheKey.has(reference.cacheKey) &&
      repositoryLocksByCacheKey.has(reference.cacheKey)
    ) {
      emitRepositoryLoadStage(onLoadStage, {
        stage: "wait_repository_creation_lock",
        label: "Waiting for another repository load...",
        cacheKey: reference.cacheKey,
      });
    }

    return getOrCreateLocked({
      cache: repositoriesByCacheKey,
      locks: repositoryLocksByCacheKey,
      key: reference.cacheKey,
      create: async () => {
        emitRepositoryLoadStage(onLoadStage, {
          stage: "open_project_store",
          label: "Opening project database...",
          cacheKey: reference.cacheKey,
        });
        let repositoryResult = await withRecoveredStore(
          reference,
          async (store) => {
            let events = [];
            let initialRevision;
            const reusableMainCheckpoint = await loadReusableMainCheckpoint({
              store,
              cacheKey: reference.cacheKey,
              onLoadStage,
            });

            if (reusableMainCheckpoint) {
              initialRevision = reusableMainCheckpoint.initialRevision;
              emitRepositoryLoadStage(onLoadStage, {
                stage: "reuse_main_checkpoint",
                label: "Using project state checkpoint...",
                cacheKey: reference.cacheKey,
                revision: initialRevision,
              });
            } else {
              emitRepositoryLoadStage(onLoadStage, {
                stage: "read_project_events",
                label: "Reading project events...",
                cacheKey: reference.cacheKey,
              });
              events =
                (await store.getEvents({
                  onProgress: onEventLoadProgress,
                })) || [];
              emitRepositoryLoadStage(onLoadStage, {
                stage: "project_events_loaded",
                label: "Reading project events...",
                cacheKey: reference.cacheKey,
                eventCount: Array.isArray(events) ? events.length : 0,
              });
            }

            if (typeof collabAdapter?.beforeCreateRepository === "function") {
              emitRepositoryLoadStage(onLoadStage, {
                stage: "prepare_project_events",
                label: "Preparing project events...",
                cacheKey: reference.cacheKey,
                eventCount: Array.isArray(events) ? events.length : 0,
              });
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

            emitRepositoryLoadStage(onLoadStage, {
              stage: "build_repository_state",
              label: "Building project state...",
              cacheKey: reference.cacheKey,
              eventCount: Array.isArray(events) ? events.length : 0,
            });
            const repository = await createProjectRepository({
              projectId: reference.repositoryProjectId,
              store,
              events: reusableMainCheckpoint ? undefined : events,
              historyLoaded: !reusableMainCheckpoint,
              initialRevision,
              loadEvents: async () => (await store.getEvents()) || [],
              onHydrationProgress,
            });
            emitRepositoryLoadStage(onLoadStage, {
              stage: "validate_repository_state",
              label: "Validating project state...",
              cacheKey: reference.cacheKey,
            });
            await ensureCompatibleCreatorVersion(store);
            assertSupportedProjectState(repository.getState());

            if (reference.projectId) {
              storesByProject.set(reference.projectId, store);
              referencesByProject.set(reference.projectId, reference);
            }

            if (typeof collabAdapter?.afterCreateRepository === "function") {
              emitRepositoryLoadStage(onLoadStage, {
                stage: "finalize_repository",
                label: "Finalizing project repository...",
                cacheKey: reference.cacheKey,
              });
              await collabAdapter.afterCreateRepository({
                projectId: reference.projectId,
                reference,
                store,
                repository,
              });
            }

            return {
              repository,
            };
          },
        );

        return repositoryResult.repository;
      },
    });
  };

  const getRepositoryByProject = async (
    projectId,
    { onHydrationProgress, onLoadStage, onEventLoadProgress } = {},
  ) => {
    const reference = await resolveProjectReferenceByProjectId(projectId);
    return getRepositoryByReference(reference, {
      onHydrationProgress,
      onLoadStage,
      onEventLoadProgress,
    });
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

  const ensureRepository = async ({
    onHydrationProgress,
    onLoadStage,
    onEventLoadProgress,
  } = {}) => {
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

    emitRepositoryLoadStage(onLoadStage, {
      stage: "resolve_project_reference",
      label: "Resolving project reference...",
      projectId,
    });
    const reference = await resolveProjectReferenceByProjectId(projectId);
    const repository = await getRepositoryByReference(reference, {
      onHydrationProgress,
      onLoadStage,
      onEventLoadProgress,
    });
    const store = await getStoreByReference(reference);

    currentProjectId = projectId;
    currentRepository = repository;
    currentStore = store;
    currentReference = reference;
    emitRepositoryLoadStage(onLoadStage, {
      stage: "read_project_metadata",
      label: "Reading project metadata...",
      projectId,
      cacheKey: reference.cacheKey,
    });
    const projectInfo = await readProjectInfoFromStore(store, {
      fallbackProjectId: projectId,
    });
    emitRepositoryLoadStage(onLoadStage, {
      stage: "sync_project_entry",
      label: "Syncing project entry...",
      projectId,
      cacheKey: reference.cacheKey,
    });
    await syncProjectEntryProjectInfo(projectId, projectInfo);
    emitRepositoryLoadStage(onLoadStage, {
      stage: "repository_ready",
      label: "Project ready.",
      projectId,
      cacheKey: reference.cacheKey,
    });

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
    async ensureRepository(options) {
      return ensureRepository(options);
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
            const reference = normalizeReference(
              await storageAdapter.resolveProjectReferenceByPath({
                projectPath,
              }),
              projectPath,
            );
            await ensureCompatibleCreatorVersionForReference(reference);
          },
          async getProjectInfoByPath(projectPath) {
            if (
              typeof storageAdapter.readProjectInfoByReference === "function"
            ) {
              const reference = normalizeReference(
                await storageAdapter.resolveProjectReferenceByPath({
                  projectPath,
                }),
                projectPath,
              );
              await ensureCompatibleCreatorVersionForReference(reference);
              return normalizeProjectInfo(
                await storageAdapter.readProjectInfoByReference({
                  reference,
                  db,
                }),
              );
            }

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
