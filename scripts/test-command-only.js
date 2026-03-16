import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import {
  createInMemoryClientStore,
  validateCommandSubmitItem,
} from "insieme/client";
import {
  buildRepositoryProjectionFromCommittedEvents,
  createCommandEnvelope,
  committedEventToCommand,
  createProjectCollabService,
  commandToSyncEvent,
  ensureRepositoryProjectionCache,
  PROJECTOR_CACHE_VERSION,
} from "../src/deps/services/shared/collab/index.js";
import { createStoryCommandApi } from "../src/deps/services/shared/commandApi/story.js";
import { COMMAND_TYPES } from "../src/internal/project/commands.js";
import { validateCommand } from "../src/internal/project/commands.js";
import {
  createInMemoryServerTransport,
  parseToken,
  sleep,
  waitFor,
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

const createRepositoryStoreStub = (initialEvents = []) => {
  let events = initialEvents.map((event) => structuredClone(event));
  let clearMaterializedViewCheckpointsCount = 0;
  const appState = new Map();

  return {
    async getEvents() {
      return events.map((event) => structuredClone(event));
    },
    async appendEvent(event) {
      events.push(structuredClone(event));
    },
    async clearEvents() {
      events = [];
    },
    async clearMaterializedViewCheckpoints() {
      clearMaterializedViewCheckpointsCount += 1;
    },
    app: {
      async get(key) {
        return structuredClone(appState.get(key));
      },
      async set(key, value) {
        appState.set(key, structuredClone(value));
      },
      async remove(key) {
        appState.delete(key);
      },
    },
    _debug: {
      getEvents() {
        return events.map((event) => structuredClone(event));
      },
      getAppValue(key) {
        return structuredClone(appState.get(key));
      },
      getClearMaterializedViewCheckpointsCount() {
        return clearMaterializedViewCheckpointsCount;
      },
    },
  };
};

const createCommittedEventFromCommand = (command, committedId, created) => ({
  committedId,
  id: command.id,
  partitions: [...(command.partitions || [])],
  ...commandToSyncEvent(command),
  created,
});

const createSubmitItemFromCommand = (command) => ({
  id: command.id,
  partitions: [...(command.partitions || [])],
  ...commandToSyncEvent(command),
});

const projectId = "project-command-only-001";
const actor = { userId: "user-1", clientId: "client-1" };
const storyPartition = `project:${projectId}:story`;

const legacySceneCreateCommand = createCommandEnvelope({
  id: "legacy-scene-create",
  projectId,
  scope: "story",
  partitions: [storyPartition],
  type: COMMAND_TYPES.SCENE_CREATE,
  payload: {
    sceneId: "scene-legacy",
    name: "Legacy Scene",
  },
  actor,
  clientTs: 42,
});

validateCommand(legacySceneCreateCommand);
assert.deepEqual(commandToSyncEvent(legacySceneCreateCommand).payload, {
  sceneId: "scene-legacy",
  data: {
    name: "Legacy Scene",
  },
});
assert.deepEqual(
  commandFromItem(
    createCommittedEventFromCommand(legacySceneCreateCommand, 1, 42),
  ).payload,
  {
    sceneId: "scene-legacy",
    data: {
      name: "Legacy Scene",
    },
  },
);

const legacyResourceRenameCommand = createCommandEnvelope({
  id: "legacy-resource-rename",
  projectId,
  scope: "resources",
  partitions: [`project:${projectId}:resources:images`],
  type: "resource.rename",
  payload: {
    resourceType: "images",
    resourceId: "image-legacy",
    name: "Legacy Image",
  },
  actor,
  clientTs: 43,
});

validateCommand(legacyResourceRenameCommand);
assert.equal(commandToSyncEvent(legacyResourceRenameCommand).type, "resource.update");
assert.deepEqual(commandToSyncEvent(legacyResourceRenameCommand).payload, {
  resourceType: "images",
  resourceId: "image-legacy",
  data: {
    name: "Legacy Image",
  },
});
const normalizedLegacyResourceRename = commandFromItem(
  createCommittedEventFromCommand(legacyResourceRenameCommand, 2, 43),
);
assert.equal(normalizedLegacyResourceRename.type, "resource.update");
assert.deepEqual(normalizedLegacyResourceRename.payload, {
  resourceType: "images",
  resourceId: "image-legacy",
  data: {
    name: "Legacy Image",
  },
});

const legacySectionRenameCommand = createCommandEnvelope({
  id: "legacy-section-rename",
  projectId,
  scope: "story",
  partitions: [storyPartition, `project:${projectId}:story:scene:scene-legacy`],
  type: "section.rename",
  payload: {
    sectionId: "section-legacy",
    name: "Legacy Section",
  },
  actor,
  clientTs: 44,
});

validateCommand(legacySectionRenameCommand);
assert.equal(commandToSyncEvent(legacySectionRenameCommand).type, "section.update");
assert.deepEqual(commandToSyncEvent(legacySectionRenameCommand).payload, {
  sectionId: "section-legacy",
  data: {
    name: "Legacy Section",
  },
});
const normalizedLegacySectionRename = commandFromItem(
  createCommittedEventFromCommand(legacySectionRenameCommand, 3, 44),
);
assert.equal(normalizedLegacySectionRename.type, "section.update");
assert.deepEqual(normalizedLegacySectionRename.payload, {
  sectionId: "section-legacy",
  data: {
    name: "Legacy Section",
  },
});

const legacySectionReorderCommand = createCommandEnvelope({
  id: "legacy-section-reorder",
  projectId,
  scope: "story",
  partitions: [storyPartition, `project:${projectId}:story:scene:scene-legacy`],
  type: "section.reorder",
  payload: {
    sectionId: "section-legacy",
    index: 0,
  },
  actor,
  clientTs: 45,
});

validateCommand(legacySectionReorderCommand);
assert.equal(commandToSyncEvent(legacySectionReorderCommand).type, "section.move");
assert.deepEqual(commandToSyncEvent(legacySectionReorderCommand).payload, {
  sectionId: "section-legacy",
  index: 0,
});
const normalizedLegacySectionReorder = commandFromItem(
  createCommittedEventFromCommand(legacySectionReorderCommand, 4, 45),
);
assert.equal(normalizedLegacySectionReorder.type, "section.move");
assert.deepEqual(normalizedLegacySectionReorder.payload, {
  sectionId: "section-legacy",
  index: 0,
});

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
  data: {
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
  const imagesPartition = `project:${projectId}:resources:images`;
  const layoutsResourcePartition = `project:${projectId}:resources:layouts`;
  const layoutsPartition = `project:${projectId}:layouts`;

  const commands = [
    createCommandEnvelope({
      projectId,
      scope: "resources",
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
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.SCENE_CREATE,
      payload: {
        sceneId: "scene-1",
        data: { name: "Scene 1" },
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "story",
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.SECTION_CREATE,
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
        data: { name: "Section 1" },
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "story",
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.LINE_INSERT_AFTER,
      payload: {
        sectionId: "section-1",
        lineId: "line-1",
        data: {
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
      partitions: [storyBasePartition, scenePartition],
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId: "line-1",
        data: {
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
      partitions: [layoutsPartition],
      type: COMMAND_TYPES.LAYOUT_ELEMENT_CREATE,
      payload: {
        layoutId: "layout-1",
        elementId: "el-1",
        data: {
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
      normalizePartitions(command.partitions),
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

{
  const futureProjectId = "project-command-only-future";
  const storyPartition = `project:${futureProjectId}:story`;
  const currentSceneCommand = createCommandEnvelope({
    id: "future-scene-1",
    projectId: futureProjectId,
    scope: "story",
    partitions: [storyPartition],
    type: COMMAND_TYPES.SCENE_CREATE,
    payload: {
      sceneId: "scene-1",
      name: "Scene 1",
    },
    actor,
    clientTs: 4001,
    commandVersion: 1,
  });
  const futureSectionCommand = createCommandEnvelope({
    id: "future-section-1",
    projectId: futureProjectId,
    scope: "story",
    partitions: [storyPartition],
    type: COMMAND_TYPES.SECTION_CREATE,
    payload: {
      sceneId: "scene-1",
      sectionId: "section-1",
      name: "Section 1",
    },
    actor,
    clientTs: 4002,
    commandVersion: 2,
  });

  const futureItem = createCommittedEventFromCommand(
    futureSectionCommand,
    2,
    4002,
  );
  const futureCommand = commandFromItem(futureItem);
  assert.equal(futureCommand.commandVersion, 2);

  const committedEvents = [
    createCommittedEventFromCommand(currentSceneCommand, 1, 4001),
    futureItem,
  ];
  const oldProjection = buildRepositoryProjectionFromCommittedEvents({
    committedEvents,
  });
  assert.equal(oldProjection.repositoryEvents.length, 1);
  assert.equal(
    oldProjection.projectionGap?.commandType,
    COMMAND_TYPES.SECTION_CREATE,
  );
  assert.equal(oldProjection.projectionGap?.remoteCommandVersion, 2);

  const upgradedProjection = buildRepositoryProjectionFromCommittedEvents({
    committedEvents,
    supportedCommandVersion: 2,
  });
  assert.equal(upgradedProjection.repositoryEvents.length, 2);
  assert.equal(upgradedProjection.projectionGap, undefined);

  const rawClientStore = createInMemoryClientStore();
  const repositoryStore = createRepositoryStoreStub([
    oldProjection.repositoryEvents[0],
  ]);
  const cacheResult = await ensureRepositoryProjectionCache({
    repositoryStore,
    rawClientStore,
  });
  assert.equal(cacheResult.rebuilt, true);
  assert.equal(rawClientStore._debug.getCommitted().length, 1);
  assert.equal(repositoryStore._debug.getEvents().length, 1);
  assert.equal(
    repositoryStore._debug.getAppValue("projector.cacheVersion"),
    PROJECTOR_CACHE_VERSION,
  );
  assert.equal(
    repositoryStore._debug.getClearMaterializedViewCheckpointsCount(),
    1,
  );
}

{
  const futureProjectId = "project-command-only-live-future";
  const storyPartition = `project:${futureProjectId}:story`;
  const oldClientStore = createInMemoryClientStore();
  const futureStore = createInMemorySyncStore();
  const futureServer = createSyncServer({
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
          partition.startsWith(`project:${futureProjectId}:`),
        );
      },
    },
    validation: {
      validate: async (item) => {
        validateCommandSubmitItem(item);
      },
    },
    store: futureStore,
    clock: {
      now: () => Date.now(),
    },
  });

  const oldClient = createProjectCollabService({
    projectId: futureProjectId,
    projectName: "Future Compatibility",
    projectDescription: "old client should keep running",
    token: "user:user-1:client:old-client",
    actor: {
      userId: "user-1",
      clientId: "old-client",
    },
    partitions: [storyPartition],
    clientStore: oldClientStore,
    transport: createInMemoryServerTransport({
      server: futureServer,
      connectionId: "future-old-client",
    }),
  });

  const futureWriter = createProjectCollabService({
    projectId: futureProjectId,
    projectName: "Future Compatibility",
    projectDescription: "writer",
    token: "user:user-2:client:future-writer",
    actor: {
      userId: "user-2",
      clientId: "future-writer",
    },
    partitions: [storyPartition],
    transport: createInMemoryServerTransport({
      server: futureServer,
      connectionId: "future-writer-client",
    }),
  });

  try {
    await oldClient.start();
    await futureWriter.start();

    await futureWriter.submitEvent(
      createSubmitItemFromCommand(
        createCommandEnvelope({
          id: "live-scene-1",
          projectId: futureProjectId,
          scope: "story",
          partitions: [storyPartition],
          type: COMMAND_TYPES.SCENE_CREATE,
          payload: {
            sceneId: "scene-1",
            name: "Scene 1",
          },
          actor: {
            userId: "user-2",
            clientId: "future-writer",
          },
          clientTs: 5001,
          commandVersion: 1,
        }),
      ),
    );

    await waitFor(() => Boolean(oldClient.getState().scenes["scene-1"]), {
      label: "old client applies compatible scene.create",
    });

    await futureWriter.submitEvent(
      createSubmitItemFromCommand(
        createCommandEnvelope({
          id: "live-section-1",
          projectId: futureProjectId,
          scope: "story",
          partitions: [storyPartition],
          type: COMMAND_TYPES.SECTION_CREATE,
          payload: {
            sceneId: "scene-1",
            sectionId: "section-1",
            name: "Section 1",
          },
          actor: {
            userId: "user-2",
            clientId: "future-writer",
          },
          clientTs: 5002,
          commandVersion: 2,
        }),
      ),
    );

    await waitFor(() => Boolean(oldClient.getProjectionGap()), {
      label: "old client records projection gap",
    });

    assert.equal(oldClient.getState().sections["section-1"], undefined);
    assert.equal(
      oldClient.getProjectionGap()?.commandType,
      COMMAND_TYPES.SECTION_CREATE,
    );
    assert.equal(oldClient.getProjectionGap()?.remoteCommandVersion, 2);
    assert.equal(oldClientStore._debug.getCommitted().length, 2);
    assert.equal(
      oldClientStore._debug.getCommitted()[1].meta.commandVersion,
      2,
    );
  } finally {
    await oldClient.stop();
    await futureWriter.stop();
    await futureServer.shutdown();
  }
}

console.log("Command-only tests: PASS");
