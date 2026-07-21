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
import {
  extractFontWeightCapabilities,
  isStrictFontMimeType,
} from "../../../internal/fontCapabilities.js";
import { normalizeFontFileType } from "../../../internal/fileTypes.js";

// Exceptional shipped-data repair. Keep its marker, legacy predicates,
// collaboration gate, and lifecycle aligned with
// docs/platform/14-project-content-patches.md.
const DEFAULT_MENU_TEXT_STYLES_PATCH_KEY =
  "contentPatch.defaultMenuTextStyles-1-9-1";
const FONT_WEIGHT_METADATA_PATCH_KEY = "contentPatch.fontWeightMetadata-1-10-0";
const NON_RETRYABLE_FONT_INSPECTION_ERROR_CODES = new Set([
  "unsupported_font_format",
  "invalid_font_data",
  "missing_font_weight",
  "invalid_font_weight",
]);
const MENU_ITEM_TEXT_STYLE_ID = "e2WbW3vcPZR9";
const MENU_ITEM_SELECTED_TEXT_STYLE_ID = "saV5A4pkvHRb";
const MENU_PAGE_LAYOUT_ID = "fKr5fa67MQWh";
const LOAD_MENU_ELEMENT_ID = "icn4dknq2kyp";
const LEGACY_DIALOGUE_CONTENT_TEXT_STYLE_ID = "5rwEfyx2GBEi";
const RELEASE_PLATFORM_IDS = ["web", "windows", "macos"];

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
  shouldApplyProjectContentPatchesOnEnsure = () => true,
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
    resolveFileMetadata: (fileId) =>
      repositoryService.getCachedRepository().getFileRecord(fileId),
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

  const contentPatchesByProject = new Map();

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

  const patchDefaultMenuItemSelectedTextStyle = async (repositoryState) => {
    const selectedTextStyle =
      repositoryState?.textStyles?.items?.[MENU_ITEM_SELECTED_TEXT_STYLE_ID];
    if (selectedTextStyle?.fontWeight !== "400") {
      return;
    }

    const result = await collabService.commandApi.updateTextStyle({
      textStyleId: MENU_ITEM_SELECTED_TEXT_STYLE_ID,
      data: {
        fontWeight: "700",
      },
    });
    if (result?.valid === false) {
      throw new Error(
        result.error?.message ||
          "Failed to patch the default selected menu text style.",
      );
    }
  };

  const patchDefaultMenuLoadTextStyle = async (repositoryState) => {
    const menuItemTextStyle =
      repositoryState?.textStyles?.items?.[MENU_ITEM_TEXT_STYLE_ID];
    const menuPage = repositoryState?.layouts?.items?.[MENU_PAGE_LAYOUT_ID];
    const loadMenuElement = menuPage?.elements?.items?.[LOAD_MENU_ELEMENT_ID];

    if (
      !menuItemTextStyle ||
      loadMenuElement?.textStyleId !== LEGACY_DIALOGUE_CONTENT_TEXT_STYLE_ID
    ) {
      return;
    }

    const result = await collabService.commandApi.updateLayoutElement({
      layoutId: MENU_PAGE_LAYOUT_ID,
      elementId: LOAD_MENU_ELEMENT_ID,
      data: {
        textStyleId: MENU_ITEM_TEXT_STYLE_ID,
      },
      replace: false,
    });
    if (result?.valid === false) {
      throw new Error(
        result.error?.message || "Failed to patch the default Load menu text.",
      );
    }
  };

  const applyDefaultMenuTextStylesPatch = async (repository) => {
    if (typeof repository?.getState !== "function") {
      return;
    }

    const store = repositoryService.getCachedStore();
    const isApplied = await store.app.get(DEFAULT_MENU_TEXT_STYLES_PATCH_KEY);
    if (isApplied === true) {
      return;
    }

    const repositoryState = repository.getState();
    await patchDefaultMenuItemSelectedTextStyle(repositoryState);
    await patchDefaultMenuLoadTextStyle(repositoryState);
    await store.app.set(DEFAULT_MENU_TEXT_STYLES_PATCH_KEY, true);
  };

  const hasCompleteFontWeightMetadata = (font) =>
    font.minWeight !== undefined &&
    font.defaultWeight !== undefined &&
    font.maxWeight !== undefined;

  const selectFontsRequiringWeightMetadata = (repositoryState) => {
    const fonts = repositoryState?.fonts?.items ?? {};
    const files = repositoryState?.files?.items ?? {};
    const selectedFonts = [];

    for (const [fontId, font] of Object.entries(fonts)) {
      if (
        font?.type !== "font" ||
        !font.fileId ||
        hasCompleteFontWeightMetadata(font)
      ) {
        continue;
      }

      const fileRecord = files[font.fileId];
      const mimeType = normalizeFontFileType({
        fileType: fileRecord?.mimeType ?? font.fileType,
        fileName: font.name,
      });
      if (!isStrictFontMimeType(mimeType)) {
        continue;
      }

      selectedFonts.push({ fontId, font });
    }

    return selectedFonts;
  };

  const inspectStoredFontWeightMetadata = async (font) => {
    let content;
    try {
      content = await assetService.getFileContent(font.fileId);
      const response = await fetch(content.url);
      if (!response.ok) {
        throw new Error(`Failed to read font file (HTTP ${response.status}).`);
      }
      return extractFontWeightCapabilities(await response.arrayBuffer());
    } finally {
      content?.revoke?.();
    }
  };

  const patchFontWeightMetadata = async (repositoryState) => {
    const fonts = selectFontsRequiringWeightMetadata(repositoryState);

    for (const { fontId, font } of fonts) {
      let capabilities;
      try {
        capabilities = await inspectStoredFontWeightMetadata(font);
      } catch (error) {
        if (NON_RETRYABLE_FONT_INSPECTION_ERROR_CODES.has(error?.code)) {
          console.warn(
            `Could not migrate font weight metadata for ${font.fileId}.`,
            error,
          );
          continue;
        }
        throw error;
      }

      const result = await collabService.commandApi.updateFont({
        fontId,
        data: {
          minWeight: capabilities.minWeight,
          defaultWeight: capabilities.defaultWeight,
          maxWeight: capabilities.maxWeight,
        },
      });
      if (result?.valid === false) {
        throw new Error(
          result.error?.message || "Failed to migrate font weight metadata.",
        );
      }
    }
  };

  const applyFontWeightMetadataPatch = async (repository) => {
    if (typeof repository?.getState !== "function") {
      return;
    }

    const store = repositoryService.getCachedStore();
    const isApplied = await store.app.get(FONT_WEIGHT_METADATA_PATCH_KEY);
    if (isApplied === true) {
      return;
    }

    await patchFontWeightMetadata(repository.getState());
    await store.app.set(FONT_WEIGHT_METADATA_PATCH_KEY, true);
  };

  const applyProjectContentPatches = async (repository) => {
    await applyDefaultMenuTextStylesPatch(repository);
    await applyFontWeightMetadataPatch(repository);
  };

  const ensureContentPatches = async (repository) => {
    const projectId = getCurrentProjectId();
    const existingPatches = contentPatchesByProject.get(projectId);
    if (existingPatches) {
      return existingPatches;
    }

    const patches = applyProjectContentPatches(repository);
    contentPatchesByProject.set(projectId, patches);

    try {
      await patches;
    } finally {
      if (contentPatchesByProject.get(projectId) === patches) {
        contentPatchesByProject.delete(projectId);
      }
    }
  };

  const ensureProjectContentPatches = async () => {
    const repository = await repositoryService.ensureRepository();
    await ensureLayoutSchemaVersion(repository);
    await ensureContentPatches(repository);
    return repository;
  };

  const ensureRepository = async (options = {}) => {
    const repository = await repositoryService.ensureRepository(options);
    await ensureLayoutSchemaVersion(repository);
    const shouldApplyContentPatches =
      await shouldApplyProjectContentPatchesOnEnsure({
        projectId: getCurrentProjectId(),
      });
    if (shouldApplyContentPatches) {
      await ensureContentPatches(repository);
    }
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
    const [sceneOverviewsById, sceneTextStatsById] = await Promise.all([
      repository.loadSceneOverviews({ sceneIds }),
      repository.loadSceneTextStats({ sceneIds }),
    ]);

    for (const overview of Object.values(sceneOverviewsById)) {
      delete overview.textStats;
    }
    for (const [sceneId, textStats] of Object.entries(sceneTextStatsById)) {
      if (sceneOverviewsById[sceneId]) {
        sceneOverviewsById[sceneId].textStats = textStats;
      }
    }

    return sceneOverviewsById;
  };

  const getSceneOverview = async (sceneId) => {
    const repository = await ensureRepository();
    return repository.getSceneOverview(sceneId);
  };

  const cacheSceneTextStats = async (payload = {}) => {
    const repository = await ensureRepository();
    return repository.cacheSceneTextStats(payload);
  };

  const getDomainState = () => {
    const repositoryState = getRepositoryState();
    const projectId = getCurrentProjectId() || "unknown-project";
    return projectRepositoryStateToDomainState({
      repositoryState,
      projectId,
    });
  };

  const checkPlatformDetailsImageUsage = async ({
    itemId,
    repository,
  } = {}) => {
    const image = repository.getState()?.images?.items?.[itemId];
    if (image?.type !== "image" || !image.fileId) {
      return {
        inProps: {},
        isUsed: false,
        count: 0,
      };
    }

    const platformDetailsByPlatform = await Promise.all(
      RELEASE_PLATFORM_IDS.map(async (platform) => ({
        platform,
        applicationInfo:
          await repositoryService.getCurrentPlatformDetails(platform),
      })),
    );
    const usages = platformDetailsByPlatform
      .filter(
        ({ applicationInfo }) => applicationInfo?.iconFileId === image.fileId,
      )
      .map(({ platform }) => ({
        property: `${platform}.iconFileId`,
      }));

    return {
      inProps: usages.length > 0 ? { platformDetails: usages } : {},
      isUsed: usages.length > 0,
      count: usages.length,
    };
  };

  const checkResourceUsage = async ({ itemId, checkTargets = [] } = {}) => {
    const repository = await ensureRepository();
    const store = repositoryService.getCachedStore();
    const projectId = getCurrentProjectId() || "unknown-project";

    const projectUsage = await checkProjectResourceUsage({
      repository,
      store,
      projectId,
      itemId,
      checkTargets,
    });
    if (projectUsage.isUsed) {
      return projectUsage;
    }

    return checkPlatformDetailsImageUsage({ itemId, repository });
  };

  const deleteImageIfUnused = async ({ imageId, checkTargets = [] } = {}) => {
    const repository = await ensureRepository();
    const platformDetailsUsage = await checkPlatformDetailsImageUsage({
      itemId: imageId,
      repository,
    });
    if (platformDetailsUsage.isUsed) {
      return { deleted: false, usage: platformDetailsUsage };
    }

    return collabService.deleteImageIfUnused({ imageId, checkTargets });
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
    ensureProjectContentPatches,
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
    cacheSceneTextStats,
    getCurrentProjectInfo: repositoryService.getCurrentProjectInfo,
    updateCurrentProjectInfo: repositoryService.updateCurrentProjectInfo,
    updateProjectInfoById: repositoryService.updateProjectInfoByProjectId,
    getCurrentPlatformDetails: repositoryService.getCurrentPlatformDetails,
    getCurrentPlatformDetailsDefaults:
      repositoryService.getCurrentPlatformDetailsDefaults,
    createCurrentPlatformDetails:
      repositoryService.createCurrentPlatformDetails,
    updateCurrentPlatformDetails:
      repositoryService.updateCurrentPlatformDetails,
    getCachedVersions: collabService.getCachedVersions,
    loadVersionsFromProject: collabService.loadVersionsFromProject,
    addVersionToProject: collabService.addVersionToProject,
    updateVersionInProject: collabService.updateVersionInProject,
    deleteVersionFromProject: collabService.deleteVersionFromProject,
    deleteImageIfUnused,
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
    promptWindowsExecutablePath: exportService.promptWindowsExecutablePath,
    promptWindowsInstallerPath: exportService.promptWindowsInstallerPath,
    getWindowsExportAvailability: exportService.getWindowsExportAvailability,
    createWindowsPortableExecutableToPath:
      exportService.createWindowsPortableExecutableToPath,
    createWindowsInstallerToPath: exportService.createWindowsInstallerToPath,
    promptMacosApplicationPath: exportService.promptMacosApplicationPath,
    getMacosExportAvailability: exportService.getMacosExportAvailability,
    createMacosApplicationToPath: exportService.createMacosApplicationToPath,
  };
};
