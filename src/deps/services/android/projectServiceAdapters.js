import JSZip from "jszip";
import {
  loadTemplate,
  getTemplateFiles,
} from "../../clients/web/templateLoader.js";
import {
  base64ToUint8Array,
  callAndroidBridge,
  uint8ArrayToBase64,
} from "../../clients/android/bridge.js";
import { assertSafeAndroidStorageSegment } from "../../clients/android/storagePaths.js";
import { getAndroidProjectFileUrl } from "./projectFileUrls.js";
import {
  createPersistedAndroidProjectStore,
  evictPersistedAndroidProjectStoreCache,
} from "./collabClientStore.js";
import { commandToSyncEvent } from "../shared/collab/mappers.js";
import {
  createBundleResult,
  normalizeExportFileEntries,
} from "../shared/projectExportService.js";
import {
  assertSupportedProjectState,
  createProjectCreateRepositoryEvent,
} from "../shared/projectRepository.js";
import {
  resolveProjectResolutionForWrite,
  scaleTemplateProjectStateForResolution,
} from "../../../internal/projectResolution.js";
import {
  createMainProjectionState,
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
} from "../shared/projectRepositoryViews/shared.js";
import { toBootstrappedDraftEvent } from "../shared/collab/clientStoreHistory.js";
import { assertSafeProjectFileId } from "../../../internal/projectFileIds.js";
import { normalizeProjectLanguage } from "../../../internal/projectLanguage.js";

const PROJECT_INFO_KEY = "projectInfo";
const CREATOR_VERSION_KEY = "creatorVersion";

const normalizeProjectInfo = (projectInfo = {}) => ({
  id: projectInfo.id ?? "",
  namespace: projectInfo.namespace ?? "",
  nativeApplicationIdentifier: projectInfo.nativeApplicationIdentifier ?? "",
  name: projectInfo.name ?? "",
  description: projectInfo.description ?? "",
  language: normalizeProjectLanguage(projectInfo.language),
  iconFileId: projectInfo.iconFileId ?? null,
});

const getByteLength = (value) => {
  if (!value) return 0;
  if (typeof value.byteLength === "number") return value.byteLength;
  if (typeof value.size === "number") return value.size;
  return 0;
};

const logExportSizeStats = (stats = {}) => {
  console.info("[export.bundle.size]", stats);
};

const isMissingProjectFileError = (error) => {
  return String(error?.message ?? "").includes("Project file was not found");
};

const createAndroidRemoteCollabDisabledError = () => {
  return new Error("Android remote collaboration is disabled.");
};

const isUnreliableMimeType = (mimeType) => {
  const normalizedMimeType = String(mimeType ?? "")
    .trim()
    .toLowerCase();
  return (
    !normalizedMimeType ||
    normalizedMimeType === "text/plain" ||
    normalizedMimeType === "application/octet-stream"
  );
};

const detectMimeTypeFromBytes = (bytes) => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return "image/png";
  }

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) {
    return "image/jpeg";
  }

  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    data.length >= 4 &&
    data[0] === 0x00 &&
    data[1] === 0x01 &&
    data[2] === 0x00 &&
    data[3] === 0x00
  ) {
    return "font/ttf";
  }

  if (
    data.length >= 4 &&
    data[0] === 0x4f &&
    data[1] === 0x54 &&
    data[2] === 0x54 &&
    data[3] === 0x4f
  ) {
    return "font/otf";
  }

  if (
    data.length >= 4 &&
    data[0] === 0x77 &&
    data[1] === 0x4f &&
    data[2] === 0x46 &&
    data[3] === 0x46
  ) {
    return "font/woff";
  }

  if (
    data.length >= 4 &&
    data[0] === 0x77 &&
    data[1] === 0x4f &&
    data[2] === 0x46 &&
    data[3] === 0x32
  ) {
    return "font/woff2";
  }

  return undefined;
};

