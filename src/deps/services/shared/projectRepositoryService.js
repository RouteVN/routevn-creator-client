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
import { loadProjectionGap } from "./collab/projectionGapState.js";
import { loadRepositoryEventsFromClientStore } from "./collab/clientStoreHistory.js";
import { UNSUPPORTED_PROJECT_STORE_FORMAT_MESSAGE } from "../../../internal/projectOpenErrors.js";

const logRepositoryOpen = (event, payload = {}) => {
  console.info("[projectRepositoryService]", {
    event,
    ...payload,
  });
};

const summarizeRepositoryStateForDiagnostics = (state) => {
  const scenes = state?.scenes?.items || {};
  const sceneItems = Object.values(scenes);
  const sectionItems = sceneItems.flatMap((scene) =>
    Object.values(scene?.sections?.items || {}),
  );
  const lineCount = sectionItems.reduce(
    (total, section) => total + Object.keys(section?.lines?.items || {}).length,
    0,
  );

  return {
    sceneCount: sceneItems.length,
    sectionCount: sectionItems.length,
    lineCount,
    initialSceneId: state?.story?.initialSceneId,
  };
};

const flushRepositoryMainCheckpoint = async (repository) => {
  await repository.flushMainCheckpoint();
};

const flushRepositoryForRelease = async (repository) => {
  await repository.flushMaterializedViews();
};

const discardReusableMainCheckpoint = async (store) => {
  await store.deleteMaterializedViewCheckpoint({
    viewName: MAIN_VIEW_NAME,
    partition: MAIN_PARTITION,
  });
};

