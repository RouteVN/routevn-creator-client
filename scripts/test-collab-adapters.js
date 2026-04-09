import assert from "node:assert/strict";
import {
  applyCommandToRepositoryState,
  initialProjectData,
  createRepositoryCommandEvent,
  repositoryEventToCommand,
} from "../src/deps/services/shared/projectRepository.js";
import { COMMAND_ENVELOPE_VERSION } from "../src/internal/projectCompatibility.js";
import { createCommandApiShared } from "../src/deps/services/shared/commandApi/shared.js";
import { createMediaResourceCommandApi } from "../src/deps/services/shared/commandApi/resources/media.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../src/deps/services/shared/collab/partitions.js";
import {
  enqueueSerialTask,
  ensureCachedCommittedCursor,
  persistCachedCommittedCursor,
  toReplaySubmissionEvent,
  toUncommittedSyncSubmissionEvents,
} from "../src/deps/services/web/projectServiceCollabRuntime.js";

const projectId = "project-adapter-test-001";
const scene1MainPartition = mainScenePartitionFor("scene-1");
const scene1Partition = scenePartitionFor("scene-1");

const createRepositoryEvent = ({
  id,
  actor = {
    userId: `local-${projectId}`,
    clientId: "local-client",
  },
  clientTs = 1000,
  meta,
  type = "image.update",
  schemaVersion = COMMAND_ENVELOPE_VERSION,
  payload = {
    imageId: "image-1",
    data: {
      name: "Updated",
    },
  },
  partition = "m",
}) => ({
  id,
  partition,
  projectId,
  userId: actor.userId,
  type,
  schemaVersion,
  payload,
  meta: {
    clientId: actor.clientId,
    clientTs,
    ...(meta ? structuredClone(meta) : {}),
  },
});

{
  const repositoryEvent = createRepositoryEvent({
    id: "command-1",
    clientTs: 1234,
    meta: {
      origin: "offline-draft",
      note: "keep me",
      clientId: "stale-client",
    },
  });
  const replayed = toReplaySubmissionEvent({
    repositoryEvent,
    actor: {
      userId: "remote-user",
      clientId: "remote-client",
    },
  });
  const replayedCommand = repositoryEventToCommand(replayed);

  assert.equal(replayed.id, "command-1");
  assert.equal(replayed.partition, repositoryEvent.partition);
  assert.equal(replayedCommand.id, "command-1");
  assert.equal(replayedCommand.projectId, projectId);
  assert.equal(replayedCommand.actor.userId, "remote-user");
  assert.equal(replayedCommand.actor.clientId, "remote-client");
  assert.equal(replayedCommand.clientTs, 1234);
  assert.equal(replayedCommand.meta.origin, "offline-draft");
  assert.equal(replayedCommand.meta.note, "keep me");
  assert.equal(replayedCommand.meta.clientId, "remote-client");
  assert.equal(replayedCommand.meta.clientTs, 1234);

  const repositoryEvents = [
    createRepositoryEvent({
      id: "command-1",
      type: "scene.create",
      partition: scene1MainPartition,
      payload: {
        sceneId: "scene-1",
        data: { name: "Scene 1" },
      },
    }),
    createRepositoryEvent({
      id: "command-2",
      type: "section.create",
      partition: scene1MainPartition,
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
        data: { name: "Section 1" },
      },
    }),
    createRepositoryEvent({
      id: "command-3",
      type: "line.create",
      partition: scene1Partition,
      payload: {
        sectionId: "section-1",
        lines: [
          {
            lineId: "line-1",
            data: { actions: { narration: "hello" } },
          },
        ],
      },
    }),
  ];
  const uncommitted = toUncommittedSyncSubmissionEvents({
    repositoryEvents,
    committedCursor: 2.9,
  });

  assert.deepEqual(
    uncommitted.map((event) => event.id),
    ["command-3"],
  );
}

