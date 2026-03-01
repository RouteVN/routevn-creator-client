import { createCommandSyncSession } from "insieme/browser";
import { processCommand } from "../../domain/v2/engine.js";
import { assertDomainInvariants } from "../../domain/v2/invariants.js";
import { createEmptyProjectState } from "../../domain/v2/model.js";
import { validateCommand } from "../../domain/v2/validateCommand.js";

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
  initialState,
  token,
  actor,
  transport,
  partitions,
  clientStore,
  logger = () => {},
  onCommittedCommand,
}) => {
  let lastError = null;

  let projectedState =
    initialState && typeof initialState === "object"
      ? structuredClone(initialState)
      : createEmptyProjectState({
          projectId,
          name: projectName,
          description: projectDescription,
        });

  const session = createCommandSyncSession({
    token,
    actor,
    partitions,
    transport: transport || undefined,
    store: clientStore || undefined,
    logger,
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
      if (!isFromCurrentActor) {
        const result = processCommand({ state: projectedState, command });
        projectedState = result.state;
        assertDomainInvariants(projectedState);
      }

      if (typeof onCommittedCommand === "function") {
        void onCommittedCommand({
          command: structuredClone(command),
          committedEvent: structuredClone(committedEvent),
          sourceType,
          isFromCurrentActor,
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
      validateCommand(command);

      const optimistic = processCommand({ state: projectedState, command });
      projectedState = optimistic.state;
      assertDomainInvariants(projectedState);

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

      return command.id;
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
      return structuredClone(projectedState);
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
