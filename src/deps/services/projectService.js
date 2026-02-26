import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import JSZip from "jszip";
import { createInsiemeTauriStoreAdapter } from "../infra/tauri/tauriRepositoryAdapter";
import { loadTemplate, getTemplateFiles } from "../../utils/templateLoader";
import { createBundle } from "../../utils/bundleUtils";
import {
  createCommandEnvelope,
  createProjectCollabService,
  createWebSocketTransport,
} from "../../collab/v2/index.js";
import { RESOURCE_TYPES } from "../../domain/v2/constants.js";
import {
  getImageDimensions,
  getVideoDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "../../utils/fileProcessors";
import { projectRepositoryStateToDomainState } from "../../domain/v2/stateProjection.js";
import {
  applyTypedCommandToRepository,
  assertV2State,
  createTreeCollection,
  createInsiemeProjectRepositoryRuntime,
  findLineLocation,
  findSectionLocation,
  getSiblingOrderNodes,
  initialProjectData,
  normalizeParentId,
  resolveIndexFromPosition,
  uniquePartitions,
} from "./shared/typedProjectRepository.js";

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
  const localCollabActorsByProject = new Map();

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

  const storyBasePartitionFor = (projectId) => `project:${projectId}:story`;
  const storyScenePartitionFor = (projectId, sceneId) =>
    `project:${projectId}:story:scene:${sceneId}`;
  const resourceTypePartitionFor = (projectId, resourceType) =>
    `project:${projectId}:resources:${resourceType}`;

  const getBasePartitions = (projectId, partitions) =>
    partitions || [
      storyBasePartitionFor(projectId),
      ...RESOURCE_TYPES.map((resourceType) =>
        resourceTypePartitionFor(projectId, resourceType),
      ),
      `project:${projectId}:layouts`,
      `project:${projectId}:settings`,
    ];

  const getOrCreateLocalActor = (projectId) => {
    const existing = localCollabActorsByProject.get(projectId);
    if (existing) return existing;
    const actor = {
      userId: `local-${projectId}`,
      clientId: `local-${nanoid()}`,
    };
    localCollabActorsByProject.set(projectId, actor);
    return actor;
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
      logger: (entry) => {
        collabLog("debug", "sync-client", entry);
      },
      onCommittedCommand: async ({ command, isFromCurrentActor }) => {
        if (isFromCurrentActor) return;
        await applyTypedCommandToRepository({
          repository,
          command,
          projectId: resolvedProjectId,
        });
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

  const ensureCommandSessionForProject = async (projectId) => {
    const existing = collabSessionsByProject.get(projectId);
    if (existing) return existing;

    const actor = getOrCreateLocalActor(projectId);
    return createSessionForProject({
      projectId,
      token: `user:${actor.userId}:client:${actor.clientId}`,
      userId: actor.userId,
      clientId: actor.clientId,
      mode: "local",
    });
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
        let existingEvents = (await store.getEvents()) || [];
        if (existingEvents.length === 0) {
          const bootstrapDomainState = projectRepositoryStateToDomainState({
            repositoryState: initialProjectData,
            projectId: projectPath,
          });
          const bootstrapEvent = {
            type: "typedSnapshot",
            payload: {
              projectId: projectPath,
              state: bootstrapDomainState,
            },
          };
          await store.appendTypedEvent(bootstrapEvent);
          existingEvents = [bootstrapEvent];
        }

        const repository = await createInsiemeProjectRepositoryRuntime({
          projectId: projectPath,
          store,
          events: existingEvents,
        });
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

  const ensureTypedCommandContext = async () => {
    const repository = await getCurrentRepository();
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const state = repository.getState();
    assertV2State(state);

    const projectId = state.project?.id || currentProjectId;
    const session = await ensureCommandSessionForProject(currentProjectId);
    const actor =
      typeof session.getActor === "function"
        ? session.getActor()
        : getOrCreateLocalActor(currentProjectId);

    return {
      repository,
      state,
      session,
      actor,
      projectId,
      currentProjectId,
    };
  };

  const submitTypedCommandWithContext = async ({
    context,
    scope,
    type,
    payload,
    partitions = [],
    basePartition,
  }) => {
    const resolvedBasePartition =
      basePartition || `project:${context.projectId}:${scope}`;
    const command = createCommandEnvelope({
      projectId: context.projectId,
      scope,
      partition: resolvedBasePartition,
      partitions: uniquePartitions(resolvedBasePartition, ...partitions),
      type,
      payload,
      actor: context.actor,
    });

    await context.session.submitCommand(command);

    const applyResult = await applyTypedCommandToRepository({
      repository: context.repository,
      command,
      projectId: context.projectId,
    });

    return {
      commandId: command.id,
      eventCount: applyResult.events.length,
      applyMode: applyResult.mode,
    };
  };

  const resolveResourceIndex = ({
    state,
    resourceType,
    parentId,
    position,
    index,
    movingId = null,
  }) => {
    if (Number.isInteger(index)) return index;
    const collection = state?.[resourceType];
    const siblings = getSiblingOrderNodes(collection, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveSceneIndex = ({
    state,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(state?.scenes, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveSectionIndex = ({
    scene,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(scene?.sections, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveLineIndex = ({
    section,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(section?.lines, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveLayoutElementIndex = ({
    layout,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(layout?.elements, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
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
      const context = await ensureTypedCommandContext();
      const keys = Object.keys(patch || {}).filter(
        (key) =>
          key && key !== "id" && key !== "createdAt" && key !== "updatedAt",
      );
      if (keys.length === 0) return;

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "project.update",
        payload: {
          patch: structuredClone(patch),
        },
        partitions: [],
      });
    },

    async createSceneItem({
      sceneId,
      name,
      parentId = null,
      position = "last",
      index,
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextSceneId = sceneId || nanoid();
      const resolvedIndex = resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(
        context.projectId,
        nextSceneId,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.create",
        payload: {
          sceneId: nextSceneId,
          name,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: structuredClone(data || {}),
        },
        partitions: [basePartition, scenePartition],
      });
      return nextSceneId;
    },

    async updateSceneItem({ sceneId, patch }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.update",
        payload: {
          sceneId,
          patch: structuredClone(patch || {}),
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async renameSceneItem({ sceneId, name }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.rename",
        payload: {
          sceneId,
          name,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async deleteSceneItem({ sceneId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.delete",
        payload: {
          sceneId,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async setInitialScene({ sceneId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.set_initial",
        payload: {
          sceneId,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async reorderSceneItem({
      sceneId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const resolvedIndex = resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        index,
        movingId: sceneId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.reorder",
        payload: {
          sceneId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async createSectionItem({
      sceneId,
      sectionId,
      name,
      parentId = null,
      position = "last",
      index,
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextSectionId = sectionId || nanoid();
      const scene = context.state?.scenes?.items?.[sceneId];
      const resolvedIndex = resolveSectionIndex({
        scene,
        parentId,
        position,
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.create",
        payload: {
          sceneId,
          sectionId: nextSectionId,
          name,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: structuredClone(data || {}),
        },
        partitions: [basePartition, scenePartition],
      });

      return nextSectionId;
    },

    async renameSectionItem({ sceneId, sectionId, name }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
      const scenePartition = sceneIdForPartition
        ? storyScenePartitionFor(context.projectId, sceneIdForPartition)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.rename",
        payload: {
          sectionId,
          name,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async deleteSectionItem({ sceneId, sectionId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
      const scenePartition = sceneIdForPartition
        ? storyScenePartitionFor(context.projectId, sceneIdForPartition)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.delete",
        payload: {
          sectionId,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async createLineItem({
      sectionId,
      lineId,
      line = {},
      afterLineId,
      parentId = null,
      position,
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextLineId = lineId || nanoid();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedPosition =
        position || (afterLineId ? { after: afterLineId } : undefined);
      const resolvedIndex = resolveLineIndex({
        section: sectionLocation?.section,
        parentId,
        position: resolvedPosition || "last",
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, sectionLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.insert_after",
        payload: {
          sectionId,
          lineId: nextLineId,
          line: structuredClone(line || {}),
          afterLineId: afterLineId || null,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position: resolvedPosition || "last",
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });

      return nextLineId;
    },

    async updateLineActions({ lineId, patch, replace = false }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const lineLocation = findLineLocation(context.state, lineId);
      const scenePartition = lineLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, lineLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.update_actions",
        payload: {
          lineId,
          patch: structuredClone(patch || {}),
          replace: replace === true,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async deleteLineItem({ lineId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const lineLocation = findLineLocation(context.state, lineId);
      const scenePartition = lineLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, lineLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.delete",
        payload: {
          lineId,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async moveLineItem({
      lineId,
      toSectionId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const targetSection = findSectionLocation(context.state, toSectionId);
      const resolvedIndex = resolveLineIndex({
        section: targetSection?.section,
        parentId,
        position,
        index,
        movingId: lineId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const sourceLine = findLineLocation(context.state, lineId);
      const sourceScenePartition = sourceLine?.sceneId
        ? storyScenePartitionFor(context.projectId, sourceLine.sceneId)
        : null;
      const targetScenePartition = targetSection?.sceneId
        ? storyScenePartitionFor(context.projectId, targetSection.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.move",
        payload: {
          lineId,
          toSectionId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [basePartition, sourceScenePartition, targetScenePartition],
      });
    },

    async createResourceItem({
      resourceType,
      resourceId,
      data,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextResourceId = resourceId || nanoid();
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId,
        position,
        index,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.create",
        payload: {
          resourceType,
          resourceId: nextResourceId,
          data: structuredClone(data),
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
      return nextResourceId;
    },

    async updateResourceItem({ resourceType, resourceId, patch }) {
      const context = await ensureTypedCommandContext();
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.update",
        payload: {
          resourceType,
          resourceId,
          patch: structuredClone(patch),
        },
        partitions: [],
      });
    },

    async moveResourceItem({
      resourceType,
      resourceId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId,
        position,
        index,
        movingId: resourceId,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.move",
        payload: {
          resourceType,
          resourceId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
    },

    async deleteResourceItem({ resourceType, resourceId }) {
      const context = await ensureTypedCommandContext();
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.delete",
        payload: {
          resourceType,
          resourceId,
        },
        partitions: [],
      });
    },

    async duplicateResourceItem({
      resourceType,
      sourceId,
      newId,
      parentId,
      position,
      index,
      name,
    }) {
      const context = await ensureTypedCommandContext();
      const collection = context.state?.[resourceType];
      const sourceItem = collection?.items?.[sourceId];
      const resolvedParentId = normalizeParentId(
        parentId ?? sourceItem?.parentId ?? null,
      );
      const resolvedPosition = position || { after: sourceId };
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId: resolvedParentId,
        position: resolvedPosition,
        index,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.duplicate",
        payload: {
          resourceType,
          sourceId,
          newId,
          parentId: resolvedParentId,
          index: resolvedIndex,
          position: resolvedPosition,
          name: typeof name === "string" && name.length > 0 ? name : undefined,
        },
        partitions: [],
      });
    },

    async createLayoutItem({
      layoutId,
      name,
      layoutType = "normal",
      elements = createTreeCollection(),
      parentId = null,
      position = "last",
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextLayoutId = layoutId || nanoid();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.create",
        payload: {
          layoutId: nextLayoutId,
          name,
          layoutType,
          elements: structuredClone(elements || createTreeCollection()),
          parentId: normalizeParentId(parentId),
          position,
          data: structuredClone(data || {}),
        },
        partitions: [],
      });

      return nextLayoutId;
    },

    async renameLayoutItem({ layoutId, name }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.rename",
        payload: {
          layoutId,
          name,
        },
        partitions: [],
      });
    },

    async deleteLayoutItem({ layoutId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.delete",
        payload: {
          layoutId,
        },
        partitions: [],
      });
    },

    async updateLayoutElement({ layoutId, elementId, patch, replace = true }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.update",
        payload: {
          layoutId,
          elementId,
          patch: structuredClone(patch || {}),
          replace: replace === true,
        },
        partitions: [],
      });
    },

    async createLayoutElement({
      layoutId,
      elementId,
      element,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextElementId = elementId || nanoid();
      const layout = context.state?.layouts?.items?.[layoutId];
      const resolvedIndex = resolveLayoutElementIndex({
        layout,
        parentId,
        position,
        index,
      });

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.create",
        payload: {
          layoutId,
          elementId: nextElementId,
          element: structuredClone(element || {}),
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });

      return nextElementId;
    },

    async moveLayoutElement({
      layoutId,
      elementId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const layout = context.state?.layouts?.items?.[layoutId];
      const resolvedIndex = resolveLayoutElementIndex({
        layout,
        parentId,
        position,
        index,
        movingId: elementId,
      });

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.move",
        payload: {
          layoutId,
          elementId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
    },

    async deleteLayoutElement({ layoutId, elementId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.delete",
        payload: {
          layoutId,
          elementId,
        },
        partitions: [],
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
      const context = await ensureTypedCommandContext();
      const nextVariableId = variableId || nanoid();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.create",
        payload: {
          variableId: nextVariableId,
          name,
          variableType: type,
          initialValue: defaultValue,
          parentId: normalizeParentId(parentId),
          position,
          data: {
            scope,
          },
        },
        partitions: [],
      });

      return nextVariableId;
    },

    async updateVariableItem({ variableId, patch }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.update",
        payload: {
          variableId,
          patch: structuredClone(patch || {}),
        },
        partitions: [],
      });
    },

    async deleteVariableItem({ variableId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.delete",
        payload: {
          variableId,
        },
        partitions: [],
      });
    },

    // Sync state access - requires ensureRepository() to be called first
    getState() {
      const repository = getCachedRepository();
      const state = repository.getState();
      assertV2State(state);
      return state;
    },
    getDomainState() {
      const repositoryState = this.getState();
      const projectId =
        repositoryState?.project?.id ||
        getCurrentProjectId() ||
        "unknown-project";
      return projectRepositoryStateToDomainState({
        repositoryState,
        projectId,
      });
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
        model_version: 2,
        project: { name, description },
      };

      const bootstrapDomainState = projectRepositoryStateToDomainState({
        repositoryState: initData,
        projectId: projectPath,
      });

      // Create store and initialize typed bootstrap state
      const store = await createInsiemeTauriStoreAdapter(projectPath);
      await store.appendTypedEvent({
        type: "typedSnapshot",
        payload: {
          projectId: projectPath,
          state: bootstrapDomainState,
        },
      });

      await store.app.set("creator_version", "2");
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