const resolveProjectFileMimeType = ({ mimeType, bytes } = {}) => {
  if (!isUnreliableMimeType(mimeType)) {
    return mimeType;
  }

  return detectMimeTypeFromBytes(bytes) ?? "application/octet-stream";
};

const normalizeLocalDraftCreatedAt = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : Date.now();
};

const toLocalDraftEvent = (command) => {
  const syncEvent = commandToSyncEvent(command);
  return {
    id: command?.id,
    partition: syncEvent?.partition ?? command?.partition,
    projectId: syncEvent?.projectId ?? command?.projectId,
    ...syncEvent,
    createdAt: normalizeLocalDraftCreatedAt(
      syncEvent?.createdAt ?? command?.clientTs ?? command?.meta?.clientTs,
    ),
  };
};

const createLocalSubmitError = (error) => ({
  code: error?.code || "submit_failed",
  message: error?.message || "Failed to persist local draft",
});

const createLocalOnlyProjectCollabSession = ({
  actor,
  clientStore,
  logger = () => {},
}) => {
  let lastError;
  let status = "idle";

  const submitDrafts = async (commands = []) => {
    const normalizedCommands = Array.isArray(commands)
      ? commands.filter(Boolean)
      : [];
    if (normalizedCommands.length === 0) {
      return { valid: true, commandIds: [] };
    }

    try {
      const draftEvents = normalizedCommands.map(toLocalDraftEvent);
      if (draftEvents.length === 1) {
        await clientStore.insertDraft(draftEvents[0]);
      } else {
        await clientStore.insertDrafts(draftEvents);
      }
      status = "ready";
      lastError = undefined;
      return {
        valid: true,
        commandIds: normalizedCommands.map((command) => command.id),
      };
    } catch (error) {
      const normalizedError = createLocalSubmitError(error);
      lastError = structuredClone(normalizedError);
      logger({ event: "local_submit_failed", error: normalizedError });
      return { valid: false, error: normalizedError };
    }
  };

  return {
    async start() {
      status = "ready";
      logger({ event: "local_session_started" });
    },

    async stop() {
      status = "stopped";
      logger({ event: "local_session_stopped" });
    },

    async submitCommand(command) {
      const submitResult = await submitDrafts([command]);
      if (submitResult?.valid === false) {
        return submitResult;
      }
      return { valid: true, commandId: command.id };
    },

    async submitCommands(commands) {
      return submitDrafts(commands);
    },

    async submitEvent(input) {
      await clientStore.insertDraft({
        ...structuredClone(input),
        createdAt: normalizeLocalDraftCreatedAt(
          input?.createdAt ?? input?.clientTs ?? input?.meta?.clientTs,
        ),
      });
      status = "ready";
    },

    async syncNow() {},
    async flushDrafts() {},

    getStatus() {
      return { phase: status, transportState: "offline" };
    },

    getLastError() {
      return lastError ? structuredClone(lastError) : undefined;
    },

    clearLastError() {
      lastError = undefined;
    },

    getActor() {
      return structuredClone(actor);
    },

    async setOnlineTransport() {
      logger({ event: "local_transport_attach_ignored" });
    },
  };
};

const ensureAndroidProjectStorage = (projectId) => {
  callAndroidBridge("ensureProjectStorage", {
    projectId: assertSafeAndroidStorageSegment(projectId, {
      label: "Android project id",
    }),
  });
};

const writeAndroidProjectFile = ({ projectId, fileId, bytes, mimeType }) => {
  const safeProjectId = assertSafeAndroidStorageSegment(projectId, {
    label: "Android project id",
  });
  callAndroidBridge("writeProjectFile", {
    projectId: safeProjectId,
    fileId,
    mimeType: resolveProjectFileMimeType({ mimeType, bytes }),
    base64: uint8ArrayToBase64(bytes),
  });
};

const readAndroidProjectFile = ({ projectId, fileId }) => {
  const safeProjectId = assertSafeAndroidStorageSegment(projectId, {
    label: "Android project id",
  });
  const result = callAndroidBridge("readProjectFile", {
    projectId: safeProjectId,
    fileId,
  });
  return {
    bytes: base64ToUint8Array(result?.base64 || ""),
    mimeType: result?.mimeType || "application/octet-stream",
  };
};

