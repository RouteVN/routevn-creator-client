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
import { createCharacterSpriteCommandApi } from "../src/deps/services/shared/commandApi/characterSprites.js";
import { createLayoutCommandApi } from "../src/deps/services/shared/commandApi/layouts.js";
import { createResourceCommandApi } from "../src/deps/services/shared/commandApi/resources.js";
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
assert.equal(
  commandToSyncEvent(legacySectionRenameCommand).type,
  "section.update",
);
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
assert.equal(
  commandToSyncEvent(legacySectionReorderCommand).type,
  "section.move",
);
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

const legacyLineInsertAfterCommand = createCommandEnvelope({
  id: "legacy-line-insert-after",
  projectId,
  scope: "story",
  partitions: [storyPartition, `project:${projectId}:story:scene:scene-legacy`],
  type: "line.insert_after",
  payload: {
    sectionId: "section-legacy",
    lineId: "line-legacy",
    afterLineId: "line-anchor",
    line: {
      actions: {
        dialogue: {
          content: [{ text: "Legacy line" }],
          mode: "adv",
        },
      },
    },
  },
  actor,
  clientTs: 46,
});

validateCommand(legacyLineInsertAfterCommand);
assert.equal(
  commandToSyncEvent(legacyLineInsertAfterCommand).type,
  "line.create",
);
assert.deepEqual(commandToSyncEvent(legacyLineInsertAfterCommand).payload, {
  sectionId: "section-legacy",
  lines: [
    {
      lineId: "line-legacy",
      data: {
        actions: {
          dialogue: {
            content: [{ text: "Legacy line" }],
            mode: "adv",
          },
        },
      },
    },
  ],
  position: "after",
  positionTargetId: "line-anchor",
});
const normalizedLegacyLineInsertAfter = commandFromItem(
  createCommittedEventFromCommand(legacyLineInsertAfterCommand, 5, 46),
);
assert.equal(normalizedLegacyLineInsertAfter.type, "line.create");
assert.deepEqual(normalizedLegacyLineInsertAfter.payload, {
  sectionId: "section-legacy",
  lines: [
    {
      lineId: "line-legacy",
      data: {
        actions: {
          dialogue: {
            content: [{ text: "Legacy line" }],
            mode: "adv",
          },
        },
      },
    },
  ],
  position: "after",
  positionTargetId: "line-anchor",
});

const expectDeleteValidationFailure = ({
  id,
  scope,
  partitions,
  type,
  payload,
  pattern,
}) => {
  assert.throws(
    () =>
      validateCommand(
        createCommandEnvelope({
          id,
          projectId,
          scope,
          partitions,
          type,
          payload,
          actor,
          clientTs: 47,
        }),
      ),
    pattern,
  );
};

expectDeleteValidationFailure({
  id: "invalid-scene-delete-shape",
  scope: "story",
  partitions: [storyPartition],
  type: COMMAND_TYPES.SCENE_DELETE,
  payload: { sceneId: "scene-legacy" },
  pattern: /payload\.sceneIds is required/,
});

expectDeleteValidationFailure({
  id: "invalid-section-delete-shape",
  scope: "story",
  partitions: [storyPartition],
  type: COMMAND_TYPES.SECTION_DELETE,
  payload: { sectionId: "section-legacy" },
  pattern: /payload\.sectionIds is required/,
});

expectDeleteValidationFailure({
  id: "invalid-line-delete-shape",
  scope: "story",
  partitions: [storyPartition],
  type: COMMAND_TYPES.LINE_DELETE,
  payload: { lineId: "line-legacy" },
  pattern: /payload\.lineIds is required/,
});

