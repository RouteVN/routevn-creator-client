import assert from "node:assert/strict";
import { createProjectCollabService } from "../src/deps/services/shared/collab/createProjectCollabService.js";
import {
  applyCommandToRepository,
  createProjectCreatedRepositoryEvent,
  createProjectRepository,
  initialProjectData,
} from "../src/deps/services/shared/projectRepository.js";
import {
  COMMAND_VERSION,
  DomainPreconditionError,
} from "../src/internal/project/commands.js";
import { processCommand } from "../src/internal/project/state.js";
import { assertDomainInvariants } from "../src/internal/project/state.js";
import { buildLayoutRenderElements } from "../src/internal/project/layout.js";
import { createEmptyProjectState } from "../src/internal/project/state.js";
import { projectRepositoryStateToDomainState } from "../src/internal/project/projection.js";
import { toHierarchyStructure } from "../src/internal/project/tree.js";
import { extractFileIdsFromRenderState } from "../src/internal/project/layout.js";

const projectId = "proj-test-001";
const actor = { userId: "user-1", clientId: "client-1" };

const makeCommand = ({
  type,
  payload,
  partitions = [`project:${projectId}:story`],
  ts,
}) => ({
  id: `${type}-${ts}-${Math.random().toString(36).slice(2, 7)}`,
  projectId,
  partitions: [...partitions],
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

const createInMemoryRepositoryEventStore = () => {
  const events = [];
  return {
    async appendEvent(event) {
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
  description: "current",
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
    type: "line.update_actions",
    ts: 1350,
    payload: {
      lineId: "line-1",
      patch: {
        dialogue: {
          content: [{ text: "Hello" }],
          ui: { resourceId: "layout-1" },
          characterId: "char-1",
        },
      },
      replace: false,
    },
  }),
);
assert.deepEqual(state.lines["line-1"].actions.dialogue, {
  content: [{ text: "Hello" }],
  ui: { resourceId: "layout-1" },
  characterId: "char-1",
});
assert.equal(state.lines["line-1"].actions.narration, "hello");

apply(
  makeCommand({
    type: "line.update_actions",
    ts: 1360,
    payload: {
      lineId: "line-1",
      patch: {
        dialogue: {
          mode: "nvl",
        },
      },
      replace: false,
    },
  }),
);
assert.deepEqual(state.lines["line-1"].actions.dialogue, {
  mode: "nvl",
});
assert.equal(state.lines["line-1"].actions.narration, "hello");

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
    type: "resource.create",
    ts: 1600,
    partitions: [`project:${projectId}:resources:layouts`],
    payload: {
      resourceType: "layouts",
      resourceId: "layout-1",
      data: { name: "L1", layoutType: "scene" },
    },
  }),
);
apply(
  makeCommand({
    type: "layout.element.create",
    ts: 1700,
    partitions: [`project:${projectId}:layouts`],
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
    partitions: [`project:${projectId}:layouts`],
    payload: {
      layoutId: "layout-1",
      elementId: "B",
      parentId: "A",
      element: { type: "text" },
    },
  }),
);

apply(
  makeCommand({
    type: "layout.element.update",
    ts: 1850,
    partitions: [`project:${projectId}:layouts`],
    payload: {
      layoutId: "layout-1",
      elementId: "B",
      patch: {
        textStyle: {
          color: "#ffffff",
          shadow: {
            blur: 4,
          },
        },
        opacity: 0.5,
      },
      replace: false,
    },
  }),
);
apply(
  makeCommand({
    type: "layout.element.update",
    ts: 1860,
    partitions: [`project:${projectId}:layouts`],
    payload: {
      layoutId: "layout-1",
      elementId: "B",
      patch: {
        textStyle: {
          shadow: {
            offsetX: 2,
          },
        },
      },
      replace: false,
    },
  }),
);
assert.deepEqual(state.resources.layouts.items["layout-1"].elements["B"], {
  id: "B",
  type: "text",
  parentId: "A",
  children: [],
  textStyle: {
    color: "#ffffff",
    shadow: {
      blur: 4,
      offsetX: 2,
    },
  },
  opacity: 0.5,
});

apply(
  makeCommand({
    type: "layout.element.update",
    ts: 1870,
    partitions: [`project:${projectId}:layouts`],
    payload: {
      layoutId: "layout-1",
      elementId: "B",
      patch: {
        type: "text",
        textStyle: {
          shadow: {
            offsetX: 1,
          },
        },
      },
      replace: true,
    },
  }),
);
assert.deepEqual(state.resources.layouts.items["layout-1"].elements["B"], {
  id: "B",
  type: "text",
  parentId: "A",
  children: [],
  textStyle: {
    shadow: {
      offsetX: 1,
    },
  },
});

