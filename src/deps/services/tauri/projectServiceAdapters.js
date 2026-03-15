import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import { createInsiemeTauriStoreAdapter } from "../../clients/tauri/tauriRepositoryAdapter.js";
import {
  loadTemplate,
  getTemplateFiles,
} from "../../clients/web/templateLoader.js";
import { createPersistedTauriCollabClientStore } from "./collabClientStore.js";
import { createProjectCollabService } from "../shared/collab/createProjectCollabService.js";
import {
  clearProjectionGap,
  ensureRepositoryProjectionCache,
  saveProjectionGap,
} from "../shared/collab/projectorCache.js";
import { createWebSocketTransport } from "../web/collab/createWebSocketTransport.js";
import { projectRepositoryStateToDomainState } from "../../../internal/project/projection.js";
import {
  applyCommandToRepository,
  assertSupportedProjectState,
  createProjectCreateRepositoryEvent,
  initialProjectData,
} from "../shared/projectRepository.js";

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
  const collabClientStoresByProjectPath = new Map();

  const getCollabClientStore = async (projectPath) => {
    const existing = collabClientStoresByProjectPath.get(projectPath);
    if (existing) return existing;

    const store = await createPersistedTauriCollabClientStore({
      projectPath,
    });
    collabClientStoresByProjectPath.set(projectPath, store);
    return store;
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
        repositoryProjectId: project.projectPath,
      };
    },

    resolveProjectReferenceByPath: async ({ projectPath }) => ({
      projectPath,
      cacheKey: projectPath,
      repositoryProjectId: projectPath,
    }),

    createStore: async ({ reference }) => {
      return createInsiemeTauriStoreAdapter(reference.projectPath);
    },

    initializeProject: async ({ projectPath, template }) => {
      if (!template) {
        throw new Error("Template is required for project initialization");
      }

      const filesPath = await join(projectPath, "files");
      await mkdir(filesPath, { recursive: true });

      const templateData = await loadTemplate(template);
      await copyTemplateFiles(template, filesPath);

      const initData = {
        ...initialProjectData,
        ...templateData,
        model_version: 2,
        project: { id: projectPath },
      };

      const bootstrapDomainState = projectRepositoryStateToDomainState({
        repositoryState: initData,
        projectId: projectPath,
      });

      const store = await createInsiemeTauriStoreAdapter(projectPath);
      await store.appendEvent(
        createProjectCreateRepositoryEvent({
          projectId: projectPath,
          state: bootstrapDomainState,
        }),
      );

      await store.app.set("creator_version", "2");
    },
  };

  const fileAdapter = {
    continueOnUploadError: false,

    storeFile: async ({ file, idGenerator, getCurrentReference }) => {
      const reference = getCurrentReference();
      const fileId = idGenerator();
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const filesPath = await join(reference.projectPath, "files");
      const filePath = await join(filesPath, fileId);
      await writeFile(filePath, uint8Array);

      return {
        fileId,
        downloadUrl: convertFileSrc(filePath),
      };
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
    beforeCreateRepository: async ({ reference, store }) => {
      const rawClientStore = await getCollabClientStore(reference.projectPath);
      const projectionCacheResult = await ensureRepositoryProjectionCache({
        repositoryStore: store,
        rawClientStore,
      });

      collabLog("debug", "repository projection cache ready", {
        projectId: reference.projectId,
        projectPath: reference.projectPath,
        rebuilt: projectionCacheResult.rebuilt,
        bootstrapped: projectionCacheResult.bootstrapped,
        repositoryEventCount: projectionCacheResult.repositoryEventCount,
        committedEventCount: projectionCacheResult.committedEventCount,
        projectionGap: projectionCacheResult.projectionGap || null,
      });

      return store.getEvents();
    },

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
      partitions,
      mode,
      partitioning,
      getRepositoryByProject,
      getStoreByProject,
      getProjectMetadataFromEntries,
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

      const resolvedProjectId = state.project?.id || projectId;
      const resolvedPartitions = partitioning.getBasePartitions(
        resolvedProjectId,
        partitions,
      );
      const projectMetadata = await getProjectMetadataFromEntries(projectId);
      const clientStore = await getCollabClientStore(resolvedProjectId);
      const repositoryStore = await getStoreByProject(projectId);
      const collabSession = createProjectCollabService({
        projectId: resolvedProjectId,
        projectName: projectMetadata.name,
        projectDescription: projectMetadata.description,
        initialState: projectRepositoryStateToDomainState({
          repositoryState: state,
          projectId: resolvedProjectId,
        }),
        token,
        actor: {
          userId,
          clientId,
        },
        partitions: resolvedPartitions,
        clientStore,
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
        partitions: resolvedPartitions,
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
