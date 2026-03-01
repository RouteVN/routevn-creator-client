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

const createHarness = ({ authorizePartitions } = {}) => {
  const projectStates = new Map();

  const ensureProjectState = (projectId) => {
    if (!projectStates.has(projectId)) {
      projectStates.set(
        projectId,
        createEmptyProjectState({
          projectId,
          name: "Integration",
          description: "server projection",
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
      authorizePartitions:
        authorizePartitions ||
        (async (_identity, partitions) =>
          Array.isArray(partitions) && partitions.length > 0),
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
      projectName: "Integration",
      projectDescription: "integration",
      token: `user:${userId}:client:${clientId}`,
      actor,
      partitions,
      transport,
    });
    return { client, actor };
  };

  return { server, createClient };
};

const runScenario = async (name, fn) => {
  await fn();
  console.log(`PASS: ${name}`);
};

await runScenario("late-join-catchup", async () => {
  const projectId = "project-int-latejoin";
  const harness = createHarness();
  const a = harness.createClient({
    projectId,
    userId: "u1",
    clientId: "a",
    partitions: [`project:${projectId}:story`],
    connectionId: "latejoin-a",
  });
  const b = harness.createClient({
    projectId,
    userId: "u2",
    clientId: "b",
    partitions: [`project:${projectId}:story`],
    connectionId: "latejoin-b",
  });

  try {
    await a.client.start();
    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "scene.create",
        payload: { sceneId: "scene-1", name: "Scene 1" },
        actor: a.actor,
        clientTs: 1000,
      }),
    );
    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "section.create",
        payload: {
          sceneId: "scene-1",
          sectionId: "section-1",
          name: "Section 1",
        },
        actor: a.actor,
        clientTs: 1100,
      }),
    );
    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "line.insert_after",
        payload: {
          lineId: "line-1",
          sectionId: "section-1",
          line: { actions: { narration: "hello" } },
        },
        actor: a.actor,
        clientTs: 1200,
      }),
    );

    await b.client.start();
    await waitFor(() => Boolean(b.client.getState().lines["line-1"]), {
      label: "late join client catch-up line-1",
    });

    await a.client.syncNow();
    await b.client.syncNow();

    assert.deepEqual(
      normalizeStateForCompare(a.client.getState()),
      normalizeStateForCompare(b.client.getState()),
    );
  } finally {
    await a.client.stop();
    await b.client.stop();
    await harness.server.shutdown();
  }
});

await runScenario("concurrent-two-client-writes", async () => {
  const projectId = "project-int-concurrent";
  const harness = createHarness();
  const a = harness.createClient({
    projectId,
    userId: "u1",
    clientId: "a",
    partitions: [`project:${projectId}:story`],
    connectionId: "concurrent-a",
  });
  const b = harness.createClient({
    projectId,
    userId: "u2",
    clientId: "b",
    partitions: [`project:${projectId}:story`],
    connectionId: "concurrent-b",
  });

  try {
    await a.client.start();
    await b.client.start();

    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "scene.create",
        payload: { sceneId: "scene-1", name: "Scene 1" },
        actor: a.actor,
        clientTs: 2000,
      }),
    );
    await waitFor(() => Boolean(b.client.getState().scenes["scene-1"]), {
      label: "client B sees scene-1",
    });

    await Promise.all([
      a.client.submitCommand(
        createCommandEnvelope({
          projectId,
          scope: "story",
          type: "section.create",
          payload: {
            sceneId: "scene-1",
            sectionId: "section-a",
            name: "A",
          },
          actor: a.actor,
          clientTs: 2100,
        }),
      ),
      b.client.submitCommand(
        createCommandEnvelope({
          projectId,
          scope: "story",
          type: "section.create",
          payload: {
            sceneId: "scene-1",
            sectionId: "section-b",
            name: "B",
          },
          actor: b.actor,
          clientTs: 2200,
        }),
      ),
    ]);

    await waitFor(
      () =>
        Boolean(a.client.getState().sections["section-a"]) &&
        Boolean(a.client.getState().sections["section-b"]) &&
        Boolean(b.client.getState().sections["section-a"]) &&
        Boolean(b.client.getState().sections["section-b"]),
      { label: "both clients see both sections" },
    );

    await a.client.syncNow();
    await b.client.syncNow();

    assert.deepEqual(
      normalizeStateForCompare(a.client.getState()),
      normalizeStateForCompare(b.client.getState()),
    );
  } finally {
    await a.client.stop();
    await b.client.stop();
    await harness.server.shutdown();
  }
});

await runScenario("partition-isolation", async () => {
  const projectId = "project-int-partitions";
  const harness = createHarness();
  const full = harness.createClient({
    projectId,
    userId: "u1",
    clientId: "full",
    partitions: [
      `project:${projectId}:story`,
      `project:${projectId}:resources`,
    ],
    connectionId: "partition-full",
  });
  const storyOnly = harness.createClient({
    projectId,
    userId: "u2",
    clientId: "story",
    partitions: [`project:${projectId}:story`],
    connectionId: "partition-story",
  });

  try {
    await full.client.start();
    await storyOnly.client.start();

    await full.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "resources",
        type: "resource.create",
        payload: {
          resourceType: "images",
          resourceId: "img-1",
          data: { name: "bg", fileId: "file-1" },
        },
        actor: full.actor,
        clientTs: 3000,
      }),
    );

    await waitFor(
      () => Boolean(full.client.getState().resources.images.items["img-1"]),
      { label: "full client sees image resource" },
    );
    await sleep(150);
    assert.equal(
      storyOnly.client.getState().resources.images.items["img-1"],
      undefined,
    );

    await full.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "scene.create",
        payload: { sceneId: "scene-1", name: "Scene 1" },
        actor: full.actor,
        clientTs: 3100,
      }),
    );

    await waitFor(
      () => Boolean(storyOnly.client.getState().scenes["scene-1"]),
      {
        label: "story-only client sees story event",
      },
    );
  } finally {
    await full.client.stop();
    await storyOnly.client.stop();
    await harness.server.shutdown();
  }
});

console.log("V2 integration tests: PASS");
