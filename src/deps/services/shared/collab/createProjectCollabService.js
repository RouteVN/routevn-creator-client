import { createCommandSyncSession } from "insieme/browser";
import { processCommand } from "../../../../internal/project/state.js";
import { assertDomainInvariants } from "../../../../internal/project/state.js";
import { createEmptyProjectState } from "../../../../internal/project/state.js";
import { validateCommand } from "../../../../internal/project/commands.js";
import {
  createProjectionGap,
  evaluateRemoteCommandCompatibility,
  REMOTE_COMMAND_COMPATIBILITY,
} from "./compatibility.js";
import { commandToSyncEvent, committedEventToCommand } from "./mappers.js";

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
  let session = null;
  let serverErrorStopInFlight = false;
  let projectionGap;
  let activeSubmission = null;
  const queuedSubmissions = [];
  const idleWaiters = new Set();

  const resolveIdleWaiters = () => {
    if (activeSubmission || queuedSubmissions.length > 0) {
      return;
    }

    for (const resolve of idleWaiters) {
      resolve();
    }
    idleWaiters.clear();
  };

  const settleActiveSubmission = (submissionId, error) => {
    if (!activeSubmission || activeSubmission.command.id !== submissionId) {
      return;
    }

    const completedSubmission = activeSubmission;
    activeSubmission = null;

    if (error) {
      completedSubmission.reject(error);
    } else {
      completedSubmission.resolve(completedSubmission.command.id);
    }

    processNextSubmission();
  };

  const processNextSubmission = () => {
    if (activeSubmission || queuedSubmissions.length === 0) {
      resolveIdleWaiters();
      return;
    }

    const nextSubmission = queuedSubmissions.shift();
    activeSubmission = nextSubmission;

    void (async () => {
      try {
        await session.submitCommand(nextSubmission.command);
      } catch (error) {
        activeSubmission = null;
        nextSubmission.reject(error);
        processNextSubmission();
      }
    })();
  };

  const waitForIdle = () => {
    if (!activeSubmission && queuedSubmissions.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      idleWaiters.add(resolve);
    });
  };

  let projectedState =
    initialState && typeof initialState === "object"
      ? structuredClone(initialState)
      : createEmptyProjectState({
          projectId,
          name: projectName,
          description: projectDescription,
        });

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
          const result = processCommand({ state: projectedState, command });
          projectedState = result.state;
          assertDomainInvariants(projectedState);
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
      } else if (type === "committed") {
        settleActiveSubmission(payload?.id);
      } else if (type === "rejected") {
        lastError = {
          code: payload?.reason || "validation_failed",
          message: "Server rejected command",
          payload,
        };
        settleActiveSubmission(
          payload?.id,
          new Error(payload?.reason || "Server rejected command"),
        );
      }

      resolveIdleWaiters();
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

      const terminalSubmission = new Promise((resolve, reject) => {
        queuedSubmissions.push({
          command,
          resolve,
          reject: (error) => {
            if (!isTransportDisconnectedError(error)) {
              reject(error);
              return;
            }

            // Keep optimistic state and rely on draft persistence for retry.
            lastError = {
              code: "transport_disconnected",
              message: error?.message || "websocket is not connected",
            };
          },
        });
      });

      void terminalSubmission.catch(() => {});
      processNextSubmission();

      return command.id;
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
      return structuredClone(projectedState);
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
