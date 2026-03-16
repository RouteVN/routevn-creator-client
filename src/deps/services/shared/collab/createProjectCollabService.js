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
  projectName = "",
  projectDescription = "",
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
  let serverErrorStopInFlight = false;
  let projectionGap;

  const createInitialRepositoryState = () => ({
    ...structuredClone(initialProjectData),
    project: {
      ...structuredClone(initialProjectData.project || {}),
      id: projectId,
      name: projectName,
      description: projectDescription,
    },
  });

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
    },
  });

  return {
    async start() {
      await session.start();
    },

    async stop() {
      await session.stop();
    },

    async submitCommand(command) {
      const optimistic = applyCommandToRepositoryState({
        repositoryState: projectedRepositoryState,
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

      projectedRepositoryState = optimistic.repositoryState;

      try {
        await session.submitCommand(command);
      } catch (error) {
        if (!isTransportDisconnectedError(error)) {
          throw error;
        }
        // Keep optimistic state and rely on draft persistence for retry.
        lastError = {
          code: "transport_disconnected",
          message: error?.message || "websocket is not connected",
        };
      }

      return {
        valid: true,
        commandId: command.id,
      };
    },

    async submitEvent(input) {
      return session.submitEvent(input);
    },

    async syncNow(options = {}) {
      await session.syncNow(options);
    },

    async flushDrafts() {
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
      await session.setOnlineTransport(nextTransport);
    },
  };
};
