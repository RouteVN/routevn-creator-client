import { readAndroidLastBuildNumber } from "../../../internal/androidExport.js";
import { createProjectAssetService } from "./projectAssetService.js";
import { createAssetPackageExportService } from "./assetPackageExportService.js";
import { createEditorThumbnailService } from "./editorThumbnailService.js";
import { createSpritesheetFramesService } from "./spritesheetFramesService.js";
import { createProjectCollabCore } from "./projectCollabCore.js";
import { createAndroidSigningService } from "./androidSigningService.js";
import { createProjectExportService } from "./projectExportService.js";
import { createProjectRepositoryService } from "./projectRepositoryService.js";
import { createResourcePackageImportService } from "./resourcePackageImportService.js";
import { importImageFile as importProjectImageFile } from "./resourceImports.js";
import {
  buildImageUsageIndex,
  selectFolderImageIds,
  checkProjectResourceUsage,
  checkSceneDeleteUsage,
  selectImageUsage,
} from "./resourceUsage.js";
import { projectRepositoryStateToDomainState } from "../../../internal/project/projection.js";
import { upgradeResetStoryActions } from "../../../internal/navigationActions.js";
import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
  normalizeLayoutSchemaVersion,
} from "../../../internal/project/layout.js";
import {
  extractFontWeightCapabilities,
  isStrictFontMimeType,
} from "../../../internal/fontCapabilities.js";
import {
  detectAudioMimeTypeFromBytes,
  normalizeFontFileType,
} from "../../../internal/fileTypes.js";

// Exceptional shipped-data repair. Keep its marker, legacy predicates,
// collaboration gate, and lifecycle aligned with
// docs/platform/14-project-content-patches.md.
const DEFAULT_MENU_TEXT_STYLES_PATCH_KEY =
  "contentPatch.defaultMenuTextStyles-1-9-1";
const FONT_WEIGHT_METADATA_PATCH_KEY = "contentPatch.fontWeightMetadata-1-10-0";
const SECTION_TRANSITION_RESET_STORY_PATCH_KEY =
  "contentPatch.sectionTransitionResetStory-1-22-0";