{
  const repositoryEvent = {
    id: "command-no-client-id",
    partition: scene1Partition,
    projectId,
    userId: "user-1",
    type: "line.create",
    schemaVersion: COMMAND_ENVELOPE_VERSION,
    payload: {
      sectionId: "section-1",
      lines: [
        {
          lineId: "line-1",
          data: { actions: { narration: "hello" } },
        },
      ],
    },
    meta: {
      clientTs: 4321,
    },
  };

  const command = repositoryEventToCommand(repositoryEvent);

  assert.equal(command.id, repositoryEvent.id);
  assert.equal(command.actor.userId, "user-1");
  assert.equal(command.actor.clientId, undefined);
  assert.equal(command.clientTs, 4321);

  const roundTrippedRepositoryEvent = createRepositoryCommandEvent({
    command,
  });

  assert.equal(roundTrippedRepositoryEvent.id, repositoryEvent.id);
  assert.equal(
    roundTrippedRepositoryEvent.partition,
    repositoryEvent.partition,
  );
  assert.equal(
    roundTrippedRepositoryEvent.projectId,
    repositoryEvent.projectId,
  );
  assert.deepEqual(roundTrippedRepositoryEvent.meta, { clientTs: 4321 });
}

{
  const uploadProjectId = "project-image-upload-001";
  let repositoryState = structuredClone(initialProjectData);

  const repository = {
    getState: () => structuredClone(repositoryState),
    async addEvent(repositoryEvent) {
      const command = repositoryEventToCommand(repositoryEvent);
      const applyResult = applyCommandToRepositoryState({
        repositoryState,
        command,
        projectId: uploadProjectId,
      });
      if (applyResult.valid === false) {
        throw new Error(applyResult.error?.message || "Failed to add event");
      }
      repositoryState = applyResult.repositoryState;
    },
  };

  let projectedState = structuredClone(repositoryState);
  const actor = {
    userId: `local-${uploadProjectId}`,
    clientId: "local-client",
  };

  const session = {
    getActor: () => actor,
    syncProjectedRepositoryState(nextState) {
      projectedState = structuredClone(nextState);
    },
    async submitCommand(command) {
      const applyResult = applyCommandToRepositoryState({
        repositoryState: projectedState,
        command,
        projectId: uploadProjectId,
      });
      if (applyResult.valid === false) {
        return applyResult;
      }
      projectedState = applyResult.repositoryState;
      return { valid: true };
    },
  };

  const shared = createCommandApiShared({
    idGenerator: (() => {
      let counter = 0;
      return () => `cmd-${++counter}`;
    })(),
    now: (() => {
      let timestamp = 1000;
      return () => ++timestamp;
    })(),
    getCurrentProjectId: () => uploadProjectId,
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => actor,
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "m",
    resourceTypePartitionFor: () => "m",
  });

  const mediaApi = createMediaResourceCommandApi(shared);
  const createdImageId = await mediaApi.createImage({
    imageId: "image-1",
    fileRecords: [
      {
        id: "file-1",
        mimeType: "image/png",
        size: 123,
        sha256: "sha256-1",
      },
    ],
    data: {
      type: "image",
      fileId: "file-1",
      thumbnailFileId: "file-1",
      name: "Uploaded Image",
      fileType: "image/png",
      fileSize: 123,
      width: 64,
      height: 64,
    },
    parentId: null,
    position: "last",
  });

  assert.equal(createdImageId, "image-1");
  assert.ok(repositoryState.files.items["file-1"]);
  assert.ok(repositoryState.images.items["image-1"]);
}

