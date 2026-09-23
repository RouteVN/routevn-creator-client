import { createCommandSyncSession } from "insieme/client";
import { commandToSyncEvent, committedEventToCommand } from "./mappers.js";

export const createProjectCollabService = ({
  projectId,
  token,
  actor,
  transport,
  clientStore,
  logger = () => {},
  onCommittedCommand = () => {},
  acceptance,
}) => {
  let lastError = null;
  let session = null;

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
    if (acceptance) {
      const result = await acceptance.submitCommands(commands, actor);
      if (result.valid) {
        // Local acceptance has released its operation lock. Delivery can wait
        // for the network without blocking another local edit.
        void session.flushDrafts().catch((error) => {
          lastError = createSubmitErrorResult(error).error;
        });
      } else lastError = structuredClone(result.error);
      return result;
    }
    const normalizedCommands = Array.isArray(commands)
      ? commands.filter(Boolean)
      : [];
    if (normalizedCommands.length === 0) {
      return {
        valid: true,
        commandIds: [],
      };
    }

    try {
      const commandIds = await session.submitCommands(normalizedCommands);

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
    store: acceptance
      ? {
          ...clientStore,
          insertDraft: async () => {
            throw new Error(
              "Direct event authoring is not supported; submit a command request",
            );
          },
          insertDrafts: async () => {
            throw new Error(
              "Direct event authoring is not supported; submit command requests",
            );
          },
          applyCommittedBatch: (input) => acceptance.applyCommittedBatch(input),
          applySubmitResult: (input) => acceptance.applySubmitResult(input),
        }
      : clientStore || undefined,
    logger,
    submitBatch: acceptance
      ? { maxEvents: 16_384, maxBytes: 67_108_864 }
      : undefined,
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
      if (acceptance) return;
      void onCommittedCommand({
        command: structuredClone(command),
        committedEvent: structuredClone(committedEvent),
        sourceType,
        isFromCurrentActor,
      });
    },
  });

  return {
    async start() {
      if (acceptance?.isReadOnly()) return;
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
        ...submitResult,
        commandId: command.id,
      };
    },

    async submitCommands(commands) {
      return submitValidatedCommands(commands);
    },

    async submitEvent(input) {
      if (acceptance)
        return {
          valid: false,
          error: {
            code: "invalid_command_request",
            message: "Submit domain command requests instead of stored events",
          },
        };
      return session.submitEvent(input);
    },

    async syncNow(options = {}) {
      if (acceptance?.isReadOnly()) return;
      await session.syncNow(options);
    },

    async flushDrafts() {
      if (acceptance?.isReadOnly()) return;
      await session.flushDrafts();
    },

    getStatus() {
      return session.getStatus();
    },

    getLastError() {
      if (lastError) return structuredClone(lastError);
      return session.getLastError();
    },

    clearLastError() {
      lastError = null;
      session.clearLastError();
    },

    getActor() {
      return session.getActor();
    },

    async setOnlineTransport(nextTransport) {
      if (acceptance?.isReadOnly()) return;
      await session.setOnlineTransport(nextTransport);
    },
  };
};