const readAndroidProjectFileMetadata = ({ projectId, fileId }) => {
  const safeProjectId = assertSafeAndroidStorageSegment(projectId, {
    label: "Android project id",
  });
  const safeFileId = assertSafeProjectFileId(fileId);
  const result = callAndroidBridge("readProjectFileMetadata", {
    projectId: safeProjectId,
    fileId: safeFileId,
  });
  return {
    mimeType: result?.mimeType || "application/octet-stream",
    size: result?.size ?? 0,
  };
};

const getAndroidProjectFileUrlCacheKey = ({
  projectId,
  fileId,
  mimeType,
  sha256,
}) => {
  return [
    assertSafeAndroidStorageSegment(projectId, {
      label: "Android project id",
    }),
    assertSafeProjectFileId(fileId),
    mimeType ?? "",
    sha256 ?? "",
  ].join(":");
};

const resolveKnownFileMetadata = (fileMetadata) => {
  if (!fileMetadata || typeof fileMetadata !== "object") {
    return undefined;
  }

  const mimeType =
    typeof fileMetadata.mimeType === "string" && fileMetadata.mimeType
      ? fileMetadata.mimeType
      : undefined;
  if (!mimeType) {
    return undefined;
  }

  return {
    mimeType,
    size: Number.isFinite(fileMetadata.size) ? fileMetadata.size : undefined,
    sha256:
      typeof fileMetadata.sha256 === "string" && fileMetadata.sha256
        ? fileMetadata.sha256
        : undefined,
  };
};

const resolveAndroidProjectFileMetadata = ({
  projectId,
  fileId,
  fileMetadata,
}) => {
  return (
    resolveKnownFileMetadata(fileMetadata) ??
    readAndroidProjectFileMetadata({ projectId, fileId })
  );
};

const copyTemplateFiles = async ({ templateId, projectId, templateData }) => {
  const templateFilesPath = `/templates/${templateId}/files/`;
  const filesToCopy = await getTemplateFiles(templateId);

  for (const fileId of filesToCopy) {
    try {
      const sourcePath = templateFilesPath + fileId;
      const response = await fetch(sourcePath);
      if (response.ok) {
        const blob = await response.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const templateMimeType = templateData.files.items[fileId].mimeType;
        writeAndroidProjectFile({
          projectId,
          fileId: assertSafeProjectFileId(fileId),
          bytes,
          mimeType: templateMimeType ?? blob.type,
        });
      }
    } catch (error) {
      console.error(`Failed to copy template file ${fileId}:`, error);
    }
  }
};

const writeDownloadFile = ({ filename, bytes, mimeType }) => {
  return callAndroidBridge("writeDownloadFile", {
    filename,
    mimeType: mimeType || "application/octet-stream",
    base64: uint8ArrayToBase64(bytes),
  });
};

const writeSelectedFile = ({ uri, bytes, mimeType }) => {
  return callAndroidBridge("writeFileToUri", {
    uri,
    mimeType: mimeType || "application/octet-stream",
    base64: uint8ArrayToBase64(bytes),
  });
};

const collectDistributionZipAssets = async ({
  fileEntries,
  getCurrentReference,
}) => {
  const reference = getCurrentReference();
  const projectId = reference?.repositoryProjectId ?? reference?.projectId;
  if (!projectId) {
    throw new Error("Project reference is required for Android ZIP export.");
  }

  const assets = {};
  for (const fileEntry of normalizeExportFileEntries(fileEntries)) {
    const safeFileId = assertSafeProjectFileId(fileEntry.id);
    try {
      const { bytes, mimeType } = readAndroidProjectFile({
        projectId,
        fileId: safeFileId,
      });
      assets[safeFileId] = {
        buffer: bytes,
        mime: fileEntry.mimeType || mimeType || "application/octet-stream",
      };
    } catch (error) {
      if (!isMissingProjectFileError(error)) {
        throw error;
      }
      console.warn(`Skipping missing file during export: ${safeFileId}`);
    }
  }

  return assets;
};

