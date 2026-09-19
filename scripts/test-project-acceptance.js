import assert from "node:assert/strict";
import { test } from "node:test";
import { processCommand, validatePayload } from "@routevn/creator-model";
import { createProjectAcceptanceCoordinator } from "../src/deps/services/shared/projectAcceptanceCoordinator.js";
import { decodeCommandEnvelope } from "../src/deps/services/shared/collab/commandCodec.js";
import { initialProjectData } from "../src/deps/services/shared/projectRepository.js";

const file = (id, fileId = id) => ({
  id,
  partition: "main",
  type: "file.create",
  payload: { fileId, data: { mimeType: "image/png", size: 1, sha256: fileId } },
});
const image = (id, fileId) => ({
  id,
  partition: "main",
  type: "image.create",
  payload: { imageId: id, data: { type: "image", name: "Image One", fileId } },
});

function harness() {
  const history = { committed: [], drafts: [] };
  const publications = [];
  const validatedVersions = [];
  let generated = 0,
    lockTail = Promise.resolve(),
    current = true;
  let write, read;
  const readHistory = async () => (read ? read() : structuredClone(history));
  const resolveState = async (source) => {
    let state = structuredClone(initialProjectData);
    for (const record of [...source.committed, ...source.drafts]) {
      const result = processCommand({
        state,
        command: decodeCommandEnvelope(record),
      });
      if (!result.valid) {
        const error = new Error(result.error.message);
        Object.assign(error, result.error);
        throw error;
      }
      state = result.state;
    }
    return state;
  };
  const append = (records) => {
    for (const record of records)
      history.drafts.push({
        ...structuredClone(record),
        draftClock: history.drafts.length + 1,
      });
  };
  const make = (overrides = {}) =>
    createProjectAcceptanceCoordinator({
      storageKey: "project-one",
      projectId: "project-one",
      actor: { userId: "user-one", clientId: "client-one" },
      generateId: () => `generated-${++generated}`,
      now: () => 123,
      withLock: (_key, operation) => {
        const result = lockTail.then(operation);
        lockTail = result.catch(() => {});
        return result;
      },
      isCurrent: () => current,
      readHistory,
      resolveState,
      validatePayload,
      validateCommand: (input) => {
        validatedVersions.push(input.command.modelSchemaVersion);
        return processCommand(input);
      },
      persistDrafts: async (records) =>
        write ? write(records) : append(records),
      persistCommittedBatch: async ({ events }) => {
        for (const record of events) {
          if (!history.committed.some((event) => event.id === record.id))
            history.committed.push(structuredClone(record));
          history.drafts = history.drafts.filter(
            (draft) => draft.id !== record.id,
          );
        }
      },
      persistSubmitResult: async ({ result }) => {
        const draft = history.drafts.find((record) => record.id === result.id);
        if (draft && result.status === "committed")
          history.committed.push({
            ...draft,
            committedId: result.committedId,
            serverTs: result.serverTs,
          });
        history.drafts = history.drafts.filter(
          (record) => record.id !== result.id,
        );
      },
      publish: (value) => publications.push(structuredClone(value)),
      ...overrides,
    });
  return {
    make,
    history,
    append,
    publications,
    validatedVersions,
    setWrite: (value) => {
      write = value;
    },
    setRead: (value) => {
      read = value;
    },
    switchProject: () => {
      current = false;
    },
  };
}
test("accepts a validated strict record and publishes only persisted state", async () => {
  const h = harness();
  const result = await h.make().submit([file("one")]);
  assert.equal(result.valid, true);
  assert.deepEqual(h.validatedVersions, [16]);
  assert.deepEqual(h.history.drafts[0].payload, {
    mv: 16,
    commandPayload: file("one").payload,
  });
  assert.equal(h.history.drafts[0].schemaVersion, 2);
  assert.equal(h.publications.length, 1);
  assert.equal(h.publications[0].state.files.items.one.id, "one");
});
test("two coordinators sharing a lock revalidate against each other's persisted writes", async () => {
  const h = harness();
  const [first, second] = await Promise.all([
    h.make().submit([file("first", "same-file")]),
    h.make().submit([file("second", "same-file")]),
  ]);
  assert.equal(first.valid, true);
  assert.equal(second.valid, false);
  assert.equal(h.history.drafts.length, 1);
});
test("invalid batch preflight writes nothing, including its valid prefix", async () => {
  const h = harness();
  const result = await h
    .make()
    .submit([file("one"), image("image-one", "missing-file")]);
  assert.equal(result.valid, false);
  assert.deepEqual(h.history.drafts, []);
  assert.equal(h.publications.length, 0);
});
test("exact retry preserves the original stored record without a second application", async () => {
  const h = harness(),
    coordinator = h.make();
  assert.equal((await coordinator.submit([file("one")])).valid, true);
  const stored = structuredClone(h.history.drafts[0]);
  assert.equal((await coordinator.submit([file("one")])).valid, true);
  assert.deepEqual(h.history.drafts, [stored]);
  assert.deepEqual(h.validatedVersions, [16]);
  const conflict = await coordinator.submit([file("one", "different-file")]);
  assert.equal(conflict.error.code, "command_identity_conflict");
  assert.deepEqual(h.history.drafts, [stored]);
});
test("partial writes publish the actual prefix and retain original retry identities", async () => {
  const h = harness(),
    coordinator = h.make();
  h.setWrite((records) => {
    h.append(records.slice(0, 2));
    throw Error("disk error");
  });
  const requests = [file("one"), file("two"), file("three")];
  const result = await coordinator.submit(requests);
  assert.equal(result.error.code, "partial_write");
  assert.deepEqual(result.error.details.persistedIds, ["one", "two"]);
  assert.deepEqual(result.error.details.unpersistedIds, ["three"]);
  assert.deepEqual(result.error.details.retryRequests, requests);
  assert.deepEqual(Object.keys(h.publications[0].state.files.items), [
    "one",
    "two",
  ]);
  h.setWrite(undefined);
  assert.equal(
    (await coordinator.submit(result.error.details.retryRequests)).valid,
    true,
  );
  assert.deepEqual(
    h.history.drafts.map((row) => row.id),
    ["one", "two", "three"],
  );
});
test("an error after all rows reached storage resolves as success", async () => {
  const h = harness();
  h.setWrite((records) => {
    h.append(records);
    throw Error("lost acknowledgment");
  });
  assert.equal((await h.make().submit([file("one")])).valid, true);
});
test("unreadable write outcomes pause acceptance until explicit reconciliation", async () => {
  const h = harness(),
    coordinator = h.make();
  h.setWrite((records) => {
    h.append(records);
    h.setRead(() => {
      throw Error("storage unavailable");
    });
    throw Error("unknown save");
  });
  const result = await coordinator.submit([file("one")]);
  assert.equal(result.error.code, "write_outcome_unknown");
  assert.equal(coordinator.isPaused(), true);
  assert.equal(
    (await coordinator.submit([file("two")])).error.code,
    "write_outcome_unknown",
  );
  h.setRead(undefined);
  h.setWrite(undefined);
  await coordinator.reconcile();
  assert.equal(coordinator.isPaused(), false);
  assert.equal((await coordinator.submit([file("two")])).valid, true);
});
test("unexpected non-prefix persistence pauses further acceptance", async () => {
  const h = harness(),
    coordinator = h.make();
  h.setWrite((records) => {
    h.append([records[1]]);
    throw Error("broken transaction");
  });
  const result = await coordinator.submit([file("one"), file("two")]);
  assert.equal(result.error.code, "write_reconciliation_failed");
  assert.equal(coordinator.isPaused(), true);
});
test("project switches during refresh prevent a write", async () => {
  const h = harness();
  h.setRead(() => {
    h.switchProject();
    return structuredClone(h.history);
  });
  const result = await h.make().submit([file("one")]);
  assert.equal(result.error.code, "stale_project_context");
  assert.deepEqual(h.history.drafts, []);
});
test("caller-supplied versions, wrappers and sparse requests cannot choose legacy authoring", async () => {
  for (const request of [
    { ...file("one"), schemaVersion: 1 },
    { ...file("one"), modelSchemaVersion: 15 },
    { ...file("one"), extra: true },
    undefined,
  ]) {
    const h = harness();
    assert.equal((await h.make().submit([request])).valid, false);
    assert.deepEqual(h.history.drafts, []);
  }
});
test("acknowledgment cannot promote a dependent draft ahead of its prerequisite", async () => {
  const h = harness(),
    coordinator = h.make();
  assert.equal(
    (await coordinator.submit([file("one"), image("image-one", "one")])).valid,
    true,
  );
  await assert.rejects(
    coordinator.applySubmitResult({
      result: {
        status: "committed",
        id: "image-one",
        committedId: 1,
        serverTs: 456,
      },
    }),
  );
  assert.equal(h.history.committed.length, 0);
  assert.equal(h.history.drafts.length, 2);
});
test("acknowledgment before broadcast applies the command exactly once", async () => {
  const h = harness(),
    coordinator = h.make();
  await coordinator.submit([file("one")]);
  const result = {
    status: "committed",
    id: "one",
    committedId: 1,
    serverTs: 456,
  };
  await coordinator.applySubmitResult({ result });
  await coordinator.applyCommittedBatch({
    events: structuredClone(h.history.committed),
    nextCursor: 1,
  });
  await coordinator.applySubmitResult({ result });
  assert.equal(h.history.committed.length, 1);
  assert.equal(h.history.drafts.length, 0);
});
test("a rejected prerequisite cannot silently drop dependent strict drafts", async () => {
  const h = harness(),
    coordinator = h.make();
  await coordinator.submit([file("one"), image("image-one", "one")]);
  await assert.rejects(
    coordinator.applySubmitResult({
      result: { status: "rejected", id: "one" },
    }),
  );
  assert.deepEqual(
    h.history.drafts.map((row) => row.id),
    ["one", "image-one"],
  );
});
test("unseen live legacy input cannot use historical tolerance", async () => {
  const h = harness();
  await assert.rejects(
    h.make().applyCommittedBatch({
      events: [{ ...file("one"), schemaVersion: 1, committedId: 1 }],
      nextCursor: 1,
    }),
    { code: "unversioned_live_command" },
  );
  assert.deepEqual(h.history.committed, []);
});

