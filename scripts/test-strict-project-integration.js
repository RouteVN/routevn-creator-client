import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInMemorySyncStore, createSyncServer } from "insieme/server";
import { createInMemoryServerTransport } from "./collabTestSupport.js";
import { setTimeout as wait } from "node:timers/promises";
import { createProjectCollabService } from "../src/deps/services/shared/collab/createProjectCollabService.js";
import { SCHEMA_VERSION } from "@routevn/creator-model";
import {
  createAcceptedProjectRepository,
  initializeAcceptedProject,
} from "../src/deps/services/shared/acceptedProjectRepository.js";
import {
  createPersistedTauriProjectStore,
  evictPersistedTauriProjectStoreCache,
} from "../src/deps/services/tauri/collabClientStore.js";
import { fixtureRoot } from "../tests/projectCompatibility/fixtureArchive.mjs";
import {
  decodeValue,
  readSourceRecords,
} from "../tests/projectCompatibility/records.mjs";

assert.equal(
  SCHEMA_VERSION,
  16,
  "Run this integration suite with the strict model package (or its owning development checkout)",
);
const actor = { userId: "user-one", clientId: "client-one" };
const lease = () => ({
  writable: true,
  withLock: (operation) => operation(),
  close: async () => {},
});
const fileRequest = {
  id: "strict-file-create",
  partition: "main",
  type: "file.create",
  payload: {
    fileId: "strict-file",
    data: { mimeType: "image/png", size: 1, sha256: "one" },
  },
};

for (const fixture of [
  "P07-recovery-draft",
  "P07-recovery-missing-scene-draft",
  "P09-draft",
]) {
  test(`${fixture}: strict edits survive reopen and new-cache deletion without changing legacy sources`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "routevn-strict-project-"));
    await cp(join(await fixtureRoot(), fixture, "source"), dir, {
      recursive: true,
    });
    let store;
    let repository;
    let trustedDigest;
    t.after(async () => {
      await repository?.close();
      await store?.close();
      await evictPersistedTauriProjectStoreCache({ projectPath: dir });
      await rm(dir, { recursive: true, force: true });
    });
    const open = async () => {
      store = await createPersistedTauriProjectStore({
        projectPath: dir,
        projectId: "project-one",
      });
      repository = await createAcceptedProjectRepository({
        store,
        reference: {
          projectId: "project-one",
          repositoryProjectId: "project-one",
          cacheKey: dir,
        },
        lease: lease(),
        isCurrent: () => true,
        generateId: () => "generated-one",
        now: () => 123,
        readCacheTrust: async () => trustedDigest,
        writeCacheTrust: async (value) => {
          trustedDigest = value;
        },
      });
    };
    const close = async () => {
      await repository.close();
      await store.close();
      await evictPersistedTauriProjectStoreCache({ projectPath: dir });
    };
    await open();
    const before = readSourceRecords(join(dir, "project.db"));
    const original = await repository.getContextState();
    const invalid = await repository.submitCommands(
      [{ ...fileRequest, schemaVersion: 1 }],
      actor,
    );
    assert.equal(invalid.valid, false);
    assert.deepEqual(readSourceRecords(join(dir, "project.db")), before);
    const result = await repository.submitCommands([fileRequest], actor);
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(result.acceptedByCoordinator, true);
    const accepted = await repository.getContextState();
    if (fixture.startsWith("P07")) {
      const draft = (await store.listDraftsOrdered())[0];
      await assert.rejects(
        repository.applySubmitResult({
          result: { status: "rejected", id: draft.id },
        }),
        { code: "recovery_source_changed" },
      );
      assert.deepEqual(await repository.getContextState(), accepted);
    }
    assert.deepEqual(accepted.scenes, original.scenes);
    assert.equal(accepted.files.items["strict-file"].id, "strict-file");
    const after = readSourceRecords(join(dir, "project.db"));
    assert.deepEqual(
      after.drafts.slice(0, before.drafts.length),
      before.drafts,
    );
    const legacyCheckpoints = (source) =>
      source.checkpoints.filter(
        (row) => !decodeValue(row).view_name.startsWith("project_accepted_"),
      );
    assert.deepEqual(legacyCheckpoints(after), before.checkpoints);
    await close();
    await open();
    assert.deepEqual(await repository.getContextState(), accepted);
    for (const row of readSourceRecords(
      join(dir, "project.db"),
    ).checkpoints.map(decodeValue)) {
      if (row.view_name.startsWith("project_accepted_"))
        await store.deleteMaterializedViewCheckpoint({
          viewName: row.view_name,
          partition: row.partition,
        });
    }
    await close();
    await open();
    assert.deepEqual(await repository.getContextState(), accepted);
    assert.deepEqual(
      legacyCheckpoints(readSourceRecords(join(dir, "project.db"))),
      before.checkpoints,
    );
    assert.equal(
      (await repository.submitCommands([fileRequest], actor)).valid,
      true,
    );
    assert.equal(
      (await store.listDraftsOrdered()).filter(
        (row) => row.id === fileRequest.id,
      ).length,
      1,
    );
    if (fixture === "P09-draft") {
      for (const row of readSourceRecords(
        join(dir, "project.db"),
      ).checkpoints.map(decodeValue)) {
        await store.deleteMaterializedViewCheckpoint({
          viewName: row.view_name,
          partition: row.partition,
        });
      }
      await close();
      await open();
      assert.deepEqual(await repository.getContextState(), accepted);
    }
  });
}

