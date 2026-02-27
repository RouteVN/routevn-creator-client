import { processCommand } from "../../domain/v2/engine.js";
import { applyDomainEvent } from "../../domain/v2/reducer.js";
import { assertDomainInvariants } from "../../domain/v2/invariants.js";
import { createEmptyProjectState } from "../../domain/v2/model.js";
import { validateCommand } from "../../domain/v2/validateCommand.js";
import { commandToSyncEvent, committedEventToDomainEvent } from "./mappers.js";

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
  onCommittedEvent,
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

  const emitCommittedEvent = ({
    domainEvent,
    committedEvent,
    sourceType,
    isFromCurrentActor,
  }) => {
    if (typeof onCommittedEvent !== "function") return;
    try {
      const result = onCommittedEvent({
        domainEvent: structuredClone(domainEvent),
        committedEvent: structuredClone(committedEvent),
        sourceType,
        isFromCurrentActor,
      });
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          lastError = {
            code: "on_committed_event_failed",
            message: error?.message || "unknown",
          };
        });
      }
    } catch (error) {
      lastError = {
        code: "on_committed_event_failed",
        message: error?.message || "unknown",
      };
    }
  };

  const applyCommittedEvents = (events, sourceType = "unknown") => {
    let typedStateMutated = false;
    let receivedCount = 0;
    let parsedCount = 0;
    let appliedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    for (const committedEvent of events) {
      receivedCount += 1;
      const domainEvent = committedEventToDomainEvent(committedEvent);
      if (!domainEvent) {
        skippedCount += 1;
        logger({
          component: "sync_client",
          event: "committed_event_ignored_unparseable",
          source_type: sourceType,
          committed_id: Number.isFinite(Number(committedEvent?.committed_id))
            ? Number(committedEvent.committed_id)
            : null,
          raw_event_type: committedEvent?.event?.type || null,
        });
        continue;
      }
      parsedCount += 1;
      const commandId =
        typeof domainEvent?.meta?.commandId === "string" &&
        domainEvent.meta.commandId.length > 0
          ? domainEvent.meta.commandId
          : null;
      const dedupeId = commandId || committedEvent?.id || null;
      if (dedupeId && appliedEventIds.has(dedupeId)) continue;

      const isFromCurrentActor =
        domainEvent?.meta?.actor?.clientId === actor?.clientId &&
        domainEvent?.meta?.actor?.userId === actor?.userId;

      try {
        projectedState = applyDomainEvent(projectedState, domainEvent);
      } catch (error) {
        failedCount += 1;
        lastError = {
          code: "projection_apply_failed",
          message: error?.message || "unknown",
          sourceType,
          committedId: Number.isFinite(Number(committedEvent?.committed_id))
            ? Number(committedEvent.committed_id)
            : null,
          eventType: domainEvent?.type || null,
        };
        logger({
          component: "sync_client",
          event: "domain_event_apply_failed",
          source_type: sourceType,
          committed_id: Number.isFinite(Number(committedEvent?.committed_id))
            ? Number(committedEvent.committed_id)
            : null,
          domain_event_type: domainEvent?.type || null,
          command_id: domainEvent?.meta?.commandId || null,
          error: error?.message || "unknown",
          payload_preview: {
            resourceType: domainEvent?.payload?.resourceType || null,
            resourceId: domainEvent?.payload?.resourceId || null,
            sceneId: domainEvent?.payload?.sceneId || null,
          },
        });
        continue;
      }
      typedStateMutated = true;
      appliedCount += 1;

      if (dedupeId) {
        appliedEventIds.add(dedupeId);
      }
      if (commandId) {
        appliedEventIds.add(commandId);
      }
      if (committedEvent?.id) {
        appliedEventIds.add(committedEvent.id);
      }

      emitCommittedEvent({
        domainEvent,
        committedEvent,
        sourceType,
        isFromCurrentActor,
      });
    }

    if (typedStateMutated) {
      assertDomainInvariants(projectedState);
    }

    logger({
      component: "sync_client",
      event: "committed_events_processed",
      source_type: sourceType,
      received_count: receivedCount,
      parsed_count: parsedCount,
      applied_count: appliedCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
    });
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
            logger({
              component: "sync_client",
              event: "submit_rejected_detail",
              reason: payload?.reason || "validation_failed",
              rejected_id: payload?.id || null,
              msg_id: payload?.msg_id || null,
              payload,
            });
          } else if (type === "error") {
            lastError = payload;
            logger({
              component: "sync_client",
              event: "sync_client_error_detail",
              payload,
            });
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
        // Keep optimistic state and rely on persisted drafts for retry after reconnect.
        lastError = {
          code: "transport_disconnected",
          message: error?.message || "websocket is not connected",
        };
        logger({
          component: "sync_client",
          event: "submit_deferred_transport_disconnected",
          command_id: command.id,
        });
      }

      return command.id;
    },

    async submitSyncEvent({ partitions: targetPartitions, event }) {
      const normalizedPartitions = Array.isArray(targetPartitions)
        ? targetPartitions.filter(
            (partition) =>
              typeof partition === "string" && partition.length > 0,
          )
        : [];
      if (normalizedPartitions.length === 0) {
        throw new Error("Sync event must include at least one partition");
      }
      if (!event || typeof event !== "object") {
        throw new Error("Sync event payload is required");
      }

      const client = await ensureSyncClient();
      logger({
        component: "sync_client",
        event: "submit_sync_event_request",
        partitions: normalizedPartitions,
        event_type: event?.type || null,
        command_id:
          event?.type === "event" ? event?.payload?.commandId || null : null,
        command_schema:
          event?.type === "event" ? event?.payload?.schema || null : null,
      });
      await client.submitEvent({
        partitions: normalizedPartitions,
        event: structuredClone(event),
      });
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
