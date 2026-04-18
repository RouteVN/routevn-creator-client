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

  const loadRepositoryState = async (untilEventIndex) => {
    const repository = await repositoryService.ensureRepository();
    return repository.loadState(untilEventIndex);
  };

  const clearActiveSceneId = async () => {
    const repository = await repositoryService.ensureRepository();
    await repository.clearActiveSceneId();
  };

  const setActiveSceneId = async (sceneId) => {
    const repository = await repositoryService.ensureRepository();
    await repository.setActiveSceneId(sceneId);
  };

  const loadSceneOverviews = async ({ sceneIds = [] } = {}) => {
    const repository = await repositoryService.ensureRepository();
    return repository.loadSceneOverviews({ sceneIds });
  };

  const getSceneOverview = async (sceneId) => {
    const repository = await repositoryService.ensureRepository();
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
    const repository = await repositoryService.ensureRepository();
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
    await repositoryService.ensureRepository();

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

  const deleteSceneIfUnused = async ({ sceneId } = {}) => {
    const usage = await checkSceneDeletionUsage({ sceneId });
    if (usage.isUsed) {
      return { deleted: false, usage };
    }

    const deleteResult = await collabService.commandApi.deleteSceneItem({
      sceneIds: [sceneId],
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
    ensureRepository: repositoryService.ensureRepository,
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
    createBundle: exportService.createBundle,
    exportProject: exportService.exportProject,
    downloadBundle: exportService.downloadBundle,
    createDistributionZip: exportService.createDistributionZip,
    createDistributionZipStreamed: exportService.createDistributionZipStreamed,
    promptDistributionZipPath: exportService.promptDistributionZipPath,
    createDistributionZipStreamedToPath:
      exportService.createDistributionZipStreamedToPath,
  };
};