const NON_RETRYABLE_FONT_INSPECTION_ERROR_CODES = new Set([
  "unsupported_font_format",
  "invalid_font_data",
  "missing_font_weight",
  "invalid_font_weight",
  "unreadable_font_weight",
]);
const PLATFORM_DETAILS_IMAGE_PROPERTIES = [
  "iconFileId",
  "adaptiveIconFileId",
  "splashIconFileId",
  "loadingBackgroundFileId",
  "startBackgroundFileId",
];
const MENU_ITEM_TEXT_STYLE_ID = "e2WbW3vcPZR9";
const MENU_ITEM_SELECTED_TEXT_STYLE_ID = "saV5A4pkvHRb";
const MENU_PAGE_LAYOUT_ID = "fKr5fa67MQWh";
const LOAD_MENU_ELEMENT_ID = "icn4dknq2kyp";
const LEGACY_DIALOGUE_CONTENT_TEXT_STYLE_ID = "5rwEfyx2GBEi";
const RELEASE_PLATFORM_IDS = ["web", "windows", "macos", "android", "ios"];
const IMAGE_USAGE_INDEX_BUILD_ATTEMPTS = 3;

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
  errorTracker,
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
    errorTracker,
    getCurrentRepository: repositoryService.getCurrentRepository,
    getCachedRepository: repositoryService.getCachedRepository,
    getRepositoryByProject: repositoryService.getRepositoryByProject,
    getAdapterByProject: repositoryService.getStoreByProjectSync,
    getProjectCacheKey: repositoryService.getProjectCacheKey,
    getOpenProjectId: () => getCurrentProjectId(),
    getOpenRepository: repositoryService.getEnsuredRepository,
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

  const assetPackageExportService = createAssetPackageExportService({
    getFileContent: assetService.getFileContent,
    getRepositoryState: () =>
      repositoryService.getCachedRepository().getState(),
  });

  const getCurrentProjectId = () =>
    repositoryService.getEnsuredProjectId() || router.getPayload()?.p;

  const androidSigningService = createAndroidSigningService({
    fileAdapter,
    filePicker,
    getProjectId: getCurrentProjectId,
    getAndroidSigningByProjectId:
      repositoryService.getAndroidSigningByProjectId,
    setAndroidSigningByProjectId:
      repositoryService.setAndroidSigningByProjectId,
  });

  // The Build Number of this project's last Android export under
  // `applicationId`, or no value when there was none.
  const getLastAndroidBuildNumber = async (applicationId) =>
    readAndroidLastBuildNumber(
      await repositoryService.getAndroidLastExportByProjectId(
        getCurrentProjectId(),
      ),
      applicationId,
    );

  // Called after an export: keeps the highest Build Number exported.
  const recordAndroidBuildNumber = async ({ applicationId, buildNumber }) => {
    const last = await getLastAndroidBuildNumber(applicationId);
    if (last !== undefined && last >= buildNumber) return;
    await repositoryService.setAndroidLastExportByProjectId(
      getCurrentProjectId(),
      { applicationId, buildNumber },
    );
  };

  // A signed export names its key by fingerprint; the key comes from the
  // project.
  const createAndroidApkToPath = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) => {
    const signingKey = metadata.signingCertificateSha256
      ? await androidSigningService.getAndroidSigningKeyMaterial(
          metadata.signingCertificateSha256,
        )
      : undefined;
    return exportService.createAndroidApkToPath(
      projectData,
      fileEntries,
      outputPath,
      { ...metadata, signingKey },
      options,
    );
  };

  // An App Bundle is always signed, with the project key named by
  // `metadata.signingCertificateSha256`.
  const createAndroidBundleToPath = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) => {
    const signingKey = await androidSigningService.getAndroidSigningKeyMaterial(
      metadata.signingCertificateSha256,
    );
    return exportService.createAndroidBundleToPath(
      projectData,
      fileEntries,
      outputPath,
      { ...metadata, signingKey },
      options,
    );
  };

  const contentPatchesByProject = new Map();
  // The repositories whose content patches completed. The route opens a project
  // once and its pages ensure it many times; only the first ensure of an opened
  // repository reads the patch markers. Held weakly, so a released repository
  // can be freed.
  const patchedRepositories = new WeakSet();

  const getRepositoryState = () => {
    const repository = repositoryService.getCachedRepository();
    return repository.getState();
  };

  const getRepositoryRevision = () => {
    const repository = repositoryService.getCachedRepository();
    return repository.getRevision();
  };

  const editorThumbnailService = createEditorThumbnailService({
    getEnsuredProjectId: repositoryService.getEnsuredProjectId,
    getRepositoryState,
    getFileContent: assetService.getFileContent,
    storeFileForProject: assetService.storeFileForProject,
    updateTransform: collabService.commandApi.updateTransform,
    updateParticle: collabService.commandApi.updateParticle,
    updateLayout: collabService.commandApi.updateLayoutItem,
    updateAnimation: collabService.commandApi.updateAnimation,
  });

  const spritesheetFramesService = createSpritesheetFramesService({
    getFileContent: assetService.getFileContent,
    uploadFiles: assetService.uploadFiles,
  });

  const resourcePackageImportService = createResourcePackageImportService({
    idGenerator,
    getCurrentProjectId,
    getRepositoryState,
    getRepositoryRevision,
    assetService,
    commandApi: collabService.commandApi,
    logEvent: (event, details) =>
      collabLog?.("info", `resourceImport.${event}`, details),
  });

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

  const selectSceneIdsBySectionId = (repositoryState) => {
    const sceneIdsBySectionId = new Map();
    for (const [sceneId, scene] of Object.entries(
      repositoryState?.scenes?.items ?? {},
    )) {
      for (const sectionId of Object.keys(scene?.sections?.items ?? {})) {
        sceneIdsBySectionId.set(sectionId, sceneId);
      }
    }
    return sceneIdsBySectionId;
  };

  const createResetStoryUpgrade = (repositoryState) => {
    const sceneIdsBySectionId = selectSceneIdsBySectionId(repositoryState);
    return (value) =>
      upgradeResetStoryActions(value, {
        resolveSceneId: (sectionId) => sceneIdsBySectionId.get(sectionId),
      });
  };

  // The top-level fields of an item that the upgrade rewrote. Element updates
  // merge by field, so only these are sent.
  const selectUpgradedFields = (item, upgradedItem) => {
    const data = {};
    for (const [key, value] of Object.entries(upgradedItem)) {
      if (value !== item[key]) {
        data[key] = value;
      }
    }
    return data;
  };

  // Where the project holds actions: scene lines, layout elements, control
  // elements, and control key bindings. Each target reads its item from the
  // state it is given, so the rewrite can be made from the current state.
  const selectResetStoryPatchTargets = (repositoryState) => {
    const targets = [];

    for (const [sceneId, scene] of Object.entries(
      repositoryState?.scenes?.items ?? {},
    )) {
      for (const [sectionId, section] of Object.entries(
        scene?.sections?.items ?? {},
      )) {
        for (const lineId of Object.keys(section?.lines?.items ?? {})) {
          targets.push({
            label: `line ${lineId}`,
            sceneId,
            selectItem: (state) =>
              state?.scenes?.items?.[sceneId]?.sections?.items?.[sectionId]
                ?.lines?.items?.[lineId]?.actions,
            // A merge would keep the deprecated action next to its
            // replacement.
            submit: (actions) =>
              collabService.commandApi.updateLineActions({
                lineId,
                data: actions,
                replace: true,
              }),
          });
        }
      }
    }

    for (const [layoutId, layout] of Object.entries(
      repositoryState?.layouts?.items ?? {},
    )) {
      for (const elementId of Object.keys(layout?.elements?.items ?? {})) {
        targets.push({
          label: `layout ${layoutId} element ${elementId}`,
          selectItem: (state) =>
            state?.layouts?.items?.[layoutId]?.elements?.items?.[elementId],
          submit: (upgradedElement, element) =>
            collabService.commandApi.updateLayoutElement({
              layoutId,
              elementId,
              data: selectUpgradedFields(element, upgradedElement),
              replace: false,
            }),
        });
      }
    }

    for (const [controlId, control] of Object.entries(
      repositoryState?.controls?.items ?? {},
    )) {
      for (const key of ["keyboard", "keyup"]) {
        targets.push({
          label: `control ${controlId} ${key}`,
          selectItem: (state) => state?.controls?.items?.[controlId]?.[key],
          submit: (upgradedKeys) =>
            collabService.commandApi.updateControlItem({
              controlId,
              data: { [key]: upgradedKeys },
            }),
        });
      }

      for (const elementId of Object.keys(control?.elements?.items ?? {})) {
        targets.push({
          label: `control ${controlId} element ${elementId}`,
          selectItem: (state) =>
            state?.controls?.items?.[controlId]?.elements?.items?.[elementId],
          submit: (upgradedElement, element) =>
            collabService.commandApi.updateControlElement({
              controlId,
              elementId,
              data: selectUpgradedFields(element, upgradedElement),
              replace: false,
            }),
        });
      }
    }

    return targets;
  };

  // The repository state holds the lines of the scene being edited only, so
  // the lines of the given scenes are loaded with it.
  const readStateWithSceneLines = async (repository, sceneIds) => {
    if (sceneIds.length === 0) {
      return repository.getState();
    }
    return repository.getContextState({ sceneIds });
  };

  // Returns whether every rewrite was accepted. A rejected rewrite is skipped
  // so that one unusual item does not keep the others from being rewritten.
  const patchResetStoryActions = async (repository) => {
    const snapshotState = await readStateWithSceneLines(
      repository,
      Object.keys(repository.getState()?.scenes?.items ?? {}),
    );
    const snapshotUpgrade = createResetStoryUpgrade(snapshotState);
    const targets = selectResetStoryPatchTargets(snapshotState).filter(
      ({ selectItem }) => {
        const item = selectItem(snapshotState);
        return snapshotUpgrade(item) !== item;
      },
    );

    let isComplete = true;
    for (const { label, sceneId, selectItem, submit } of targets) {
      // Earlier updates were awaited, so the project may have changed since
      // the snapshot. The rewrite is made from the item as it is now.
      const currentState = await readStateWithSceneLines(
        repository,
        sceneId === undefined ? [] : [sceneId],
      );
      const item = selectItem(currentState);
      const upgradedItem = createResetStoryUpgrade(currentState)(item);
      if (upgradedItem === item) {
        continue;
      }

      const result = await submit(upgradedItem, item);
      if (result?.valid === false) {
        isComplete = false;
        console.warn(
          `Could not migrate the reset action of ${label}.`,
          result.error?.message,
        );
      }
    }
    return isComplete;
  };

  const applySectionTransitionResetStoryPatch = async (repository) => {
    if (typeof repository?.getState !== "function") {
      return;
    }

    const store = repositoryService.getCachedStore();
    const isApplied = await store.app.get(
      SECTION_TRANSITION_RESET_STORY_PATCH_KEY,
    );
    if (isApplied === true) {
      return;
    }

    // Route Engine still runs the deprecated action, so a project that could
    // not be fully rewritten keeps working. A failure here must never keep
    // the project from opening: the marker stays unset and the patch is
    // evaluated again the next time the project is opened.
    try {
      const isComplete = await patchResetStoryActions(repository);
      if (isComplete) {
        await store.app.set(SECTION_TRANSITION_RESET_STORY_PATCH_KEY, true);
      }
    } catch (error) {
      console.warn(
        "Could not migrate reset actions to section transitions.",
        error,
      );
    }
  };

  const applyProjectContentPatches = async (repository) => {
    await applyDefaultMenuTextStylesPatch(repository);
    await applyFontWeightMetadataPatch(repository);
    await applySectionTransitionResetStoryPatch(repository);
  };

  const repairingSoundIds = new Set();
  let soundRepairQueue = Promise.resolve();

  // Older sound uploads can have an application/octet-stream file record.
  // File records are immutable, so store the same bytes with the type detected
  // from them and point the sound at the new file.
  const runSoundFileTypeRepair = async (soundId) => {
    const getSoundFileId = () =>
      getRepositoryState().sounds.items[soundId]?.fileId;
    const fileId = getSoundFileId();
    const fileRecord = getRepositoryState().files.items[fileId];
    if (fileRecord?.mimeType !== "application/octet-stream") {
      return false;
    }

    const content = await assetService.getFileContent(fileId);
    let blob;
    try {
      const response = await fetch(content.url);
      if (!response.ok) {
        throw new Error(`Failed to read sound file (HTTP ${response.status}).`);
      }
      blob = await response.blob();
    } finally {
      content.revoke?.();
    }

    const mimeType = detectAudioMimeTypeFromBytes(
      await blob.slice(0, 12).arrayBuffer(),
    );
    if (!mimeType) {
      return false;
    }

    const stored = await assetService.storeFile({
      file: blob.slice(0, blob.size, mimeType),
    });
    // The sound may have been replaced or deleted while its bytes were copied.
    if (getSoundFileId() !== fileId) {
      return false;
    }

    const result = await collabService.commandApi.updateSound({
      soundId,
      data: { fileId: stored.fileId },
      fileRecords: stored.fileRecords,
    });
    if (result?.valid === false) {
      throw new Error(
        result.error?.message || "Failed to repair sound file type.",
      );
    }

    return true;
  };

  // Repairs run one at a time, and repeated taps on a sound being repaired
  // are ignored, so selecting through many sounds does not copy them at once.
  const repairSoundFileType = ({ soundId } = {}) => {
    if (repairingSoundIds.has(soundId)) {
      return Promise.resolve(false);
    }

    repairingSoundIds.add(soundId);
    const repair = soundRepairQueue
      .then(() => runSoundFileTypeRepair(soundId))
      .finally(() => repairingSoundIds.delete(soundId));
    soundRepairQueue = repair.catch(() => {});
    return repair;
  };

  const ensureContentPatches = async (repository) => {
    const projectId = getCurrentProjectId();
    if (patchedRepositories.has(repository)) {
      return;
    }

    const existingPatches = contentPatchesByProject.get(projectId);
    if (existingPatches) {
      return existingPatches;
    }

    const patches = applyProjectContentPatches(repository);
    contentPatchesByProject.set(projectId, patches);

    try {
      await patches;
      patchedRepositories.add(repository);
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

  const ensureSceneTextStats = async (payload = {}) => {
    const repository = await ensureRepository();
    return repository.ensureSceneTextStats(payload);
  };

  const getDomainState = () => {
    const repositoryState = getRepositoryState();
    const projectId = getCurrentProjectId() || "unknown-project";
    return projectRepositoryStateToDomainState({
      repositoryState,
      projectId,
    });
  };

  // The platform details fields that show an image file, by file id.
  const loadPlatformDetailsFileUsages = async () => {
    const platformDetailsByPlatform = await Promise.all(
      RELEASE_PLATFORM_IDS.map(async (platform) => ({
        platform,
        applicationInfo:
          await repositoryService.getCurrentPlatformDetails(platform),
      })),
    );
    const usagesByFileId = new Map();
    for (const { platform, applicationInfo } of platformDetailsByPlatform) {
      for (const property of PLATFORM_DETAILS_IMAGE_PROPERTIES) {
        const fileId = applicationInfo?.[property];
        if (!fileId) {
          continue;
        }

        const usages = usagesByFileId.get(fileId) ?? [];
        usages.push({ platform, property });
        usagesByFileId.set(fileId, usages);
      }
    }

    return usagesByFileId;
  };

  // The platform details fields that show the image's file.
  const findPlatformDetailsImageUsages = async ({
    itemId,
    repository,
  } = {}) => {
    const image = repository.getState()?.images?.items?.[itemId];
    if (image?.type !== "image" || !image.fileId) {
      return [];
    }

    return (await loadPlatformDetailsFileUsages()).get(image.fileId) ?? [];
  };

  const checkPlatformDetailsImageUsage = async ({
    itemId,
    repository,
  } = {}) => {
    const usages = (
      await findPlatformDetailsImageUsages({ itemId, repository })
    ).map(({ platform, property }) => ({
      property: `${platform}.${property}`,
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

  // Where every image is used, kept until the project changes. Building it
  // reads every scene's lines, so the pages that show or check image usage
  // share one build per project revision.
  let imageUsageIndexCache;

  const startImageUsageIndexBuild = (repository) => {
    const revision = repository.getRevision();
    if (
      imageUsageIndexCache?.repository === repository &&
      imageUsageIndexCache.revision === revision
    ) {
      return imageUsageIndexCache;
    }

    const cacheEntry = {
      repository,
      revision,
      promise: buildImageUsageIndex({
        repository,
        store: repositoryService.getCachedStore(),
      }),
    };
    imageUsageIndexCache = cacheEntry;
    cacheEntry.promise.catch(() => {
      if (imageUsageIndexCache === cacheEntry) {
        imageUsageIndexCache = undefined;
      }
    });

    return cacheEntry;
  };

  // A change that lands while the index is built can leave it out of date,
  // so it is built again. After a few builds the newest one is returned as
  // it is, rather than waiting for a project that keeps changing.
  const loadImageUsageIndex = async () => {
    const repository = await ensureRepository();
    let index;
    for (
      let attempt = 0;
      attempt < IMAGE_USAGE_INDEX_BUILD_ATTEMPTS;
      attempt += 1
    ) {
      const cacheEntry = startImageUsageIndexBuild(repository);
      index = await cacheEntry.promise;
      if (repository.getRevision() === cacheEntry.revision) {
        break;
      }
    }

    return index;
  };

  // Builds the image usage index ahead of the first lookup.
  const prepareImageUsage = async () => {
    await loadImageUsageIndex();
  };

  // An image that platform details shows cannot be deleted.
  const addPlatformDetailsUsages = (usage, platformDetailsUsages = []) => {
    for (const { platform, property } of platformDetailsUsages) {
      usage.usages.push({ type: "platformDetails", platform, property });
    }
    if (platformDetailsUsages.length > 0) {
      usage.blocksDelete = true;
    }
  };

  // Where the image is used: `usages` lists the scenes (with their lines),
  // layouts, controls, animations, particles and platform details fields, and
  // `blocksDelete` tells whether any of them keeps it from being deleted.
  const getImageUsage = async ({ imageId } = {}) => {
    const repository = await ensureRepository();
    const [index, platformDetailsUsages] = await Promise.all([
      loadImageUsageIndex(),
      findPlatformDetailsImageUsages({ itemId: imageId, repository }),
    ]);
    const usage = selectImageUsage({ index, imageId });
    addPlatformDetailsUsages(usage, platformDetailsUsages);

    return usage;
  };

  // The images in a folder, and in the folders inside it, that cannot be
  // deleted, each with where it is used. The folder cannot be deleted while
  // it holds any, which `blocksDelete` tells.
  const getImageFolderUsage = async ({ folderId } = {}) => {
    const repository = await ensureRepository();
    const [index, platformDetailsUsagesByFileId] = await Promise.all([
      loadImageUsageIndex(),
      loadPlatformDetailsFileUsages(),
    ]);
    const images = repository.getState().images;
    const usedImages = [];

    for (const imageId of selectFolderImageIds({ images, folderId })) {
      const image = images.items[imageId];
      const usage = selectImageUsage({ index, imageId });
      addPlatformDetailsUsages(
        usage,
        platformDetailsUsagesByFileId.get(image.fileId),
      );
      if (usage.blocksDelete) {
        usedImages.push({
          id: imageId,
          name: image.name,
          usages: usage.usages,
        });
      }
    }

    return {
      images: usedImages,
      blocksDelete: usedImages.length > 0,
    };
  };

  const deleteImageIfUnused = async ({ imageId } = {}) => {
    const usage = await getImageUsage({ imageId });
    if (usage.blocksDelete) {
      return {
        deleted: false,
        usage: {
          isUsed: true,
          count: usage.usages.length,
          usages: usage.usages,
        },
      };
    }

    // The usage was checked above, so the delete skips its own check.
    return collabService.deleteImageIfUnused({ imageId, checkTargets: [] });
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
    // The changes made in the project, and those they lead to, reach it before
    // it closes. Closing then takes its turn among the changes, so one made
    // while it closes waits for it and is refused, not run in a closing project.
    await collabService.commandApi.waitForChanges();
    await collabService.commandApi.runAfterChanges(async () => {
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
    });
  };

  return {
    getRepository: repositoryService.getRepository,
    getRepositoryById: repositoryService.getRepositoryById,
    getAdapterById: repositoryService.getAdapterById,
    getEnsuredProjectId: repositoryService.getEnsuredProjectId,
    getEnsuredProjectPath: repositoryService.getEnsuredProjectPath,
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
    // Like subscribeProjectState, for the local drafts left out when the
    // project's history loads: `listener` receives `{ projectId,
    // skippedDrafts, rebuildError }`, where each draft is `{ draftId, type,
    // partition, sceneId, error }`. `rebuildError` is set once, when a storage
    // error kept cached state from being fully rebuilt without them.
    subscribeSkippedDrafts(listener, options) {
      const projectId = options?.projectId ?? getCurrentProjectId();
      return repositoryService.subscribeSkippedDrafts(
        (skippedDrafts, rebuildError) => {
          listener({
            projectId,
            skippedDrafts,
            rebuildError,
          });
        },
        options,
      );
    },
    getRepositoryByPath: repositoryService.getRepositoryByPath,
    releaseRepositoryByPath: repositoryService.releaseRepositoryByPath,
    ...collabService.commandApi,
    getState: getDomainState,
    getDomainState,
    getRepositoryState,
    getRepositoryRevision,
    validateResourceImportUrl:
      resourcePackageImportService.validateResourceImportUrl,
    createResourceImportPlan:
      resourcePackageImportService.createResourceImportPlan,
    loadResourceImportPreview:
      resourcePackageImportService.loadResourceImportPreview,
    validateResourceImportPlan:
      resourcePackageImportService.validateResourceImportPlan,
    executeResourceImportPlan:
      resourcePackageImportService.executeResourceImportPlan,
    discardResourceImportPlan:
      resourcePackageImportService.discardResourceImportPlan,
    cancelResourceImport: resourcePackageImportService.cancelResourceImport,
    loadRepositoryState,
    setActiveSceneId,
    clearActiveSceneId,
    checkResourceUsage,
    checkSceneDeletionUsage,
    deleteSceneIfUnused,
    loadSceneOverviews,
    getSceneOverview,
    cacheSceneTextStats,
    ensureSceneTextStats,
    getCurrentProjectInfo: repositoryService.getCurrentProjectInfo,
    updateCurrentProjectInfo: repositoryService.updateCurrentProjectInfo,
    updateProjectInfoById: repositoryService.updateProjectInfoByProjectId,
    getCurrentAssetPackage: repositoryService.getCurrentAssetPackage,
    updateCurrentAssetPackage: repositoryService.updateCurrentAssetPackage,
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
    getImageUsage,
    getImageFolderUsage,
    prepareImageUsage,
    deleteSoundIfUnused: collabService.deleteSoundIfUnused,
    repairSoundFileType,
    deleteVideoIfUnused: collabService.deleteVideoIfUnused,
    deleteParticleIfUnused: collabService.deleteParticleIfUnused,
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
    validateImageUploadFiles: assetService.validateImageUploadFiles,
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
    observeFileUrls: assetService.observeFileUrls,
    readSpritesheetFrameFiles:
      spritesheetFramesService.readSpritesheetFrameFiles,
    loadSpritesheetFrameFileIds:
      spritesheetFramesService.loadSpritesheetFrameFileIds,
    extractSpritesheetFrames: spritesheetFramesService.extractSpritesheetFrames,
    renderSpritesheetFramesPreview:
      spritesheetFramesService.renderSpritesheetFramesPreview,
    buildSpritesheetFromFrames:
      spritesheetFramesService.buildSpritesheetFromFrames,
    combineSpritesheetSourceFiles:
      spritesheetFramesService.combineSpritesheetSourceFiles,
    checkFileIntegrity: assetService.checkFileIntegrity,
    createAssetPackageBundle:
      assetPackageExportService.createAssetPackageBundle,
    requestTransformThumbnails:
      editorThumbnailService.requestTransformThumbnails,
    requestParticleThumbnails: editorThumbnailService.requestParticleThumbnails,
    requestLayoutThumbnails: editorThumbnailService.requestLayoutThumbnails,
    requestAnimationThumbnails:
      editorThumbnailService.requestAnimationThumbnails,
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
    getAndroidExportAvailability: exportService.getAndroidExportAvailability,
    promptAndroidApkPath: exportService.promptAndroidApkPath,
    createAndroidApkToPath,
    promptAndroidBundlePath: exportService.promptAndroidBundlePath,
    createAndroidBundleToPath,
    getLastAndroidBuildNumber,
    recordAndroidBuildNumber,
    supportsAndroidSigning: androidSigningService.supportsAndroidSigning,
    getAndroidSigningSummary: androidSigningService.getAndroidSigningSummary,
    ensureAndroidSigningKey: androidSigningService.ensureAndroidSigningKey,
    createAndroidSigningKey: androidSigningService.createAndroidSigningKey,
    promptAndroidKeystore: androidSigningService.promptAndroidKeystore,
    importAndroidSigningKey: androidSigningService.importAndroidSigningKey,
    useAndroidSigningKeyAgain: androidSigningService.useAndroidSigningKeyAgain,
    promptAndroidKeyCopyPath: androidSigningService.promptAndroidKeyCopyPath,
    saveAndroidSigningKeyCopy: androidSigningService.saveAndroidSigningKeyCopy,
    promptMacosApplicationPath: exportService.promptMacosApplicationPath,
    getMacosExportAvailability: exportService.getMacosExportAvailability,
    createMacosApplicationToPath: exportService.createMacosApplicationToPath,
    getIosExportAvailability: exportService.getIosExportAvailability,
    getIosExportRequirements: exportService.getIosExportRequirements,
    listIosDevices: exportService.listIosDevices,
    promptIosApplicationPath: exportService.promptIosApplicationPath,
    exportIosApplication: exportService.exportIosApplication,
    cancelIosExport: exportService.cancelIosExport,
  };
};