test("malformed acknowledgments preserve the exact draft", async () => {
  const h = harness(),
    coordinator = h.make();
  await coordinator.submit([file("one")]);
  const before = structuredClone(h.history);
  for (const patch of [
    { serverTs: "123" },
    { serverTs: -1 },
    { modelSchemaVersion: 16 },
    { status: "unknown" },
  ]) {
    await assert.rejects(
      coordinator.applySubmitResult({
        result: {
          id: "one",
          status: "committed",
          committedId: 1,
          serverTs: 456,
          ...patch,
        },
      }),
    );
    assert.deepEqual(h.history, before);
  }
  await coordinator.applySubmitResult({
    result: {
      id: "one",
      status: "not_processed",
      reason: "prior_item_rejected",
      blockedById: "previous",
    },
  });
  assert.deepEqual(h.history, before);
});

test("a synchronization error after promotion reconciles as success", async () => {
  const h = harness();
  const coordinator = h.make({
    persistSubmitResult: async ({ result }) => {
      const draft = h.history.drafts[0];
      h.history.committed.push({
        ...draft,
        committedId: result.committedId,
        serverTs: result.serverTs,
      });
      h.history.drafts = [];
      throw Error("lost storage response");
    },
  });
  await coordinator.submit([file("one")]);
  await coordinator.applySubmitResult({
    result: { id: "one", status: "committed", committedId: 1, serverTs: 456 },
  });
  assert.equal(coordinator.isPaused(), false);
  assert.equal(h.publications.at(-1).history.committed.length, 1);
});

