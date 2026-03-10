import JSZip from "jszip";
import { commandToSyncEvent } from "insieme/client";
import {
  createInsiemeWebStoreAdapter,
  initializeProject as initializeWebProject,
} from "../../infra/web/webRepositoryAdapter.js";
import {
  createProjectCollabService,
  createWebSocketTransport,
} from "../../../collab/index.js";
import { projectRepositoryStateToDomainState } from "../../../domain/stateProjection.js";
import { createPersistedInMemoryClientStore } from "./collabClientStore.js";
import {
  clearCommittedCursor,
  loadCommittedCursor,
  saveCommittedCursor,
} from "./collabCommittedCursorStore.js";
import {
  applyCommandToRepository,
  assertRepositoryCommandEvent,
  assertSupportedProjectState,
  repositoryEventToCommand,
} from "../shared/projectRepository.js";
import { createBundle } from "../../../utils/bundleUtils.js";

const countImageEntries = (imagesData) =>
  Object.values(imagesData?.items || {}).filter(
    (item) => item?.type === "image",
  ).length;

const toSyncSubmissionEvents = (repositoryEvents = []) =>
  repositoryEvents.map((repositoryEvent) => {
    assertRepositoryCommandEvent(repositoryEvent);
    return structuredClone(repositoryEvent);
  });

const toUncommittedSyncSubmissionEvents = ({
  repositoryEvents = [],
  committedCursor = 0,
}) => {
  const normalizedEvents = Array.isArray(repositoryEvents)
    ? repositoryEvents
    : [];
  const cursor = Number.isFinite(Number(committedCursor))
    ? Math.max(0, Math.floor(Number(committedCursor)))
    : 0;
  const startIndex = Math.min(cursor, normalizedEvents.length);
  return toSyncSubmissionEvents(normalizedEvents.slice(startIndex));
};

const toReplaySubmissionEvent = ({ repositoryEvent, actor }) => {
  assertRepositoryCommandEvent(repositoryEvent);
  const command = repositoryEventToCommand(repositoryEvent);
  const replayCommand = {
    ...command,
    actor: {
      userId: actor?.userId,
      clientId: actor?.clientId,
    },
  };

  return {
    id: replayCommand.id,
    partitions: Array.isArray(repositoryEvent?.partitions)
      ? [...repositoryEvent.partitions]
      : [],
    ...commandToSyncEvent(replayCommand),
  };
};

const summarizeRepositoryEventsForSync = (events = []) => {
  const normalizedEvents = Array.isArray(events) ? events : [];
  const commands = normalizedEvents.map((event) =>
    repositoryEventToCommand(event),
  );
  const firstCommand = commands[0] || null;
  const commandTypes = commands
    .slice(0, 8)
    .map((command) => command?.type || "unknown");
  const hasProjectCreated = commands.some(
    (command) => command?.type === "project.created",
  );

  return {
    repositoryEventCount: normalizedEvents.length,
    commandEventCount: commands.length,
    hasProjectCreated,
    commandTypesSample: commandTypes,
    firstCommandType: firstCommand?.type || null,
    firstCommandId: firstCommand?.id || null,
    firstCommandProjectId: firstCommand?.projectId || null,
    firstCommandPartition: firstCommand?.partition || null,
  };
};

const INITIAL_REMOTE_SYNC_TIMEOUT_MS = 5_000;

