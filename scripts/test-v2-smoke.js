import assert from "node:assert/strict";
import { createProjectCollabService } from "../src/collab/v2/createProjectCollabService.js";
import { COMMAND_VERSION } from "../src/domain/v2/constants.js";
import { processCommand } from "../src/domain/v2/engine.js";
import { DomainPreconditionError } from "../src/domain/v2/errors.js";
import { assertDomainInvariants } from "../src/domain/v2/invariants.js";
import { createEmptyProjectState } from "../src/domain/v2/model.js";

const projectId = "proj-test-001";
const actor = { userId: "user-1", clientId: "client-1" };

const makeCommand = ({
  type,
  payload,
  partition = `project:${projectId}:story`,
  ts,
}) => ({
  id: `${type}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
  projectId,
  partition,
  type,
  commandVersion: COMMAND_VERSION,
  actor,
  clientTs: ts,
  payload,
});

let state = createEmptyProjectState({
  projectId,
  name: "Smoke",
  description: "v2",
});
assertDomainInvariants(state);

const apply = (command) => {
  const result = processCommand({ state, command });
  state = result.state;
  assertDomainInvariants(state);
  return result;
};

apply(
  makeCommand({
    type: "scene.create",
    ts: 1000,
    payload: { sceneId: "scene-1", name: "Scene 1" },
  }),
);
assert.equal(state.scenes["scene-1"].createdAt, 1000);

apply(
  makeCommand({
    type: "section.create",
    ts: 1100,
    payload: { sceneId: "scene-1", sectionId: "section-1", name: "Section 1" },
  }),
);
assert.equal(state.sections["section-1"].createdAt, 1100);

apply(
  makeCommand({
    type: "line.insert_after",
    ts: 1200,
    payload: {
      lineId: "line-1",
      sectionId: "section-1",
      line: { actions: { narration: "hello" } },
    },
  }),
);
assert.deepEqual(state.sections["section-1"].lineIds, ["line-1"]);

apply(
  makeCommand({
    type: "line.insert_after",
    ts: 1300,
    payload: {
      lineId: "line-2",
      sectionId: "section-1",
      afterLineId: "line-1",
      line: { actions: { narration: "world" } },
    },
  }),
);
assert.deepEqual(state.sections["section-1"].lineIds, ["line-1", "line-2"]);

apply(
  makeCommand({
    type: "section.create",
    ts: 1400,
    payload: { sceneId: "scene-1", sectionId: "section-2", name: "Section 2" },
  }),
);

let preconditionFailed = false;
try {
  apply(
    makeCommand({
      type: "line.insert_after",
      ts: 1500,
      payload: {
        lineId: "line-3",
        sectionId: "section-2",
        afterLineId: "line-1",
        line: { actions: {} },
      },
    }),
  );
} catch (error) {
  preconditionFailed = error instanceof DomainPreconditionError;
}
assert.equal(preconditionFailed, true);

apply(
  makeCommand({
    type: "layout.create",
    ts: 1600,
    partition: `project:${projectId}:layouts`,
    payload: { layoutId: "layout-1", name: "L1", layoutType: "scene" },
  }),
);
apply(
  makeCommand({
    type: "layout.element.create",
    ts: 1700,
    partition: `project:${projectId}:layouts`,
    payload: {
      layoutId: "layout-1",
      elementId: "A",
      element: { type: "container" },
    },
  }),
);
apply(
  makeCommand({
    type: "layout.element.create",
    ts: 1800,
    partition: `project:${projectId}:layouts`,
    payload: {
      layoutId: "layout-1",
      elementId: "B",
      parentId: "A",
      element: { type: "text" },
    },
  }),
);

let invariantFailed = false;
try {
  apply(
    makeCommand({
      type: "layout.element.move",
      ts: 1900,
      partition: `project:${projectId}:layouts`,
      payload: {
        layoutId: "layout-1",
        elementId: "A",
        parentId: "B",
        index: 0,
      },
    }),
  );
} catch {
  invariantFailed = true;
}
assert.equal(invariantFailed, true);

const collab = createProjectCollabService({
  projectId,
  projectName: "Smoke",
  projectDescription: "v2",
  token: "user:user-1:client:client-1",
  actor,
  partitions: [`project:${projectId}:story`],
});
await collab.start();
await collab.stop();

const syncRuntime = await import("insieme");
for (const key of [
  "createSyncClient",
  "createOfflineTransport",
  "createInMemoryClientStore",
  "createSyncServer",
  "createSqliteSyncStore",
]) {
  assert.equal(typeof syncRuntime[key], "function");
}

console.log("V2 smoke tests: PASS");
