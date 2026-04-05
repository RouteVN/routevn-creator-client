import { createProjectAssetService } from "./projectAssetService.js";
import { createProjectCollabCore } from "./projectCollabCore.js";
import { createProjectExportService } from "./projectExportService.js";
import { createProjectRepositoryService } from "./projectRepositoryService.js";
import { projectRepositoryStateToDomainState } from "../../../internal/project/projection.js";

export const createProjectServiceCore = ({
  router,
  db,
  filePicker,
  idGenerator,
  now = () => Date.now(),
  collabLog,
  storageAdapter,
  fileAdapter,
  collabAdapter,
}) => {
  const repositoryService = createProjectRepositoryService({
    router,
    db,
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

  const loadSceneOverviews = async ({ sceneIds = [] } = {}) => {
    const repository = await repositoryService.ensureRepository();
    if (typeof repository.loadSceneOverviews !== "function") {
      return {};
    }
    return repository.loadSceneOverviews({ sceneIds });
  };

  const getSceneOverview = async (sceneId) => {
    const repository = await repositoryService.ensureRepository();
    if (typeof repository.getSceneOverview !== "function") {
      return undefined;
    }
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

  return {
    getRepository: repositoryService.getRepository,
    getRepositoryById: repositoryService.getRepositoryById,
    getAdapterById: repositoryService.getAdapterById,
    getEnsuredProjectId: repositoryService.getEnsuredProjectId,
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
    ...("getRepositoryByPath" in repositoryService
      ? {
          getRepositoryByPath: repositoryService.getRepositoryByPath,
        }
      : {}),
    ...collabService.commandApi,
    getState: getDomainState,
    getDomainState,
    getRepositoryState,
    getRepositoryRevision,
    loadSceneOverviews,
    getSceneOverview,
    getCurrentProjectInfo: repositoryService.getCurrentProjectInfo,
    updateCurrentProjectInfo: repositoryService.updateCurrentProjectInfo,
    addVersionToProject: collabService.addVersionToProject,
    updateVersionInProject: collabService.updateVersionInProject,
    deleteVersionFromProject: collabService.deleteVersionFromProject,
    deleteImageIfUnused: collabService.deleteImageIfUnused,
    deleteSoundIfUnused: collabService.deleteSoundIfUnused,
    deleteVideoIfUnused: collabService.deleteVideoIfUnused,
    async initializeProject(payload) {
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
    uploadFiles: assetService.uploadFiles,
    getFileContent: assetService.getFileContent,
    downloadMetadata: assetService.downloadMetadata,
    loadFontFile: assetService.loadFontFile,
    detectFileType: assetService.detectFileType,
    ...("getFileByProjectId" in assetService
      ? {
          getFileByProjectId: assetService.getFileByProjectId,
        }
      : {}),
    ...("getProjectInfoByPath" in repositoryService
      ? {
          ensureProjectCompatibleByPath:
            repositoryService.ensureProjectCompatibleByPath,
          getProjectInfoByPath: repositoryService.getProjectInfoByPath,
          updateProjectInfoByPath: repositoryService.updateProjectInfoByPath,
        }
      : {}),
    createBundle: exportService.createBundle,
    exportProject: exportService.exportProject,
    downloadBundle: exportService.downloadBundle,
    createDistributionZip: exportService.createDistributionZip,
    createDistributionZipStreamed: exportService.createDistributionZipStreamed,
  };
};
