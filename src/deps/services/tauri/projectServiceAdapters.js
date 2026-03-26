import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import {
  loadTemplate,
  getTemplateFiles,
} from "../../clients/web/templateLoader.js";
import { createPersistedTauriProjectStore } from "./collabClientStore.js";
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
import { resolveProjectResolutionForWrite } from "../../../internal/projectResolution.js";

const PROJECT_INFO_KEY = "projectInfo";
const CREATOR_VERSION_KEY = "creatorVersion";

const normalizeProjectInfo = (projectInfo = {}) => ({
  name: projectInfo.name ?? "",
  description: projectInfo.description ?? "",
  iconFileId: projectInfo.iconFileId ?? null,
});

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

const isAudioUploadFile = (file) => file?.type?.startsWith("audio/");

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

export const createTauriProjectServiceAdapters = ({ collabLog }) => {
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

    createStore: async ({ reference }) => {
      return createPersistedTauriProjectStore({
        projectPath: reference.projectPath,
        projectId: reference.repositoryProjectId,
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

      const templateData = await loadTemplate(template);
      templateData.project = {
        ...templateData.project,
        resolution: resolveProjectResolutionForWrite({
          projectResolution,
          fallbackResolution: templateData.project?.resolution,
        }),
      };
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

      await store.insertDraft({
        id: initialEvent.id,
        partition: initialEvent.partition,
        type: initialEvent.type,
        schemaVersion: initialEvent.schemaVersion,
        payload: structuredClone(initialEvent.payload),
        clientTs: Number(initialEvent.meta?.clientTs) || 0,
        createdAt: Number(initialEvent.meta?.clientTs) || 0,
      });

      await store.app.set(CREATOR_VERSION_KEY, 1);
      await store.app.set(PROJECT_INFO_KEY, normalizeProjectInfo(projectInfo));
    },
  };

  const fileAdapter = {
    continueOnUploadError: false,

    storeFile: async ({ file, bytes, idGenerator, getCurrentReference }) => {
      const reference = getCurrentReference();
      const fileId = idGenerator();
      const totalStartedAt = getNow();
      let uint8ArrayDurationMs = 0;
      let writeFileDurationMs = 0;

      try {
        const arrayBuffer = bytes ?? (await file.arrayBuffer());

        const uint8ArrayStartedAt = getNow();
        const uint8Array = new Uint8Array(arrayBuffer);
        uint8ArrayDurationMs = getDurationMs(uint8ArrayStartedAt);

        const filesPath = await join(reference.projectPath, "files");
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

        return {
          fileId,
          downloadUrl: convertFileSrc(filePath),
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
      const filesPath = await join(reference.projectPath, "files");
      const filePath = await join(filesPath, fileId);

      const fileExists = await exists(filePath);
      if (!fileExists) {
        throw new Error(`File not found: ${fileId}`);
      }

      return { url: convertFileSrc(filePath) };
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
        const selectedPath = await filePicker.saveFilePicker({
          title: options.title || "Save Distribution ZIP",
          defaultPath: `${zipName}.zip`,
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (!selectedPath) {
          return null;
        }

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

        await invoke("create_distribution_zip_streamed", {
          outputPath: selectedPath,
          assets,
          instructionsJson: JSON.stringify(projectData),
          indexHtml: staticFiles.indexHtml || null,
          mainJs: staticFiles.mainJs || null,
          usePartFile: options.usePartFile ?? true,
        });

        return selectedPath;
      } catch (error) {
        console.error(
          "Error saving streamed distribution ZIP with dialog:",
          error,
        );
        throw error;
      }
    },
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
