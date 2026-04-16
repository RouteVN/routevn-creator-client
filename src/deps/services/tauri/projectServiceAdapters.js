import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import JSZip from "jszip";
import {
  loadTemplate,
  getTemplateFiles,
} from "../../clients/web/templateLoader.js";
import {
  PROJECT_DB_NAME,
  createPersistedTauriProjectStore,
  evictPersistedTauriProjectStoreCache,
  toBootstrappedCommittedEvent,
} from "./collabClientStore.js";
import { createProjectCollabService } from "../shared/collab/createProjectCollabService.js";
import {
  clearProjectionGap,
  saveProjectionGap,
} from "../shared/collab/projectorCache.js";
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
  SQLITE_BUSY_TIMEOUT_MS,
  withSqliteLockRetry,
} from "../../../internal/sqliteLocking.js";

const PROJECT_INFO_KEY = "projectInfo";
const CREATOR_VERSION_KEY = "creatorVersion";
const APP_STATE_TABLE = "app_state";

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

const getNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

const getDurationMs = (startedAt) => Number((getNow() - startedAt).toFixed(2));

const isAudioUploadFile = (file) =>
  [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/ogg",
  ].includes(file?.type);

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

  const readProjectAppValueByPath = async ({ projectPath, key }) => {
    if (!projectPath || !key) {
      return undefined;
    }

    try {
      const dbPath = await join(projectPath, PROJECT_DB_NAME);
      // plugin-sql pools connections by db path; closing a raw preflight handle
      // here can tear down the shared pool used by the project store.
      const projectDb = await Database.load(`sqlite:${dbPath}`);
      await withSqliteLockRetry(() =>
        projectDb.execute(`PRAGMA busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`),
      );
      const rows = await withSqliteLockRetry(() =>
        projectDb.select(
          `SELECT value FROM ${APP_STATE_TABLE} WHERE key = $1`,
          [key],
        ),
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return parseStoredAppValue(row?.value);
    } catch {
      return undefined;
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
      const projectPath = reference?.projectPath;
      const parsedValue = await readProjectAppValueByPath({
        projectPath,
        key: CREATOR_VERSION_KEY,
      });
      return Number.isFinite(parsedValue) ? parsedValue : undefined;
    },

    readProjectInfoByReference: async ({ reference }) => {
      const projectPath = reference?.projectPath;
      return normalizeProjectInfo(
        await readProjectAppValueByPath({
          projectPath,
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
      await store.applyCommittedBatch({
        events: [
          {
            ...toBootstrappedCommittedEvent(initialEvent, 0),
            projectId,
          },
        ],
        nextCursor: 1,
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
      const totalStartedAt = getNow();
      let uint8ArrayDurationMs = 0;
      let writeFileDurationMs = 0;

      try {
        const arrayBuffer = bytes ?? (await file.arrayBuffer());

        const uint8ArrayStartedAt = getNow();
        const uint8Array = new Uint8Array(arrayBuffer);
        uint8ArrayDurationMs = getDurationMs(uint8ArrayStartedAt);

        const filesPath = await getReferenceFilesPath(reference);
        await mkdir(filesPath, { recursive: true });
        const filePath = await join(filesPath, fileId);

        const writeFileStartedAt = getNow();
        await writeFile(filePath, uint8Array);
        writeFileDurationMs = getDurationMs(writeFileStartedAt);

        if (isAudioUploadFile(file)) {
          console.info("[audioUpload.store.tauri] complete", {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            usedPreloadedBytes: bytes !== undefined,
            uint8ArrayDurationMs,
            writeFileDurationMs,
            totalDurationMs: getDurationMs(totalStartedAt),
          });
        }

        const fileUrl = convertFileSrc(filePath);
        fileUrlByCacheKey.set(getFileUrlCacheKey(reference, fileId), fileUrl);

        return {
          fileId,
          downloadUrl: fileUrl,
        };
      } catch (error) {
        if (isAudioUploadFile(file)) {
          console.warn("[audioUpload.store.tauri] failed", {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            usedPreloadedBytes: bytes !== undefined,
            uint8ArrayDurationMs,
            writeFileDurationMs,
            totalDurationMs: getDurationMs(totalStartedAt),
            error: error?.message ?? "Unknown error",
          });
        }
        throw error;
      }
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
    createTransport: ({ endpointUrl }) =>
      createWebSocketTransport({
        url: endpointUrl,
        label: "routevn.collab.tauri.transport",
      }),

    createSessionForProject: async ({
      projectId,
      token,
      userId,
      clientId,
      endpointUrl,
      mode,
      getRepositoryByProject,
      getStoreByProject,
      getProjectInfoByProjectId,
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
      const projectInfo = await getProjectInfoByProjectId(projectId);
      const repositoryStore = await getStoreByProject(projectId);
      const collabSession = createProjectCollabService({
        projectId: resolvedProjectId,
        projectName: projectInfo.name,
        projectDescription: projectInfo.description,
        initialRepositoryState: state,
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
          isFromCurrentActor,
          projectionStatus,
          projectionGap,
        }) => {
          if (projectionGap) {
            await saveProjectionGap(repositoryStore, projectionGap);
          }
          if (isFromCurrentActor) return;
          if (projectionStatus !== "applied") return;
          await applyCommandToRepository({
            repository,
            command,
            projectId: resolvedProjectId,
          });
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
