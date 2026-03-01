import { processCommand } from "../../domain/v2/engine.js";
import { assertDomainInvariants } from "../../domain/v2/invariants.js";
import { createEmptyProjectState } from "../../domain/v2/model.js";
import { validateCommand } from "../../domain/v2/validateCommand.js";
import { commandToSyncEvent, committedEventToCommand } from "./mappers.js";

const toArray = (value) => (Array.isArray(value) ? value : []);
const nonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;
const commandPartitions = (command) => {
  const fromArray = Array.isArray(command?.partitions)
    ? command.partitions
    : [];
  const normalized = fromArray
    .map((partition) => nonEmptyString(partition))
    .filter(Boolean);
  if (normalized.length > 0) return [...new Set(normalized)];
  const fallback = nonEmptyString(command?.partition);
  return fallback ? [fallback] : [];
};
const isTransportDisconnectedError = (error) => {
  const code = error?.code;
  if (code === "transport_disconnected") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("websocket is not connected") ||
    message.includes("transport_disconnected")
  );
};

const loadSyncRuntime = async () => {
  const insieme = await import("insieme");
  const {
    createInMemoryClientStore,
    createOfflineTransport,
    createSyncClient,
  } = insieme;

  if (
    typeof createInMemoryClientStore !== "function" ||
    typeof createOfflineTransport !== "function" ||
    typeof createSyncClient !== "function"
  ) {
    throw new Error(
      "Insieme sync runtime is unavailable. Install a 1.x release that exports createSyncClient/createOfflineTransport/createInMemoryClientStore.",
    );
  }

  return {
    createInMemoryClientStore,
    createOfflineTransport,
    createSyncClient,
  };
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
  const appliedEventIds = new Set();
  let lastError = null;
  let syncClient = null;
  let baseTransport = transport || null;
  let runtimeStore = clientStore || null;

  let projectedState =
    initialState && typeof initialState === "object"
      ? structuredClone(initialState)
      : createEmptyProjectState({
          projectId,
          name: projectName,
          description: projectDescription,
        });

  const emitCommittedCommand = ({
    command,
    committedEvent,
    sourceType,
    isFromCurrentActor,
  }) => {
    if (typeof onCommittedCommand !== "function") return;
    try {
      const result = onCommittedCommand({
        command: structuredClone(command),
        committedEvent: structuredClone(committedEvent),
        sourceType,
        isFromCurrentActor,
      });
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          lastError = {
            code: "on_committed_command_failed",
            message: error?.message || "unknown",
          };
        });
      }
    } catch (error) {
      lastError = {
        code: "on_committed_command_failed",
        message: error?.message || "unknown",
      };
    }
  };

  const applyCommittedEvents = (events, sourceType = "unknown") => {
    let typedStateMutated = false;
    for (const committedEvent of events) {
      const command = committedEventToCommand(committedEvent);
      if (!command) continue;
      const dedupeId = command.id || committedEvent?.id;
      if (!dedupeId || appliedEventIds.has(dedupeId)) continue;

      const isFromCurrentActor =
        command?.actor?.clientId === actor?.clientId &&
        command?.actor?.userId === actor?.userId;

      const result = processCommand({ state: projectedState, command });
      projectedState = result.state;
      typedStateMutated = true;

      appliedEventIds.add(dedupeId);
      if (committedEvent?.id) {
        appliedEventIds.add(committedEvent.id);
      }

      emitCommittedCommand({
        command: {
          ...structuredClone(command),
        },
        committedEvent,
        sourceType,
        isFromCurrentActor,
      });
    }

    if (typedStateMutated) {
      assertDomainInvariants(projectedState);
    }
  };

  const ensureSyncClient = async () => {
    if (syncClient) return syncClient;

    const runtime = await loadSyncRuntime();

    if (!runtimeStore) {
      runtimeStore = runtime.createInMemoryClientStore({
        materializedViews: [],
      });
    }

    if (!baseTransport) {
      baseTransport = runtime.createOfflineTransport();
    }

    syncClient = runtime.createSyncClient({
      transport: baseTransport,
      store: runtimeStore,
      token,
      clientId: actor.clientId,
      partitions,
      onEvent: ({ type, payload }) => {
        try {
          if (type === "broadcast") {
            applyCommittedEvents([payload], "broadcast");
          } else if (type === "sync_page") {
            applyCommittedEvents(toArray(payload?.events), "sync_page");
          } else if (type === "rejected") {
            lastError = {
              code: payload.reason || "validation_failed",
              message: "Server rejected command",
              payload,
            };
          } else if (type === "error") {
            lastError = payload;
          }
        } catch (error) {
          lastError = {
            code: "projection_apply_failed",
            message: error.message,
          };
        }
      },
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
    });

    return syncClient;
  };

  return {
    async start() {
      const client = await ensureSyncClient();
      await client.start();
    },

    async stop() {
      if (!syncClient) return;
      await syncClient.stop();
    },

    async submitCommand(command) {
      validateCommand(command);

      const optimistic = processCommand({ state: projectedState, command });
      projectedState = optimistic.state;
      appliedEventIds.add(command.id);

      const partitions = commandPartitions(command);
      if (partitions.length === 0) {
        throw new Error("Command must include at least one partition");
      }

      const client = await ensureSyncClient();
      try {
        await client.submitEvent({
          partitions,
          event: commandToSyncEvent(command),
        });
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

    async syncNow(options = {}) {
      const client = await ensureSyncClient();
      await client.syncNow(options);
    },

    async flushDrafts() {
      const client = await ensureSyncClient();
      await client.flushDrafts();
    },

    getState() {
      return structuredClone(projectedState);
    },

    getLastError() {
      return lastError ? structuredClone(lastError) : null;
    },

    clearLastError() {
      lastError = null;
    },

    getActor() {
      return structuredClone(actor);
    },

    async setOnlineTransport(nextTransport) {
      await ensureSyncClient();
      if (typeof baseTransport.setOnlineTransport !== "function") {
        throw new Error(
          "Current transport does not support online transport swap",
        );
      }
      await baseTransport.setOnlineTransport(nextTransport);
    },
  };
};