test("received accessors and storage-version overrides are rejected before evaluation", async () => {
  const h = harness(),
    coordinator = h.make();
  await coordinator.submit([file("one")]);
  const event = { ...h.history.drafts[0], committedId: 1, serverTs: 456 };
  let evaluated = 0;
  Object.defineProperty(event, "payload", {
    enumerable: true,
    get() {
      evaluated++;
      return {};
    },
  });
  await assert.rejects(coordinator.applyCommittedBatch({ events: [event] }));
  assert.equal(evaluated, 0);
  await assert.rejects(
    coordinator.applyCommittedBatch({
      events: [{ ...h.history.drafts[0], rawSchemaVersion: 1, committedId: 1 }],
    }),
  );
  assert.equal(h.history.drafts.length, 1);
  assert.equal(h.history.committed.length, 0);
});

test("ordinary requests cannot replace history with project.create", async () => {
  const h = harness();
  const result = await h.make().submit([
    {
      id: "bootstrap",
      partition: "main",
      type: "project.create",
      payload: { state: structuredClone(initialProjectData) },
    },
  ]);
  assert.equal(result.valid, false);
  assert.equal(h.history.drafts.length, 0);
});

test("consecutive acknowledgments advance known history before the sync cursor", async () => {
  const h = harness(),
    coordinator = h.make({ readCursor: async () => 0 });
  await coordinator.submit([file("one"), image("image-one", "one")]);
  for (const [index, id] of ["one", "image-one"].entries()) {
    await coordinator.applySubmitResult({
      result: {
        id,
        status: "committed",
        committedId: index + 1,
        serverTs: 456,
      },
    });
  }
  assert.equal(h.history.committed.length, 2);
  assert.equal(h.history.drafts.length, 0);
});

test("an acknowledgment beyond missing history preserves drafts for resynchronization", async () => {
  const h = harness(),
    coordinator = h.make({ readCursor: async () => 0 });
  await coordinator.submit([file("one")]);
  const before = structuredClone(h.history);
  await assert.rejects(
    coordinator.applySubmitResult({
      result: { id: "one", status: "committed", committedId: 2, serverTs: 456 },
    }),
    { code: "missing_committed_history" },
  );
  assert.deepEqual(h.history, before);
  assert.equal(coordinator.isPaused(), false);
});
