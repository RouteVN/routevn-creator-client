import assert from "node:assert/strict";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import {
  createCommandEnvelope,
  createProjectCollabService,
} from "../src/collab/v2/index.js";
import { COMMAND_VERSION } from "../src/domain/v2/constants.js";
import { processCommand } from "../src/domain/v2/engine.js";
import { createEmptyProjectState } from "../src/domain/v2/model.js";
import { validateCommand } from "../src/domain/v2/validateCommand.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (
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

const parseToken = (token) => {
  const parts = String(token || "").split(":");
  if (parts.length !== 4 || parts[0] !== "user" || parts[2] !== "client") {
    throw new Error("invalid token");
  }
  return {
    userId: parts[1],
    clientId: parts[3],
  };
};

const createInMemoryServerTransport = ({
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

const normalizeStateForCompare = (state) => ({
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
  layouts: state.layouts,
  variables: state.variables,
});

const projectStates = new Map();
const ensureProjectState = (projectId) => {
  if (!projectStates.has(projectId)) {
    projectStates.set(
      projectId,
      createEmptyProjectState({
        projectId,
        name: "Convergence",
        description: "Server projection",
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
        claims: {
          userId: identity.userId,
        },
      };
    },
  },
  authz: {
    authorizePartitions: async (_identity, partitions) =>
      Array.isArray(partitions) && partitions.length > 0,
  },
  validation: {
    validate: async (item) => {
      if (item?.event?.type !== "event") {
        const error = new Error("invalid event envelope type");
        error.code = "validation_failed";
        throw error;
      }

      const payload = item.event.payload;
      const command = {
        id: item.id,
        projectId: payload?.projectId,
        partition: Array.isArray(item.partitions) ? item.partitions[0] : "",
        type: payload?.schema,
        payload: payload?.data,
        commandVersion: payload?.commandVersion ?? COMMAND_VERSION,
        actor: payload?.actor,
        clientTs: payload?.clientTs,
      };

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

const projectId = "project-conv-001";
const actorA = { userId: "user-1", clientId: "client-a" };
const actorB = { userId: "user-2", clientId: "client-b" };

const clientA = createProjectCollabService({
  projectId,
  projectName: "Convergence",
  projectDescription: "two-client",
  token: "user:user-1:client:client-a",
  actor: actorA,
  partitions: [
    `project:${projectId}:story`,
    `project:${projectId}:resources`,
    `project:${projectId}:layouts`,
  ],
  transport: createInMemoryServerTransport({
    server,
    connectionId: "conn-a",
    latencyMs: 5,
  }),
});

const clientB = createProjectCollabService({
  projectId,
  projectName: "Convergence",
  projectDescription: "two-client",
  token: "user:user-2:client:client-b",
  actor: actorB,
  partitions: [
    `project:${projectId}:story`,
    `project:${projectId}:resources`,
    `project:${projectId}:layouts`,
  ],
  transport: createInMemoryServerTransport({
    server,
    connectionId: "conn-b",
    latencyMs: 5,
  }),
});

try {
  await clientA.start();
  await clientB.start();

  await clientA.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "story",
      type: "scene.create",
      payload: { sceneId: "scene-1", name: "Scene 1" },
      actor: actorA,
      clientTs: 1000,
    }),
  );

  await waitFor(() => Boolean(clientB.getState().scenes["scene-1"]), {
    label: "clientB.scene-1",
  });

  await clientB.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "story",
      type: "section.create",
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
        name: "Section 1",
      },
      actor: actorB,
      clientTs: 1100,
    }),
  );

  await waitFor(() => Boolean(clientA.getState().sections["section-1"]), {
    label: "clientA.section-1",
  });

  await clientA.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "story",
      type: "line.insert_after",
      payload: {
        lineId: "line-1",
        sectionId: "section-1",
        line: { actions: { narration: "hello world" } },
      },
      actor: actorA,
      clientTs: 1200,
    }),
  );

  await waitFor(() => Boolean(clientB.getState().lines["line-1"]), {
    label: "clientB.line-1",
  });

  await clientB.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "resources",
      type: "resource.create",
      payload: {
        resourceType: "images",
        resourceId: "img-1",
        data: { name: "bg-1", fileId: "file-1" },
      },
      actor: actorB,
      clientTs: 1300,
    }),
  );

  await waitFor(
    () => Boolean(clientA.getState().resources.images.items["img-1"]),
    { label: "clientA.images.img-1" },
  );

  await clientA.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "layouts",
      type: "layout.create",
      payload: { layoutId: "layout-1", name: "Layout 1", layoutType: "scene" },
      actor: actorA,
      clientTs: 1400,
    }),
  );

  await waitFor(() => Boolean(clientB.getState().layouts["layout-1"]), {
    label: "clientB.layout-1",
  });

  await clientB.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "layouts",
      type: "layout.element.create",
      payload: {
        layoutId: "layout-1",
        elementId: "el-1",
        element: { type: "text", x: 100, y: 100, opacity: 1 },
      },
      actor: actorB,
      clientTs: 1500,
    }),
  );

  await waitFor(
    () => Boolean(clientA.getState().layouts["layout-1"]?.elements?.["el-1"]),
    { label: "clientA.layout-1.el-1" },
  );

  await clientA.syncNow();
  await clientB.syncNow();

  const stateA = clientA.getState();
  const stateB = clientB.getState();

  assert.deepEqual(
    normalizeStateForCompare(stateA),
    normalizeStateForCompare(stateB),
  );

  assert.equal(clientA.getLastError(), null);
  assert.equal(clientB.getLastError(), null);

  console.log("V2 two-client convergence: PASS");
} finally {
  await clientA.stop();
  await clientB.stop();
  await server.shutdown();
}