{
  const repositoryEvent = createRepositoryEvent({
    id: "materialized-view-wrapper",
    clientTs: 5678,
    partition: scene1Partition,
    type: "line.create",
    payload: {
      sectionId: "section-1",
      lines: [
        {
          lineId: "line-2",
          data: { actions: { narration: "wrapped" } },
        },
      ],
    },
  });

  const wrappedReducerEvent = {
    ...structuredClone(repositoryEvent),
    event: {
      type: repositoryEvent.type,
      payload: structuredClone(repositoryEvent.payload),
    },
  };

  const command = repositoryEventToCommand(wrappedReducerEvent);

  assert.equal(command.id, repositoryEvent.id);
  assert.equal(command.projectId, repositoryEvent.projectId);
  assert.equal(command.partition, repositoryEvent.partition);
  assert.equal(command.type, repositoryEvent.type);
}

{
  const cache = new Map();
  let loadCalls = 0;
  const saved = [];
  const warnings = [];

  const ensureResult = await ensureCachedCommittedCursor({
    key: projectId,
    cache,
    loadCursor: async () => {
      loadCalls += 1;
      return 4;
    },
    onWarn: (entry) => {
      warnings.push(entry);
    },
  });

  assert.equal(ensureResult, 4);
  assert.equal(loadCalls, 1);

  const cachedResult = await ensureCachedCommittedCursor({
    key: projectId,
    cache,
    loadCursor: async () => {
      loadCalls += 1;
      return 999;
    },
  });
  assert.equal(cachedResult, 4);
  assert.equal(loadCalls, 1);

  const unchanged = await persistCachedCommittedCursor({
    key: projectId,
    cursor: 3,
    cache,
    loadCursor: async () => 999,
    saveCursor: async (cursor) => {
      saved.push(cursor);
    },
  });
  assert.equal(unchanged, 4);
  assert.deepEqual(saved, []);

  const advanced = await persistCachedCommittedCursor({
    key: projectId,
    cursor: 6.9,
    cache,
    loadCursor: async () => 999,
    saveCursor: async (cursor) => {
      saved.push(cursor);
    },
  });
  assert.equal(advanced, 6);
  assert.deepEqual(saved, [6]);

  const warned = await persistCachedCommittedCursor({
    key: "project-error",
    cursor: 2,
    cache,
    loadCursor: async () => {
      throw new Error("load failed");
    },
    saveCursor: async () => {
      throw new Error("save failed");
    },
    onWarn: (entry) => {
      warnings.push(entry);
    },
  });
  assert.equal(warned, 2);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].key, "project-error");
  assert.equal(warnings[1].key, "project-error");
}

{
  const queueByKey = new Map();
  const events = [];
  const queueErrors = [];
  let releaseFirstTask;
  const firstTaskGate = new Promise((resolve) => {
    releaseFirstTask = resolve;
  });

  const first = enqueueSerialTask({
    key: projectId,
    queueByKey,
    task: async () => {
      events.push("start-1");
      await firstTaskGate;
      events.push("end-1");
    },
    onError: (entry) => {
      queueErrors.push(entry.error?.message || "unknown");
    },
  });
  const second = enqueueSerialTask({
    key: projectId,
    queueByKey,
    task: async () => {
      events.push("start-2");
      events.push("end-2");
    },
    onError: (entry) => {
      queueErrors.push(entry.error?.message || "unknown");
    },
  });

  releaseFirstTask();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["start-1", "end-1", "start-2", "end-2"]);

  const third = enqueueSerialTask({
    key: projectId,
    queueByKey,
    task: async () => {
      events.push("start-3");
      throw new Error("expected failure");
    },
    onError: (entry) => {
      queueErrors.push(entry.error?.message || "unknown");
    },
  });
  const fourth = enqueueSerialTask({
    key: projectId,
    queueByKey,
    task: async () => {
      events.push("start-4");
      events.push("end-4");
    },
    onError: (entry) => {
      queueErrors.push(entry.error?.message || "unknown");
    },
  });

  await Promise.all([third, fourth]);
  assert.deepEqual(queueErrors, ["expected failure"]);
  assert.deepEqual(events.slice(-3), ["start-3", "start-4", "end-4"]);
}

console.log("Collab adapter tests: PASS");
