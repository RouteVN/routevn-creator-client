import { createBundle } from "../../../utils/bundleUtils.js";
import {
  getImageDimensions,
  getVideoDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "../../../utils/fileProcessors.js";
import { assertV2State, createProjectRepository } from "./projectRepository.js";
import { getOrCreateLocked } from "./getOrCreateLocked.js";
import { createProjectCollabCore } from "./projectCollabCore.js";
import { loadFont } from "./fontLoader.js";

const getBundleStaticFiles = async () => {
  let indexHtml;
  let mainJs;

  try {
    const indexResponse = await fetch("/bundle/index.html");
    if (indexResponse.ok) {
      indexHtml = await indexResponse.text();
    }

    const mainJsResponse = await fetch("/bundle/main.js");
    if (mainJsResponse.ok) {
      mainJs = await mainJsResponse.text();
    }
  } catch (error) {
    console.error("Failed to fetch static bundle files:", error);
  }

  return { indexHtml, mainJs };
};

const storeMetadata = async ({ data, storeFile, idGenerator }) => {
  const jsonString = JSON.stringify(data, null, 2);
  const jsonBlob = new Blob([jsonString], { type: "application/json" });
  const uniqueName = `metadata_${idGenerator()}.json`;
  Object.defineProperty(jsonBlob, "name", {
    value: uniqueName,
    writable: false,
  });
  return storeFile(jsonBlob);
};

export const createProjectServiceCore = ({
  router,
  db,
  filePicker,
  idGenerator,
  collabLog,
  storageAdapter,
  fileAdapter,
  collabAdapter,
}) => {
  const repositoriesByCacheKey = new Map();
  const storesByCacheKey = new Map();
  const storesByProject = new Map();
  const referencesByProject = new Map();
  const storeLocksByCacheKey = new Map();
  const repositoryLocksByCacheKey = new Map();

  let currentRepository;
  let currentProjectId;
  let currentStore;
  let currentReference;

  const getCurrentProjectId = () => {
    return router.getPayload()?.p;
  };

  const getProjectMetadataFromEntries = async (projectId) => {
    if (!db || typeof db.get !== "function") {
      return {
        name: "",
        description: "",
      };
    }

    const entries = (await db.get("projectEntries")) || [];
    const entry = Array.isArray(entries)
      ? entries.find((item) => item?.id === projectId)
      : undefined;

    return {
      name: entry?.name || "",
      description: entry?.description || "",
    };
  };

  const normalizeReference = (reference, projectId) => {
    if (!reference || typeof reference !== "object") {
      throw new Error(`Project reference not found for '${projectId}'`);
    }

    return {
      ...reference,
      projectId,
      cacheKey: reference.cacheKey || projectId,
      repositoryProjectId: reference.repositoryProjectId || projectId,
    };
  };

  const resolveProjectReferenceByProjectId = async (projectId) => {
    if (!projectId) {
      throw new Error("projectId is required");
    }

    const cached = referencesByProject.get(projectId);
    if (cached) {
      return cached;
    }

    const reference = normalizeReference(
      await storageAdapter.resolveProjectReferenceByProjectId({
        db,
        projectId,
      }),
      projectId,
    );
    referencesByProject.set(projectId, reference);
    return reference;
  };

  const getStoreByReference = async (reference) => {
    return getOrCreateLocked({
      cache: storesByCacheKey,
      locks: storeLocksByCacheKey,
      key: reference.cacheKey,
      create: async () => {
        const store = await storageAdapter.createStore({ reference, db });
        if (reference.projectId) {
          storesByProject.set(reference.projectId, store);
          referencesByProject.set(reference.projectId, reference);
        }
        return store;
      },
    });
  };

  const getStoreByProject = async (projectId) => {
    const reference = await resolveProjectReferenceByProjectId(projectId);
    const store = await getStoreByReference(reference);
    storesByProject.set(projectId, store);
    return store;
  };

  const getRepositoryByReference = async (reference) => {
    return getOrCreateLocked({
      cache: repositoriesByCacheKey,
      locks: repositoryLocksByCacheKey,
      key: reference.cacheKey,
      create: async () => {
        const store = await getStoreByReference(reference);
        let events = (await store.getEvents()) || [];

        if (typeof collabAdapter?.beforeCreateRepository === "function") {
          const nextEvents = await collabAdapter.beforeCreateRepository({
            projectId: reference.projectId,
            reference,
            store,
            events,
          });
          if (Array.isArray(nextEvents)) {
            events = nextEvents;
          }
        }

        const repository = await createProjectRepository({
          projectId: reference.repositoryProjectId,
          store,
          events,
        });
        assertV2State(repository.getState());

        if (reference.projectId) {
          storesByProject.set(reference.projectId, store);
          referencesByProject.set(reference.projectId, reference);
        }

        if (typeof collabAdapter?.afterCreateRepository === "function") {
          await collabAdapter.afterCreateRepository({
            projectId: reference.projectId,
            reference,
            store,
            repository,
          });
        }

        return repository;
      },
    });
  };

  const getRepositoryByProject = async (projectId) => {
    const reference = await resolveProjectReferenceByProjectId(projectId);
    const repository = await getRepositoryByReference(reference);
    return repository;
  };

  const getRepositoryByPath =
    typeof storageAdapter.resolveProjectReferenceByPath === "function"
      ? async (projectPath) => {
          const reference = normalizeReference(
            await storageAdapter.resolveProjectReferenceByPath({
              db,
              projectPath,
            }),
            projectPath,
          );
          return getRepositoryByReference(reference);
        }
      : undefined;

  const getCurrentRepository = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }

    const reference = await resolveProjectReferenceByProjectId(projectId);
    const repository = await getRepositoryByReference(reference);
    const store = await getStoreByReference(reference);

    currentProjectId = projectId;
    currentRepository = repository;
    currentStore = store;
    currentReference = reference;

    return repository;
  };

  const getCachedRepository = () => {
    const projectId = getCurrentProjectId();
    if (!currentRepository || currentProjectId !== projectId) {
      throw new Error(
        "Repository not initialized. Call ensureRepository() first.",
      );
    }
    return currentRepository;
  };

  const getCachedStore = () => {
    const projectId = getCurrentProjectId();
    if (!currentStore || currentProjectId !== projectId) {
      throw new Error(
        "Adapter not initialized. Call ensureRepository() first.",
      );
    }
    return currentStore;
  };

  const getCachedReference = () => {
    const projectId = getCurrentProjectId();
    if (!currentReference || currentProjectId !== projectId) {
      throw new Error(
        "Project reference not initialized. Call ensureRepository() first.",
      );
    }
    return currentReference;
  };

  const storeFile = async (file) => {
    return fileAdapter.storeFile({
      file,
      idGenerator,
      getCurrentStore: getCachedStore,
      getCurrentReference: getCachedReference,
      getStoreByProject,
    });
  };

  const getFileContent = async (fileId) => {
    return fileAdapter.getFileContent({
      fileId,
      getCurrentStore: getCachedStore,
      getCurrentReference: getCachedReference,
      getStoreByProject,
    });
  };

  const processFile = async (file) => {
    const fileType = detectFileType(file);

    if (fileType === "image") {
      const dimensions = await getImageDimensions(file);
      const stored = await storeFile(file);
      return { ...stored, dimensions, type: "image" };
    }

    if (fileType === "audio") {
      const arrayBuffer = await file.arrayBuffer();
      const fileForWaveform = new File([arrayBuffer], file.name, {
        type: file.type,
      });
      const fileForStorage = new File([arrayBuffer], file.name, {
        type: file.type,
      });

      const waveformData = await extractWaveformData(fileForWaveform);
      const stored = await storeFile(fileForStorage);

      let waveformDataFileId = null;
      if (waveformData) {
        const compressedWaveformData = {
          ...waveformData,
          amplitudes: waveformData.amplitudes.map((value) =>
            Math.round(value * 255),
          ),
        };
        const waveformResult = await storeMetadata({
          data: compressedWaveformData,
          storeFile,
          idGenerator,
        });
        waveformDataFileId = waveformResult.fileId;
      }

      return {
        ...stored,
        waveformDataFileId,
        waveformData,
        duration: waveformData?.duration,
        type: "audio",
      };
    }

    if (fileType === "video") {
      const [dimensions, thumbnailData] = await Promise.all([
        getVideoDimensions(file),
        extractVideoThumbnail(file, {
          timeOffset: 1,
          width: 240,
          height: 135,
          format: "image/jpeg",
          quality: 0.8,
        }),
      ]);
      const [videoResult, thumbnailResult] = await Promise.all([
        storeFile(file),
        storeFile(thumbnailData.blob),
      ]);
      return {
        ...videoResult,
        thumbnailFileId: thumbnailResult.fileId,
        thumbnailData,
        dimensions,
        type: "video",
      };
    }

    if (fileType === "font") {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
      const fontUrl = URL.createObjectURL(file);

      try {
        await loadFont(fontName, fontUrl);
      } catch (loadError) {
        URL.revokeObjectURL(fontUrl);
        throw new Error(`Invalid font file: ${loadError.message}`);
      }

      const stored = await storeFile(file);
      return {
        ...stored,
        fontName,
        fontUrl,
        type: "font",
      };
    }

    const stored = await storeFile(file);
    return {
      ...stored,
      type: "generic",
    };
  };

  const collabCore = createProjectCollabCore({
    router,
    idGenerator,
    collabLog,
    getCurrentRepository,
    getCachedRepository,
    getRepositoryByProject,
    getAdapterByProject: (projectId) => storesByProject.get(projectId),
    createSessionForProject: (payload) =>
      collabAdapter.createSessionForProject({
        ...payload,
        getRepositoryByProject,
        getStoreByProject,
        getProjectMetadataFromEntries,
        collabLog,
      }),
    createTransport: collabAdapter.createTransport,
    onEnsureLocalSession: collabAdapter.onEnsureLocalSession,
    onSessionCleared: collabAdapter.onSessionCleared,
    onSessionTransportUpdated: collabAdapter.onSessionTransportUpdated,
  });

  const service = {
    async getRepository() {
      return getCurrentRepository();
    },

    async getRepositoryById(projectId) {
      return getRepositoryByProject(projectId);
    },

    getAdapterById(projectId) {
      return storesByProject.get(projectId);
    },

    async ensureRepository() {
      return getCurrentRepository();
    },

    ...collabCore.commandApi,

    addVersionToProject: collabCore.addVersionToProject,
    deleteVersionFromProject: collabCore.deleteVersionFromProject,
    deleteResourceItemIfUnused: collabCore.deleteResourceItemIfUnused,

    async initializeProject(payload) {
      return storageAdapter.initializeProject(payload);
    },

    createCollabSession: collabCore.createCollabSession,
    getCollabSession: collabCore.getCollabSession,
    getCollabSessionMode: collabCore.getCollabSessionMode,
    stopCollabSession: collabCore.stopCollabSession,
    submitCommand: collabCore.submitCommand,

    async uploadFiles(files) {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const uploadPromises = fileArray.map(async (file) => {
        try {
          const result = await processFile(file);
          return {
            success: true,
            file,
            displayName: file.name.replace(/\.[^.]+$/, ""),
            ...result,
          };
        } catch (error) {
          if (fileAdapter.continueOnUploadError === false) {
            throw error;
          }
          console.error(`Failed to upload ${file.name}:`, error);
          return { success: false, file, error: error.message };
        }
      });

      const results = await Promise.all(uploadPromises);
      return results.filter((result) => result.success);
    },

    async getFileContent(fileId) {
      return getFileContent(fileId);
    },

    async downloadMetadata(fileId) {
      try {
        const content = await getFileContent(fileId);
        const response = await fetch(content.url);
        if (response.ok) {
          const data = await response.json();
          content.revoke?.();
          return data;
        }
        content.revoke?.();
        console.error("Failed to download metadata:", response.statusText);
        return null;
      } catch (error) {
        console.error("Failed to download metadata:", error);
        return null;
      }
    },

    async loadFontFile({ fontName, fileId }) {
      if (!fontName || !fileId || fileId === "undefined") {
        throw new Error(
          "Invalid font parameters: fontName and fileId are required.",
        );
      }

      try {
        const content = await getFileContent(fileId);
        await loadFont(fontName, content.url);
        return { success: true };
      } catch (error) {
        console.error("Failed to load font file:", error);
        return { success: false, error: error.message };
      }
    },

    detectFileType,

    createBundle(projectData, assets) {
      return createBundle(projectData, assets);
    },

    exportProject(projectData, files) {
      return createBundle(projectData, files);
    },

    async downloadBundle(bundle, filename, options = {}) {
      return fileAdapter.downloadBundle({
        bundle,
        filename,
        options,
        filePicker,
      });
    },

    async createDistributionZip(bundle, zipName, options = {}) {
      return fileAdapter.createDistributionZip({
        bundle,
        zipName,
        options,
        filePicker,
        staticFiles: await getBundleStaticFiles(),
      });
    },

    async createDistributionZipStreamed(
      projectData,
      fileIds,
      zipName,
      options = {},
    ) {
      return fileAdapter.createDistributionZipStreamed({
        projectData,
        fileIds,
        zipName,
        options,
        filePicker,
        staticFiles: await getBundleStaticFiles(),
        getCurrentReference: getCachedReference,
        getCurrentStore: getCachedStore,
        getFileContent,
      });
    },
  };

  if (typeof getRepositoryByPath === "function") {
    service.getRepositoryByPath = getRepositoryByPath;
  }

  if (typeof fileAdapter.getFileByProjectId === "function") {
    service.getFileByProjectId = (projectId, fileId) =>
      fileAdapter.getFileByProjectId({
        projectId,
        fileId,
        getStoreByProject,
      });
  }

  return service;
};
