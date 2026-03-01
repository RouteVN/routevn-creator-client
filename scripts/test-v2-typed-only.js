import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import {
  createCommandEnvelope,
  createProjectCollabService,
} from "../src/collab/v2/index.js";
import { validateCommand } from "../src/domain/v2/validateCommand.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const parseProjectIdFromPartitions = (partitions = []) => {
  const first = partitions[0] || "";
  const parts = first.split(":");
  return parts.length >= 3 ? parts[1] : null;
};

const commandFromItem = (item) => {
  const payload = item?.event?.payload || {};
  const partitions = Array.isArray(item?.partitions) ? item.partitions : [];
  return {
    id: payload.commandId,
    projectId: payload.projectId || parseProjectIdFromPartitions(partitions),
    partition: partitions[0],
    partitions,
    type: payload.schema,
    commandVersion: payload.commandVersion,
    clientTs: payload.clientTs,
    actor: payload.actor,
    payload: payload.data,
  };
};

const createInMemoryServerTransport = ({ server, connectionId }) => {
  let session = null;
  let messageHandler = null;
  let connected = false;

  const deliver = async (message) => {
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

const projectId = "project-typed-only-001";
const actor = { userId: "user-1", clientId: "client-1" };

const bypassScan = spawnSync(
  "rg",
  ["-n", "repository\\.addEvent\\(", "src/pages", "src/components"],
  {
    encoding: "utf8",
  },
);
assert.equal(
  bypassScan.status,
  1,
  `Found write-path bypasses:\n${(bypassScan.stdout || "").trim()}`,
);

const observedSchemas = [];
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
    authorizePartitions: async (_identity, partitions) => {
      if (!Array.isArray(partitions) || partitions.length === 0) return false;
      return partitions.every((partition) =>
        partition.startsWith(`project:${projectId}:`),
      );
    },
  },
  validation: {
    validate: async (item) => {
      if (item?.event?.type !== "event") {
        const error = new Error("invalid event envelope type");
        error.code = "validation_failed";
        throw error;
      }

      const command = commandFromItem(item);
      if (command.type.startsWith("legacy.")) {
        const error = new Error("legacy commands are not supported");
        error.code = "validation_failed";
        throw error;
      }

      validateCommand(command);
      observedSchemas.push(command.type);
    },
  },
  store,
  clock: {
    now: () => Date.now(),
  },
});

const collab = createProjectCollabService({
  projectId,
  projectName: "Typed Only",
  projectDescription: "no legacy commands",
  token: "user:user-1:client:client-1",
  actor,
  partitions: [
    `project:${projectId}:settings`,
    `project:${projectId}:resources`,
    `project:${projectId}:story`,
    `project:${projectId}:layouts`,
  ],
  transport: createInMemoryServerTransport({
    server,
    connectionId: "typed-only-conn-1",
  }),
});

try {
  await collab.start();

  const methodNames = Object.keys(collab);
  assert.ok(
    methodNames.every((name) => !name.toLowerCase().includes("legacy")),
    `legacy method leakage detected: ${methodNames.join(", ")}`,
  );

  const updateProject = createCommandEnvelope({
    projectId,
    scope: "settings",
    partition: `project:${projectId}:settings`,
    partitions: [`project:${projectId}:settings`],
    type: "project.update",
    payload: {
      patch: {
        name: "Typed Project",
        description: "Only typed commands should sync",
      },
    },
    actor,
  });

  const createImage = createCommandEnvelope({
    projectId,
    scope: "resources",
    partition: `project:${projectId}:resources`,
    partitions: [
      `project:${projectId}:resources`,
      `project:${projectId}:resources:images:image-1`,
    ],
    type: "resource.create",
    payload: {
      resourceType: "images",
      resourceId: "image-1",
      data: {
        name: "Image 1",
        type: "image",
        src: "image-1.png",
      },
    },
    actor,
  });

  await collab.submitCommand(updateProject);
  await collab.submitCommand(createImage);
  await collab.flushDrafts();
  await collab.syncNow({ timeoutMs: 1000 });
  await sleep(30);

  const observedSet = new Set(observedSchemas);
  assert.ok(observedSet.has("project.update"));
  assert.ok(observedSet.has("resource.create"));
  assert.ok(
    [...observedSet].every((schema) => !schema.startsWith("legacy.")),
    `unexpected schemas: ${[...observedSet].join(", ")}`,
  );
} finally {
  await collab.stop();
  await server.shutdown();
}

console.log("V2 typed-only command tests: PASS");
