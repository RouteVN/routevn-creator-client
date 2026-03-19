import { createCommandSyncSession } from "insieme/browser";
import {
  createProjectionGap,
  evaluateRemoteCommandCompatibility,
  REMOTE_COMMAND_COMPATIBILITY,
} from "./compatibility.js";
import { commandToSyncEvent, committedEventToCommand } from "./mappers.js";
import { projectRepositoryStateToDomainState } from "../../../../internal/project/projection.js";
import {
  applyCommandToRepositoryState,
  initialProjectData,
} from "../projectRepository.js";

const isTransportDisconnectedError = (error) => {
  const code = error?.code;
  if (code === "transport_disconnected") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("websocket is not connected") ||
    message.includes("transport_disconnected")
  );
};

export const createProjectCollabService = ({
  projectId,
  initialRepositoryState,
  token,
  actor,
  transport,
  partitions,
  clientStore,
  logger = () => {},
  onCommittedCommand,
}) => {
  let lastError = null;
  let session = null;
  let sessionStarted = false;
  let onlineTransportAttached = Boolean(transport);
  let serverErrorStopInFlight = false;
  let projectionGap;
  let activeSubmission = null;
  const queuedSubmissions = [];
  const idleWaiters = new Set();
  let processNextSubmissionTimer;
  const SUBMISSION_BATCH_WINDOW_MS = 24;

  const resolveIdleWaiters = () => {
    if (activeSubmission || queuedSubmissions.length > 0) {
      return;
    }

    for (const resolve of idleWaiters) {
      resolve();
    }
    idleWaiters.clear();
  };

  const processNextSubmission = () => {
    if (processNextSubmissionTimer !== undefined) {
      clearTimeout(processNextSubmissionTimer);
      processNextSubmissionTimer = undefined;
    }

    if (activeSubmission || queuedSubmissions.length === 0) {
      resolveIdleWaiters();
      return;
    }

    const submissions = [];
    while (queuedSubmissions.length > 0) {
      submissions.push(queuedSubmissions.shift());
    }
    const combinedCommands = submissions.flatMap(
      (submission) => submission.commands,
    );
    activeSubmission = {
      submissions,
      commandCount: combinedCommands.length,
    };

    void (async () => {
      try {
        const insertedLocally =
          await insertDraftCommandsLocally(combinedCommands);
        if (!insertedLocally) {
          await session.submitCommands(combinedCommands);
        }
        for (const submission of submissions) {
          submission.resolve(submission.commands.map((command) => command.id));
        }
        activeSubmission = null;
        processNextSubmission();
      } catch (error) {
        activeSubmission = null;
        for (const submission of submissions) {
          submission.reject(error);
        }
        processNextSubmission();
      }
    })();
  };

  const scheduleProcessNextSubmission = () => {
    if (activeSubmission || queuedSubmissions.length === 0) {
      resolveIdleWaiters();
      return;
    }

    if (processNextSubmissionTimer !== undefined) {
      return;
    }

    processNextSubmissionTimer = setTimeout(() => {
      processNextSubmissionTimer = undefined;
      processNextSubmission();
    }, SUBMISSION_BATCH_WINDOW_MS);
  };

  const waitForIdle = () => {
    if (!activeSubmission && queuedSubmissions.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      idleWaiters.add(resolve);
    });
  };

  const createInitialRepositoryState = () =>
    structuredClone(initialProjectData);

  const coerceInitialRepositoryState = () => {
    if (
      initialRepositoryState &&
      typeof initialRepositoryState === "object" &&
      initialRepositoryState.scenes?.items
    ) {
      return structuredClone(initialRepositoryState);
    }

    return createInitialRepositoryState();
  };

  let projectedRepositoryState = coerceInitialRepositoryState();

  const getCommandPartitions = (command) => {
    const commandPartitions = Array.isArray(command?.partitions)
      ? command.partitions.filter(
          (partition) => typeof partition === "string" && partition.length > 0,
        )
      : [];

    if (commandPartitions.length === 0) {
      throw new Error("Command must include at least one partition");
    }

    return commandPartitions;
  };

  const insertDraftCommandsLocally = async (commands) => {
    if (
      onlineTransportAttached ||
      !sessionStarted ||
      !clientStore ||
      typeof clientStore.insertDrafts !== "function"
    ) {
      return false;
    }

    await clientStore.insertDrafts(
      commands.map((command) => ({
        id: command.id,
        partitions: getCommandPartitions(command),
        ...commandToSyncEvent(command),
        createdAt: Date.now(),
      })),
    );

    return true;
  };

  const enqueueCommands = async (commands) => {
    const normalizedCommands = Array.isArray(commands)
      ? commands.filter(Boolean)
      : [];
    if (normalizedCommands.length === 0) {
      return {
        valid: true,
        commandIds: [],
      };
    }

    let nextProjectedRepositoryState = projectedRepositoryState;

    for (const command of normalizedCommands) {
      const optimistic = applyCommandToRepositoryState({
        repositoryState: nextProjectedRepositoryState,
        command,
        projectId,
      });

      if (!optimistic.valid) {
        lastError = {
          code: optimistic.error?.code || "validation_failed",
          message: optimistic.error?.message || "command validation failed",
          payload: optimistic.error,
        };
        return optimistic;
      }

      nextProjectedRepositoryState = optimistic.repositoryState;
    }

    projectedRepositoryState = nextProjectedRepositoryState;

    const storedSubmission = new Promise((resolve, reject) => {
      queuedSubmissions.push({
        commands: normalizedCommands,
        resolve,
        reject: (error) => {
          if (!isTransportDisconnectedError(error)) {
            reject(error);
            return;
          }

          lastError = {
            code: "transport_disconnected",
            message: error?.message || "websocket is not connected",
          };
        },
      });
    });

    void storedSubmission.catch(() => {});
    scheduleProcessNextSubmission();
    await storedSubmission;

    return {
      valid: true,
      commandIds: normalizedCommands.map((command) => command.id),
    };
  };

  session = createCommandSyncSession({
    token,
    actor,
    partitions,
    transport: transport || undefined,
    store: clientStore || undefined,
    logger,
    mapCommandToSyncEvent: commandToSyncEvent,
    mapCommittedToCommand: committedEventToCommand,
    reconnect: {
      enabled: true,
      initialDelayMs: 200,
      maxDelayMs: 5000,
      factor: 2,
      jitter: 0.2,
      maxAttempts: Number.POSITIVE_INFINITY,
      handshakeTimeoutMs: 5000,
    },
    onCommittedCommand: ({
      command,
      committedEvent,
      sourceType,
      isFromCurrentActor,
    }) => {
      let compatibility = {
        status: REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE,
        reason: "ok",
      };
      let projectionStatus = "applied";

      if (!isFromCurrentActor) {
        compatibility = evaluateRemoteCommandCompatibility(command);

        if (projectionGap) {
          projectionStatus = "skipped_due_to_gap";
        } else if (
          compatibility.status === REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE
        ) {
          const result = applyCommandToRepositoryState({
            repositoryState: projectedRepositoryState,
            command,
            projectId,
          });

          if (result.valid) {
            projectedRepositoryState = result.repositoryState;
          } else {
            compatibility = {
              status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
              reason: "creator_model_projection_failed",
              message: result.error?.message || "projection failed",
            };
            projectionGap = createProjectionGap({
              command,
              committedEvent,
              compatibility,
              sourceType,
            });
            projectionStatus = "skipped_invalid";
          }
        } else {
          projectionGap = createProjectionGap({
            command,
            committedEvent,
            compatibility,
            sourceType,
          });
          projectionStatus =
            compatibility.status === REMOTE_COMMAND_COMPATIBILITY.FUTURE
              ? "skipped_future"
              : "skipped_invalid";
        }
      }

      if (typeof onCommittedCommand === "function") {
        void onCommittedCommand({
          command: structuredClone(command),
          committedEvent: structuredClone(committedEvent),
          sourceType,
          isFromCurrentActor,
          compatibility: structuredClone(compatibility),
          projectionStatus,
          projectionGap: projectionGap
            ? structuredClone(projectionGap)
            : undefined,
        });
      }
    },
    onEvent: ({ type, payload }) => {
      if (type === "error") {
        lastError = payload || {
          code: "unknown_error",
          message: "unknown",
        };
        // Prevent hot reconnect loops when backend persistently returns
        // server_error for submit/sync operations.
        if (
          payload?.code === "server_error" &&
          !serverErrorStopInFlight &&
          session
        ) {
          serverErrorStopInFlight = true;
          void session.stop().finally(() => {
            serverErrorStopInFlight = false;
          });
        }
      } else if (type === "rejected") {
        lastError = {
          code: payload?.reason || "validation_failed",
          message: "Server rejected command",
          payload,
        };
      }

      resolveIdleWaiters();
    },
  });

  return {
    async start() {
      await session.start();
      sessionStarted = true;
    },

    async stop() {
      if (processNextSubmissionTimer !== undefined) {
        clearTimeout(processNextSubmissionTimer);
        processNextSubmissionTimer = undefined;
      }
      await session.stop();
      sessionStarted = false;
    },

    async submitCommand(command) {
      const submitResult = await enqueueCommands([command]);
      if (submitResult?.valid === false) {
        return submitResult;
      }

      return {
        valid: true,
        commandId: command.id,
      };
    },

    async submitCommands(commands) {
      return enqueueCommands(commands);
    },

    async submitEvent(input) {
      return session.submitEvent(input);
    },

    async syncNow(options = {}) {
      await waitForIdle();
      await session.syncNow(options);
    },

    async flushDrafts() {
      await waitForIdle();
      await session.flushDrafts();
    },

    getStatus() {
      return session.getStatus();
    },

    getState() {
      return projectRepositoryStateToDomainState({
        repositoryState: projectedRepositoryState,
        projectId,
      });
    },

    getLastError() {
      if (lastError) return structuredClone(lastError);
      return session.getLastError();
    },

    getProjectionGap() {
      return projectionGap ? structuredClone(projectionGap) : undefined;
    },

    clearLastError() {
      lastError = null;
      session.clearLastError();
    },

    getActor() {
      return session.getActor();
    },

    async setOnlineTransport(nextTransport) {
      onlineTransportAttached = true;
      await session.setOnlineTransport(nextTransport);
    },
  };
};