expectDeleteValidationFailure({
  id: "invalid-layout-element-delete-shape",
  scope: "layouts",
  partitions: [`project:${projectId}:layouts`],
  type: COMMAND_TYPES.LAYOUT_ELEMENT_DELETE,
  payload: {
    layoutId: "layout-legacy",
    elementId: "element-legacy",
  },
  pattern: /payload\.elementIds is required/,
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
  `Found hardcoded command types outside shared command metadata:\n${(
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
            "scene-2": {
              sections: {
                items: {
                  "section-2": {
                    lines: {
                      items: {
                        "line-4": {
                          actions: {
                            dialogue: {
                              content: [{ text: "secondary" }],
                              characterId: "char-2",
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
    return `project:${currentProjectId}:story:scene:${sceneId}`;
  },
  resolveLineIndex({ section, position, positionTargetId, index }) {
    if (Number.isInteger(index)) {
      return index;
    }

    const orderedLineIds = Object.keys(section?.lines?.items || {});
    if (position === "before" && typeof positionTargetId === "string") {
      const beforeIndex = orderedLineIds.indexOf(positionTargetId);
      return beforeIndex >= 0 ? beforeIndex : 0;
    }

    if (position === "after" && typeof positionTargetId === "string") {
      const afterIndex = orderedLineIds.indexOf(positionTargetId);
      return afterIndex >= 0 ? afterIndex + 1 : orderedLineIds.length;
    }

    return orderedLineIds.length;
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
  `project:${projectId}:story:scene:scene-1`,
]);

capturedLineActionSubmits.length = 0;
await storyCommandApi.setInitialScene({
  sceneId: "scene-1",
});

assert.equal(capturedLineActionSubmits.length, 1);
assert.equal(capturedLineActionSubmits[0].scope, "story");
assert.equal(capturedLineActionSubmits[0].type, COMMAND_TYPES.STORY_UPDATE);
assert.deepEqual(capturedLineActionSubmits[0].payload, {
  data: {
    initialSceneId: "scene-1",
  },
});
assert.deepEqual(capturedLineActionSubmits[0].partitions, [
  `project:${projectId}:story`,
  `project:${projectId}:story:scene:scene-1`,
]);

capturedLineActionSubmits.length = 0;
const createdLineIds = await storyCommandApi.createLineItem({
  sectionId: "section-1",
  position: "after",
  positionTargetId: "line-1",
  lines: [
    {
      lineId: "line-2",
      data: {
        actions: {
          narration: "second",
        },
      },
    },
    {
      lineId: "line-3",
      data: {
        actions: {
          narration: "third",
        },
      },
    },
  ],
});

assert.deepEqual(createdLineIds, ["line-2", "line-3"]);
assert.equal(capturedLineActionSubmits.length, 1);
assert.equal(capturedLineActionSubmits[0].type, COMMAND_TYPES.LINE_CREATE);
assert.deepEqual(capturedLineActionSubmits[0].payload, {
  sectionId: "section-1",
  lines: [
    {
      lineId: "line-2",
      data: {
        actions: {
          narration: "second",
        },
      },
    },
    {
      lineId: "line-3",
      data: {
        actions: {
          narration: "third",
        },
      },
    },
  ],
  parentId: null,
  index: 1,
});
assert.deepEqual(capturedLineActionSubmits[0].partitions, [
  `project:${projectId}:story`,
  `project:${projectId}:story:scene:scene-1`,
]);

capturedLineActionSubmits.length = 0;
await storyCommandApi.deleteSceneItem({
  sceneIds: ["scene-1", "scene-2"],
});

assert.equal(capturedLineActionSubmits.length, 1);
assert.equal(capturedLineActionSubmits[0].type, COMMAND_TYPES.SCENE_DELETE);
assert.deepEqual(capturedLineActionSubmits[0].payload, {
  sceneIds: ["scene-1", "scene-2"],
});
assert.deepEqual(
  normalizePartitions(capturedLineActionSubmits[0].partitions),
  normalizePartitions([
    `project:${projectId}:story`,
    `project:${projectId}:story:scene:scene-1`,
    `project:${projectId}:story:scene:scene-2`,
  ]),
);

capturedLineActionSubmits.length = 0;
await storyCommandApi.deleteSectionItem({
  sectionIds: ["section-1", "section-2"],
});

assert.equal(capturedLineActionSubmits.length, 1);
assert.equal(capturedLineActionSubmits[0].type, COMMAND_TYPES.SECTION_DELETE);
assert.deepEqual(capturedLineActionSubmits[0].payload, {
  sectionIds: ["section-1", "section-2"],
});
assert.deepEqual(
  normalizePartitions(capturedLineActionSubmits[0].partitions),
  normalizePartitions([
    `project:${projectId}:story`,
    `project:${projectId}:story:scene:scene-1`,
    `project:${projectId}:story:scene:scene-2`,
  ]),
);

capturedLineActionSubmits.length = 0;
await storyCommandApi.deleteLineItem({
  lineIds: ["line-1", "line-4"],
});

assert.equal(capturedLineActionSubmits.length, 1);
assert.equal(capturedLineActionSubmits[0].type, COMMAND_TYPES.LINE_DELETE);
assert.deepEqual(capturedLineActionSubmits[0].payload, {
  lineIds: ["line-1", "line-4"],
});
assert.deepEqual(
  normalizePartitions(capturedLineActionSubmits[0].partitions),
  normalizePartitions([
    `project:${projectId}:story`,
    `project:${projectId}:story:scene:scene-1`,
    `project:${projectId}:story:scene:scene-2`,
  ]),
);

const capturedResourceSubmits = [];
const resourceCommandApi = createResourceCommandApi({
  async ensureCommandContext() {
    return {
      projectId,
      state: {},
    };
  },
  resourceTypePartitionFor(currentProjectId, resourceType) {
    return `project:${currentProjectId}:resources:${resourceType}`;
  },
  async submitCommandWithContext(payload) {
    capturedResourceSubmits.push(payload);
  },
});

await resourceCommandApi.deleteResourceItem({
  resourceType: "images",
  resourceIds: ["image-1", "image-2"],
});

assert.equal(capturedResourceSubmits.length, 1);
assert.equal(capturedResourceSubmits[0].type, COMMAND_TYPES.IMAGE_DELETE);
assert.deepEqual(capturedResourceSubmits[0].payload, {
  imageIds: ["image-1", "image-2"],
});

const capturedCharacterSpriteSubmits = [];
const characterSpriteCommandApi = createCharacterSpriteCommandApi({
  createId() {
    return "generated-sprite-id";
  },
  async ensureCommandContext() {
    return {
      projectId,
      state: {
        characters: {
          items: {
            "character-1": {
              sprites: {
                items: {
                  "sprite-folder": {
                    type: "folder",
                    name: "Folder",
                    parentId: null,
                  },
                  "sprite-1": {
                    type: "image",
                    name: "Sprite 1",
                    fileId: "file-1",
                    parentId: "sprite-folder",
                  },
                },
                tree: [
                  {
                    id: "sprite-folder",
                    children: [{ id: "sprite-1" }],
                  },
                ],
              },
            },
          },
        },
      },
    };
  },
  resolveCharacterSpriteIndex({ index }) {
    return index;
  },
  resourceTypePartitionFor(currentProjectId, resourceType) {
    return `project:${currentProjectId}:resources:${resourceType}`;
  },
  async submitCommandWithContext(payload) {
    capturedCharacterSpriteSubmits.push(payload);
  },
});

await characterSpriteCommandApi.createCharacterSpriteItem({
  characterId: "character-1",
  spriteId: "sprite-2",
  parentId: "sprite-folder",
  index: 1,
  data: {
    type: "image",
    name: "Sprite 2",
    fileId: "file-2",
  },
});

assert.equal(capturedCharacterSpriteSubmits.length, 1);
assert.equal(
  capturedCharacterSpriteSubmits[0].type,
  COMMAND_TYPES.CHARACTER_SPRITE_CREATE,
);
assert.deepEqual(capturedCharacterSpriteSubmits[0].payload, {
  characterId: "character-1",
  spriteId: "sprite-2",
  parentId: "sprite-folder",
  index: 1,
  data: {
    type: "image",
    name: "Sprite 2",
    fileId: "file-2",
  },
});

capturedCharacterSpriteSubmits.length = 0;
await characterSpriteCommandApi.deleteCharacterSpriteItem({
  characterId: "character-1",
  spriteIds: ["sprite-1", "sprite-2"],
});

assert.equal(capturedCharacterSpriteSubmits.length, 1);
assert.equal(
  capturedCharacterSpriteSubmits[0].type,
  COMMAND_TYPES.CHARACTER_SPRITE_DELETE,
);
assert.deepEqual(capturedCharacterSpriteSubmits[0].payload, {
  characterId: "character-1",
  spriteIds: ["sprite-1", "sprite-2"],
});

const capturedLayoutSubmits = [];
const layoutCommandApi = createLayoutCommandApi({
  async ensureCommandContext() {
    return {
      projectId,
      state: {
        layouts: {
          items: {
            "layout-1": {
              elements: {
                A: { id: "A", children: [], parentId: null },
                B: { id: "B", children: [], parentId: null },
              },
            },
          },
        },
      },
    };
  },
  resourceTypePartitionFor(currentProjectId, resourceType) {
    return `project:${currentProjectId}:resources:${resourceType}`;
  },
  async submitCommandWithContext(payload) {
    capturedLayoutSubmits.push(payload);
  },
});

await layoutCommandApi.deleteLayoutItem({
  layoutIds: ["layout-1", "layout-2"],
});

assert.equal(capturedLayoutSubmits.length, 1);
assert.equal(capturedLayoutSubmits[0].type, COMMAND_TYPES.LAYOUT_DELETE);
assert.deepEqual(capturedLayoutSubmits[0].payload, {
  layoutIds: ["layout-1", "layout-2"],
});

capturedLayoutSubmits.length = 0;
await layoutCommandApi.deleteLayoutElement({
  layoutId: "layout-1",
  elementIds: ["A", "B"],
});

assert.equal(capturedLayoutSubmits.length, 1);
assert.equal(
  capturedLayoutSubmits[0].type,
  COMMAND_TYPES.LAYOUT_ELEMENT_DELETE,
);
assert.deepEqual(capturedLayoutSubmits[0].payload, {
  layoutId: "layout-1",
  elementIds: ["A", "B"],
});

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

  const invalidLocalResult = await collab.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "story",
      partitions: [
        `project:${projectId}:story`,
        `project:${projectId}:story:scene:scene-missing`,
      ],
      type: COMMAND_TYPES.STORY_UPDATE,
      payload: {
        data: {
          initialSceneId: "scene-missing",
        },
      },
      actor,
      clientTs: 41,
    }),
  );
  assert.equal(invalidLocalResult.valid, false);
  assert.equal(
    invalidLocalResult.error.message,
    "payload.data.initialSceneId must reference an existing scene",
  );

  const storyBasePartition = `project:${projectId}:story`;
  const scenePartition = `project:${projectId}:story:scene:scene-1`;
  const charactersPartition = `project:${projectId}:resources:characters`;
  const imagesPartition = `project:${projectId}:resources:images`;
  const layoutsResourcePartition = `project:${projectId}:resources:layouts`;
  const layoutsPartition = `project:${projectId}:layouts`;

  const commands = [
    createCommandEnvelope({
      projectId,
      scope: "resources",
      partitions: [charactersPartition],
      type: COMMAND_TYPES.CHARACTER_CREATE,
      payload: {
        characterId: "character-1",
        data: {
          name: "Character 1",
          type: "character",
          sprites: {
            items: {},
            tree: [],
          },
        },
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "resources",
      partitions: [charactersPartition],
      type: COMMAND_TYPES.CHARACTER_SPRITE_CREATE,
      payload: {
        characterId: "character-1",
        spriteId: "sprite-1",
        index: 0,
        data: {
          type: "image",
          name: "Sprite 1",
          fileId: "sprite-1.png",
        },
      },
      actor,
    }),
    createCommandEnvelope({
      projectId,
      scope: "resources",
      partitions: [imagesPartition],
      type: COMMAND_TYPES.IMAGE_CREATE,
      payload: {
        imageId: "image-1",
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
      type: COMMAND_TYPES.LINE_CREATE,
      payload: {
        sectionId: "section-1",
        lines: [
          {
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
        ],
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
      type: COMMAND_TYPES.LAYOUT_CREATE,
      payload: {
        layoutId: "layout-1",
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
  assert.ok(observedSet.has(COMMAND_TYPES.CHARACTER_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.IMAGE_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.LAYOUT_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.CHARACTER_SPRITE_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.SCENE_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.LINE_CREATE));
  assert.ok(observedSet.has(COMMAND_TYPES.LINE_UPDATE_ACTIONS));
  assert.ok(observedSet.has(COMMAND_TYPES.LAYOUT_ELEMENT_CREATE));
  assert.ok(
    [...observedSet].every((schema) => !schema.startsWith("legacy.")),
    `unexpected schemas: ${[...observedSet].join(", ")}`,
  );

  const committed = store._debug.getCommitted();
  assert.equal(committed.length, commands.length);
  assert.deepEqual(
    committed.map((event) => event.committedId),
    commands.map((_command, index) => index + 1),
  );

  const committedById = new Map(committed.map((event) => [event.id, event]));
  for (const command of commands) {
    const committedEvent = committedById.get(command.id);
    assert.ok(committedEvent, `missing committed event for ${command.id}`);
    assert.equal(committedEvent.type, command.type);
  }

  for (const command of commands) {
    const event = committedById.get(command.id);
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
      COMMAND_TYPES.LINE_CREATE,
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
    [COMMAND_TYPES.LAYOUT_CREATE],
  );

  const charactersPage = await store.listCommittedSince({
    partitions: [charactersPartition],
    sinceCommittedId: 0,
    limit: 100,
  });
  assert.deepEqual(
    charactersPage.events.map((event) => event.type),
    [COMMAND_TYPES.CHARACTER_CREATE, COMMAND_TYPES.CHARACTER_SPRITE_CREATE],
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
