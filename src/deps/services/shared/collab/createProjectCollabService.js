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
      await session.setOnlineTransport(nextTransport);
    },
  };
};