test("new templates use strict bootstrap and invalid initial content writes no history", async (t) => {
  const state = JSON.parse(
    await readFile(
      new URL("../static/templates/default/repository.json", import.meta.url),
      "utf8",
    ),
  );
  const dir = await mkdtemp(join(tmpdir(), "routevn-strict-bootstrap-"));
  const store = await createPersistedTauriProjectStore({
    projectPath: dir,
    projectId: "project-one",
  });
  t.after(async () => {
    await store.close();
    await evictPersistedTauriProjectStoreCache({ projectPath: dir });
    await rm(dir, { recursive: true, force: true });
  });
  const reference = { repositoryProjectId: "project-one", cacheKey: dir };
  const invalid = structuredClone(state);
  invalid.layouts.items[Object.keys(invalid.layouts.items)[0]].preview = {
    unsupported: true,
  };
  await assert.rejects(
    initializeAcceptedProject({
      reference,
      store,
      lease: lease(),
      state: invalid,
    }),
  );
  assert.deepEqual(await store.listDraftsOrdered(), []);
  await initializeAcceptedProject({ reference, store, lease: lease(), state });
  const drafts = await store.listDraftsOrdered();
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].schemaVersion, 2);
  assert.equal(drafts[0].payload.mv, 16);
  assert.equal(drafts[0].type, "project.create");
  await assert.rejects(
    initializeAcceptedProject({ reference, store, lease: lease(), state }),
  );
  assert.equal((await store.listDraftsOrdered()).length, 1);
});

