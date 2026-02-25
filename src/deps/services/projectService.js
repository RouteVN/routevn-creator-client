import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import JSZip from "jszip";
import { createRepository } from "#domain-structure";
import { createInsiemeTauriStoreAdapter } from "../infra/tauri/tauriRepositoryAdapter";
import { loadTemplate, getTemplateFiles } from "../../utils/templateLoader";
import { createBundle } from "../../utils/bundleUtils";
import {
  createProjectCollabService,
  createWebSocketTransport,
} from "../../collab/v2/index.js";
import {
  getImageDimensions,
  getVideoDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "../../utils/fileProcessors";
import { createEmptyProjectState } from "../../domain/v2/model.js";

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

const createInitialProjectData = (projectId = "") =>
  createEmptyProjectState({
    projectId,
    name: "",
    description: "",
  });

export const initialProjectData = createInitialProjectData();

const assertV2State = (state) => {
  if (!state || state.model_version !== 2) {
    throw new Error(
      "Unsupported project model version. RouteVN V2 only supports model_version=2 projects.",
    );
  }
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
  const collabLog = (level, message, meta = {}) => {
    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.log.bind(console);
    fn(`[routevn.collab.tauri] ${message}`, meta);
  };

  // Repository cache
  const repositoriesByProject = new Map();
  const repositoriesByPath = new Map();
  const adaptersByProject = new Map();
  const adaptersByPath = new Map();
  const collabSessionsByProject = new Map();
  const collabSessionModeByProject = new Map();

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

  const getBasePartitions = (projectId, partitions) =>
    partitions || [
      `project:${projectId}:story`,
      `project:${projectId}:resources`,
      `project:${projectId}:layouts`,
      `project:${projectId}:settings`,
    ];

  const toParentId = (parentId) =>
    typeof parentId === "string" && parentId.length > 0 && parentId !== "_root"
      ? parentId
      : "_root";

  const findSectionLocationInLegacyState = (state, sectionId) => {
    const sceneItems = state?.scenes?.items || {};
    for (const [sceneId, scene] of Object.entries(sceneItems)) {
      const section = scene?.sections?.items?.[sectionId];
      if (!section) continue;
      return { sceneId, section };
    }
    return null;
  };

  const findLineLocationInLegacyState = (state, lineId) => {
    const sceneItems = state?.scenes?.items || {};
    for (const [sceneId, scene] of Object.entries(sceneItems)) {
      const sectionItems = scene?.sections?.items || {};
      for (const [sectionId, section] of Object.entries(sectionItems)) {
        const line = section?.lines?.items?.[lineId];
        if (!line) continue;
        return { sceneId, sectionId, line };
      }
    }
    return null;
  };

  const createSessionForProject = async ({
    projectId,
    token,
    userId,
    clientId,
    endpointUrl,
    partitions,
    mode,
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
    assertV2State(state);

    const resolvedProjectId = state.project?.id || projectId;
    const resolvedPartitions = getBasePartitions(resolvedProjectId, partitions);
    const collabSession = createProjectCollabService({
      projectId: resolvedProjectId,
      projectName: state.project?.name || "",
      projectDescription: state.project?.description || "",
      token,
      actor: {
        userId,
        clientId,
      },
      partitions: resolvedPartitions,
      logger: (entry) => {
        collabLog("debug", "sync-client", entry);
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

    collabSessionsByProject.set(projectId, collabSession);
    collabSessionModeByProject.set(projectId, mode);
    return collabSession;
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
        assertV2State(repository.getState());
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

  const getBundleStaticFiles = async () => {
    let indexHtml = null;
    let mainJs = null;

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
        fileId: videoResult.fileId,
        downloadUrl: videoResult.downloadUrl,
        thumbnailFileId: thumbnailResult.fileId,
        thumbnailData,
        dimensions,
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

    async updateProjectFields({ patch }) {
      const entries = Object.entries(patch || {}).filter(
        ([key]) =>
          key && key !== "id" && key !== "createdAt" && key !== "updatedAt",
      );
      for (const [key, value] of entries) {
        await this.appendEvent({
          type: "set",
          payload: {
            target: `project.${key}`,
            value: structuredClone(value),
          },
        });
      }
    },

    async createSceneItem({
      sceneId,
      name,
      parentId = null,
      position = "last",
      data = {},
    }) {
      const nextSceneId = sceneId || nanoid();
      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: "scenes",
          value: {
            id: nextSceneId,
            type: "scene",
            name,
            sections: { items: {}, order: [] },
            ...structuredClone(data || {}),
          },
          options: {
            parent: toParentId(parentId),
            position,
          },
        },
      });
      return nextSceneId;
    },

    async updateSceneItem({ sceneId, patch }) {
      await this.appendEvent({
        type: "nodeUpdate",
        payload: {
          target: "scenes",
          value: structuredClone(patch || {}),
          options: {
            id: sceneId,
            replace: false,
          },
        },
      });
    },

    async renameSceneItem({ sceneId, name }) {
      await this.updateSceneItem({
        sceneId,
        patch: { name },
      });
    },

    async deleteSceneItem({ sceneId }) {
      await this.appendEvent({
        type: "nodeDelete",
        payload: {
          target: "scenes",
          options: {
            id: sceneId,
          },
        },
      });
    },

    async setInitialScene({ sceneId }) {
      await this.appendEvent({
        type: "set",
        payload: {
          target: "story.initialSceneId",
          value: sceneId,
        },
      });
    },

    async reorderSceneItem({ sceneId, parentId = null, position = "last" }) {
      await this.appendEvent({
        type: "nodeMove",
        payload: {
          target: "scenes",
          options: {
            id: sceneId,
            parent: toParentId(parentId),
            position,
          },
        },
      });
    },

    async createSectionItem({
      sceneId,
      sectionId,
      name,
      parentId = null,
      position = "last",
      data = {},
    }) {
      const nextSectionId = sectionId || nanoid();
      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: `scenes.items.${sceneId}.sections`,
          value: {
            id: nextSectionId,
            type: "section",
            name,
            lines: { items: {}, order: [] },
            ...structuredClone(data || {}),
          },
          options: {
            parent: toParentId(parentId),
            position,
          },
        },
      });
      return nextSectionId;
    },

    async renameSectionItem({ sceneId, sectionId, name }) {
      const resolvedSceneId =
        sceneId ||
        findSectionLocationInLegacyState(this.getState(), sectionId)?.sceneId;
      if (!resolvedSceneId) return;

      await this.appendEvent({
        type: "nodeUpdate",
        payload: {
          target: `scenes.items.${resolvedSceneId}.sections`,
          value: {
            name,
          },
          options: {
            id: sectionId,
            replace: false,
          },
        },
      });
    },

    async deleteSectionItem({ sceneId, sectionId }) {
      const resolvedSceneId =
        sceneId ||
        findSectionLocationInLegacyState(this.getState(), sectionId)?.sceneId;
      if (!resolvedSceneId) return;

      await this.appendEvent({
        type: "nodeDelete",
        payload: {
          target: `scenes.items.${resolvedSceneId}.sections`,
          options: {
            id: sectionId,
          },
        },
      });
    },

    async createLineItem({
      sectionId,
      lineId,
      line = {},
      afterLineId,
      parentId = null,
      position = "last",
    }) {
      const nextLineId = lineId || nanoid();
      const location = findSectionLocationInLegacyState(
        this.getState(),
        sectionId,
      );
      if (!location) return nextLineId;

      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: `scenes.items.${location.sceneId}.sections.items.${sectionId}.lines`,
          value: {
            id: nextLineId,
            ...structuredClone(line || {}),
          },
          options: {
            parent: toParentId(parentId),
            position: afterLineId ? { after: afterLineId } : position,
          },
        },
      });

      return nextLineId;
    },

    async updateLineActions({ lineId, patch, replace = false }) {
      const location = findLineLocationInLegacyState(this.getState(), lineId);
      if (!location) return;

      await this.appendEvent({
        type: "set",
        payload: {
          target: `scenes.items.${location.sceneId}.sections.items.${location.sectionId}.lines.items.${lineId}.actions`,
          value: structuredClone(patch || {}),
          options: {
            replace: replace === true,
          },
        },
      });
    },

    async deleteLineItem({ lineId }) {
      const location = findLineLocationInLegacyState(this.getState(), lineId);
      if (!location) return;

      await this.appendEvent({
        type: "nodeDelete",
        payload: {
          target: `scenes.items.${location.sceneId}.sections.items.${location.sectionId}.lines`,
          options: {
            id: lineId,
          },
        },
      });
    },

    async moveLineItem({
      lineId,
      toSectionId,
      parentId = null,
      position = "last",
    }) {
      const sectionLocation = findSectionLocationInLegacyState(
        this.getState(),
        toSectionId,
      );
      if (!sectionLocation) return;

      await this.appendEvent({
        type: "nodeMove",
        payload: {
          target: `scenes.items.${sectionLocation.sceneId}.sections.items.${toSectionId}.lines`,
          options: {
            id: lineId,
            parent: toParentId(parentId),
            position,
          },
        },
      });
    },

    async createResourceItem({
      resourceType,
      resourceId,
      data,
      parentId = null,
      position = "last",
    }) {
      const nextResourceId = resourceId || nanoid();
      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: resourceType,
          value: {
            id: nextResourceId,
            ...structuredClone(data || {}),
          },
          options: {
            parent: parentId || "_root",
            position,
          },
        },
      });
      return nextResourceId;
    },

    async updateResourceItem({ resourceType, resourceId, patch }) {
      await this.appendEvent({
        type: "nodeUpdate",
        payload: {
          target: resourceType,
          value: structuredClone(patch || {}),
          options: {
            id: resourceId,
            replace: false,
          },
        },
      });
    },

    async moveResourceItem({
      resourceType,
      resourceId,
      parentId = null,
      position = "last",
    }) {
      await this.appendEvent({
        type: "nodeMove",
        payload: {
          target: resourceType,
          options: {
            id: resourceId,
            parent: parentId || "_root",
            position,
          },
        },
      });
    },

    async deleteResourceItem({ resourceType, resourceId }) {
      await this.appendEvent({
        type: "nodeDelete",
        payload: {
          target: resourceType,
          options: {
            id: resourceId,
          },
        },
      });
    },

    async duplicateResourceItem({
      resourceType,
      sourceId,
      newId,
      parentId,
      position,
      name,
    }) {
      const state = this.getState();
      const sourceItem = state?.[resourceType]?.items?.[sourceId];
      if (!sourceItem) {
        throw new Error(
          `Cannot duplicate missing resource '${sourceId}' in '${resourceType}'`,
        );
      }
      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: resourceType,
          value: {
            ...structuredClone(sourceItem),
            id: newId,
            name:
              typeof name === "string" && name.length > 0
                ? name
                : `${sourceItem.name || "Resource"} Copy`,
          },
          options: {
            parent: parentId || sourceItem.parentId || "_root",
            position: position || { after: sourceId },
          },
        },
      });
    },

    async createLayoutItem({
      layoutId,
      name,
      layoutType = "normal",
      elements = { items: {}, order: [] },
      parentId = null,
      position = "last",
      data = {},
    }) {
      const nextLayoutId = layoutId || nanoid();
      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: "layouts",
          value: {
            id: nextLayoutId,
            type: "layout",
            name,
            layoutType,
            elements: structuredClone(elements || { items: {}, order: [] }),
            ...structuredClone(data || {}),
          },
          options: {
            parent: parentId || "_root",
            position,
          },
        },
      });
      return nextLayoutId;
    },

    async renameLayoutItem({ layoutId, name }) {
      await this.appendEvent({
        type: "nodeUpdate",
        payload: {
          target: "layouts",
          value: { name },
          options: {
            id: layoutId,
            replace: false,
          },
        },
      });
    },

    async deleteLayoutItem({ layoutId }) {
      await this.appendEvent({
        type: "nodeDelete",
        payload: {
          target: "layouts",
          options: {
            id: layoutId,
          },
        },
      });
    },

    async updateLayoutElement({ layoutId, elementId, patch, replace = true }) {
      await this.appendEvent({
        type: "nodeUpdate",
        payload: {
          target: `layouts.items.${layoutId}.elements`,
          value: structuredClone(patch || {}),
          options: {
            id: elementId,
            replace: replace === true,
          },
        },
      });
    },

    async createLayoutElement({
      layoutId,
      elementId,
      element,
      parentId = null,
      position = "last",
    }) {
      const nextElementId = elementId || nanoid();
      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: `layouts.items.${layoutId}.elements`,
          value: {
            id: nextElementId,
            ...structuredClone(element || {}),
          },
          options: {
            parent: toParentId(parentId),
            position,
          },
        },
      });
      return nextElementId;
    },

    async moveLayoutElement({
      layoutId,
      elementId,
      parentId = null,
      position = "last",
    }) {
      await this.appendEvent({
        type: "nodeMove",
        payload: {
          target: `layouts.items.${layoutId}.elements`,
          options: {
            id: elementId,
            parent: toParentId(parentId),
            position,
          },
        },
      });
    },

    async deleteLayoutElement({ layoutId, elementId }) {
      await this.appendEvent({
        type: "nodeDelete",
        payload: {
          target: `layouts.items.${layoutId}.elements`,
          options: {
            id: elementId,
          },
        },
      });
    },

    async createVariableItem({
      variableId,
      name,
      scope = "global",
      type = "string",
      defaultValue = "",
      parentId = null,
      position = "last",
    }) {
      const nextVariableId = variableId || nanoid();
      await this.appendEvent({
        type: "nodeInsert",
        payload: {
          target: "variables",
          value: {
            id: nextVariableId,
            itemType: "variable",
            name,
            scope,
            type,
            default: defaultValue,
          },
          options: {
            parent: parentId || "_root",
            position,
          },
        },
      });
      return nextVariableId;
    },

    async updateVariableItem({ variableId, patch }) {
      await this.appendEvent({
        type: "nodeUpdate",
        payload: {
          target: "variables",
          value: structuredClone(patch || {}),
          options: {
            id: variableId,
            replace: false,
          },
        },
      });
    },

    async deleteVariableItem({ variableId }) {
      await this.appendEvent({
        type: "nodeDelete",
        payload: {
          target: "variables",
          options: {
            id: variableId,
          },
        },
      });
    },

    // Event sourcing - automatically uses current project
    async appendEvent(event) {
      const repository = await getCurrentRepository();
      await repository.addEvent(event);
    },

    // Sync state access - requires ensureRepository() to be called first
    getState() {
      const repository = getCachedRepository();
      const state = repository.getState();
      assertV2State(state);
      return state;
    },
    getDomainState() {
      return this.getState();
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
    async initializeProject({
      name,
      description,
      projectPath,
      projectId,
      template,
    }) {
      if (!template) {
        throw new Error("Template is required for project initialization");
      }

      const filesPath = await join(projectPath, "files");
      await mkdir(filesPath, { recursive: true });

      // Load template data first
      const templateData = await loadTemplate(template);
      const isCanonicalDomainTemplate = Boolean(
        templateData &&
          typeof templateData === "object" &&
          templateData.model_version === 2 &&
          templateData.resources &&
          templateData.story &&
          templateData.scenes &&
          templateData.sections &&
          templateData.lines &&
          templateData.layouts &&
          templateData.variables,
      );
      if (!isCanonicalDomainTemplate) {
        throw new Error(
          "Template repository.json must be canonical v2 domain state.",
        );
      }
      await copyTemplateFiles(template, filesPath);

      // Merge template with project info
      const initData = {
        ...createInitialProjectData(projectId),
        ...templateData,
        model_version: 2,
        project: {
          ...templateData?.project,
          id:
            typeof projectId === "string" && projectId.length > 0
              ? projectId
              : (templateData?.project?.id ?? "unknown-project"),
          name,
          description,
          updatedAt: Date.now(),
        },
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

    async createCollabSession({
      token,
      userId,
      clientId = nanoid(),
      endpointUrl,
      partitions,
    }) {
      const currentProjectId = getCurrentProjectId();
      if (!currentProjectId) {
        throw new Error("No project selected (missing ?p= in URL)");
      }
      collabLog("info", "createCollabSession called", {
        currentProjectId,
        endpointUrl: endpointUrl || null,
        hasToken: Boolean(token),
        userId,
        clientId,
      });

      const existing = collabSessionsByProject.get(currentProjectId);
      const existingMode = collabSessionModeByProject.get(currentProjectId);
      if (existing) {
        collabLog("info", "existing session found", {
          currentProjectId,
          existingMode,
        });
        const hasExplicitIdentity = Boolean(token && userId);
        if (hasExplicitIdentity && existingMode === "local") {
          await existing.stop();
          collabSessionsByProject.delete(currentProjectId);
          collabSessionModeByProject.delete(currentProjectId);
          collabLog("info", "replaced local session with explicit identity", {
            currentProjectId,
          });
        } else {
          if (endpointUrl) {
            const transport = createWebSocketTransport({ url: endpointUrl });
            await existing.setOnlineTransport(transport);
            collabLog("info", "updated existing session transport", {
              currentProjectId,
              endpointUrl,
            });
          }
          return existing;
        }
      }
      return createSessionForProject({
        projectId: currentProjectId,
        token,
        userId,
        clientId,
        endpointUrl,
        partitions,
        mode: "explicit",
      });
    },

    getCollabSession() {
      const currentProjectId = getCurrentProjectId();
      if (!currentProjectId) return null;
      return collabSessionsByProject.get(currentProjectId) || null;
    },

    async stopCollabSession(projectId) {
      const targetProjectId = projectId || getCurrentProjectId();
      if (!targetProjectId) return;
      const session = collabSessionsByProject.get(targetProjectId);
      if (!session) return;
      await session.stop();
      collabSessionsByProject.delete(targetProjectId);
      collabSessionModeByProject.delete(targetProjectId);
      collabLog("info", "session stopped", {
        projectId: targetProjectId,
      });
    },

    async submitCommand(command) {
      const session = this.getCollabSession();
      if (!session) {
        throw new Error(
          "Collaboration session not initialized. Call createCollabSession() first.",
        );
      }
      return session.submitCommand(command);
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

        const { indexHtml, mainJs } = await getBundleStaticFiles();
        if (indexHtml) zip.file("index.html", indexHtml);
        if (mainJs) zip.file("main.js", mainJs);

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

    async createDistributionZipStreamed(
      projectData,
      fileIds,
      zipName,
      options = {},
    ) {
      try {
        const selectedPath = await filePicker.saveFilePicker({
          title: options.title || "Save Distribution ZIP",
          defaultPath: `${zipName}.zip`,
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (!selectedPath) {
          return null;
        }

        const filesPath = await getFilesPath();
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

        const { indexHtml, mainJs } = await getBundleStaticFiles();

        await invoke("create_distribution_zip_streamed", {
          outputPath: selectedPath,
          assets,
          instructionsJson: JSON.stringify(projectData),
          indexHtml,
          mainJs,
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
