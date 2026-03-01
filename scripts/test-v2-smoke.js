import assert from "node:assert/strict";
import { createProjectCollabService } from "../src/collab/v2/createProjectCollabService.js";
import {
  applyTypedCommandToRepository,
  createProjectCreatedTypedEvent,
  createInsiemeProjectRepositoryRuntime,
  initialProjectData,
} from "../src/deps/services/shared/typedProjectRepository.js";
import { COMMAND_VERSION } from "../src/domain/v2/constants.js";
import { processCommand } from "../src/domain/v2/engine.js";
import { DomainPreconditionError } from "../src/domain/v2/errors.js";
import { assertDomainInvariants } from "../src/domain/v2/invariants.js";
import { createEmptyProjectState } from "../src/domain/v2/model.js";
import { projectRepositoryStateToDomainState } from "../src/domain/v2/stateProjection.js";

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

const flattenTreeIds = (nodes, output = []) => {
  if (!Array.isArray(nodes)) return output;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    output.push(node.id);
    flattenTreeIds(node.children || [], output);
  }
  return output;
};

const findTreeNodeById = (nodes, targetId) => {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    if (node.id === targetId) return node;
    const child = findTreeNodeById(node.children || [], targetId);
    if (child) return child;
  }
  return null;
};

const createInMemoryTypedEventStore = () => {
  const events = [];
  return {
    async appendTypedEvent(event) {
      events.push(structuredClone(event));
    },
    async getEvents() {
      return events.map((event) => structuredClone(event));
    },
  };
};

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

apply(
  makeCommand({
    type: "variable.create",
    ts: 2000,
    partition: `project:${projectId}:settings`,
    payload: {
      variableId: "var-a",
      name: "A",
      variableType: "string",
      initialValue: "",
      position: "last",
    },
  }),
);
apply(
  makeCommand({
    type: "variable.create",
    ts: 2100,
    partition: `project:${projectId}:settings`,
    payload: {
      variableId: "var-b",
      name: "B",
      variableType: "string",
      initialValue: "",
      position: { after: "var-a" },
    },
  }),
);
apply(
  makeCommand({
    type: "variable.create",
    ts: 2200,
    partition: `project:${projectId}:settings`,
    payload: {
      variableId: "var-c",
      name: "C",
      variableType: "string",
      initialValue: "",
      position: { before: "var-b" },
    },
  }),
);
assert.deepEqual(flattenTreeIds(state.variables.tree), [
  "var-a",
  "var-c",
  "var-b",
]);

apply(
  makeCommand({
    type: "variable.update",
    ts: 2250,
    partition: `project:${projectId}:settings`,
    payload: {
      variableId: "var-a",
      patch: {
        name: "A Renamed",
        type: "string",
      },
    },
  }),
);
assert.equal(state.variables.items["var-a"].name, "A Renamed");
assert.equal(state.variables.items["var-a"].type, "string");

let variableTypeChangeBlocked = false;
try {
  apply(
    makeCommand({
      type: "variable.update",
      ts: 2260,
      partition: `project:${projectId}:settings`,
      payload: {
        variableId: "var-a",
        patch: {
          type: "number",
        },
      },
    }),
  );
} catch (error) {
  variableTypeChangeBlocked = error instanceof DomainPreconditionError;
}
assert.equal(variableTypeChangeBlocked, true);

let variableVariableTypeChangeBlocked = false;
try {
  apply(
    makeCommand({
      type: "variable.update",
      ts: 2270,
      partition: `project:${projectId}:settings`,
      payload: {
        variableId: "var-a",
        patch: {
          variableType: "boolean",
        },
      },
    }),
  );
} catch (error) {
  variableVariableTypeChangeBlocked = error instanceof DomainPreconditionError;
}
assert.equal(variableVariableTypeChangeBlocked, true);
assert.equal(state.variables.items["var-a"].type, "string");

apply(
  makeCommand({
    type: "layout.create",
    ts: 2300,
    partition: `project:${projectId}:layouts`,
    payload: {
      layoutId: "layout-folder",
      name: "Layout Folder",
      layoutType: "scene",
      data: {
        type: "folder",
      },
    },
  }),
);

