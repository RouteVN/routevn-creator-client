import { nanoid } from "nanoid";
import JSZip from "jszip";
import {
  createInsiemeWebStoreAdapter,
  initializeProject as initializeWebProject,
} from "../../infra/web/webRepositoryAdapter.js";
import { createBundle } from "../../../utils/bundleUtils.js";
import {
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
import { projectRepositoryStateToDomainState } from "../../../domain/v2/stateProjection.js";
import { createPersistedInMemoryClientStore } from "./collabClientStore.js";
import {
  clearCommittedCursor,
  loadCommittedCursor,
  saveCommittedCursor,
} from "./collabCommittedCursorStore.js";
import { createProjectServiceCore } from "../shared/projectServiceCore.js";
import {
  applyTypedSnapshotToRepository,
  applyTypedCommandToRepository,
  assertV2State,
  createInsiemeProjectRepositoryRuntime,
  initialProjectData,
} from "../shared/typedProjectRepository.js";
import { buildBootstrapSeedEvent } from "./collabSeedSync.js";

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

const countImageEntries = (imagesData) =>
  Object.values(imagesData?.items || {}).filter(
    (item) => item?.type === "image",
  ).length;
const INITIAL_REMOTE_SYNC_TIMEOUT_MS = 5_000;

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
  const collabApplyQueueByProject = new Map();
  const collabLastCommittedIdByProject = new Map();
  const collabAppliedCommittedIdsByProject = new Map();
  const collabInitialSeedAttemptedByProject = new Set();

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

  const ensureCommittedIdLoaded = async (projectId) => {
    if (collabLastCommittedIdByProject.has(projectId)) {
      return collabLastCommittedIdByProject.get(projectId);
    }
    const adapter = adaptersByProject.get(projectId) || null;
    if (!adapter) {
      collabLastCommittedIdByProject.set(projectId, 0);
      return 0;
    }

    let loaded = 0;
    try {
      loaded = await loadCommittedCursor({ adapter, projectId });
    } catch (error) {
      collabLog("warn", "failed to load committed cursor", {
        projectId,
        error: error?.message || "unknown",
      });
    }

    collabLastCommittedIdByProject.set(projectId, loaded);
    return loaded;
  };

  const persistCommittedCursor = async (projectId, cursor) => {
    const normalized = Number.isFinite(Number(cursor))
      ? Math.max(0, Math.floor(Number(cursor)))
      : 0;
    const current = await ensureCommittedIdLoaded(projectId);
    if (normalized <= current) return current;

    collabLastCommittedIdByProject.set(projectId, normalized);
    const adapter = adaptersByProject.get(projectId) || null;
    if (!adapter) return normalized;

    try {
      await saveCommittedCursor({
        adapter,
        projectId,
        cursor: normalized,
      });
    } catch (error) {
      collabLog("warn", "failed to persist committed cursor", {
        projectId,
        cursor: normalized,
        error: error?.message || "unknown",
      });
    }

    return normalized;
  };
  const getAppliedCommittedSet = (projectId) => {
    let committedIds = collabAppliedCommittedIdsByProject.get(projectId);
    if (!committedIds) {
      committedIds = new Set();
      collabAppliedCommittedIdsByProject.set(projectId, committedIds);
    }
    return committedIds;
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
    partitioning,
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
    const adapter = adaptersByProject.get(projectId);
    if (!adapter) {
      throw new Error(`Store adapter not found for project '${projectId}'`);
    }

    const localTypedEvents = Array.isArray(repository.getEvents?.())
      ? repository.getEvents()
      : [];
    const localEventCount = localTypedEvents.length;
    const appearsBootstrapOnly =
      localEventCount <= 1 &&
      (state?.project?.name || "") === "" &&
      (state?.project?.description || "") === "";

    if (endpointUrl && appearsBootstrapOnly) {
      await clearCommittedCursor({
        adapter,
        projectId,
      }).catch(() => {});
      collabLastCommittedIdByProject.delete(projectId);
      collabAppliedCommittedIdsByProject.delete(projectId);
      collabLog("warn", "forcing full sync for bootstrap-only local project", {
        projectId,
        localEventCount,
      });
    }

    const resolvedProjectId = state.project?.id || projectId;
    const resolvedPartitions = partitioning.getBasePartitions(
      resolvedProjectId,
      partitions,
    );
    const clientStore = await createPersistedInMemoryClientStore({
      projectId,
      adapter,
      logger: (entry) => {
        if (entry?.level === "warn") {
          collabLog("warn", "client store warning", entry);
        }
      },
    });
    const initialPersistedCommittedCursor =
      await ensureCommittedIdLoaded(projectId);
    const actor = {
      userId,
      clientId,
    };
    let latestConnectedServerLastCommittedId = null;
    const collabSession = createProjectCollabService({
      projectId: resolvedProjectId,
      projectName: state.project?.name || "",
      projectDescription: state.project?.description || "",
      initialState: projectRepositoryStateToDomainState({
        repositoryState: state,
        projectId: resolvedProjectId,
      }),
      token,
      actor,
      partitions: resolvedPartitions,
      clientStore,
      logger: (entry) => {
        if (entry?.event === "connected") {
          const serverLastCommittedId = Number(entry?.server_last_committed_id);
          if (Number.isFinite(serverLastCommittedId)) {
            latestConnectedServerLastCommittedId = serverLastCommittedId;
          }
        }
        collabLog("debug", "sync-client", entry);
      },
      onCommittedCommand: ({
        command,
        committedEvent,
        sourceType,
        isFromCurrentActor,
      }) =>
        queueCollabApply(projectId, async () => {
          const applyCommittedEventToRepository = async ({
            command,
            committedEvent,
            sourceType,
            isFromCurrentActor,
          }) => {
            if (isFromCurrentActor) {
              const isBootstrapCommand = command?.type === "project.bootstrap";
              collabLog(
                "debug",
                isBootstrapCommand
                  ? "typed bootstrap skipped (current actor source)"
                  : "typed command skipped (current actor source)",
                {
                  projectId,
                  sourceType,
                  commandId: command?.id || null,
                  commandType: command?.type || null,
                  committedId: Number.isFinite(
                    Number(committedEvent?.committed_id),
                  )
                    ? Number(committedEvent.committed_id)
                    : null,
                },
              );
              return;
            }

            if (command?.type === "project.bootstrap") {
              const bootstrapState = command?.payload?.state;
              const applyResult = await applyTypedSnapshotToRepository({
                repository,
                state: bootstrapState,
                projectId: resolvedProjectId,
              });
              collabLog(
                "info",
                "remote bootstrap command applied to repository",
                {
                  projectId,
                  sourceType,
                  committedId: Number.isFinite(
                    Number(committedEvent?.committed_id),
                  )
                    ? Number(committedEvent.committed_id)
                    : null,
                },
              );
              if (typeof onRemoteEvent === "function") {
                for (const event of applyResult.events) {
                  onRemoteEvent({
                    projectId,
                    sourceType,
                    command,
                    committedEvent,
                    event,
                  });
                }
              }
              return;
            }

            const beforeState = repository.getState();
            const beforeImagesCount = countImageEntries(beforeState?.images);
            const applyResult = await applyTypedCommandToRepository({
              repository,
              command,
              projectId: resolvedProjectId,
            });
            if (applyResult.events.length === 0) {
              collabLog(
                "warn",
                "typed command ignored (no projection events)",
                {
                  projectId,
                  sourceType,
                  commandType: command?.type || null,
                  commandId: command?.id || null,
                },
              );
              return;
            }

            const afterState = repository.getState();
            const afterImagesCount = countImageEntries(afterState?.images);
            collabLog("info", "remote typed command applied to repository", {
              projectId,
              commandType: command?.type || null,
              applyMode: applyResult.mode,
              eventCount: applyResult.events.length,
              beforeImagesCount,
              afterImagesCount,
              sourceType,
            });
            if (typeof onRemoteEvent === "function") {
              for (const event of applyResult.events) {
                onRemoteEvent({
                  projectId,
                  sourceType,
                  command,
                  committedEvent,
                  event,
                });
              }
            }
          };

          const committedId = Number(committedEvent?.committed_id);
          const hasCommittedId = Number.isFinite(committedId);
          const lastCommittedId = await ensureCommittedIdLoaded(projectId);

          if (hasCommittedId) {
            const appliedCommittedIds = getAppliedCommittedSet(projectId);
            if (appliedCommittedIds.has(committedId)) {
              collabLog("debug", "committed event skipped (already applied)", {
                projectId,
                committedId,
                sourceType,
              });
              return;
            }
            appliedCommittedIds.add(committedId);
            if (appliedCommittedIds.size > 5000) {
              const oldest = appliedCommittedIds.values().next().value;
              appliedCommittedIds.delete(oldest);
            }
          }

          await applyCommittedEventToRepository({
            command,
            committedEvent,
            sourceType,
            isFromCurrentActor,
          });

          if (hasCommittedId) {
            const nextWatermark = Math.max(lastCommittedId, committedId);
            await persistCommittedCursor(projectId, nextWatermark);
          }
        }),
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
        label: "routevn.collab.web.transport",
      });
      try {
        await collabSession.setOnlineTransport(transport);
        collabLog("info", "websocket transport attached", {
          endpointUrl,
        });
      } catch (error) {
        collabLog(
          "warn",
          "failed to attach websocket transport; continuing in offline mode",
          {
            endpointUrl,
            error: error?.message || "unknown",
          },
        );
        return collabSession;
      }

      try {
        const syncStartedAt = Date.now();
        await collabSession.syncNow({
          timeoutMs: INITIAL_REMOTE_SYNC_TIMEOUT_MS,
        });
        // Wait until repository projection has finished applying synced events.
        await queueCollabApply(projectId, async () => {});
        const repositoryEventCount = Array.isArray(repository.getEvents?.())
          ? repository.getEvents().length
          : null;
        const syncDurationMs = Date.now() - syncStartedAt;
        collabLog("info", "initial remote sync completed", {
          projectId: resolvedProjectId,
          endpointUrl,
          syncDurationMs,
          repositoryEventCount,
        });
        const remoteStreamIsExplicitlyEmpty =
          latestConnectedServerLastCommittedId === 0;
        const noRemoteEventsAppliedDuringSync =
          repositoryEventCount === localEventCount;
        const shouldAttemptInitialSeed =
          initialPersistedCommittedCursor === 0 &&
          localEventCount > 0 &&
          remoteStreamIsExplicitlyEmpty &&
          noRemoteEventsAppliedDuringSync &&
          !collabInitialSeedAttemptedByProject.has(projectId);
        if (shouldAttemptInitialSeed) {
          const bootstrapSeedEvent = buildBootstrapSeedEvent({
            typedEvents: localTypedEvents,
            projectId: resolvedProjectId,
            actor,
            partitions: resolvedPartitions,
          });
          if (bootstrapSeedEvent) {
            collabInitialSeedAttemptedByProject.add(projectId);
            collabLog(
              "warn",
              "remote stream appears empty; publishing local bootstrap event",
              {
                projectId: resolvedProjectId,
                endpointUrl,
                bootstrapId: bootstrapSeedEvent.bootstrapId,
              },
            );
            try {
              await collabSession.submitSyncEvent({
                partitions: bootstrapSeedEvent.partitions,
                event: bootstrapSeedEvent.event,
              });
              await collabSession.flushDrafts();
              if (typeof collabSession.syncNow === "function") {
                try {
                  await collabSession.syncNow({
                    timeoutMs: INITIAL_REMOTE_SYNC_TIMEOUT_MS,
                  });
                } catch (error) {
                  collabLog("warn", "post-seed sync failed", {
                    projectId: resolvedProjectId,
                    error: error?.message || "unknown",
                  });
                }
              }
              collabLog("info", "local seed events published", {
                projectId: resolvedProjectId,
                seedEventCount: 1,
              });
            } catch (error) {
              collabInitialSeedAttemptedByProject.delete(projectId);
              collabLog("error", "failed to publish local seed events", {
                projectId: resolvedProjectId,
                seedEventCount: 1,
                error: error?.message || "unknown",
              });
            }
          } else {
            collabInitialSeedAttemptedByProject.delete(projectId);
            collabLog(
              "warn",
              "remote stream appears empty but no local bootstrap seed was available",
              {
                projectId: resolvedProjectId,
                endpointUrl,
              },
            );
          }
        } else if (
          initialPersistedCommittedCursor === 0 &&
          localEventCount > 0
        ) {
          collabLog("info", "skipping local bootstrap seed publish", {
            projectId: resolvedProjectId,
            endpointUrl,
            serverLastCommittedId: latestConnectedServerLastCommittedId,
            repositoryEventCount,
            localEventCount,
          });
        }
      } catch (error) {
        collabLog("warn", "initial remote sync failed", {
          projectId: resolvedProjectId,
          endpointUrl,
          error: error?.message || "unknown",
        });
      }
    }

    return collabSession;
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
        let existingEvents = (await store.getEvents()) || [];

        // Recover from stale sync cursor state: a project can have a persisted
        // cursor while local typed events are empty/minimal (e.g. cleared IDB events).
        const persistedCursor = await loadCommittedCursor({
          adapter: store,
          projectId,
        }).catch(() => 0);
        if (
          persistedCursor > existingEvents.length &&
          existingEvents.length <= 1
        ) {
          await clearCommittedCursor({
            adapter: store,
            projectId,
          }).catch(() => {});
          collabLastCommittedIdByProject.delete(projectId);
          collabLog("warn", "reset stale committed cursor for project", {
            projectId,
            persistedCursor,
            localEventCount: existingEvents.length,
          });
        }

        if (existingEvents.length === 0) {
          const bootstrapDomainState = projectRepositoryStateToDomainState({
            repositoryState: {
              ...initialProjectData,
              project: {
                ...initialProjectData.project,
                id: projectId,
              },
            },
            projectId,
          });
          const bootstrapEvent = {
            type: "typedSnapshot",
            payload: {
              projectId,
              state: bootstrapDomainState,
            },
          };
          await store.appendTypedEvent(bootstrapEvent);
          existingEvents = [bootstrapEvent];
        }

        const repository = await createInsiemeProjectRepositoryRuntime({
          projectId,
          store,
          events: existingEvents,
        });

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
  const serviceCore = createProjectServiceCore({
    router,
    idGenerator: nanoid,
    collabLog,
    getCurrentRepository,
    getCachedRepository,
    getRepositoryByProject,
    getAdapterByProject: (projectId) => adaptersByProject.get(projectId),
    createSessionForProject,
    createTransport: ({ endpointUrl }) =>
      createWebSocketTransport({
        url: endpointUrl,
        label: "routevn.collab.web.transport",
      }),
    onEnsureLocalSession: ({ projectId }) => {
      collabLog(
        "warn",
        "creating local-only session (backend transport not attached)",
        {
          projectId,
          hint: "Set collabEndpoint or use default ws://localhost:8787/sync auto-connect.",
        },
      );
    },
    onSessionCleared: ({ projectId, reason }) => {
      collabApplyQueueByProject.delete(projectId);
      collabAppliedCommittedIdsByProject.delete(projectId);
      void reason;
    },
    onSessionTransportUpdated: () => {},
  });

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
    ...serviceCore.typedCommandApi,
    addVersionToProject: serviceCore.addVersionToProject,
    deleteVersionFromProject: serviceCore.deleteVersionFromProject,
    async initializeProject({ name, description, projectId, template }) {
      return initializeWebProject({
        name,
        description,
        projectId,
        template,
      });
    },
    createCollabSession: serviceCore.createCollabSession,
    getCollabSession: serviceCore.getCollabSession,
    getCollabSessionMode: serviceCore.getCollabSessionMode,
    stopCollabSession: serviceCore.stopCollabSession,
    submitCommand: serviceCore.submitCommand,
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
