import { nanoid } from "nanoid";
import JSZip from "jszip";
import { createRepository } from "#insieme-compat";
import {
  createInsiemeWebStoreAdapter,
  initializeProject as initializeWebProject,
} from "../../infra/web/webRepositoryAdapter.js";
import { createBundle } from "../../../utils/bundleUtils.js";
import {
  createLegacyEventCommand,
  createProjectCollabService,
  createWebSocketTransport,
} from "../../../collab/v2/index.js";
import {
  getImageDimensions,
  getVideoDimensions,
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
  model_version: 2,
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

const assertV2State = (state) => {
  if (!state || state.model_version !== 2) {
    throw new Error(
      "Unsupported project model version. RouteVN V2 only supports model_version=2 projects.",
    );
  }
};

/**
 * Create a project service for the web that manages repositories and operations.
 * Gets current projectId from router query params automatically.
 *
 * @param {Object} params
 * @param {Object} params.router - Router instance to get current projectId from URL
 * @param {Object} params.filePicker - Web file picker instance
 */
const countImageEntries = (imagesData) =>
  Object.values(imagesData?.items || {}).filter(
    (item) => item?.type === "image",
  ).length;

export const createProjectService = ({ router, filePicker, onRemoteEvent }) => {
  const collabLog = (level, message, meta = {}) => {
    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.log.bind(console);
    fn(`[routevn.collab.web] ${message}`, meta);
  };

  // Repository cache
  const repositoriesByProject = new Map();
  const adaptersByProject = new Map();
  const collabSessionsByProject = new Map();
  const collabSessionModeByProject = new Map();
  const localCollabActorsByProject = new Map();
  const collabDiagnosticsByProject = new Map();
  const collabApplyQueueByProject = new Map();
  const collabLastCommittedIdByProject = new Map();

  // Initialization locks - prevents duplicate initialization
  const initLocksByProject = new Map(); // projectId -> Promise<Repository>

  // Current repository cache (for sync access after ensureRepository is called)
  let currentRepository = null;
  let currentProjectId = null;
  let currentAdapter = null;

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

  const updateCollabDiagnostics = (projectId, patch = {}) => {
    const existing = collabDiagnosticsByProject.get(projectId) || {};
    collabDiagnosticsByProject.set(projectId, {
      ...existing,
      projectId,
      lastUpdatedAt: Date.now(),
      ...patch,
    });
  };

  const ensureCommittedIdLoaded = async (projectId) => {
    if (collabLastCommittedIdByProject.has(projectId)) {
      return collabLastCommittedIdByProject.get(projectId);
    }
    collabLastCommittedIdByProject.set(projectId, 0);
    return 0;
  };

  const queueCollabApply = (projectId, task) => {
    const previous =
      collabApplyQueueByProject.get(projectId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(task)
      .catch((error) => {
        collabLog("error", "remote apply failed", {
          projectId,
          error: error?.message || "unknown",
        });
      });
    collabApplyQueueByProject.set(projectId, next);
    return next;
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
    updateCollabDiagnostics(projectId, {
      mode,
      endpointUrl: endpointUrl || null,
      actor: {
        userId,
        clientId,
      },
      partitions: resolvedPartitions,
      status: "starting",
    });
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
        updateCollabDiagnostics(projectId, {
          lastSyncEntry: entry,
          lastSyncEventAt: Date.now(),
        });
        collabLog("debug", "sync-client", entry);
      },
      onCommittedCommand: ({
        command,
        committedEvent,
        sourceType,
        isFromCurrentActor,
      }) =>
        queueCollabApply(projectId, async () => {
          const committedId = Number(committedEvent?.committed_id);
          const hasCommittedId = Number.isFinite(committedId);
          const lastCommittedId = await ensureCommittedIdLoaded(projectId);

          if (hasCommittedId && committedId <= lastCommittedId) {
            collabLog("debug", "committed event skipped by watermark", {
              projectId,
              committedId,
              lastCommittedId,
              sourceType,
            });
            updateCollabDiagnostics(projectId, {
              status: "committed_event_skipped",
              lastSeenCommittedId: committedId,
              lastAppliedCommittedId: lastCommittedId,
              sourceType,
            });
            return;
          }

          const isLegacyEventCommand = command?.type === "legacy.event.apply";
          const shouldApplyRemoteLegacyEvent =
            isLegacyEventCommand &&
            (!isFromCurrentActor || sourceType === "broadcast");

          if (
            isLegacyEventCommand &&
            isFromCurrentActor &&
            sourceType !== "broadcast"
          ) {
            collabLog("debug", "legacy event skipped (current actor source)", {
              projectId,
              sourceType,
              commandId: command?.id || null,
              committedId: hasCommittedId ? committedId : null,
              actor: command?.actor || null,
            });
          }

          if (shouldApplyRemoteLegacyEvent) {
            const remoteEvent = command?.payload?.event;
            if (remoteEvent && typeof remoteEvent === "object") {
              const beforeState = repository.getState();
              const beforeImagesCount = countImageEntries(beforeState?.images);
              await repository.addEvent(remoteEvent);
              const afterState = repository.getState();
              const afterImagesCount = countImageEntries(afterState?.images);
              collabLog("info", "remote legacy event applied to repository", {
                projectId,
                eventType: remoteEvent?.type || null,
                eventTarget: remoteEvent?.payload?.target || null,
                beforeImagesCount,
                afterImagesCount,
                sourceType,
                isFromCurrentActor,
              });
              updateCollabDiagnostics(projectId, {
                status: "remote_legacy_event_applied",
                sourceType,
                lastRemoteEventType: remoteEvent.type || null,
              });
              if (typeof onRemoteEvent === "function") {
                onRemoteEvent({
                  projectId,
                  sourceType,
                  command,
                  committedEvent,
                  event: remoteEvent,
                });
              }
            }
          }

          if (hasCommittedId) {
            collabLastCommittedIdByProject.set(projectId, committedId);
          }
        }),
    });

    await collabSession.start();
    updateCollabDiagnostics(projectId, {
      status: "started",
    });
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
        label: "routevn.collab.web.transport",
      });
      await collabSession.setOnlineTransport(transport);
      updateCollabDiagnostics(projectId, {
        endpointUrl,
        status: "online_transport_attached",
      });
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

    collabLog(
      "warn",
      "creating local-only session (backend transport not attached)",
      {
        projectId,
        hint: "Set collabEndpoint or use default ws://localhost:8787/sync auto-connect.",
      },
    );
    updateCollabDiagnostics(projectId, {
      mode: "local",
      endpointUrl: null,
      status: "local_only",
    });

    const actor = getOrCreateLocalActor(projectId);
    return createSessionForProject({
      projectId,
      token: `user:${actor.userId}:client:${actor.clientId}`,
      userId: actor.userId,
      clientId: actor.clientId,
      mode: "local",
    });
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
        const store = await createInsiemeWebStoreAdapter(projectId);
        const repository = createRepository({
          originStore: store,
          snapshotInterval: 500, // Auto-save snapshot every 500 events
        });
        await repository.init({ initialState: initialProjectData });
        assertV2State(repository.getState());
        repositoriesByProject.set(projectId, repository);
        adaptersByProject.set(projectId, store);
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
    currentAdapter = adaptersByProject.get(projectId);
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
    getAdapterById(projectId) {
      return adaptersByProject.get(projectId);
    },
    async ensureRepository() {
      return getCurrentRepository();
    },
    async appendEvent(event) {
      const repository = await getCurrentRepository();
      await repository.addEvent(event);

      try {
        const currentProjectId = getCurrentProjectId();
        if (!currentProjectId) return;

        const session = await ensureCommandSessionForProject(currentProjectId);
        const state = repository.getState();
        assertV2State(state);

        const projectId = state.project?.id || currentProjectId;
        const actor =
          typeof session.getActor === "function"
            ? session.getActor()
            : getOrCreateLocalActor(currentProjectId);
        const command = createLegacyEventCommand({ projectId, actor, event });

        if (typeof session.submitLegacyCommand === "function") {
          await session.submitLegacyCommand(command);
        } else {
          await session.submitCommand(command);
        }
      } catch (error) {
        console.warn(
          "appendEvent command bridge failed; local event persisted only",
          error,
        );
      }
    },
    getState() {
      const repository = getCachedRepository();
      const state = repository.getState();
      assertV2State(state);
      return state;
    },
    async getEvents() {
      const repository = await getCurrentRepository();
      return repository.getEvents();
    },
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
    async initializeProject({ name, description, projectId, template }) {
      return initializeWebProject({
        name,
        description,
        projectId,
        template,
      });
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
          updateCollabDiagnostics(currentProjectId, {
            status: "replaced_local_session",
          });
        } else {
          if (endpointUrl) {
            const transport = createWebSocketTransport({ url: endpointUrl });
            await existing.setOnlineTransport(transport);
            updateCollabDiagnostics(currentProjectId, {
              endpointUrl,
              status: "online_transport_updated",
            });
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
    getCollabDiagnostics(projectId) {
      const targetProjectId = projectId || getCurrentProjectId();
      if (!targetProjectId) return null;
      const session = collabSessionsByProject.get(targetProjectId) || null;
      const diagnostics =
        collabDiagnosticsByProject.get(targetProjectId) || null;
      return {
        ...diagnostics,
        hasSession: Boolean(session),
        sessionMode: collabSessionModeByProject.get(targetProjectId) || null,
        sessionError: session?.getLastError?.() || null,
      };
    },
    async stopCollabSession(projectId) {
      const targetProjectId = projectId || getCurrentProjectId();
      if (!targetProjectId) return;
      const session = collabSessionsByProject.get(targetProjectId);
      if (!session) return;
      await session.stop();
      collabSessionsByProject.delete(targetProjectId);
      collabSessionModeByProject.delete(targetProjectId);
      collabApplyQueueByProject.delete(targetProjectId);
      updateCollabDiagnostics(targetProjectId, {
        status: "stopped",
      });
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

      const { indexHtml, mainJs } = await getBundleStaticFiles();
      if (indexHtml) zip.file("index.html", indexHtml);
      if (mainJs) zip.file("main.js", mainJs);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      await filePicker.saveFilePicker(zipBlob, `${zipName}.zip`);
      return `${zipName}.zip`;
    },
    async createDistributionZipStreamed(projectData, fileIds, zipName) {
      const uniqueFileIds = [];
      const seenFileIds = new Set();

      for (const fileId of fileIds || []) {
        if (!fileId || seenFileIds.has(fileId)) continue;
        seenFileIds.add(fileId);
        uniqueFileIds.push(fileId);
      }

      const files = {};
      for (const fileId of uniqueFileIds) {
        try {
          const content = await getFileUrl(fileId);
          const response = await fetch(content.url);
          const buffer = await response.arrayBuffer();
          files[fileId] = {
            buffer: new Uint8Array(buffer),
            mime: content.type,
          };
          URL.revokeObjectURL(content.url);
        } catch (error) {
          console.warn(`Failed to fetch file ${fileId}:`, error);
        }
      }

      const bundle = await createBundle(projectData, files);
      return await this.createDistributionZip(bundle, zipName);
    },
  };
};