const createDistributionZipBytes = async ({
  projectData,
  fileEntries,
  staticFiles,
  getCurrentReference,
  stats = {},
}) => {
  const assets = await collectDistributionZipAssets({
    fileEntries,
    getCurrentReference,
  });
  const { bundle, stats: bundleStats } = await createBundleResult(
    projectData,
    assets,
  );
  const zip = new JSZip();
  zip.file("package.bin", bundle);
  if (staticFiles.indexHtml) zip.file("index.html", staticFiles.indexHtml);
  if (staticFiles.mainJs) zip.file("main.js", staticFiles.mainJs);
  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const loggedStats = {};
  Object.assign(loggedStats, bundleStats, stats);
  loggedStats.zipBytes = getByteLength(zipBytes);
  logExportSizeStats(loggedStats);
  return zipBytes;
};

const createNativeDistributionZipStreamedToPath = async ({
  projectData,
  fileEntries,
  outputPath,
  staticFiles,
  getCurrentReference,
}) => {
  const reference = getCurrentReference();
  const projectId = reference?.repositoryProjectId || reference?.projectId;
  const safeProjectId = assertSafeAndroidStorageSegment(projectId, {
    label: "Android project id",
  });
  const payload = {
    projectId: safeProjectId,
    uri: outputPath,
    fileEntries: normalizeExportFileEntries(fileEntries).map((fileEntry) => {
      const entry = {
        id: assertSafeProjectFileId(fileEntry.id),
      };
      if (fileEntry.mimeType) {
        entry.mimeType = fileEntry.mimeType;
      }
      return entry;
    }),
    instructionsJson: JSON.stringify(projectData),
    usePartFile: true,
  };

  if (staticFiles.indexHtml) {
    payload.indexHtml = staticFiles.indexHtml;
  }
  if (staticFiles.mainJs) {
    payload.mainJs = staticFiles.mainJs;
  }

  const result = callAndroidBridge(
    "createDistributionZipStreamedToUri",
    payload,
  );
  logExportSizeStats(result?.stats ?? result);

  return result?.uri ?? outputPath;
};

