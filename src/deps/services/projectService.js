import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import JSZip from "jszip";
import { createRepository } from "insieme";
import { createInsiemeTauriStoreAdapter } from "../infra/tauri/tauriRepositoryAdapter";
import { loadTemplate, getTemplateFiles } from "../../utils/templateLoader";
import { createBundle } from "../../utils/bundleUtils";
import {
  getImageDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "../../utils/fileProcessors";

// Font loading helper
const loadFont = async (fontName, fontUrl) => {
  const existingFont = Array.from(document.fonts).find(
    (font) => font.family === fontName,
  );
  if (existingFont) {
    return existingFont;
  }

  const fontFace = new FontFace(fontName, `url(${fontUrl})`);
  await fontFace.load();
  document.fonts.add(fontFace);
  return fontFace;
};

/**
 * Default empty project data structure
 */
export const initialProjectData = {
  project: {
    name: "",
    description: "",
  },
  story: {
    initialSceneId: "",
  },
  images: {
    items: {},
    tree: [],
  },
  tweens: {
    items: {},
    tree: [],
  },
  sounds: {
    items: {},
    tree: [],
  },
  videos: {
    items: {},
    tree: [],
  },
  characters: {
    items: {},
    tree: [],
  },
  fonts: {
    items: {},
    tree: [],
  },
  transforms: {
    items: {},
    tree: [],
  },
  colors: {
    items: {},
    tree: [],
  },
  typography: {
    items: {},
    tree: [],
  },
  variables: {
    items: {},
    tree: [],
  },
  components: {
    items: {},
    tree: [],
  },
  layouts: {
    items: {},
    tree: [],
  },
  scenes: {
    items: {},
    tree: [],
  },
};

/**
 * Create a project service that manages repositories and operations for projects.
 * Gets current projectId from router query params automatically.
 *
 * @param {Object} params
 * @param {Object} params.router - Router instance to get current projectId from URL
 * @param {Object} params.db - App database for project entries
 * @param {Object} params.filePicker - File picker instance
 */
export const createProjectService = ({ router, db, filePicker }) => {
  // Repository cache
  const repositoriesByProject = new Map();
  const repositoriesByPath = new Map();
  const adaptersByProject = new Map();
  const adaptersByPath = new Map();

  // Initialization locks - prevents duplicate initialization
  const initLocksByProject = new Map(); // projectId -> Promise<Repository>
  const initLocksByPath = new Map(); // projectPath -> Promise<Repository>

  // Current repository cache (for sync access after ensureRepository is called)
  let currentRepository = null;
  let currentProjectId = null;

  // Get current projectId from URL query params
  const getCurrentProjectId = () => {
    const { p } = router.getPayload();
    return p;
  };

  // Get or create repository by path
  const getRepositoryByPath = async (projectPath) => {
    // Check cache first
    if (repositoriesByPath.has(projectPath)) {
      return repositoriesByPath.get(projectPath);
    }

    // Check if initialization is already in progress
    if (initLocksByPath.has(projectPath)) {
      return initLocksByPath.get(projectPath);
    }

    // Create init promise and store lock
    const initPromise = (async () => {
      try {
        const store = await createInsiemeTauriStoreAdapter(projectPath);
        const repository = createRepository({
          originStore: store,
          snapshotInterval: 500, // Auto-save snapshot every 500 events
        });
        await repository.init({ initialState: initialProjectData });
        repositoriesByPath.set(projectPath, repository);
        adaptersByPath.set(projectPath, store);
        return repository;
      } finally {
        // Always remove the lock when done (success or failure)
        initLocksByPath.delete(projectPath);
      }
    })();

    initLocksByPath.set(projectPath, initPromise);
    return initPromise;
  };

  // Get or create repository by projectId
  const getRepositoryByProject = async (projectId) => {
    // Check cache first
    if (repositoriesByProject.has(projectId)) {
      return repositoriesByProject.get(projectId);
    }

    // Check if initialization is already in progress
    if (initLocksByProject.has(projectId)) {
      return initLocksByProject.get(projectId);
    }

    // Create init promise and store lock
    const initPromise = (async () => {
      try {
        const projects = (await db.get("projectEntries")) || [];
        const project = projects.find((p) => p.id === projectId);
        if (!project) {
          throw new Error("project not found");
        }

        const repository = await getRepositoryByPath(project.projectPath);
        const adapter = adaptersByPath.get(project.projectPath);
        repositoriesByProject.set(projectId, repository);
        adaptersByProject.set(projectId, adapter);
        return repository;
      } finally {
        // Always remove the lock when done (success or failure)
        initLocksByProject.delete(projectId);
      }
    })();

    initLocksByProject.set(projectId, initPromise);
    return initPromise;
  };

  // Get current project's repository (updates cache)
  const getCurrentRepository = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const repository = await getRepositoryByProject(projectId);
    // Update cache
    currentRepository = repository;
    currentProjectId = projectId;
    return repository;
  };

  // Get cached repository (sync) - throws if not initialized
  const getCachedRepository = () => {
    const projectId = getCurrentProjectId();
    if (!currentRepository || currentProjectId !== projectId) {
      throw new Error(
        "Repository not initialized. Call ensureRepository() first.",
      );
    }
    return currentRepository;
  };

  // Get current project's path
  const getCurrentProjectPath = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const projects = (await db.get("projectEntries")) || [];
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error("project not found");
    }
    return project.projectPath;
  };

  // File operations helpers
  const getFilesPath = async () => {
    const projectPath = await getCurrentProjectPath();
    return await join(projectPath, "files");
  };

  const storeFile = async (file) => {
    const fileId = nanoid();
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const filesPath = await getFilesPath();
    const filePath = await join(filesPath, fileId);
    await writeFile(filePath, uint8Array);

    const downloadUrl = convertFileSrc(filePath);
    return { fileId, downloadUrl };
  };

  const getFileUrl = async (fileId) => {
    const filesPath = await getFilesPath();
    const filePath = await join(filesPath, fileId);

    const fileExists = await exists(filePath);
    if (!fileExists) {
      throw new Error(`File not found: ${fileId}`);
    }

    const url = convertFileSrc(filePath);
    return { url };
  };

  const storeMetadata = async (data) => {
    const jsonString = JSON.stringify(data, null, 2);
    const jsonBlob = new Blob([jsonString], { type: "application/json" });
    const uniqueName = `metadata_${nanoid()}.json`;
    Object.defineProperty(jsonBlob, "name", {
      value: uniqueName,
      writable: false,
    });
    return await storeFile(jsonBlob);
  };

  // File processors
  const processors = {
    image: async (file) => {
      const dimensions = await getImageDimensions(file);
      const { fileId, downloadUrl } = await storeFile(file);
      return { fileId, downloadUrl, dimensions, type: "image" };
    },

    audio: async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const fileForWaveform = new File([arrayBuffer], file.name, {
        type: file.type,
      });
      const fileForStorage = new File([arrayBuffer], file.name, {
        type: file.type,
      });

      const waveformData = await extractWaveformData(fileForWaveform);
      const { fileId, downloadUrl } = await storeFile(fileForStorage);

      let waveformDataFileId = null;
      if (waveformData) {
        const compressedWaveformData = {
          ...waveformData,
          amplitudes: waveformData.amplitudes.map((value) =>
            Math.round(value * 255),
          ),
        };
        const waveformResult = await storeMetadata(compressedWaveformData);
        waveformDataFileId = waveformResult.fileId;
      }

      return {
        fileId,
        downloadUrl,
        waveformDataFileId,
        waveformData,
        duration: waveformData?.duration,
        type: "audio",
      };
    },

    video: async (file) => {
      const thumbnailData = await extractVideoThumbnail(file, {
        timeOffset: 1,
        width: 240,
        height: 135,
        format: "image/jpeg",
        quality: 0.8,
      });

      const [videoResult, thumbnailResult] = await Promise.all([
        storeFile(file),
        storeFile(thumbnailData.blob),
      ]);

      return {
        fileId: videoResult.fileId,
        downloadUrl: videoResult.downloadUrl,
        thumbnailFileId: thumbnailResult.fileId,
        thumbnailData,
        type: "video",
      };
    },

    font: async (file) => {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
      const fontUrl = URL.createObjectURL(file);

      try {
        await loadFont(fontName, fontUrl);
      } catch (loadError) {
        URL.revokeObjectURL(fontUrl);
        throw new Error(`Invalid font file: ${loadError.message}`);
      }

      const { fileId, downloadUrl } = await storeFile(file);
      return { fileId, downloadUrl, fontName, fontUrl, type: "font" };
    },

    generic: async (file) => {
      const { fileId, downloadUrl } = await storeFile(file);
      return { fileId, downloadUrl, type: "generic" };
    },
  };

  const processFile = async (file) => {
    const fileType = detectFileType(file);
    const processor = processors[fileType] || processors.generic;
    return processor(file);
  };

  return {
    // Repository access - uses current project from URL
    async getRepository() {
      return getCurrentRepository();
    },

    async getRepositoryById(projectId) {
      return getRepositoryByProject(projectId);
    },

    getAdapterById(projectId) {
      return adaptersByProject.get(projectId);
    },

    async getRepositoryByPath(projectPath) {
      return getRepositoryByPath(projectPath);
    },

    // Must be called before using sync methods (typically in handleAfterMount)
    async ensureRepository() {
      return getCurrentRepository();
    },

    // Event sourcing - automatically uses current project
    async appendEvent(event) {
      const repository = await getCurrentRepository();
      await repository.addEvent(event);
    },

    // Sync state access - requires ensureRepository() to be called first
    getState() {
      const repository = getCachedRepository();
      return repository.getState();
    },

    async getEvents() {
      const repository = await getCurrentRepository();
      return repository.getEvents();
    },

    // Version management
    async addVersionToProject(projectId, version) {
      let adapter = adaptersByProject.get(projectId);
      if (!adapter) {
        await getRepositoryByProject(projectId);
        adapter = adaptersByProject.get(projectId);
      }
      const versions = (await adapter.app.get("versions")) || [];
      versions.unshift(version);
      await adapter.app.set("versions", versions);
    },

    async deleteVersionFromProject(projectId, versionId) {
      let adapter = adaptersByProject.get(projectId);
      if (!adapter) {
        await getRepositoryByProject(projectId);
        adapter = adaptersByProject.get(projectId);
      }
      const versions = (await adapter.app.get("versions")) || [];
      const newVersions = versions.filter((v) => v.id !== versionId);
      await adapter.app.set("versions", newVersions);
    },

    // Initialize a new project at a given path
    async initializeProject({ name, description, projectPath, template }) {
      if (!template) {
        throw new Error("Template is required for project initialization");
      }

      const filesPath = await join(projectPath, "files");
      await mkdir(filesPath, { recursive: true });

      // Load template data first
      const templateData = await loadTemplate(template);
      await copyTemplateFiles(template, filesPath);

      // Merge template with project info
      const initData = {
        ...initialProjectData,
        ...templateData,
        project: { name, description },
      };

      // Create store and initialize repository with the full data
      const store = await createInsiemeTauriStoreAdapter(projectPath);
      const repository = createRepository({
        originStore: store,
        snapshotInterval: 500, // Auto-save snapshot every 500 events
      });
      await repository.init({ initialState: initData });

      await store.app.set("creator_version", "1");
    },

    // File operations - uses current project
    async uploadFiles(files) {
      const fileArray = Array.isArray(files) ? files : Array.from(files);

      const uploadPromises = fileArray.map(async (file) => {
        const result = await processFile(file);
        return {
          success: true,
          file,
          displayName: file.name.replace(/\.[^.]+$/, ""),
          ...result,
        };
      });

      const results = await Promise.all(uploadPromises);
      return results.filter((r) => r.success);
    },

    async getFileContent(fileId) {
      return await getFileUrl(fileId);
    },

    async downloadMetadata(fileId) {
      try {
        const { url } = await getFileUrl(fileId);
        const response = await fetch(url);
        if (response.ok) {
          return await response.json();
        }
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
        const { url } = await getFileUrl(fileId);
        await loadFont(fontName, url);
        return { success: true };
      } catch (error) {
        console.error("Failed to load font file:", error);
        return { success: false, error: error.message };
      }
    },

    detectFileType,

    // Bundle operations
    createBundle(projectData, assets) {
      return createBundle(projectData, assets);
    },

    exportProject(projectData, files) {
      return createBundle(projectData, files);
    },

    async downloadBundle(bundle, filename, options = {}) {
      try {
        const selectedPath = await filePicker.saveFilePicker({
          title: options.title || "Save Bundle File",
          defaultPath: filename,
          filters: [{ name: "Visual Novel Bundle", extensions: ["bin"] }],
        });

        if (selectedPath) {
          await writeFile(selectedPath, bundle);
          return selectedPath;
        }
        return null;
      } catch (error) {
        console.error("Error saving bundle with dialog:", error);
        throw error;
      }
    },

    async createDistributionZip(bundle, zipName, options = {}) {
      try {
        const zip = new JSZip();
        zip.file("package.bin", bundle);

        try {
          const indexResponse = await fetch("/bundle/index.html");
          const indexContent = await indexResponse.text();
          zip.file("index.html", indexContent);

          const mainJsResponse = await fetch("/bundle/main.js");
          const mainJsContent = await mainJsResponse.text();
          zip.file("main.js", mainJsContent);
        } catch (error) {
          console.error("Failed to fetch static bundle files:", error);
        }

        const zipBlob = await zip.generateAsync({ type: "uint8array" });

        const selectedPath = await filePicker.saveFilePicker({
          title: options.title || "Save Distribution ZIP",
          defaultPath: `${zipName}.zip`,
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (selectedPath) {
          await writeFile(selectedPath, zipBlob);
          return selectedPath;
        }
        return null;
      } catch (error) {
        console.error("Error saving distribution ZIP with dialog:", error);
        throw error;
      }
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