export const createWebProjectServiceAdapters = ({
  onRemoteEvent,
  collabLog,
}) => {
  const collabApplyQueueByProject = new Map();
  const collabLastCommittedIdByProject = new Map();
  const collabAppliedCommittedIdsByProject = new Map();

  const ensureCommittedIdLoaded = async (projectId, getStoreByProject) => {
    if (collabLastCommittedIdByProject.has(projectId)) {
      return collabLastCommittedIdByProject.get(projectId);
    }

    const adapter = await getStoreByProject(projectId);
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

  const persistCommittedCursor = async (
    projectId,
    cursor,
    getStoreByProject,
  ) => {
    const normalized = Number.isFinite(Number(cursor))
      ? Math.max(0, Math.floor(Number(cursor)))
      : 0;
    const current = await ensureCommittedIdLoaded(projectId, getStoreByProject);
    if (normalized <= current) {
      return current;
    }

    collabLastCommittedIdByProject.set(projectId, normalized);
    const adapter = await getStoreByProject(projectId);

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

  const storageAdapter = {
    resolveProjectReferenceByProjectId: async ({ projectId }) => ({
      cacheKey: projectId,
      repositoryProjectId: projectId,
    }),

    createStore: async ({ reference }) => {
      return createInsiemeWebStoreAdapter(reference.projectId);
    },

    initializeProject: async ({ projectId, template }) => {
      return initializeWebProject({
        projectId,
        template,
      });
    },
  };

  const fileAdapter = {
    continueOnUploadError: true,

    storeFile: async ({ file, idGenerator, getCurrentStore }) => {
      const adapter = getCurrentStore();
      const fileId = idGenerator();
      const fileBlob = new Blob([await file.arrayBuffer()], {
        type: file.type,
      });
      await adapter.setFile(fileId, fileBlob);
      return { fileId };
    },

    getFileContent: async ({ fileId, getCurrentStore }) => {
      const adapter = getCurrentStore();
      const blob = await adapter.getFile(fileId);
      if (!blob) {
        throw new Error(`File not found: ${fileId}`);
      }

      const url = URL.createObjectURL(blob);
      return {
        url,
        type: blob.type,
        revoke: () => URL.revokeObjectURL(url),
      };
    },

    getFileByProjectId: async ({ projectId, fileId, getStoreByProject }) => {
      const adapter = await getStoreByProject(projectId);
      return adapter.getFile(fileId);
    },

    downloadBundle: async ({ bundle, filename, filePicker }) => {
      await filePicker.saveFilePicker(
        new Blob([bundle], { type: "application/octet-stream" }),
        filename,
      );
      return filename;
    },

    createDistributionZip: async ({
      bundle,
      zipName,
      filePicker,
      staticFiles,
    }) => {
      const zip = new JSZip();
      zip.file("package.bin", bundle);
      if (staticFiles.indexHtml) zip.file("index.html", staticFiles.indexHtml);
      if (staticFiles.mainJs) zip.file("main.js", staticFiles.mainJs);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      await filePicker.saveFilePicker(zipBlob, `${zipName}.zip`);
      return `${zipName}.zip`;
    },

    createDistributionZipStreamed: async ({
      projectData,
      fileIds,
      zipName,
      filePicker,
      staticFiles,
      getFileContent,
    }) => {
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
          const content = await getFileContent(fileId);
          const response = await fetch(content.url);
          const buffer = await response.arrayBuffer();
          files[fileId] = {
            buffer: new Uint8Array(buffer),
            mime: content.type,
          };
          content.revoke?.();
        } catch (error) {
          console.warn(`Failed to fetch file ${fileId}:`, error);
        }
      }

      const bundle = await createBundle(projectData, files);
      return fileAdapter.createDistributionZip({
        bundle,
        zipName,
        filePicker,
        staticFiles,
      });
    },
  };

  const collabAdapter = {
    beforeCreateRepository: async ({ projectId, store, events }) => {
      const persistedCursor = await loadCommittedCursor({
        adapter: store,
        projectId,
      }).catch(() => 0);

      if (persistedCursor > events.length && events.length <= 1) {
        await clearCommittedCursor({
          adapter: store,
          projectId,
        }).catch(() => {});
        collabLastCommittedIdByProject.delete(projectId);
        collabLog("warn", "reset stale committed cursor for project", {
          projectId,
          persistedCursor,
          localEventCount: events.length,
        });
      }

      return events;
    },

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
          hint: "Configure the web collab endpoint in src/setup.web.js to attach backend auto-connect.",
        },
      );
    },

    onSessionCleared: ({ projectId }) => {
      collabApplyQueueByProject.delete(projectId);
      collabAppliedCommittedIdsByProject.delete(projectId);
    },

    onSessionTransportUpdated: () => {},

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
      const adapter = await getStoreByProject(projectId);

      const resolvedProjectId = state.project?.id || projectId;
      const resolvedPartitions = partitioning.getBasePartitions(
        resolvedProjectId,
        partitions,
      );
      const projectMetadata = await getProjectMetadataFromEntries(projectId);
      const clientStore = await createPersistedInMemoryClientStore({
        projectId,
        adapter,
        logger: (entry) => {
          if (entry?.level === "warn") {
            collabLog("warn", "client store warning", entry);
          }
        },
      });
      await ensureCommittedIdLoaded(projectId, getStoreByProject);
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
          if (entry?.event === "connected") {
            const globalLastCommittedId = Number(entry?.globalLastCommittedId);
            if (Number.isFinite(globalLastCommittedId)) {
              collabLog("debug", "connected cursor", {
                projectId: resolvedProjectId,
                globalLastCommittedId,
              });
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
                collabLog("debug", "command skipped (current actor source)", {
                  projectId,
                  sourceType,
                  commandId: command?.id || null,
                  commandType: command?.type || null,
                  committedId: Number.isFinite(
                    Number(committedEvent?.committedId),
                  )
                    ? Number(committedEvent.committedId)
                    : null,
                });
                return;
              }

              const beforeState = repository.getState();
              const beforeImagesCount = countImageEntries(beforeState?.images);
              const applyResult = await applyCommandToRepository({
                repository,
                command,
                projectId: resolvedProjectId,
              });
              if (applyResult.events.length === 0) {
                collabLog("warn", "command ignored (no projection events)", {
                  projectId,
                  sourceType,
                  commandType: command?.type || null,
                  commandId: command?.id || null,
                });
                return;
              }

              const afterState = repository.getState();
              const afterImagesCount = countImageEntries(afterState?.images);
              collabLog("info", "remote command applied to repository", {
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

            const committedId = Number(committedEvent?.committedId);
            const hasCommittedId = Number.isFinite(committedId);
            const lastCommittedId = await ensureCommittedIdLoaded(
              projectId,
              getStoreByProject,
            );

            if (hasCommittedId) {
              const appliedCommittedIds = getAppliedCommittedSet(projectId);
              if (appliedCommittedIds.has(committedId)) {
                collabLog(
                  "debug",
                  "committed event skipped (already applied)",
                  {
                    projectId,
                    committedId,
                    sourceType,
                  },
                );
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
              await persistCommittedCursor(
                projectId,
                nextWatermark,
                getStoreByProject,
              );
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
          await queueCollabApply(projectId, async () => {});
          const repositoryEvents = Array.isArray(repository.getEvents?.())
            ? repository.getEvents()
            : [];
          const repositoryEventSummary =
            summarizeRepositoryEventsForSync(repositoryEvents);
          collabLog("info", "repository event snapshot before replay", {
            projectId: resolvedProjectId,
            ...repositoryEventSummary,
          });

          const localCommittedCursor = await ensureCommittedIdLoaded(
            projectId,
            getStoreByProject,
          );
          const uncommittedEvents = toUncommittedSyncSubmissionEvents({
            repositoryEvents,
            committedCursor: localCommittedCursor,
          });
          collabLog("info", "uncommitted local event snapshot", {
            projectId: resolvedProjectId,
            localCommittedCursor,
            localRepositoryEventCount: repositoryEvents.length,
            uncommittedEventCount: uncommittedEvents.length,
            firstUncommittedType: uncommittedEvents[0]?.type || null,
            firstUncommittedProjectId: uncommittedEvents[0]?.projectId || null,
          });

          if (uncommittedEvents.length > 0) {
            const actor = collabSession.getActor();
            for (const entry of uncommittedEvents) {
              await collabSession.submitEvent(
                toReplaySubmissionEvent({
                  repositoryEvent: entry,
                  actor,
                }),
              );
            }
            await collabSession.flushDrafts();
            await collabSession.syncNow({
              timeoutMs: INITIAL_REMOTE_SYNC_TIMEOUT_MS,
            });
            await queueCollabApply(projectId, async () => {});
            collabLog("info", "uncommitted local events submitted", {
              projectId: resolvedProjectId,
              submittedCount: uncommittedEvents.length,
            });
          }

          const syncDurationMs = Date.now() - syncStartedAt;
          collabLog("info", "initial remote sync completed", {
            projectId: resolvedProjectId,
            endpointUrl,
            syncDurationMs,
            repositoryEventCount: repositoryEvents.length,
            replayedUncommittedEventCount: uncommittedEvents.length,
          });
        } catch (error) {
          collabLog("warn", "initial remote sync failed", {
            projectId: resolvedProjectId,
            endpointUrl,
            error: error?.message || "unknown",
          });
        }
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