export const createAndroidProjectServiceAdapters = ({
  collabLog,
  creatorVersion,
}) => {
  const projectFileUrlByCacheKey = new Map();

  const storageAdapter = {
    resolveProjectReferenceByProjectId: async ({ projectId }) => ({
      projectId,
      cacheKey: projectId,
      repositoryProjectId: projectId,
    }),

    readCreatorVersionByReference: async ({ reference }) => {
      const store = await createPersistedAndroidProjectStore({
        projectId: reference.repositoryProjectId || reference.projectId,
      });
      const creatorVersionValue = await store.app.get(CREATOR_VERSION_KEY);
      return Number.isFinite(creatorVersionValue) ? creatorVersionValue : 0;
    },

    readProjectInfoByReference: async ({ reference }) => {
      const store = await createPersistedAndroidProjectStore({
        projectId: reference.repositoryProjectId || reference.projectId,
      });
      return normalizeProjectInfo(await store.app.get(PROJECT_INFO_KEY));
    },

    writeProjectInfoByReference: async ({ reference, projectInfo }) => {
      const store = await createPersistedAndroidProjectStore({
        projectId: reference.repositoryProjectId || reference.projectId,
      });
      await store.app.set(PROJECT_INFO_KEY, normalizeProjectInfo(projectInfo));
    },

    createStore: async ({ reference }) => {
      return createPersistedAndroidProjectStore({
        projectId: reference.repositoryProjectId || reference.projectId,
      });
    },

    evictStoreByReference: async ({ reference }) => {
      await evictPersistedAndroidProjectStoreCache({
        projectId: reference?.repositoryProjectId || reference?.projectId,
      });
    },

    initializeProject: async ({
      projectId,
      template,
      projectInfo,
      projectResolution,
    }) => {
      if (!projectId) {
        throw new Error(
          "projectId is required for Android project initialization",
        );
      }

      const safeProjectId = assertSafeAndroidStorageSegment(projectId, {
        label: "Android project id",
      });

      if (!template) {
        throw new Error("Template is required for project initialization");
      }

      ensureAndroidProjectStorage(safeProjectId);

      const loadedTemplateData = await loadTemplate(template);
      const resolvedProjectResolution = resolveProjectResolutionForWrite({
        projectResolution,
        fallbackResolution: loadedTemplateData.project?.resolution,
      });
      const templateData = scaleTemplateProjectStateForResolution(
        loadedTemplateData,
        resolvedProjectResolution,
      );
      await copyTemplateFiles({
        templateId: template,
        projectId: safeProjectId,
        templateData,
      });

      assertSupportedProjectState(templateData);

      const store = await createPersistedAndroidProjectStore({
        projectId: safeProjectId,
      });
      const initialClientTs = Date.now();
      const initialEvent = createProjectCreateRepositoryEvent({
        projectId: safeProjectId,
        state: templateData,
        clientTs: initialClientTs,
      });

      await store.clearEvents();
      await store.clearMaterializedViewCheckpoints();
      await store.insertDraft(toBootstrappedDraftEvent(initialEvent, 0));
      await store.saveMaterializedViewCheckpoint({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
        viewVersion: MAIN_VIEW_VERSION,
        lastCommittedId: 1,
        value: createMainProjectionState(templateData),
        updatedAt: Date.now(),
      });

      await store.app.set(CREATOR_VERSION_KEY, creatorVersion);
      await store.app.set(PROJECT_INFO_KEY, normalizeProjectInfo(projectInfo));
    },
  };

  const fileAdapter = {
    continueOnUploadError: false,
    requiresFileMetadata: true,

    storeFile: async ({
      file,
      bytes,
      projectId,
      idGenerator,
      getCurrentReference,
    }) => {
      const reference = projectId
        ? { projectId, repositoryProjectId: projectId, cacheKey: projectId }
        : getCurrentReference();
      const resolvedProjectId =
        reference?.repositoryProjectId || reference?.projectId;
      const fileId = idGenerator();
      const safeFileId = assertSafeProjectFileId(fileId);
      const arrayBuffer = bytes ?? (await file.arrayBuffer());
      const fileBytes = new Uint8Array(arrayBuffer);
      const mimeType = resolveProjectFileMimeType({
        mimeType: file.type,
        bytes: fileBytes,
      });

      ensureAndroidProjectStorage(resolvedProjectId);
      writeAndroidProjectFile({
        projectId: resolvedProjectId,
        fileId: safeFileId,
        bytes: fileBytes,
        mimeType,
      });

      return {
        fileId: safeFileId,
        downloadUrl: getAndroidProjectFileUrl({
          projectId: resolvedProjectId,
          fileId: safeFileId,
          mimeType,
        }),
      };
    },

    getFileContent: async ({ fileId, fileMetadata, getCurrentReference }) => {
      const reference = getCurrentReference();
      const projectId = reference?.repositoryProjectId || reference?.projectId;
      const safeFileId = assertSafeProjectFileId(fileId);
      const metadata = resolveAndroidProjectFileMetadata({
        projectId,
        fileId: safeFileId,
        fileMetadata,
      });
      const cacheKey = getAndroidProjectFileUrlCacheKey({
        projectId,
        fileId: safeFileId,
        mimeType: metadata.mimeType,
        sha256: metadata.sha256,
      });
      let url = projectFileUrlByCacheKey.get(cacheKey);
      if (!url) {
        url = getAndroidProjectFileUrl({
          projectId,
          fileId: safeFileId,
          mimeType: metadata.mimeType,
        });
        projectFileUrlByCacheKey.set(cacheKey, url);
      }

      return {
        url,
        type: metadata.mimeType,
        size: metadata.size,
      };
    },

    getFileByProjectId: async ({ projectId, fileId }) => {
      const safeFileId = assertSafeProjectFileId(fileId);
      const { bytes, mimeType } = readAndroidProjectFile({
        projectId,
        fileId: safeFileId,
      });
      return new Blob([bytes], { type: mimeType });
    },

    downloadBundle: async ({ bundle, filename }) => {
      const bytes =
        bundle instanceof Uint8Array ? bundle : new Uint8Array(bundle);
      return writeDownloadFile({
        filename,
        bytes,
        mimeType: "application/octet-stream",
      });
    },

    createDistributionZip: async ({
      bundle,
      zipName,
      staticFiles,
      stats = {},
    }) => {
      const zip = new JSZip();
      zip.file("package.bin", bundle);
      if (staticFiles.indexHtml) zip.file("index.html", staticFiles.indexHtml);
      if (staticFiles.mainJs) zip.file("main.js", staticFiles.mainJs);
      const zipBytes = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      logExportSizeStats({
        ...stats,
        packageBinBytes: getByteLength(bundle),
        zipBytes: getByteLength(zipBytes),
      });
      return writeDownloadFile({
        filename: `${zipName}.zip`,
        bytes: zipBytes,
        mimeType: "application/zip",
      });
    },

    createDistributionZipStreamed: async ({
      projectData,
      fileEntries,
      zipName,
      staticFiles,
      getCurrentReference,
    }) => {
      const zipBytes = await createDistributionZipBytes({
        projectData,
        fileEntries,
        staticFiles,
        getCurrentReference,
      });
      return writeDownloadFile({
        filename: `${zipName}.zip`,
        bytes: zipBytes,
        mimeType: "application/zip",
      });
    },

    promptDistributionZipPath: async ({
      zipName,
      options = {},
      filePicker,
    }) => {
      return filePicker.saveFilePicker({
        title: options.title || "Save Distribution ZIP",
        defaultPath: `${zipName}.zip`,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        mimeType: "application/zip",
      });
    },

    createDistributionZipStreamedToPath: async ({
      projectData,
      fileEntries,
      outputPath,
      staticFiles,
      getCurrentReference,
    }) => {
      try {
        return await createNativeDistributionZipStreamedToPath({
          projectData,
          fileEntries,
          outputPath,
          staticFiles,
          getCurrentReference,
        });
      } catch (error) {
        console.warn(
          "Native Android ZIP export failed; falling back to JavaScript ZIP.",
          error,
        );
      }

      const zipBytes = await createDistributionZipBytes({
        projectData,
        fileEntries,
        staticFiles,
        getCurrentReference,
      });
      return writeSelectedFile({
        uri: outputPath,
        bytes: zipBytes,
        mimeType: "application/zip",
      });
    },
  };

  const collabAdapter = {
    beforeCreateRepository: async () => {},
    afterCreateRepository: async () => {},

    createTransport: () => {
      throw createAndroidRemoteCollabDisabledError();
    },

    onEnsureLocalSession: () => {},
    onSessionCleared: () => {},
    onSessionTransportUpdated: () => {},

    createSessionForProject: async ({
      projectId,
      userId,
      clientId,
      endpointUrl,
      mode,
      getRepositoryByProject,
      getStoreByProject,
    }) => {
      if (mode !== "local" || endpointUrl) {
        throw createAndroidRemoteCollabDisabledError();
      }

      const repository = await getRepositoryByProject(projectId);
      const state = repository.getState();
      assertSupportedProjectState(state);
      const repositoryStore = await getStoreByProject(projectId);

      const localSession = createLocalOnlyProjectCollabSession({
        actor: { userId, clientId },
        clientStore: repositoryStore,
        logger: (entry) => collabLog("debug", "local-session", entry),
      });
      await localSession.start();
      return localSession;
    },
  };

  return {
    storageAdapter,
    fileAdapter,
    collabAdapter,
  };
};