apply(
  makeCommand({
    type: "layout.create",
    ts: 2350,
    partition: `project:${projectId}:layouts`,
    payload: {
      layoutId: "layout-2",
      name: "L2",
      layoutType: "scene",
      parentId: "layout-folder",
    },
  }),
);
assert.equal(state.layouts["layout-2"].parentId, "layout-folder");

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

const projectionProjectId = "proj-layout-tree-001";
const repositoryStateWithLayoutTree = structuredClone(initialProjectData);
repositoryStateWithLayoutTree.project = {
  ...repositoryStateWithLayoutTree.project,
  id: projectionProjectId,
  name: "Projection",
  description: "layout tree parent projection",
};
repositoryStateWithLayoutTree.layouts = {
  items: {
    "default-folder": {
      type: "folder",
      name: "Default",
    },
    "wrong-parent": {
      type: "folder",
      name: "Wrong Parent",
    },
    "layout-a": {
      type: "layout",
      name: "Layout A",
      layoutType: "normal",
      elements: { items: {}, tree: [] },
    },
    "layout-b": {
      type: "layout",
      name: "Layout B",
      layoutType: "normal",
      elements: { items: {}, tree: [] },
    },
    "layout-c": {
      type: "layout",
      name: "Layout C",
      layoutType: "normal",
      parentId: "wrong-parent",
      elements: { items: {}, tree: [] },
    },
    "layout-fallback": {
      type: "layout",
      name: "Layout Fallback",
      layoutType: "normal",
      parentId: "default-folder",
      elements: { items: {}, tree: [] },
    },
  },
  tree: [
    {
      id: "default-folder",
      children: [{ id: "layout-a" }, { id: "layout-b" }, { id: "layout-c" }],
    },
    {
      id: "wrong-parent",
    },
  ],
};

const projectedDomainState = projectRepositoryStateToDomainState({
  repositoryState: repositoryStateWithLayoutTree,
  projectId: projectionProjectId,
});
assert.equal(projectedDomainState.layouts["layout-a"].parentId, "default-folder");
assert.equal(projectedDomainState.layouts["layout-b"].parentId, "default-folder");
assert.equal(projectedDomainState.layouts["layout-c"].parentId, "default-folder");
assert.equal(
  projectedDomainState.layouts["layout-fallback"].parentId,
  "default-folder",
);

const projectionStore = createInMemoryTypedEventStore();
const projectionRepository = await createInsiemeProjectRepositoryRuntime({
  projectId: projectionProjectId,
  store: projectionStore,
  events: [
    createProjectCreatedTypedEvent({
      projectId: projectionProjectId,
      state: projectedDomainState,
      actor,
      commandId: "projection-stream-init",
      clientTs: 2300,
    }),
  ],
});

const assertLayoutsNestedUnderDefault = (repositoryState) => {
  const defaultFolderNode = findTreeNodeById(
    repositoryState.layouts.tree,
    "default-folder",
  );
  assert.ok(defaultFolderNode);
  const childIds = new Set((defaultFolderNode.children || []).map((n) => n.id));
  assert.equal(childIds.has("layout-a"), true);
  assert.equal(childIds.has("layout-b"), true);
  assert.equal(childIds.has("layout-c"), true);
  assert.equal(childIds.has("layout-fallback"), true);
};

assertLayoutsNestedUnderDefault(projectionRepository.getState());

await applyTypedCommandToRepository({
  repository: projectionRepository,
  projectId: projectionProjectId,
  command: {
    id: "project-update-layout-projection",
    projectId: projectionProjectId,
    partition: `project:${projectionProjectId}:settings`,
    partitions: [`project:${projectionProjectId}:settings`],
    type: "project.update",
    commandVersion: COMMAND_VERSION,
    actor,
    clientTs: 2400,
    payload: {
      patch: {
        description: "projection round-trip",
      },
    },
  },
});

assertLayoutsNestedUnderDefault(projectionRepository.getState());

console.log("V2 smoke tests: PASS");