let invariantFailed = false;
try {
  apply(
    makeCommand({
      type: "layout.element.move",
      ts: 1900,
      partitions: [`project:${projectId}:layouts`],
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
    type: "resource.create",
    ts: 2000,
    partitions: [`project:${projectId}:resources:variables`],
    payload: {
      resourceType: "variables",
      resourceId: "var-a",
      data: {
        itemType: "variable",
        name: "A",
        type: "string",
        variableType: "string",
        default: "",
        value: "",
      },
      position: "last",
    },
  }),
);
apply(
  makeCommand({
    type: "resource.create",
    ts: 2100,
    partitions: [`project:${projectId}:resources:variables`],
    payload: {
      resourceType: "variables",
      resourceId: "var-b",
      data: {
        itemType: "variable",
        name: "B",
        type: "string",
        variableType: "string",
        default: "",
        value: "",
      },
      index: 1,
    },
  }),
);
apply(
  makeCommand({
    type: "resource.create",
    ts: 2200,
    partitions: [`project:${projectId}:resources:variables`],
    payload: {
      resourceType: "variables",
      resourceId: "var-c",
      data: {
        itemType: "variable",
        name: "C",
        type: "string",
        variableType: "string",
        default: "",
        value: "",
      },
      index: 1,
    },
  }),
);
assert.deepEqual(flattenTreeIds(state.resources.variables.tree), [
  "var-a",
  "var-c",
  "var-b",
]);

apply(
  makeCommand({
    type: "resource.update",
    ts: 2250,
    partitions: [`project:${projectId}:resources:variables`],
    payload: {
      resourceType: "variables",
      resourceId: "var-a",
      patch: {
        name: "A Renamed",
        type: "string",
      },
    },
  }),
);
assert.equal(state.resources.variables.items["var-a"].name, "A Renamed");
assert.equal(state.resources.variables.items["var-a"].type, "string");

let variableTypeChangeBlocked = false;
try {
  apply(
    makeCommand({
      type: "resource.update",
      ts: 2260,
      partitions: [`project:${projectId}:resources:variables`],
      payload: {
        resourceType: "variables",
        resourceId: "var-a",
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
      type: "resource.update",
      ts: 2270,
      partitions: [`project:${projectId}:resources:variables`],
      payload: {
        resourceType: "variables",
        resourceId: "var-a",
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
assert.equal(state.resources.variables.items["var-a"].type, "string");

apply(
  makeCommand({
    type: "resource.create",
    ts: 2300,
    partitions: [`project:${projectId}:resources:layouts`],
    payload: {
      resourceType: "layouts",
      resourceId: "layout-folder",
      data: {
        name: "Layout Folder",
        type: "folder",
      },
    },
  }),
);

apply(
  makeCommand({
    type: "resource.create",
    ts: 2350,
    partitions: [`project:${projectId}:resources:layouts`],
    payload: {
      resourceType: "layouts",
      resourceId: "layout-2",
      data: {
        name: "L2",
        layoutType: "scene",
      },
      parentId: "layout-folder",
    },
  }),
);
assert.equal(
  state.resources.layouts.items["layout-2"].parentId,
  "layout-folder",
);

const collab = createProjectCollabService({
  projectId,
  projectName: "Smoke",
  projectDescription: "current",
  token: "user:user-1:client:client-1",
  actor,
  partitions: [`project:${projectId}:story`],
});
await collab.start();
await collab.stop();

const syncRuntime = await import("insieme/server");
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
assert.equal(
  projectedDomainState.resources.layouts.items["layout-a"].parentId,
  "default-folder",
);
assert.equal(
  projectedDomainState.resources.layouts.items["layout-b"].parentId,
  "default-folder",
);
assert.equal(
  projectedDomainState.resources.layouts.items["layout-c"].parentId,
  "default-folder",
);
assert.equal(
  projectedDomainState.resources.layouts.items["layout-fallback"].parentId,
  "default-folder",
);

const projectionStore = createInMemoryRepositoryEventStore();
const projectionRepository = await createProjectRepository({
  projectId: projectionProjectId,
  store: projectionStore,
  events: [
    createProjectCreatedRepositoryEvent({
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

await applyCommandToRepository({
  repository: projectionRepository,
  projectId: projectionProjectId,
  command: {
    id: "project-update-layout-projection",
    projectId: projectionProjectId,
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

const renderedChoiceLayout = buildLayoutRenderElements(
  toHierarchyStructure({
    items: {
      "choice-item": {
        id: "choice-item",
        type: "container-ref-choice-item",
        name: "Choice Item",
        x: 0,
        y: 0,
      },
      "choice-label": {
        id: "choice-label",
        parentId: "choice-item",
        type: "text-ref-choice-item-content",
        name: "Choice Label",
        text: "Choice",
        x: 20,
        y: 10,
        typographyId: "body",
      },
    },
    tree: [
      {
        id: "choice-item",
        children: [{ id: "choice-label" }],
      },
    ],
  }),
  {},
  {
    items: {
      body: {
        id: "body",
        fontId: "font-body",
        colorId: "color-body",
        fontSize: 20,
        lineHeight: 1.4,
      },
    },
    tree: [],
  },
  {
    items: {
      "color-body": {
        id: "color-body",
        hex: "#ffffff",
      },
    },
    tree: [],
  },
  {
    items: {
      "font-body": {
        id: "font-body",
        fileId: "font-body-file",
      },
    },
    tree: [],
  },
);

assert.equal(renderedChoiceLayout[0].type, "container");
assert.equal(renderedChoiceLayout[0].$each, "item, i in choice.items");
assert.equal(renderedChoiceLayout[0].id, "choice-item-${i}");
assert.equal(renderedChoiceLayout[0].children[0].id, "choice-label-${i}");
assert.equal(renderedChoiceLayout[0].children[0].content, "${item.content}");
assert.equal(
  renderedChoiceLayout[0].children[0].textStyle.fontFamily,
  "font-body-file",
);

const dedupedFileReferences = extractFileIdsFromRenderState({
  elements: [
    { id: "sprite-a", type: "sprite", src: "file-1" },
    { id: "sprite-b", type: "sprite", src: "file-1" },
    { id: "sprite-c", type: "sprite", src: "file:file-1" },
  ],
});

assert.deepEqual(dedupedFileReferences, [{ url: "file-1", type: "image/png" }]);

console.log("Smoke tests: PASS");
