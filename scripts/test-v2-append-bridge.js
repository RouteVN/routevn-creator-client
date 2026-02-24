import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createInMemorySyncStore, createSyncServer } from "insieme";
import {
  createLegacyEventCommand,
  createProjectCollabService,
} from "../src/collab/v2/index.js";
import { validateEventPayload } from "../src/deps/infra/domainStructure/validation.js";

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

const projectId = "project-bridge-001";
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
  `Found write-path bypasses:\\n${(bypassScan.stdout || "").trim()}`,
);

const assertPartition = (command, expected) => {
  assert.equal(command.partition, expected[0]);
  assert.deepEqual(command.partitions, expected);
};

const commandSceneLine = createLegacyEventCommand({
  projectId,
  actor,
  event: {
    type: "set",
    payload: {
      target:
        "scenes.items.scene-1.sections.items.section-1.lines.items.line-1.actions.dialogue",
      value: {
        content: [{ text: "hello" }],
      },
      options: { replace: true },
    },
  },
});
assertPartition(commandSceneLine, [
  `project:${projectId}:story`,
  `project:${projectId}:story:line:line-1`,
]);

const commandSprite = createLegacyEventCommand({
  projectId,
  actor,
  event: {
    type: "nodeUpdate",
    payload: {
      target: "characters.items.char-7.sprites",
      value: { name: "Pose A" },
      options: { id: "sprite-9", replace: false },
    },
  },
});
assertPartition(commandSprite, [
  `project:${projectId}:resources`,
  `project:${projectId}:resources:character:char-7:sprite:sprite-9`,
]);

const commandLayoutElement = createLegacyEventCommand({
  projectId,
  actor,
  event: {
    type: "nodeMove",
    payload: {
      target: "layouts.items.layout-2.elements",
      options: {
        id: "element-5",
        parent: "_root",
        position: "last",
      },
    },
  },
});
assertPartition(commandLayoutElement, [
  `project:${projectId}:layouts`,
  `project:${projectId}:layouts:layout:layout-2:element:element-5`,
]);

const commandInitialScene = createLegacyEventCommand({
  projectId,
  actor,
  event: {
    type: "set",
    payload: {
      target: "story.initialSceneId",
      value: "scene-2",
    },
  },
});
assertPartition(commandInitialScene, [
  `project:${projectId}:story`,
  `project:${projectId}:story:scene:scene-2`,
]);

const observed = [];
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

      const payload = item.event.payload;
      if (payload?.schema !== "legacy.event.apply") {
        const error = new Error(`unexpected schema: ${payload?.schema}`);
        error.code = "validation_failed";
        throw error;
      }

      const legacyEvent = payload?.data?.event;
      if (!legacyEvent || typeof legacyEvent !== "object") {
        const error = new Error("legacy command is missing event payload");
        error.code = "validation_failed";
        throw error;
      }

      validateEventPayload(legacyEvent.type, legacyEvent.payload);
      observed.push({
        id:
          typeof payload?.commandId === "string" && payload.commandId.length > 0
            ? payload.commandId
            : item.id,
        partitions: Array.isArray(item.partitions) ? item.partitions : [],
      });
    },
  },
  store,
  clock: {
    now: () => Date.now(),
  },
});

const collab = createProjectCollabService({
  projectId,
  projectName: "Bridge",
  projectDescription: "append bridge",
  token: "user:user-1:client:client-1",
  actor,
  partitions: [
    `project:${projectId}:story`,
    `project:${projectId}:resources`,
    `project:${projectId}:layouts`,
    `project:${projectId}:settings`,
  ],
  transport: createInMemoryServerTransport({
    server,
    connectionId: "bridge-conn-1",
  }),
});

try {
  await collab.start();
  await collab.submitLegacyCommand(commandSceneLine);
  await collab.submitLegacyCommand(commandSprite);
  await collab.submitLegacyCommand(commandLayoutElement);
  await collab.submitLegacyCommand(commandInitialScene);
  await collab.flushDrafts();
  await collab.syncNow({ timeoutMs: 1000 });
  await sleep(30);

  const partitionsByCommandId = new Map();
  for (const record of observed) {
    const current = partitionsByCommandId.get(record.id) || new Set();
    for (const partition of record.partitions) current.add(partition);
    partitionsByCommandId.set(record.id, current);
  }

  if (process.env.DEBUG_APPEND_BRIDGE === "1") {
    console.log("observed", observed);
    console.log(
      "ids",
      [...partitionsByCommandId.keys()],
      commandSceneLine.id,
      commandSprite.id,
      commandLayoutElement.id,
      commandInitialScene.id,
    );
  }

  assert.equal(partitionsByCommandId.size, 4);

  const assertPartitionsFor = (command) => {
    const partitionSet = partitionsByCommandId.get(command.id);
    assert.ok(partitionSet, `missing server validation for ${command.id}`);
    assert.deepEqual([...partitionSet].sort(), [...command.partitions].sort());
  };

  assertPartitionsFor(commandSceneLine);
  assertPartitionsFor(commandSprite);
  assertPartitionsFor(commandLayoutElement);
  assertPartitionsFor(commandInitialScene);
} finally {
  await collab.stop();
  await server.shutdown();
}

console.log("V2 append bridge tests: PASS");
