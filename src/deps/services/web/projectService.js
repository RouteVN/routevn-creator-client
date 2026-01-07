import { nanoid } from "nanoid";
import JSZip from "jszip";
import { createRepository } from "insieme";
import {
  createInsiemeWebStoreAdapter,
  initializeProject as initializeWebProject,
} from "../../infra/web/webRepositoryAdapter.js";
import { createBundle } from "../../../utils/bundleUtils.js";
import {
  getImageDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "../../../utils/fileProcessors.js";

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
 * Create a project service for the web that manages repositories and operations.
 * Gets current projectId from router query params automatically.
 *
 * @param {Object} params
 * @param {Object} params.router - Router instance to get current projectId from URL
 * @param {Object} params.filePicker - Web file picker instance
 */
export const createProjectService = ({ router, filePicker }) => {
  // Repository cache
  const repositoriesByProject = new Map();

  // Current repository cache (for sync access after ensureRepository is called)
  let currentRepository = null;
  let currentProjectId = null;
  let currentAdapter = null;

  // Get current projectId from URL query params
  const getCurrentProjectId = () => {
    const { p } = router.getPayload();
    return p;
  };

  // Get or create repository by projectId
  const getRepositoryByProject = async (projectId) => {
    if (repositoriesByProject.has(projectId)) {
      return repositoriesByProject.get(projectId);
    }

    const store = await createInsiemeWebStoreAdapter(projectId);
    const repository = createRepository({ originStore: store });
    await repository.init({ initialState: initialProjectData });
    repository.adapter = store; // Attach adapter for file ops
    repositoriesByProject.set(projectId, repository);
    return repository;
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
    currentAdapter = repository.adapter;
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

  const getCachedAdapter = () => {
    const projectId = getCurrentProjectId();
    if (!currentAdapter || currentProjectId !== projectId) {
      throw new Error(
        "Adapter not initialized. Call ensureRepository() first.",
      );
    }
    return currentAdapter;
  };

  // File operations helpers
  const storeFile = async (file) => {
    const adapter = getCachedAdapter();
    const fileId = nanoid();
    const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type });
    await adapter.setFile(fileId, fileBlob);
    return { fileId };
  };

  const getFileUrl = async (fileId) => {
    const adapter = getCachedAdapter();
    const blob = await adapter.getFile(fileId);
    if (!blob) {
      throw new Error(`File not found: ${fileId}`);
    }
    const url = URL.createObjectURL(blob);
    return { url, type: blob.type };
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
      const { fileId } = await storeFile(file);
      return { fileId, dimensions, type: "image" };
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
      const { fileId } = await storeFile(fileForStorage);

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

      const { fileId } = await storeFile(file);
      return { fileId, fontName, fontUrl, type: "font" };
    },
    generic: async (file) => {
      const { fileId } = await storeFile(file);
      return { fileId, type: "generic" };
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
    async ensureRepository() {
      return getCurrentRepository();
    },
    async appendEvent(event) {
      const repository = await getCurrentRepository();
      await repository.addEvent(event);
    },
    getState() {
      const repository = getCachedRepository();
      return repository.getState();
    },
    async getEvents() {
      const repository = await getCurrentRepository();
      return repository.getEvents();
    },
    async addVersionToProject(projectId, version) {
      const repository = await getRepositoryByProject(projectId);
      const versions = (await repository.adapter.app.get("versions")) || [];
      versions.unshift(version);
      await repository.adapter.app.set("versions", versions);
    },
    async deleteVersionFromProject(projectId, versionId) {
      const repository = await getRepositoryByProject(projectId);
      const versions = (await repository.adapter.app.get("versions")) || [];
      const newVersions = versions.filter((v) => v.id !== versionId);
      await repository.adapter.app.set("versions", newVersions);
    },
    async initializeProject({ name, description, projectId, template }) {
      return initializeWebProject({
        name,
        description,
        projectId,
        template,
      });
    },
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
          console.error(`Failed to upload ${file.name}:`, error);
          return { success: false, file, error: error.message };
        }
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
          const data = await response.json();
          URL.revokeObjectURL(url);
          return data;
        }
        URL.revokeObjectURL(url);
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
        // Do not revoke here, font needs it
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
    async downloadBundle(bundle, filename) {
      await filePicker.saveFilePicker(
        new Blob([bundle], { type: "application/octet-stream" }),
        filename,
      );
      return filename; // In web, we don't get a path back
    },
    async createDistributionZip(bundle, zipName) {
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

      const zipBlob = await zip.generateAsync({ type: "blob" });
      await filePicker.saveFilePicker(zipBlob, `${zipName}.zip`);
      return `${zipName}.zip`;
    },
  };
};
