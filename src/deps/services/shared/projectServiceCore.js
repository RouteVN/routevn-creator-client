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
        getProjectMetadataFromEntries:
          repositoryService.getProjectMetadataFromEntries,
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

  return {
    getRepository: repositoryService.getRepository,
    getRepositoryById: repositoryService.getRepositoryById,
    getAdapterById: repositoryService.getAdapterById,
    getEnsuredProjectId: repositoryService.getEnsuredProjectId,
    ensureRepository: repositoryService.ensureRepository,
    subscribeProjectState(listener, options) {
      return repositoryService.subscribeProjectState((repositoryState) => {
        const projectId = repositoryState.project.id;
        const domainState = projectRepositoryStateToDomainState({
          repositoryState,
          projectId,
        });

        listener({
          projectId,
          repositoryState,
          domainState,
        });
      }, options);
    },
    ...("getRepositoryByPath" in repositoryService
      ? {
          getRepositoryByPath: repositoryService.getRepositoryByPath,
        }
      : {}),
    ...collabService.commandApi,
    addVersionToProject: collabService.addVersionToProject,
    deleteVersionFromProject: collabService.deleteVersionFromProject,
    deleteResourceItemIfUnused: collabService.deleteResourceItemIfUnused,
    async initializeProject(payload) {
      return storageAdapter.initializeProject(payload);
    },
    createCollabSession: collabService.createCollabSession,
    getCollabSession: collabService.getCollabSession,
    getCollabSessionMode: collabService.getCollabSessionMode,
    stopCollabSession: collabService.stopCollabSession,
    submitCommand: collabService.submitCommand,
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
    createBundle: exportService.createBundle,
    exportProject: exportService.exportProject,
    downloadBundle: exportService.downloadBundle,
    createDistributionZip: exportService.createDistributionZip,
    createDistributionZipStreamed: exportService.createDistributionZipStreamed,
  };
};