export const createProjectRepositoryService = ({
  router,
  db,
  creatorVersion,
  idGenerator = generateBaseId,
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

  const generateId = () => idGenerator();

  const createIncompatibleProjectVersionError = (projectVersion) => {
    const displayedProjectVersion =
      Number.isFinite(projectVersion) && projectVersion > 0
        ? String(projectVersion)
        : "0";

    return new Error(
      `You're trying to open an incompatible project with version ${displayedProjectVersion} using RouteVN Creator project format ${CURRENT_CREATOR_VERSION}. For assistance, please reach out to RouteVN staff for support.`,
    );
  };

  const createIncompatibleProjectionGapError = (projectionGap = {}) => {
    const commandType =
      typeof projectionGap?.commandType === "string" &&
      projectionGap.commandType.length > 0
        ? projectionGap.commandType
        : "unknown";
    const remoteSchemaVersion = Number(projectionGap?.remoteSchemaVersion);
    const supportedSchemaVersion = Number(
      projectionGap?.supportedSchemaVersion,
    );
    const hasSchemaVersions =
      Number.isFinite(remoteSchemaVersion) &&
      remoteSchemaVersion > 0 &&
      Number.isFinite(supportedSchemaVersion) &&
      supportedSchemaVersion > 0;
    const detailMessage =
      typeof projectionGap?.message === "string" &&
      projectionGap.message.length > 0
        ? projectionGap.message
        : undefined;

    let message =
      "This project contains committed changes that this RouteVN Creator build cannot project safely. Update RouteVN Creator before opening the project.";

    if (hasSchemaVersions) {
      message += ` Last incompatible command '${commandType}' uses schemaVersion ${remoteSchemaVersion}, while this client supports ${supportedSchemaVersion}.`;
    } else {
      message += ` Last incompatible command '${commandType}'.`;
    }

    if (detailMessage) {
      message += ` ${detailMessage}`;
    }

    const error = new Error(message);
    error.name = "ProjectProjectionGapIncompatibleError";
    error.code = "project_projection_gap_incompatible";
    error.details = {
      projectionGap: structuredClone(projectionGap),
    };
    return error;
  };

  const createUnsupportedProjectStoreFormatError = (error) => {
    const nextError = new Error(UNSUPPORTED_PROJECT_STORE_FORMAT_MESSAGE);
    nextError.name = "ProjectStoreFormatUnsupportedError";
    nextError.code = "project_store_format_unsupported";
    if (error?.details && typeof error.details === "object") {
      nextError.details = structuredClone(error.details);
    }
    nextError.cause = error;
    return nextError;
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

    await storageAdapter.evictStoreByReference({ reference });
  };

  const releaseRepositoryByReference = async (reference) => {
    const cacheKey = reference?.cacheKey;
    if (!cacheKey) {
      return;
    }

    const repository = repositoriesByCacheKey.get(cacheKey);
    if (repository) {
      try {
        await flushRepositoryForRelease(repository);
      } catch {}
    }

    await evictCachedReference(reference);
  };

  const releaseCurrentRepository = async () => {
    if (!currentReference) {
      return;
    }

    await releaseRepositoryByReference(currentReference);
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
    emitRepositoryLoadStage(onLoadStage, {
      stage: "load_main_checkpoint",
      label: "Loading project state checkpoint...",
      cacheKey,
    });
    const checkpoint = await store.loadMaterializedViewCheckpoint({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
    logRepositoryOpen("load_main_checkpoint", {
      cacheKey,
      checkpoint: checkpoint
        ? {
            viewVersion: checkpoint.viewVersion,
            lastCommittedId: checkpoint.lastCommittedId,
            updatedAt: checkpoint.updatedAt,
            historyStats: checkpoint?.meta?.historyStats
              ? structuredClone(checkpoint.meta.historyStats)
              : undefined,
            stateSummary: summarizeRepositoryStateForDiagnostics(
              checkpoint.value,
            ),
          }
        : undefined,
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
        logRepositoryOpen("discard_main_checkpoint_history_mismatch", {
          cacheKey,
          checkpointHistoryStats,
          currentHistoryStats,
        });
        await discardReusableMainCheckpoint(store);
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
        logRepositoryOpen("discard_main_checkpoint_revision_mismatch", {
          cacheKey,
          checkpointRevision,
          currentHistoryLength,
        });
        await discardReusableMainCheckpoint(store);
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
    logRepositoryOpen("reuse_main_checkpoint", {
      cacheKey,
      currentHistoryStats,
      initialRevision: Math.max(
        0,
        Math.floor(Number(checkpoint.lastCommittedId) || 0),
      ),
      stateSummary: summarizeRepositoryStateForDiagnostics(checkpoint.value),
    });
    return {
      checkpoint,
      currentHistoryStats,
      initialRevision: Math.max(
        0,
        Math.floor(Number(checkpoint.lastCommittedId) || 0),
      ),
    };
  };

  const getCurrentRepositoryHistoryStats = async (store) => {
    const currentHistoryStats = await store.getRepositoryHistoryStats();
    const committedCount = Number(currentHistoryStats?.committedCount) || 0;
    const draftCount = Number(currentHistoryStats?.draftCount) || 0;

    return {
      currentHistoryStats,
      historyLength: Math.max(0, committedCount + draftCount),
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
        let store;
        try {
          store = await storageAdapter.createStore({ reference, db });
        } catch (error) {
          if (error?.code === "project_store_format_unsupported") {
            throw createUnsupportedProjectStoreFormatError(error);
          }
          throw error;
        }
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

  const assertProjectPathSupport = () => {
    if (!storageAdapter.resolveProjectReferenceByPath) {
      throw new Error(
        "Project path operations are not supported on this platform.",
      );
    }
  };

  const resolveProjectReferenceByPath = async (projectPath) => {
    assertProjectPathSupport();
    return normalizeReference(
      await storageAdapter.resolveProjectReferenceByPath({
        projectPath,
      }),
      projectPath,
    );
  };

  const getStoreByPath = async (projectPath) => {
    const reference = await resolveProjectReferenceByPath(projectPath);
    return getStoreByReference(reference);
  };

  const readCreatorVersionFromStore = async (store) => {
    const storedCreatorVersion = await store.app.get(CREATOR_VERSION_KEY);
    if (!Number.isFinite(storedCreatorVersion)) {
      return undefined;
    }

    return storedCreatorVersion;
  };

  const readCreatorVersionFromReference = async (reference) => {
    const storedCreatorVersion =
      await storageAdapter.readCreatorVersionByReference({
        reference,
        db,
      });
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

  const ensureCompatibleCreatorVersionForReference = async (reference) => {
    const creatorVersion = await readCreatorVersionFromReference(reference);

    if (
      creatorVersion !== undefined &&
      creatorVersion !== CURRENT_CREATOR_VERSION
    ) {
      throw createIncompatibleProjectVersionError(creatorVersion);
    }
  };

  const ensureProjectionGapCompatible = async (store) => {
    const projectionGap = await loadProjectionGap(store);
    if (projectionGap) {
      throw createIncompatibleProjectionGapError(projectionGap);
    }

    return undefined;
  };

  const ensureStoreOpenCompatible = async (store) => {
    await ensureCompatibleCreatorVersion(store);
    await ensureProjectionGapCompatible(store);
  };

  const readProjectInfoFromStore = async (
    store,
    { fallbackProjectId } = {},
  ) => {
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
    await ensureStoreOpenCompatible(store);
  };

  const updateProjectInfoByProjectId = async (projectId, patch) => {
    const store = await getStoreByProject(projectId);
    await ensureStoreOpenCompatible(store);
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
            await ensureStoreOpenCompatible(store);
            let events;
            let initialRevision;
            let currentHistoryStats;
            const reusableMainCheckpoint = await loadReusableMainCheckpoint({
              store,
              cacheKey: reference.cacheKey,
              onLoadStage,
            });

            if (reusableMainCheckpoint) {
              initialRevision = reusableMainCheckpoint.initialRevision;
              currentHistoryStats = reusableMainCheckpoint.currentHistoryStats;
              emitRepositoryLoadStage(onLoadStage, {
                stage: "reuse_main_checkpoint",
                label: "Using project state checkpoint...",
                cacheKey: reference.cacheKey,
                revision: initialRevision,
              });
            } else {
              emitRepositoryLoadStage(onLoadStage, {
                stage: "read_project_history_stats",
                label: "Reading project history...",
                cacheKey: reference.cacheKey,
              });
              const history = await getCurrentRepositoryHistoryStats(store);
              currentHistoryStats = history.currentHistoryStats;
              initialRevision = history.historyLength;
              emitRepositoryLoadStage(onLoadStage, {
                stage: "project_history_ready",
                label: "Reading project history...",
                cacheKey: reference.cacheKey,
                eventCount: initialRevision,
              });
            }

            emitRepositoryLoadStage(onLoadStage, {
              stage: "prepare_project_events",
              label: "Preparing project events...",
              cacheKey: reference.cacheKey,
              eventCount: initialRevision || 0,
            });
            const nextEvents = await collabAdapter.beforeCreateRepository({
              projectId: reference.projectId,
              reference,
              store,
              historyStats: currentHistoryStats,
              initialRevision,
              events,
            });
            if (Array.isArray(nextEvents)) {
              events = nextEvents;
            }

            emitRepositoryLoadStage(onLoadStage, {
              stage: "build_repository_state",
              label: "Building project state...",
              cacheKey: reference.cacheKey,
              eventCount: Array.isArray(events)
                ? events.length
                : initialRevision,
            });
            const repository = await createProjectRepository({
              projectId: reference.repositoryProjectId,
              store,
              events,
              historyLoaded: Array.isArray(events),
              initialRevision,
              historyStats: currentHistoryStats,
              loadEvents: async () =>
                loadRepositoryEventsFromClientStore({
                  store,
                  projectId: reference.repositoryProjectId,
                  onProgress: onEventLoadProgress,
                }),
              onHydrationProgress,
            });
            emitRepositoryLoadStage(onLoadStage, {
              stage: "validate_repository_state",
              label: "Validating project state...",
              cacheKey: reference.cacheKey,
            });
            assertSupportedProjectState(repository.getState());

            if (reference.projectId) {
              storesByProject.set(reference.projectId, store);
              referencesByProject.set(reference.projectId, reference);
            }

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

            try {
              await flushRepositoryMainCheckpoint(repository);
            } catch (error) {
              console.warn("Failed to flush project repository checkpoint", {
                cacheKey: reference.cacheKey,
                error: error?.message || String(error),
              });
            }

            logRepositoryOpen("repository_open_complete", {
              cacheKey: reference.cacheKey,
              projectId: reference.projectId,
              revision: repository.getRevision(),
              stateSummary: summarizeRepositoryStateForDiagnostics(
                repository.getState(),
              ),
              historyStats: currentHistoryStats,
            });

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

  const getRepositoryByPath = async (projectPath) => {
    const reference = await resolveProjectReferenceByPath(projectPath);
    return getRepositoryByReference(reference);
  };

  const ensureProjectCompatibleByPath = async (projectPath) => {
    const reference = await resolveProjectReferenceByPath(projectPath);
    await ensureCompatibleCreatorVersionForReference(reference);
    const store = await getStoreByPath(projectPath);
    await ensureStoreOpenCompatible(store);
  };

  const getProjectInfoByPath = async (projectPath) => {
    const reference = await resolveProjectReferenceByPath(projectPath);
    await ensureCompatibleCreatorVersionForReference(reference);
    return normalizeProjectInfo(
      await storageAdapter.readProjectInfoByReference({
        reference,
        db,
      }),
    );
  };

  const updateProjectInfoByPath = async (projectPath, patch) => {
    const store = await getStoreByPath(projectPath);
    await ensureStoreOpenCompatible(store);
    return writeProjectInfoToStore({
      store,
      patch,
    });
  };

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
    releaseCurrentRepository,
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
    async getRepositoryByPath(projectPath) {
      return getRepositoryByPath(projectPath);
    },
    async ensureProjectCompatibleByPath(projectPath) {
      return ensureProjectCompatibleByPath(projectPath);
    },
    async getProjectInfoByPath(projectPath) {
      return getProjectInfoByPath(projectPath);
    },
    async updateProjectInfoByPath(projectPath, patch) {
      return updateProjectInfoByPath(projectPath, patch);
    },
  };
};
