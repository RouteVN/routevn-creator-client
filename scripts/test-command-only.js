import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import { validateCommandSubmitItem } from "insieme/client";
import {
  createCommandEnvelope,
  committedEventToCommand,
  createProjectCollabService,
} from "../src/deps/services/shared/collab/index.js";
import { createStoryCommandApi } from "../src/deps/services/shared/commandApi/story.js";
import { COMMAND_TYPES } from "../src/internal/project/commands.js";
import { validateCommand } from "../src/internal/project/commands.js";
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

const normalizePartitions = (partitions) => {
  return [...new Set(partitions || [])].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
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

const capturedLineActionSubmits = [];
const storyCommandApi = createStoryCommandApi({
  async ensureCommandContext() {
    return {
      projectId,
      state: {
        scenes: {
          items: {
            "scene-1": {
              sections: {
                items: {
                  "section-1": {
                    lines: {
                      items: {
                        "line-1": {
                          actions: {
                            dialogue: {
                              content: [{ text: "hello" }],
                              characterId: "char-1",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  },
  storyBasePartitionFor(currentProjectId) {
    return `project:${currentProjectId}:story`;
  },
  storyScenePartitionFor(currentProjectId, sceneId) {
    return `project:${currentProjectId}:story:${sceneId}`;
  },
  async submitCommandWithContext(payload) {
    capturedLineActionSubmits.push(payload);
  },
});

await storyCommandApi.updateLineDialogueAction({
  lineId: "line-1",
  dialogue: {
    content: [{ text: "updated" }],
    mode: "adv",
  },
});

assert.equal(capturedLineActionSubmits.length, 1);
assert.equal(
  capturedLineActionSubmits[0].type,
  COMMAND_TYPES.LINE_UPDATE_ACTIONS,
);
assert.deepEqual(capturedLineActionSubmits[0].payload, {
  lineId: "line-1",
  patch: {
    dialogue: {
      content: [{ text: "updated" }],
      mode: "adv",
    },
  },
  replace: false,
});
assert.deepEqual(capturedLineActionSubmits[0].partitions, [
  `project:${projectId}:story`,
  `project:${projectId}:story:scene-1`,
]);

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

  const storyBasePartition = `project:${projectId}:story`;
  const scenePartition = `project:${projectId}:story:scene:scene-1`;
  const settingsPartition = `project:${projectId}:settings`;
  const imagesPartition = `project:${projectId}:resources:images`;
  const layoutsResourcePartition = `project:${projectId}:resources:layouts`;
  const layoutsPartition = `project:${projectId}:layouts`;

  const commands = [
    createCommandEnvelope({
      projectId,
      scope: "settings",
      partition: settingsPartition,
      partitions: [settingsPartition],
      type: COMMAND_TYPES.PROJECT_UPDATE,
      payload: {
        patch: {
          name: "Command Project",
          description: "Only commands should sync",
        },
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "resources",
      partition: imagesPartition,
      partitions: [imagesPartition],
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
    }),
    createCommandEnvelope({
      projectId,
      scope: "story",
      partition: storyBasePartition,
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.SCENE_CREATE,
      payload: {
        sceneId: "scene-1",
        name: "Scene 1",
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "story",
      partition: storyBasePartition,
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.SECTION_CREATE,
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
        name: "Section 1",
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "story",
      partition: storyBasePartition,
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.LINE_INSERT_AFTER,
      payload: {
        sectionId: "section-1",
        lineId: "line-1",
        line: {
          actions: {
            dialogue: {
              content: [{ text: "Hello" }],
              mode: "adv",
            },
          },
        },
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "story",
      partition: storyBasePartition,
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId: "line-1",
        patch: {
          dialogue: {
            content: [{ text: "Hello" }],
            mode: "nvl",
            ui: {
              resourceId: "layout-1",
            },
          },
        },
        replace: false,
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "resources",
      partition: layoutsResourcePartition,
      partitions: [layoutsResourcePartition],
      type: COMMAND_TYPES.RESOURCE_CREATE,
      payload: {
        resourceType: "layouts",
        resourceId: "layout-1",
        data: {
          name: "Layout 1",
          layoutType: "normal",
          elements: {
            items: {},
            tree: [],
          },
        },
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "layouts",
      partition: layoutsPartition,
      partitions: [layoutsPartition],
      type: COMMAND_TYPES.LAYOUT_ELEMENT_CREATE,
      payload: {
        layoutId: "layout-1",
        elementId: "el-1",
        element: {
          type: "text",
          x: 10,
          y: 20,
        },
      },
      actor,
    }),
  ];

  for (const command of commands) {
    await collab.submitCommand(command);
  }

  await collab.flushDrafts();
  await collab.syncNow({ timeoutMs: 1000 });
  await sleep(30);

  const observedSet = new Set(observedSchemas);
  assert.ok(observedSet.has(COMMAND_TYPES.PROJECT_UPDATE));
  assert.ok(observedSet.has(COMMAND_TYPES.RESOURCE_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.SCENE_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.LINE_UPDATE_ACTIONS));
  assert.ok(observedSet.has(COMMAND_TYPES.LAYOUT_ELEMENT_CREATE));
  assert.ok(
    [...observedSet].every((schema) => !schema.startsWith("legacy.")),
    `unexpected schemas: ${[...observedSet].join(", ")}`,
  );

  const committed = store._debug.getCommitted();
  assert.equal(committed.length, commands.length);
  assert.deepEqual(
    committed.map((event) => event.id),
    commands.map((command) => command.id),
  );
  assert.deepEqual(
    committed.map((event) => event.type),
    commands.map((command) => command.type),
  );
  assert.deepEqual(
    committed.map((event) => event.committedId),
    commands.map((_command, index) => index + 1),
  );

  for (let index = 0; index < commands.length; index += 1) {
    const event = committed[index];
    const command = commands[index];
    assert.equal(event.projectId, projectId);
    assert.equal(event.userId, actor.userId);
    assert.deepEqual(event.payload, command.payload);
    assert.deepEqual(
      normalizePartitions(event.partitions),
      normalizePartitions(command.partitions || [command.partition]),
    );
    assert.equal(typeof event.created, "number");
  }

  const storyPage = await store.listCommittedSince({
    partitions: [storyBasePartition, scenePartition],
    sinceCommittedId: 0,
    limit: 100,
  });
  assert.deepEqual(
    storyPage.events.map((event) => event.type),
    [
      COMMAND_TYPES.SCENE_CREATE,
      COMMAND_TYPES.SECTION_CREATE,
      COMMAND_TYPES.LINE_INSERT_AFTER,
      COMMAND_TYPES.LINE_UPDATE_ACTIONS,
    ],
  );

  const layoutsPage = await store.listCommittedSince({
    partitions: [layoutsPartition],
    sinceCommittedId: 0,
    limit: 100,
  });
  assert.deepEqual(
    layoutsPage.events.map((event) => event.type),
    [COMMAND_TYPES.LAYOUT_ELEMENT_CREATE],
  );

  const layoutResourcePage = await store.listCommittedSince({
    partitions: [layoutsResourcePartition],
    sinceCommittedId: 0,
    limit: 100,
  });
  assert.deepEqual(
    layoutResourcePage.events.map((event) => event.type),
    [COMMAND_TYPES.RESOURCE_CREATE],
  );
} finally {
  await collab.stop();
  await server.shutdown();
}

console.log("Command-only tests: PASS");
