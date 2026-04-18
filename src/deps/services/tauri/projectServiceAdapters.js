import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import {
  loadTemplate,
  getTemplateFiles,
} from "../../clients/web/templateLoader.js";
import {
  PROJECT_DB_NAME,
  createPersistedTauriProjectStore,
  evictPersistedTauriProjectStoreCache,
} from "./collabClientStore.js";
import { createProjectCollabService } from "../shared/collab/createProjectCollabService.js";
import {
  clearProjectionGap,
  saveProjectionGap,
} from "../shared/collab/projectionGapState.js";
import { commandToSyncEvent } from "../shared/collab/mappers.js";
import {
  createCommittedCommandProjectionTracker,
  createProjectionGap,
  REMOTE_COMMAND_COMPATIBILITY,
} from "../shared/collab/compatibility.js";
import { createWebSocketTransport } from "../web/collab/createWebSocketTransport.js";
import {
  applyCommandToRepository,
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
import {
  SQLITE_BUSY_TIMEOUT_MS,
  withSqliteLockRetry,
} from "../../../internal/sqliteLocking.js";
import { getManagedSqliteConnection } from "../../clients/tauri/sqliteConnectionManager.js";

const PROJECT_INFO_KEY = "projectInfo";
const CREATOR_VERSION_KEY = "creatorVersion";

const normalizeProjectInfo = (projectInfo = {}) => ({
  id: projectInfo.id ?? "",
  namespace: projectInfo.namespace ?? "",
  name: projectInfo.name ?? "",
  description: projectInfo.description ?? "",
  iconFileId: projectInfo.iconFileId ?? null,
});

const parseStoredAppValue = (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const createProjectDatabaseOpenError = () =>
  new Error(
    "error returned from database: (code: 14) unable to open database file",
  );

const createLocalSubmitError = (error) => ({
  code: error?.code || "submit_failed",
  message: error?.message || "Failed to persist local draft",
});

const normalizeLocalDraftCreatedAt = (value) => {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }
  return Date.now();
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
      return {
        valid: true,
        commandIds: [],
      };
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
      logger({
        event: "local_submit_failed",
        error: normalizedError,
      });
      return {
        valid: false,
        error: normalizedError,
      };
    }
  };

  return {
    async start() {
      status = "ready";
      logger({
        event: "local_session_started",
      });
    },

    async stop() {
      status = "stopped";
      logger({
        event: "local_session_stopped",
      });
    },

    async submitCommand(command) {
      const submitResult = await submitDrafts([command]);
      if (submitResult?.valid === false) {
        return submitResult;
      }

      return {
        valid: true,
        commandId: command.id,
      };
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
      return {
        phase: status,
        transportState: "offline",
      };
    },

    getLastError() {
      if (!lastError) {
        return undefined;
      }
      return structuredClone(lastError);
    },

    clearLastError() {
      lastError = undefined;
    },

    getActor() {
      return structuredClone(actor);
    },

    async setOnlineTransport() {
      logger({
        event: "local_transport_attach_ignored",
      });
    },
  };
};

async function copyTemplateFiles(templateId, targetPath) {
  const templateFilesPath = `/templates/${templateId}/files/`;
  const filesToCopy = await getTemplateFiles(templateId);

  for (const fileName of filesToCopy) {
    try {
      const sourcePath = templateFilesPath + fileName;
      const targetFilePath = await join(targetPath, fileName);

      const response = await fetch(sourcePath + "?raw");
      if (response.ok) {
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await writeFile(targetFilePath, uint8Array);
      }
    } catch (error) {
      console.error(`Failed to copy template file ${fileName}:`, error);
    }
  }
}

