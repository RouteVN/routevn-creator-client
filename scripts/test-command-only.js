import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import { validateCommandSubmitItem } from "insieme/client";
import {
  createCommandEnvelope,
  committedEventToCommand,
  createProjectCollabService,
} from "../src/collab/index.js";
import { COMMAND_TYPES } from "../src/domain/commandCatalog.js";
import { validateCommand } from "../src/domain/validateCommand.js";
import {
  createInMemoryServerTransport,
  parseToken,
  sleep,
} from "./collabTestSupport.js";

const commandFromItem = (item) => {
  validateCommandSubmitItem(item);
  const command = committedEventToCommand(item);
  if (!command) {
    throw new Error("failed to convert normalized submit item to command");
  }
  return command;
};

const projectId = "project-command-only-001";
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

const hardcodedCommandTypeScan = spawnSync(
  "rg",
  [
    "-n",
    'type:\\s*"(project|scene|section|line|resource|layout\\.element)\\.',
    "src/deps/services/shared/commandApi",
  ],
  {
    encoding: "utf8",
  },
);
assert.equal(
  hardcodedCommandTypeScan.status,
  1,
  `Found hardcoded command types outside command catalog:\n${(
    hardcodedCommandTypeScan.stdout || ""
  ).trim()}`,
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
  projectName: "Command Only",
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
    connectionId: "command-only-conn-1",
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
    type: COMMAND_TYPES.PROJECT_UPDATE,
    payload: {
      patch: {
        name: "Command Project",
        description: "Only commands should sync",
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
    type: COMMAND_TYPES.RESOURCE_CREATE,
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
  assert.ok(observedSet.has(COMMAND_TYPES.PROJECT_UPDATE));
  assert.ok(observedSet.has(COMMAND_TYPES.RESOURCE_CREATE));
  assert.ok(
    [...observedSet].every((schema) => !schema.startsWith("legacy.")),
    `unexpected schemas: ${[...observedSet].join(", ")}`,
  );
} finally {
  await collab.stop();
  await server.shutdown();
}

console.log("Command-only tests: PASS");
