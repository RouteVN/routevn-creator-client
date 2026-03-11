import { validateCommandSubmitItem } from "insieme/client";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import {
  committedEventToCommand,
  createProjectCollabService,
} from "../src/deps/services/shared/collab/index.js";
import { processCommand } from "../src/internal/project/state.js";
import { createEmptyProjectState } from "../src/internal/project/state.js";
import { validateCommand } from "../src/internal/project/commands.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (
  predicate,
  { timeoutMs = 3000, intervalMs = 20, label = "condition" } = {},
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

export const parseToken = (token) => {
  const parts = String(token || "").split(":");
  if (parts.length !== 4 || parts[0] !== "user" || parts[2] !== "client") {
    throw new Error("invalid token");
  }
  return {
    userId: parts[1],
    clientId: parts[3],
  };
};

export const createInMemoryServerTransport = ({
  server,
  connectionId,
  latencyMs = 0,
}) => {
  let session = null;
  let messageHandler = null;
  let connected = false;

  const deliver = async (message) => {
    if (latencyMs > 0) await sleep(latencyMs);
    if (messageHandler) messageHandler(structuredClone(message));
  };

  return {
    async connect() {
      if (connected) return;
      connected = true;
      session = server.attachConnection({
        connectionId,
        send: async (message) => {
          await deliver(message);
        },
        close: async () => {
          connected = false;
        },
      });
    },

    async disconnect() {
      if (!connected || !session) return;
      const current = session;
      session = null;
      connected = false;
      await current.close("client_disconnect");
    },

    async send(message) {
      if (!connected || !session) {
        throw new Error("transport is not connected");
      }
      if (latencyMs > 0) await sleep(latencyMs);
      await session.receive(structuredClone(message));
    },

    onMessage(handler) {
      messageHandler = handler;
      return () => {
        if (messageHandler === handler) {
          messageHandler = null;
        }
      };
    },
  };
};

export const normalizeStateForCompare = (state) => ({
  model_version: state.model_version,
  project: {
    id: state.project.id,
    name: state.project.name,
    description: state.project.description,
  },
  story: state.story,
  scenes: state.scenes,
  sections: state.sections,
  lines: state.lines,
  resources: state.resources,
});

export const createProjectedSyncHarness = ({
  projectName = "Integration",
  projectDescription = "integration",
  authorizePartitions = async (_identity, partitions) =>
    Array.isArray(partitions) && partitions.length > 0,
  createInitialProjectState = ({ projectId }) =>
    createEmptyProjectState({
      projectId,
      name: projectName,
      description: projectDescription,
    }),
} = {}) => {
  const projectStates = new Map();

  const ensureProjectState = (projectId) => {
    if (!projectStates.has(projectId)) {
      projectStates.set(
        projectId,
        createInitialProjectState({
          projectId,
        }),
      );
    }
    return projectStates.get(projectId);
  };

  const store = createInMemorySyncStore();
  const server = createSyncServer({
    auth: {
      verifyToken: async (token) => {
        const identity = parseToken(token);
        return {
          clientId: identity.clientId,
          claims: { userId: identity.userId },
        };
      },
    },
    authz: {
      authorizePartitions,
    },
    validation: {
      validate: async (item) => {
        validateCommandSubmitItem(item);
        const command = committedEventToCommand(item);
        if (!command) {
          const error = new Error("failed to convert normalized submit item");
          error.code = "validation_failed";
          throw error;
        }

        validateCommand(command);
        const currentState = ensureProjectState(command.projectId);
        const { state: nextState } = processCommand({
          state: currentState,
          command,
        });
        projectStates.set(command.projectId, nextState);
      },
    },
    store,
    clock: {
      now: () => Date.now(),
    },
  });

  const createClient = ({
    projectId,
    userId,
    clientId,
    partitions,
    connectionId,
    latencyMs = 5,
  }) => {
    const actor = { userId, clientId };
    const transport = createInMemoryServerTransport({
      server,
      connectionId,
      latencyMs,
    });
    const client = createProjectCollabService({
      projectId,
      projectName,
      projectDescription,
      token: `user:${userId}:client:${clientId}`,
      actor,
      partitions,
      transport,
    });
    return {
      actor,
      client,
    };
  };

  return {
    server,
    store,
    projectStates,
    ensureProjectState,
    createClient,
  };
};