export const createTauriProjectServiceAdapters = ({
  collabLog,
  creatorVersion,
}) => {
  const filesPathByProjectPath = new Map();
  const fileUrlByCacheKey = new Map();

  const readProjectAppValueByReference = async ({ reference, key }) => {
    const projectPath = reference?.projectPath;
    if (!projectPath || !key) {
      return undefined;
    }

    const dbFilePath = await join(projectPath, PROJECT_DB_NAME);
    if (!(await exists(dbFilePath))) {
      throw createProjectDatabaseOpenError();
    }

    const db = getManagedSqliteConnection({
      dbPath: `sqlite:${dbFilePath}`,
      busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
    });
    await db.init();

    try {
      const rows = await withSqliteLockRetry(() =>
        db.select("SELECT value FROM app_state WHERE key = $1", [key]),
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return parseStoredAppValue(row?.value);
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      if (
        message.includes("no such table") ||
        message.includes("no such column")
      ) {
        return undefined;
      }
      throw error;
    }
  };

  const getReferenceFilesPath = async (reference) => {
    const projectPath = reference?.projectPath;
    if (!projectPath) {
      throw new Error("projectPath is required");
    }

    if (filesPathByProjectPath.has(projectPath)) {
      return filesPathByProjectPath.get(projectPath);
    }

    const filesPath = await join(projectPath, "files");
    filesPathByProjectPath.set(projectPath, filesPath);
    return filesPath;
  };

  const getFileUrlCacheKey = (reference, fileId) => {
    const projectKey = reference?.cacheKey ?? reference?.projectPath ?? "";
    return `${projectKey}:${fileId ?? ""}`;
  };

  const promptDistributionZipPath = async ({
    zipName,
    options = {},
    filePicker,
  }) => {
    return filePicker.saveFilePicker({
      title: options.title || "Save Distribution ZIP",
      defaultPath: `${zipName}.zip`,
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });
  };

  const collectDistributionZipAssets = async ({
    fileIds,
    getCurrentReference,
  }) => {
    const reference = getCurrentReference();
    const filesPath = await join(reference.projectPath, "files");
    const uniqueFileIds = [];
    const seenFileIds = new Set();

    for (const fileId of fileIds || []) {
      if (!fileId || seenFileIds.has(fileId)) continue;
      seenFileIds.add(fileId);
      uniqueFileIds.push(fileId);
    }

    const assets = [];
    for (const fileId of uniqueFileIds) {
      const filePath = await join(filesPath, fileId);
      const fileExists = await exists(filePath);
      if (!fileExists) {
        console.warn(`Skipping missing file during export: ${fileId}`);
        continue;
      }
      assets.push({
        id: fileId,
        path: filePath,
        mime: "application/octet-stream",
      });
    }

    return assets;
  };

  const createDistributionZipStreamedToPath = async ({
    projectData,
    fileIds,
    outputPath,
    staticFiles,
    options = {},
    getCurrentReference,
  }) => {
    const assets = await collectDistributionZipAssets({
      fileIds,
      getCurrentReference,
    });

    await invoke("create_distribution_zip_streamed", {
      outputPath,
      assets,
      instructionsJson: JSON.stringify(projectData),
      indexHtml: staticFiles.indexHtml || null,
      mainJs: staticFiles.mainJs || null,
      usePartFile: options.usePartFile ?? true,
    });

    return outputPath;
  };

  const storageAdapter = {
    resolveProjectReferenceByProjectId: async ({ db, projectId }) => {
      const projects = (await db.get("projectEntries")) || [];
      const project = projects.find((entry) => entry.id === projectId);
      if (!project) {
        throw new Error("project not found");
      }

      return {
        projectPath: project.projectPath,
        cacheKey: project.projectPath,
        repositoryProjectId: projectId,
      };
    },

    resolveProjectReferenceByPath: async ({ projectPath }) => ({
      projectPath,
      cacheKey: projectPath,
      repositoryProjectId: projectPath,
    }),

    readCreatorVersionByReference: async ({ reference }) => {
      const creatorVersion = await readProjectAppValueByReference({
        reference,
        key: CREATOR_VERSION_KEY,
      });
      return Number.isFinite(creatorVersion) ? creatorVersion : 0;
    },

    readProjectInfoByReference: async ({ reference }) => {
      return normalizeProjectInfo(
        await readProjectAppValueByReference({
          reference,
          key: PROJECT_INFO_KEY,
        }),
      );
    },

    createStore: async ({ reference }) => {
      return createPersistedTauriProjectStore({
        projectPath: reference.projectPath,
        projectId: reference.repositoryProjectId,
      });
    },

    evictStoreByReference: async ({ reference }) => {
      await evictPersistedTauriProjectStoreCache({
        projectPath: reference?.projectPath,
      });
    },

    initializeProject: async ({
      projectId,
      projectPath,
      template,
      projectInfo,
      projectResolution,
    }) => {
      if (!projectId) {
        throw new Error(
          "projectId is required for Tauri project initialization",
        );
      }

      if (!template) {
        throw new Error("Template is required for project initialization");
      }

      const filesPath = await join(projectPath, "files");
      await mkdir(filesPath, { recursive: true });

      const loadedTemplateData = await loadTemplate(template);
      const resolvedProjectResolution = resolveProjectResolutionForWrite({
        projectResolution,
        fallbackResolution: loadedTemplateData.project?.resolution,
      });
      const templateData = scaleTemplateProjectStateForResolution(
        loadedTemplateData,
        resolvedProjectResolution,
      );
      await copyTemplateFiles(template, filesPath);

      assertSupportedProjectState(templateData);

      const store = await createPersistedTauriProjectStore({
        projectPath,
        projectId,
      });
      const initialEvent = createProjectCreateRepositoryEvent({
        projectId,
        state: templateData,
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

    storeFile: async ({
      file,
      bytes,
      projectId: _projectId,
      projectPath,
      idGenerator,
      getCurrentReference,
    }) => {
      const reference = projectPath
        ? {
            projectPath,
            cacheKey: projectPath,
            repositoryProjectId: projectPath,
          }
        : getCurrentReference();
      const fileId = idGenerator();
      const arrayBuffer = bytes ?? (await file.arrayBuffer());
      const uint8Array = new Uint8Array(arrayBuffer);

      const filesPath = await getReferenceFilesPath(reference);
      await mkdir(filesPath, { recursive: true });
      const filePath = await join(filesPath, fileId);

      await writeFile(filePath, uint8Array);

      const fileUrl = convertFileSrc(filePath);
      fileUrlByCacheKey.set(getFileUrlCacheKey(reference, fileId), fileUrl);

      return {
        fileId,
        downloadUrl: fileUrl,
      };
    },

    getFileContent: async ({ fileId, getCurrentReference }) => {
      const reference = getCurrentReference();
      const cacheKey = getFileUrlCacheKey(reference, fileId);
      const cachedUrl = fileUrlByCacheKey.get(cacheKey);
      if (cachedUrl) {
        return { url: cachedUrl };
      }

      const filesPath = await getReferenceFilesPath(reference);
      const filePath = await join(filesPath, fileId);
      const url = convertFileSrc(filePath);
      fileUrlByCacheKey.set(cacheKey, url);
      return { url };
    },

    getFileByProjectId: async () => {
      throw new Error(
        "Reading project files by project id is not supported on this platform.",
      );
    },

    downloadBundle: async ({ bundle, filename, options, filePicker }) => {
      try {
        const selectedPath = await filePicker.saveFilePicker({
          title: options.title || "Save Bundle File",
          defaultPath: filename,
          filters: [{ name: "Visual Novel Bundle", extensions: ["bin"] }],
        });

        if (!selectedPath) {
          return null;
        }

        await writeFile(selectedPath, bundle);
        return selectedPath;
      } catch (error) {
        console.error("Error saving bundle with dialog:", error);
        throw error;
      }
    },

    createDistributionZip: async ({
      bundle,
      zipName,
      options,
      filePicker,
      staticFiles,
    }) => {
      try {
        const zip = new JSZip();
        zip.file("package.bin", bundle);
        if (staticFiles.indexHtml)
          zip.file("index.html", staticFiles.indexHtml);
        if (staticFiles.mainJs) zip.file("main.js", staticFiles.mainJs);

        const zipBlob = await zip.generateAsync({ type: "uint8array" });
        const selectedPath = await filePicker.saveFilePicker({
          title: options.title || "Save Distribution ZIP",
          defaultPath: `${zipName}.zip`,
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (!selectedPath) {
          return null;
        }

        await writeFile(selectedPath, zipBlob);
        return selectedPath;
      } catch (error) {
        console.error("Error saving distribution ZIP with dialog:", error);
        throw error;
      }
    },

    createDistributionZipStreamed: async ({
      projectData,
      fileIds,
      zipName,
      options,
      filePicker,
      staticFiles,
      getCurrentReference,
    }) => {
      try {
        const selectedPath = await promptDistributionZipPath({
          zipName,
          options,
          filePicker,
        });

        if (!selectedPath) {
          return null;
        }

        return createDistributionZipStreamedToPath({
          projectData,
          fileIds,
          outputPath: selectedPath,
          staticFiles,
          options,
          getCurrentReference,
        });
      } catch (error) {
        console.error(
          "Error saving streamed distribution ZIP with dialog:",
          error,
        );
        throw error;
      }
    },

    promptDistributionZipPath,
    createDistributionZipStreamedToPath,
  };

  const collabAdapter = {
    beforeCreateRepository: async () => {},

    afterCreateRepository: async () => {},

    createTransport: ({ endpointUrl }) =>
      createWebSocketTransport({
        url: endpointUrl,
        label: "routevn.collab.tauri.transport",
      }),

    onEnsureLocalSession: () => {},

    onSessionCleared: () => {},

    onSessionTransportUpdated: () => {},

    createSessionForProject: async ({
      projectId,
      token,
      userId,
      clientId,
      endpointUrl,
      mode,
      getRepositoryByProject,
      getStoreByProject,
    }) => {
      collabLog("info", "create session requested", {
        projectId,
        endpointUrl: endpointUrl || null,
        mode,
        hasToken: Boolean(token),
        userId,
        clientId,
      });

      const repository = await getRepositoryByProject(projectId);
      const state = repository.getState();
      assertSupportedProjectState(state);

      const resolvedProjectId = projectId;
      const repositoryStore = await getStoreByProject(projectId);
      if (mode === "local" && !endpointUrl) {
        const localSession = createLocalOnlyProjectCollabSession({
          actor: {
            userId,
            clientId,
          },
          clientStore: repositoryStore,
          logger: (entry) => {
            collabLog("debug", "local-session", entry);
          },
        });
        await localSession.start();
        collabLog("info", "local-only session started", {
          projectId: resolvedProjectId,
          mode,
        });
        return localSession;
      }

      const projectionTracker = createCommittedCommandProjectionTracker();
      const collabSession = createProjectCollabService({
        projectId: resolvedProjectId,
        token,
        actor: {
          userId,
          clientId,
        },
        clientStore: repositoryStore,
        logger: (entry) => {
          collabLog("debug", "sync-client", entry);
        },
        onCommittedCommand: async ({
          command,
          committedEvent,
          sourceType,
          isFromCurrentActor,
        }) => {
          const { projectionStatus, projectionGap } =
            projectionTracker.resolveCommittedCommand({
              command,
              committedEvent,
              sourceType,
              isFromCurrentActor,
            });

          if (projectionGap) {
            await saveProjectionGap(repositoryStore, projectionGap);
          }
          if (isFromCurrentActor) return;
          if (projectionStatus !== "applied") return;
          try {
            await applyCommandToRepository({
              repository,
              command,
              projectId: resolvedProjectId,
            });
          } catch (error) {
            await saveProjectionGap(
              repositoryStore,
              createProjectionGap({
                command,
                committedEvent,
                compatibility: {
                  status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
                  reason: "creator_model_projection_failed",
                  message: error?.message || "projection failed",
                },
                sourceType,
              }),
            );
            collabLog("warn", "remote command projection failed", {
              projectId: resolvedProjectId,
              sourceType,
              commandType: command?.type || null,
              commandId: command?.id || null,
              committedId: Number.isFinite(Number(committedEvent?.committedId))
                ? Number(committedEvent.committedId)
                : null,
              error: error?.message || "unknown",
            });
            return;
          }
          await clearProjectionGap(repositoryStore);
        },
      });

      await collabSession.start();
      collabLog("info", "session started", {
        projectId: resolvedProjectId,
        mode,
        online: Boolean(endpointUrl),
      });
      if (endpointUrl) {
        collabLog("info", "attaching websocket transport", {
          endpointUrl,
        });
        const transport = createWebSocketTransport({
          url: endpointUrl,
          label: "routevn.collab.tauri.transport",
        });
        await collabSession.setOnlineTransport(transport);
        collabLog("info", "websocket transport attached", {
          endpointUrl,
        });
      }

      return collabSession;
    },
  };

  return {
    storageAdapter,
    fileAdapter,
    collabAdapter,
  };
};
