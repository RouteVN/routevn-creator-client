import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commandDomainIdentity,
  decodeCommandEnvelope,
  encodeCommandEnvelope,
} from "../src/deps/services/shared/collab/commandCodec.js";
import {
  commandToSyncEvent,
  committedEventToCommand,
} from "../src/deps/services/shared/collab/mappers.js";
import {
  applyCommandToRepositoryStateWithCreatorModel,
  applyCommandsToRepositoryStateWithCreatorModel,
} from "../src/internal/creatorModelAdapter.js";
import { initialProjectData } from "../src/deps/services/shared/projectRepository.js";
import { SCHEMA_VERSION } from "@routevn/creator-model";

const command = {
  id: "command-one",
  projectId: "project-one",
  partition: "main",
  type: "line.delete",
  schemaVersion: 2,
  modelSchemaVersion: 16,
  payload: { lineIds: ["line-one"] },
  actor: { userId: "user-one", clientId: "client-one" },
  clientTs: 123,
};
const encoded = () => encodeCommandEnvelope(command);
test("strict command and sync mappings preserve the exact domain payload and version", () => {
  const record = encoded();
  assert.deepEqual(record.payload, { mv: 16, commandPayload: command.payload });
  assert.equal(Object.hasOwn(record, "modelSchemaVersion"), false);
  assert.deepEqual(decodeCommandEnvelope(record), command);
  const event = { id: command.id, ...commandToSyncEvent(command) };
  assert.deepEqual(event.payload, record.payload);
  const decoded = committedEventToCommand(event);
  assert.equal(decoded.modelSchemaVersion, 16);
  assert.deepEqual(decoded.payload, command.payload);
  assert.equal(decoded.schemaVersion, 2);
});
test("legacy payloads with wrapper-like keys remain legacy domain data", () => {
  const record = {
    ...encoded(),
    schemaVersion: 1,
    payload: { mv: 16, commandPayload: { legacy: true } },
  };
  const decoded = decodeCommandEnvelope(record);
  assert.deepEqual(decoded.payload, record.payload);
  assert.equal(Object.hasOwn(decoded, "modelSchemaVersion"), false);
  assert.deepEqual(encodeCommandEnvelope(decoded), record);
});
for (const version of [
  undefined,
  null,
  0,
  -1,
  1.5,
  2.9,
  "1",
  "2",
  "1junk",
  "2junk",
  2n,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  3,
]) {
  test(`incoming envelope rejects ${String(version)} (${typeof version})`, () => {
    assert.throws(
      () => decodeCommandEnvelope({ ...encoded(), schemaVersion: version }),
      { code: "unsupported_command_envelope_version" },
    );
  });
}
for (const payload of [
  {},
  { mv: 16 },
  { commandPayload: {} },
  { mv: 16, commandPayload: {}, extra: true },
  null,
  [],
  { mv: 16, commandPayload: [] },
  { mv: 16, commandPayload: null },
])
  test(`malformed wrapper ${JSON.stringify(payload)} never falls back`, () => {
    assert.throws(() => decodeCommandEnvelope({ ...encoded(), payload }), {
      code: "invalid_command_envelope",
    });
  });
for (const mv of [undefined, null, "16", 15, 17, 16.1, 0])
  test(`unsupported model version ${String(mv)} rejects`, () => {
    assert.throws(
      () =>
        decodeCommandEnvelope({
          ...encoded(),
          payload: { mv, commandPayload: {} },
        }),
      { code: "unsupported_model_schema_version" },
    );
  });
test("wrapper accessors are rejected without execution", () => {
  let called = false;
  const payload = {
    get mv() {
      called = true;
      throw Error("must not run");
    },
    commandPayload: {},
  };
  assert.throws(() => decodeCommandEnvelope({ ...encoded(), payload }), {
    code: "invalid_command_envelope",
  });
  assert.equal(called, false);
});
test("domain identity preserves dictionary order while ignoring wrapper field order", () => {
  const a = {
    ...encoded(),
    payload: { mv: 16, commandPayload: { frames: { first: 1, second: 2 } } },
  };
  const b = {
    ...a,
    payload: { commandPayload: a.payload.commandPayload, mv: 16 },
  };
  const c = {
    ...a,
    payload: { mv: 16, commandPayload: { frames: { second: 2, first: 1 } } },
  };
  assert.equal(commandDomainIdentity(a), commandDomainIdentity(b));
  assert.notEqual(commandDomainIdentity(a), commandDomainIdentity(c));
});
test("an older installed model cannot silently treat a strict command as legacy", () => {
  const versioned = {
    type: "story.update",
    payload: { data: { initialSceneId: null } },
    modelSchemaVersion: 16,
  };
  for (const result of [
    applyCommandToRepositoryStateWithCreatorModel({
      repositoryState: initialProjectData,
      command: versioned,
    }),
    applyCommandsToRepositoryStateWithCreatorModel({
      repositoryState: initialProjectData,
      commands: [versioned],
    }),
  ]) {
    if (SCHEMA_VERSION < 16) {
      assert.equal(result.valid, false);
      assert.equal(result.error.code, "unsupported_model_schema_version");
    } else assert.equal(result.valid, true, JSON.stringify(result.error));
  }
});
