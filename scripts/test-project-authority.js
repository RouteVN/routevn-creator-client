import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processCommand, validatePayload } from "@routevn/creator-model";
import {
  createProjectAuthority,
  digestProjectRecords,
  readProjectHistory,
} from "../src/deps/services/shared/projectAuthority.js";
import { resolveLegacyProjectAuthority } from "../src/deps/services/shared/projectLegacyAuthority.js";
import { initialProjectData } from "../src/deps/services/shared/projectRepository.js";
import { fixtureRoot } from "../tests/projectCompatibility/fixtureArchive.mjs";
import { readFixtureJson } from "../tests/projectCompatibility/fixtureIO.mjs";
import {
  decodeValue,
  encodeValue,
  readSourceRecords,
} from "../tests/projectCompatibility/records.mjs";

const record = (id, type, payload, order = {}) => ({
  id,
  partition: "main",
  type,
  schemaVersion: 2,
  payload: { mv: 16, commandPayload: payload },
  ...order,
});
const file = (id, order) =>
  record(
    id,
    "file.create",
    { fileId: id, data: { mimeType: "image/png", size: 1, sha256: id } },
    order,
  );
const createAuthority = (options = {}) =>
  createProjectAuthority({
    storageKey: "project-one",
    projectId: "project-one",
    createInitialState: () => structuredClone(initialProjectData),
    processCommand,
    validatePayload,
    resolveLegacy: async () => {
      throw Error("Unexpected legacy fallback");
    },
    ...options,
  });

test("authority replays historical dependencies before applying the final resource deletion", async () => {
  const history = {
    committed: [
      file("file-one", { committedId: 1 }),
      record(
        "image-create",
        "image.create",
        {
          imageId: "image-one",
          data: { name: "Image One", type: "image", fileId: "file-one" },
        },
        { committedId: 2 },
      ),
      record(
        "image-delete",
        "image.delete",
        { imageIds: ["image-one"] },
        { committedId: 3 },
      ),
    ],
    drafts: [],
  };
  const authority = createAuthority();
  const resolved = await authority.resolve(history);
  assert.equal(resolved.state.images.items["image-one"], undefined);
  assert.equal(resolved.state.files.items["file-one"].id, "file-one");
  assert.equal(resolved.frontier.committedCount, 3);
});

test("a source edit with unchanged counts and ordering cannot reuse accepted authority", async () => {
  const authority = createAuthority();
  const history = {
    committed: [],
    drafts: [file("file-one", { draftClock: 1 })],
  };
  const first = await authority.resolve(history);
  history.drafts[0].payload.commandPayload.data.size = 23;
  const second = await authority.resolve(history);
  assert.notEqual(first.frontier.digest, second.frontier.digest);
  assert.equal(second.state.files.items["file-one"].size, 23);
});

test("the frontier preserves payload enumeration order and ignores storage wrapper order", () => {
  const source = {
    committed: [],
    drafts: [record("one", "file.create", { a: 1, b: 2 }, { draftClock: 1 })],
  };
  const reordered = structuredClone(source);
  reordered.drafts[0].payload = { commandPayload: { a: 1, b: 2 }, mv: 16 };
  assert.equal(digestProjectRecords(source), digestProjectRecords(reordered));
  reordered.drafts[0].payload.commandPayload = { b: 2, a: 1 };
  assert.notEqual(
    digestProjectRecords(source),
    digestProjectRecords(reordered),
  );
});

test("invalid strict suffixes never select legacy recovery", async () => {
  let calls = 0;
  const authority = createAuthority({
    resolveLegacy: async () => {
      calls++;
      return { state: structuredClone(initialProjectData) };
    },
  });
  const legacy = {
    ...file("old", { draftClock: 1 }),
    schemaVersion: 1,
    payload: {},
  };
  const invalid = record(
    "bad",
    "image.create",
    {
      imageId: "image-one",
      data: { name: "Image One", type: "image", fileId: "missing" },
    },
    { draftClock: 2 },
  );
  await assert.rejects(
    authority.resolve({ committed: [], drafts: [legacy, invalid] }),
    /missing|file/i,
  );
  assert.equal(calls, 1);
});

test("acknowledgment reordering validates the changed historical dependency", async () => {
  const create = file("file-one", { draftClock: 1 });
  const use = record(
    "image-one",
    "image.create",
    {
      imageId: "image-one",
      data: { name: "Image One", type: "image", fileId: "file-one" },
    },
    { draftClock: 2 },
  );
  const authority = createAuthority();
  await authority.resolve({ committed: [], drafts: [create, use] });
  await assert.rejects(
    authority.resolve({
      committed: [{ ...use, committedId: 1 }],
      drafts: [create],
    }),
    /missing|file/i,
  );
});

for (const id of [
  "P07-recovery-draft",
  "P07-recovery-missing-scene-draft",
  "P09-draft",
]) {
  test(`legacy authority preserves the opened projection and every source row: ${id}`, async (t) => {
    const root = await fixtureRoot();
    const dir = await mkdtemp(join(tmpdir(), "routevn-authority-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await cp(join(root, id, "source"), dir, { recursive: true });
    const { createPersistedTauriProjectStore } = await import(
      "../src/deps/services/tauri/collabClientStore.js"
    );
    const store = await createPersistedTauriProjectStore({
      projectId: "project-one",
      projectPath: dir,
    });
    t.after(() => store.close());
    const before = readSourceRecords(join(dir, "project.db"));
    const history = await readProjectHistory(store);
    const resolved = await resolveLegacyProjectAuthority({
      store,
      projectId: "project-one",
      history,
    });
    const expected = decodeValue(
      readFixtureJson(join(root, id, "expected/opened-repository.json")).cold,
    ).state;
    assert.deepEqual(encodeValue(resolved.state), encodeValue(expected));
    assert.deepEqual(readSourceRecords(join(dir, "project.db")), before);
    const authority = createAuthority({
      resolveLegacy: (prefix) =>
        resolveLegacyProjectAuthority({
          store,
          projectId: "project-one",
          history: prefix,
        }),
    });
    history.drafts.push(
      file("strict-file", { draftClock: history.drafts.at(-1).draftClock + 1 }),
    );
    const next = await authority.resolve(history);
    assert.deepEqual(next.state.scenes, expected.scenes);
    assert.equal(next.state.files.items["strict-file"].id, "strict-file");
    assert.deepEqual(readSourceRecords(join(dir, "project.db")), before);
  });
}

test("incoming replay stops at the aggregate validation work budget", async () => {
  const authority = createAuthority({
    processCommand: (input) => ({
      ...processCommand(input),
      validationWork: 9_000_000,
    }),
  });
  const history = {
    committed: [
      file("one", { committedId: 1 }),
      file("two", { committedId: 2 }),
    ],
    drafts: [],
  };
  await assert.rejects(
    authority.resolve(history, { maxValidationWork: 16_000_000 }),
    { code: "command_work_limit" },
  );
  assert.equal(
    (await authority.resolve(history)).state.files.items.two.id,
    "two",
  );
});
