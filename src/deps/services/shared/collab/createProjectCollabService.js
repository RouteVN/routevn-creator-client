import { createCommandSyncSession } from "insieme/client";
import {
  createProjectionGap,
  evaluateRemoteCommandCompatibility,
  REMOTE_COMMAND_COMPATIBILITY,
} from "./compatibility.js";
import { commandToSyncEvent, committedEventToCommand } from "./mappers.js";
import { projectRepositoryStateToDomainState } from "../../../../internal/project/projection.js";
import {
  applyCommandToRepositoryState,
  applyCommandsToRepositoryState,
  initialProjectData,
} from "../projectRepository.js";

export const createProjectCollabService = ({
  projectId,
  initialRepositoryState,
  token,
  actor,
  transport,
  clientStore,
  logger = () => {},
  onCommittedCommand,
}) => {
  let lastError = null;
  let session = null;
  let projectionGap;

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

  const syncProjectedRepositoryState = (nextRepositoryState) => {
    if (
      nextRepositoryState &&
      typeof nextRepositoryState === "object" &&
      nextRepositoryState.scenes?.items
    ) {
      projectedRepositoryState = structuredClone(nextRepositoryState);
    }
  };

  const createSubmitErrorResult = (error) => {
    const normalizedError = {
      code: error?.code || "submit_failed",
      message: error?.message || "Failed to submit commands",
    };
    if (error?.details && typeof error.details === "object") {
      normalizedError.details = structuredClone(error.details);
    }
    return {
      valid: false,
      error: normalizedError,
    };
  };

  const submitValidatedCommands = async (commands) => {
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
    const optimistic = applyCommandsToRepositoryState({
      repositoryState: nextProjectedRepositoryState,
      commands: normalizedCommands,
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

    try {
      const commandIds = await session.submitCommands(normalizedCommands);
      projectedRepositoryState = nextProjectedRepositoryState;

      return {
        valid: true,
        commandIds:
          Array.isArray(commandIds) && commandIds.length > 0
            ? commandIds
            : normalizedCommands.map((command) => command.id),
      };
    } catch (error) {
      const submitResult = createSubmitErrorResult(error);
      lastError = structuredClone(submitResult.error);
      return submitResult;
    }
  };

  session = createCommandSyncSession({
    token,
    actor,
    projectId,
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
      const submitResult = await submitValidatedCommands([command]);
      if (submitResult?.valid === false) {
        return submitResult;
      }

      return {
        valid: true,
        commandId: command.id,
      };
    },

    async submitCommands(commands) {
      return submitValidatedCommands(commands);
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

    syncProjectedRepositoryState(nextRepositoryState) {
      syncProjectedRepositoryState(nextRepositoryState);
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
