import assert from "node:assert/strict";
import { repositoryEventToCommand } from "../src/deps/services/shared/projectRepository.js";
import {
  enqueueSerialTask,
  ensureCachedCommittedCursor,
  persistCachedCommittedCursor,
  toReplaySubmissionEvent,
  toUncommittedSyncSubmissionEvents,
} from "../src/deps/services/web/projectServiceCollabRuntime.js";

const projectId = "project-adapter-test-001";

const createRepositoryEvent = ({
  id,
  actor = {
    userId: `local-${projectId}`,
    clientId: "local-client",
  },
  clientTs = 1000,
  meta,
  type = "resource.update",
  payload = {
    resourceType: "images",
    resourceId: "image-1",
    data: {
      name: "Updated",
    },
  },
  partitions = [
    `project:${projectId}:resources`,
    `project:${projectId}:resources:images:image-1`,
  ],
}) => ({
  id,
  partitions,
  projectId,
  userId: actor.userId,
  type,
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
  assert.deepEqual(replayed.partitions, repositoryEvent.partitions);
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
      partitions: [`project:${projectId}:story`],
      payload: {
        sceneId: "scene-1",
        data: { name: "Scene 1" },
      },
    }),
    createRepositoryEvent({
      id: "command-2",
      type: "section.create",
      partitions: [`project:${projectId}:story`],
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
        data: { name: "Section 1" },
      },
    }),
    createRepositoryEvent({
      id: "command-3",
      type: "line.create",
      partitions: [`project:${projectId}:story`],
      payload: {
        lineId: "line-1",
        sectionId: "section-1",
        data: { actions: { narration: "hello" } },
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
