import { validateCommandSubmitItem } from "insieme/client";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import {
  committedEventToCommand,
  createProjectCollabService,
} from "../src/deps/services/shared/collab/index.js";
import {
  applyCommandToRepositoryState,
  initialProjectData,
} from "../src/deps/services/shared/projectRepository.js";

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

const canonicalize = (value) => {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    if (items.every((item) => typeof item === "string")) {
      return [...items].sort();
    }
    if (
      items.every(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.id === "string",
      )
    ) {
      return [...items].sort((left, right) => left.id.localeCompare(right.id));
    }
    return items;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
};

export const normalizeStateForCompare = (state) => {
  const normalized = canonicalize(state);

  for (const scene of Object.values(normalized?.scenes || {})) {
    if (!Array.isArray(scene?.sectionIds)) {
      continue;
    }

    scene.sectionIds = [...scene.sectionIds].sort();
    scene.initialSectionId = scene.sectionIds[0] ?? null;
  }

  for (const section of Object.values(normalized?.sections || {})) {
    if (!Array.isArray(section?.lineIds)) {
      continue;
    }

    section.lineIds = [...section.lineIds].sort();
    section.initialLineId = section.lineIds[0] ?? null;
  }

  return normalized;
};

export const createProjectedSyncHarness = ({
  authorizeProject = async (_identity, projectId) =>
    typeof projectId === "string" && projectId.length > 0,
  createInitialProjectState = () => structuredClone(initialProjectData),
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
      authorizeProject,
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

        const currentState = ensureProjectState(command.projectId);
        const applyResult = applyCommandToRepositoryState({
          repositoryState: currentState,
          command,
          projectId: command.projectId,
        });
        if (!applyResult.valid) {
          const error = new Error(
            applyResult.error?.message || "command validation failed",
          );
          error.code = applyResult.error?.code || "validation_failed";
          error.details = applyResult.error?.details ?? {};
          throw error;
        }
        projectStates.set(command.projectId, applyResult.repositoryState);
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
      token: `user:${userId}:client:${clientId}`,
      actor,
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
