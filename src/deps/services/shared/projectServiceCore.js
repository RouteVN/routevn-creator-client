import { createProjectAssetService } from "./projectAssetService.js";
import { createProjectCollabCore } from "./projectCollabCore.js";
import { createProjectExportService } from "./projectExportService.js";
import { createProjectRepositoryService } from "./projectRepositoryService.js";
import { importImageFile as importProjectImageFile } from "./resourceImports.js";
import {
  checkProjectResourceUsage,
  checkSceneDeleteUsage,
} from "./resourceUsage.js";
import { projectRepositoryStateToDomainState } from "../../../internal/project/projection.js";
import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
  normalizeLayoutSchemaVersion,
} from "../../../internal/project/layout.js";

export const createProjectServiceCore = ({
  router,
  db,
  filePicker,
  idGenerator,
  now = () => Date.now(),
  collabLog,
  creatorVersion,
  storageAdapter,
  fileAdapter,
  collabAdapter,
}) => {
  const repositoryService = createProjectRepositoryService({
    router,
    db,
    creatorVersion,
    idGenerator,
    storageAdapter,
    collabAdapter,
  });

  const assetService = createProjectAssetService({
    idGenerator,
    fileAdapter,
    getCurrentStore: repositoryService.getCachedStore,
    getCurrentReference: repositoryService.getCachedReference,
    getStoreByProject: repositoryService.getStoreByProject,
    getCurrentRepositoryState: () =>
      repositoryService.getCachedRepository().getState(),
  });

  const collabService = createProjectCollabCore({
    router,
    idGenerator,
    now,
    collabLog,
    getCurrentRepository: repositoryService.getCurrentRepository,
    getCachedRepository: repositoryService.getCachedRepository,
    getRepositoryByProject: repositoryService.getRepositoryByProject,
    getAdapterByProject: repositoryService.getStoreByProjectSync,
    createSessionForProject: (payload) =>
      collabAdapter.createSessionForProject({
        ...payload,
        getRepositoryByProject: repositoryService.getRepositoryByProject,
        getStoreByProject: repositoryService.getStoreByProject,
        getProjectInfoByProjectId: repositoryService.getProjectInfoByProjectId,
        resolveProjectReferenceByProjectId:
          repositoryService.resolveProjectReferenceByProjectId,
        collabLog,
      }),
    createTransport: collabAdapter.createTransport,
    onEnsureLocalSession: collabAdapter.onEnsureLocalSession,
    onSessionCleared: collabAdapter.onSessionCleared,
    onSessionTransportUpdated: collabAdapter.onSessionTransportUpdated,
  });

  const exportService = createProjectExportService({
    fileAdapter,
    filePicker,
    getCurrentReference: repositoryService.getCachedReference,
    getFileContent: assetService.getFileContent,
  });

  const getCurrentProjectId = () =>
    repositoryService.getEnsuredProjectId() || router.getPayload()?.p;

  const getRepositoryState = () => {
    const repository = repositoryService.getCachedRepository();
    return repository.getState();
  };

  const getRepositoryRevision = () => {
    const repository = repositoryService.getCachedRepository();
    return repository.getRevision();
  };

  const selectLayoutsRequiringSchemaUpgrade = (state) =>
    Object.entries(state?.layouts?.items || {})
      .filter(
        ([, layout]) =>
          layout?.type === "layout" &&
          normalizeLayoutSchemaVersion(layout.layoutSchemaVersion) <
            CURRENT_LAYOUT_SCHEMA_VERSION,
      )
      .map(([layoutId]) => layoutId);

  const ensureLayoutSchemaVersion = async (repository) => {
    if (typeof repository?.getState !== "function") {
      return;
    }

    const layoutIds = selectLayoutsRequiringSchemaUpgrade(
      repository.getState(),
    );
    if (layoutIds.length === 0) {
      return;
    }

    const result = await collabService.commandApi.upgradeLayoutSchemaVersion({
      layoutIds,
      targetSchemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
    });
    if (result?.valid === false) {
      throw new Error(
        result.error?.message || "Failed to upgrade layout schema version.",
      );
    }
  };

  const ensureRepository = async (options = {}) => {
    const repository = await repositoryService.ensureRepository(options);
    await ensureLayoutSchemaVersion(repository);
    return repository;
  };

  const loadRepositoryState = async (untilEventIndex) => {
    const repository = await ensureRepository();
    return repository.loadState(untilEventIndex);
  };

  const clearActiveSceneId = async () => {
    const repository = await ensureRepository();
    await repository.clearActiveSceneId();
  };

  const setActiveSceneId = async (sceneId) => {
    const repository = await ensureRepository();
    await repository.setActiveSceneId(sceneId);
  };

  const loadSceneOverviews = async ({ sceneIds = [] } = {}) => {
    const repository = await ensureRepository();
    return repository.loadSceneOverviews({ sceneIds });
  };

  const getSceneOverview = async (sceneId) => {
    const repository = await ensureRepository();
    return repository.getSceneOverview(sceneId);
  };

  const getDomainState = () => {
    const repositoryState = getRepositoryState();
    const projectId = getCurrentProjectId() || "unknown-project";
    return projectRepositoryStateToDomainState({
      repositoryState,
      projectId,
    });
  };

  const checkResourceUsage = async ({ itemId, checkTargets = [] } = {}) => {
    const repository = await ensureRepository();
    const store = repositoryService.getCachedStore();
    const projectId = getCurrentProjectId() || "unknown-project";

    return checkProjectResourceUsage({
      repository,
      store,
      projectId,
      itemId,
      checkTargets,
    });
  };

  const checkSceneDeletionUsage = async ({ sceneId } = {}) => {
    await ensureRepository();

    const state = getDomainState();
    const sceneIds = Object.keys(state?.scenes ?? {}).filter(
      (candidateSceneId) =>
        state?.scenes?.[candidateSceneId]?.type !== "folder",
    );
    const sceneOverviewsById = await loadSceneOverviews({
      sceneIds,
    });

    return checkSceneDeleteUsage({
      state,
      sceneOverviewsById,
      sceneId,
    });
  };

  const selectVoiceIdsOwnedByScene = (sceneId) => {
    const state = getRepositoryState();
    return Object.entries(state?.voices?.items || {})
      .filter(
        ([, voice]) => voice?.type === "voice" && voice.sceneId === sceneId,
      )
      .map(([voiceId]) => voiceId);
  };

  const deleteSceneIfUnused = async ({ sceneId } = {}) => {
    const usage = await checkSceneDeletionUsage({ sceneId });
    if (usage.isUsed) {
      return { deleted: false, usage };
    }

    const voiceIds = selectVoiceIdsOwnedByScene(sceneId);
    const deleteResult = await collabService.commandApi.deleteSceneItem({
      sceneIds: [sceneId],
      voiceIds,
    });
    if (deleteResult?.valid === false) {
      return { deleted: false, usage, deleteResult };
    }

    return {
      deleted: true,
      usage,
      deleteResult,
    };
  };

  const releaseProjectRuntime = async (projectId) => {
    const targetProjectId =
      projectId ||
      repositoryService.getEnsuredProjectId() ||
      router.getPayload()?.p;

    if (targetProjectId) {
      await collabService.stopCollabSession(targetProjectId);
      await repositoryService.releaseRepositoryByProjectId(targetProjectId);
      return;
    }

    await repositoryService.releaseCurrentRepository();
  };

  return {
    getRepository: repositoryService.getRepository,
    getRepositoryById: repositoryService.getRepositoryById,
    getAdapterById: repositoryService.getAdapterById,
    getEnsuredProjectId: repositoryService.getEnsuredProjectId,
    releaseCurrentRepository: repositoryService.releaseCurrentRepository,
    releaseProjectRuntime,
    ensureRepository,
    ensureProjectCompatibleById:
      repositoryService.ensureProjectCompatibleByProjectId,
    subscribeProjectState(listener, options) {
      const targetProjectId = options?.projectId || getCurrentProjectId();
      return repositoryService.subscribeProjectState(
        ({ repositoryState, revision }) => {
          const projectId = targetProjectId || getCurrentProjectId();
          const domainState = projectRepositoryStateToDomainState({
            repositoryState,
            projectId,
          });

          listener({
            projectId,
            repositoryState,
            domainState,
            revision,
          });
        },
        options,
      );
    },
    getRepositoryByPath: repositoryService.getRepositoryByPath,
    ...collabService.commandApi,
    getState: getDomainState,
    getDomainState,
    getRepositoryState,
    getRepositoryRevision,
    loadRepositoryState,
    setActiveSceneId,
    clearActiveSceneId,
    checkResourceUsage,
    checkSceneDeletionUsage,
    deleteSceneIfUnused,
    loadSceneOverviews,
    getSceneOverview,
    getCurrentProjectInfo: repositoryService.getCurrentProjectInfo,
    updateCurrentProjectInfo: repositoryService.updateCurrentProjectInfo,
    updateProjectInfoById: repositoryService.updateProjectInfoByProjectId,
    addVersionToProject: collabService.addVersionToProject,
    updateVersionInProject: collabService.updateVersionInProject,
    deleteVersionFromProject: collabService.deleteVersionFromProject,
    deleteImageIfUnused: collabService.deleteImageIfUnused,
    deleteSoundIfUnused: collabService.deleteSoundIfUnused,
    deleteVideoIfUnused: collabService.deleteVideoIfUnused,
    async initializeProject(payload) {
      await repositoryService.releaseRepositoryByProjectId(payload?.projectId);
      return storageAdapter.initializeProject(payload);
    },
    createCollabSession: collabService.createCollabSession,
    ensureCommandSessionForProject:
      collabService.ensureCommandSessionForProject,
    getCollabSession: collabService.getCollabSession,
    getCollabSessionMode: collabService.getCollabSessionMode,
    stopCollabSession: collabService.stopCollabSession,
    submitCommand: collabService.submitCommand,
    storeFile: assetService.storeFile,
    storeFileForProject: assetService.storeFileForProject,
    uploadFiles: assetService.uploadFiles,
    async importImageFile({ file, parentId, imageId } = {}) {
      return importProjectImageFile({
        file,
        parentId,
        imageId,
        uploadFiles: assetService.uploadFiles,
        createImage: collabService.commandApi.createImage,
      });
    },
    getFileContent: assetService.getFileContent,
    downloadMetadata: assetService.downloadMetadata,
    loadFontFile: assetService.loadFontFile,
    detectFileType: assetService.detectFileType,
    getFileByProjectId: assetService.getFileByProjectId,
    ensureProjectCompatibleByPath:
      repositoryService.ensureProjectCompatibleByPath,
    getProjectInfoByPath: repositoryService.getProjectInfoByPath,
    updateProjectInfoByPath: repositoryService.updateProjectInfoByPath,
    createDistributionZipStreamed: exportService.createDistributionZipStreamed,
    promptDistributionZipPath: exportService.promptDistributionZipPath,
    createDistributionZipStreamedToPath:
      exportService.createDistributionZipStreamedToPath,
  };
};