test("strict offline bootstrap and edits survive connecting and acknowledgment promotion", async (t) => {
  const state = JSON.parse(
    await readFile(
      new URL("../static/templates/default/repository.json", import.meta.url),
      "utf8",
    ),
  );
  const dir = await mkdtemp(join(tmpdir(), "routevn-strict-offline-"));
  const store = await createPersistedTauriProjectStore({
    projectPath: dir,
    projectId: "project-one",
  });
  const reference = { repositoryProjectId: "project-one", cacheKey: dir };
  let repository, session;
  const protocolEvents = [];
  const server = createSyncServer({
    logger: (entry) => protocolEvents.push(entry),
    clock: { now: () => Date.now() },
    auth: {
      verifyToken: async () => ({
        clientId: actor.clientId,
        claims: { userId: actor.userId },
      }),
    },
    authz: { authorizeProject: async (_identity, id) => id === "project-one" },
    store: createInMemorySyncStore(),
    validation: { validate: async () => {} },
  });
  t.after(async () => {
    await session?.stop();
    await server.shutdown();
    await repository?.close();
    await store.close();
    await evictPersistedTauriProjectStoreCache({ projectPath: dir });
    await rm(dir, { recursive: true, force: true });
  });
  await initializeAcceptedProject({ reference, store, lease: lease(), state });
  repository = await createAcceptedProjectRepository({
    reference,
    store,
    lease: lease(),
    isCurrent: () => true,
    generateId: () => "generated-one",
  });
  session = createProjectCollabService({
    projectId: "project-one",
    token: "synthetic-token",
    actor,
    clientStore: store,
    acceptance: repository,
  });
  await session.start();
  const result = await session.submitCommand(fileRequest);
  assert.equal(result.valid, true, JSON.stringify(result));
  await session.flushDrafts();
  assert.equal(
    (await store.listDraftsOrdered()).length,
    2,
    "offline commands remain recoverable drafts",
  );
  const transport = createInMemoryServerTransport({
    server,
    connectionId: "connection-one",
  });
  // Exercise the actual JSON wire contract; in-process servers also expose
  // optional undefined fields which WebSocket serialization omits.
  await session.setOnlineTransport({
    ...transport,
    send: (message) => transport.send(JSON.parse(JSON.stringify(message))),
    onMessage: (handler) =>
      transport.onMessage((message) =>
        handler(JSON.parse(JSON.stringify(message))),
      ),
  });
  for (
    let attempt = 0;
    attempt < 100 && (await store.listDraftsOrdered()).length;
    attempt++
  )
    await wait(10);
  assert.deepEqual(
    await store.listDraftsOrdered(),
    [],
    JSON.stringify({
      error: session.getLastError(),
      events: protocolEvents.slice(-8),
    }),
  );
  const committed = await store.listCommittedAfter({
    sinceCommittedId: 0,
    limit: 10,
  });
  assert.equal(committed.length, 2);
  assert.ok(
    committed.every((row) => row.schemaVersion === 2 && row.payload.mv === 16),
  );
  assert.equal(
    (await repository.getContextState()).files.items["strict-file"].id,
    "strict-file",
  );
});

test("public story and image authoring emit valid strict commands", async (t) => {
  const { createCommandApiShared } = await import(
    "../src/deps/services/shared/commandApi/shared.js"
  );
  const { createStoryCommandApi } = await import(
    "../src/deps/services/shared/commandApi/story.js"
  );
  const { createMediaResourceCommandApi } = await import(
    "../src/deps/services/shared/commandApi/resources/media.js"
  );
  const dir = await mkdtemp(join(tmpdir(), "routevn-strict-authoring-"));
  const store = await createPersistedTauriProjectStore({
    projectPath: dir,
    projectId: "project-one",
  });
  const repository = await createAcceptedProjectRepository({
    reference: {
      projectId: "project-one",
      repositoryProjectId: "project-one",
      cacheKey: dir,
    },
    store,
    lease: lease(),
    isCurrent: () => true,
  });
  const session = createProjectCollabService({
    projectId: "project-one",
    actor,
    clientStore: store,
    acceptance: repository,
  });
  t.after(async () => {
    await session.stop();
    await repository.close();
    await store.close();
    await evictPersistedTauriProjectStoreCache({ projectPath: dir });
    await rm(dir, { recursive: true, force: true });
  });
  let sequence = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `command-${++sequence}`,
    getCurrentProjectId: () => "project-one",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => actor,
    storyBasePartitionFor: () => "main",
    storyScenePartitionFor: () => "main",
    scenePartitionFor: () => "main",
    resourceTypePartitionFor: () => "main",
  });
  const story = createStoryCommandApi(shared);
  const created = await story.createSceneWithInitialContent({
    sceneId: "scene-one",
    sectionId: "section-one",
    lineId: "line-one",
    name: "Scene One",
    sectionName: "Section One",
  });
  assert.equal(created.valid, true, JSON.stringify(created));
  const image = await createMediaResourceCommandApi(shared).createImage({
    imageId: "image-one",
    fileRecords: [
      { id: "file-one", mimeType: "image/png", size: 123, sha256: "one" },
    ],
    data: {
      type: "image",
      name: "Image One",
      fileId: "file-one",
      width: 64,
      height: 64,
    },
  });
  assert.equal(image, "image-one", JSON.stringify(image));
  const state = await repository.getContextState();
  assert.ok(
    state.scenes.items["scene-one"].sections.items["section-one"].lines.items[
      "line-one"
    ],
  );
  assert.equal(state.images.items["image-one"].fileId, "file-one");
  assert.ok(
    (await store.listDraftsOrdered()).every(
      (row) => row.schemaVersion === 2 && row.payload.mv === 16,
    ),
  );
});
