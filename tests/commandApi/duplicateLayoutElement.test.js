import { describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";

const createApi = async () => {
  const repository = await createProjectRepository({
    projectId: "project-1",
    store: {
      appendEvents: vi.fn(async () => {}),
      loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
    },
    events: [],
    historyLoaded: true,
  });
  const actor = { userId: "user-1", clientId: "client-1" };
  let index = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `id-${++index}`,
    now: () => 1,
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => ({
      getActor: () => actor,
      submitCommand: async (command) => command.id,
      submitCommands: async (commands) => commands.map((command) => command.id),
    }),
    getOrCreateLocalActor: () => actor,
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
  });

  return { api: createLayoutCommandApi(shared), repository };
};

const text = (name) => ({
  type: "text",
  name,
  x: 0,
  y: 0,
  width: 120,
  height: 24,
  text: name,
});

const container = (name) => ({
  type: "container",
  name,
  x: 0,
  y: 0,
});

const toNamedTree = (elements, nodes = elements.tree) =>
  nodes.map((node) => {
    const named = { name: elements.items[node.id].name };
    if (node.children?.length > 0) {
      named.children = toNamedTree(elements, node.children);
    }
    return named;
  });

describe("commandApi duplicateLayoutElement", () => {
  it("copies a container with everything inside it, one layer above it", async () => {
    const { api, repository } = await createApi();
    const layoutId = await api.createLayoutItem({
      layoutId: "layout-1",
      name: "Layout One",
    });
    const create = (elementId, data, parentId = null) =>
      api.createLayoutElement({ layoutId, elementId, data, parentId });
    await create("box", container("Box"));
    await create("title", text("Title"), "box");
    await create("inner", container("Inner"), "box");
    await create("body", text("Body"), "inner");
    await create("footer", text("Footer"));

    const copyId = await api.duplicateLayoutElement({
      layoutId,
      elementId: "box",
    });

    const { elements } = repository.getState().layouts.items[layoutId];
    expect(toNamedTree(elements)).toEqual([
      {
        name: "Box 2",
        children: [
          { name: "Title" },
          { name: "Inner", children: [{ name: "Body" }] },
        ],
      },
      {
        name: "Box",
        children: [
          { name: "Title" },
          { name: "Inner", children: [{ name: "Body" }] },
        ],
      },
      { name: "Footer" },
    ]);
    expect(elements.tree[0].id).toBe(copyId);
    expect(new Set(Object.keys(elements.items)).size).toBe(9);
    expect(elements.items[copyId]).toMatchObject({ type: "container" });
  });

  it("copies an element inside a container above it", async () => {
    const { api, repository } = await createApi();
    const layoutId = await api.createLayoutItem({
      layoutId: "layout-1",
      name: "Layout One",
    });
    await api.createLayoutElement({
      layoutId,
      elementId: "box",
      data: container("Box"),
    });
    for (const name of ["Title", "Body"]) {
      await api.createLayoutElement({
        layoutId,
        elementId: name,
        data: text(name),
        parentId: "box",
      });
    }

    await api.duplicateLayoutElement({ layoutId, elementId: "Title" });

    const { elements } = repository.getState().layouts.items[layoutId];
    expect(toNamedTree(elements)).toEqual([
      {
        name: "Box",
        children: [{ name: "Title 2" }, { name: "Title" }, { name: "Body" }],
      },
    ]);
  });

  it("copies an element in a row or column above it too", async () => {
    const { api, repository } = await createApi();
    const layoutId = await api.createLayoutItem({
      layoutId: "layout-1",
      name: "Layout One",
    });
    await api.createLayoutElement({
      layoutId,
      elementId: "row",
      data: { ...container("Row"), direction: "horizontal" },
    });
    for (const name of ["First", "Second"]) {
      await api.createLayoutElement({
        layoutId,
        elementId: name,
        data: text(name),
        parentId: "row",
      });
    }

    await api.duplicateLayoutElement({ layoutId, elementId: "First" });

    const { elements } = repository.getState().layouts.items[layoutId];
    expect(toNamedTree(elements)).toEqual([
      {
        name: "Row",
        children: [{ name: "First 2" }, { name: "First" }, { name: "Second" }],
      },
    ]);
  });

  it("reports a missing element", async () => {
    const { api } = await createApi();
    const layoutId = await api.createLayoutItem({
      layoutId: "layout-1",
      name: "Layout One",
    });

    expect(
      await api.duplicateLayoutElement({ layoutId, elementId: "missing" }),
    ).toMatchObject({ valid: false });
  });
});
