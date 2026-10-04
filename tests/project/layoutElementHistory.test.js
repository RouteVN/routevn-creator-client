import { describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import {
  captureLayoutElementSnapshot,
  getChangedLayoutElementIds,
  restoreLayoutElementSnapshot,
} from "../../src/internal/project/layout.js";

const rect = (name, x = 0) => ({
  type: "rect",
  name,
  x,
  y: 0,
  width: 100,
  height: 40,
  anchorX: 0,
  anchorY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
});

const container = (name) => ({ ...rect(name), type: "container" });

// A real repository, so every restore is checked by the model's own
// validation and reducers.
const createLayout = async () => {
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
  let commandIndex = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `cmd-${++commandIndex}`,
    now: () => 1,
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => ({
      getActor: () => ({ userId: "user-1", clientId: "client-1" }),
      submitCommand: async (command) => command.id,
      submitCommands: async (commands) => commands.map(({ id }) => id),
    }),
    getOrCreateLocalActor: () => ({ userId: "user-1", clientId: "client-1" }),
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
  });
  const api = createLayoutCommandApi(shared);
  await api.createLayoutItem({
    layoutId: "layout-1",
    name: "Layout One",
    layoutType: "general",
  });
  const layoutId = "layout-1";
  const elements = () => repository.getState().layouts.items[layoutId].elements;
  const create = (elementId, data, placement = {}) =>
    api.createLayoutElement({ layoutId, elementId, data, ...placement });

  // Saves operations the way the editor page will.
  const save = async (operations) => {
    for (const { type, ...operation } of operations) {
      const result = await {
        create: api.createLayoutElement,
        delete: api.deleteLayoutElement,
        move: api.moveLayoutElement,
        update: api.updateLayoutElement,
      }[type]({ layoutId, ...operation });
      expect(result?.valid).not.toBe(false);
    }
  };

  // Runs an edit, then checks that restoring each side, on the page's copy
  // and through the saved operations, gives exactly that side back.
  const checkUndoRedo = async (edit) => {
    const before = structuredClone(elements());
    await edit();
    const after = structuredClone(elements());
    const elementIds = getChangedLayoutElementIds(before, after);
    const step = {
      before: captureLayoutElementSnapshot(before, elementIds),
      after: captureLayoutElementSnapshot(after, elementIds),
    };

    for (const [side, expected] of [
      ["before", before],
      ["after", after],
      ["before", before],
    ]) {
      const restore = restoreLayoutElementSnapshot({
        elements: elements(),
        target: step[side],
      });
      expect(restore.valid).toBe(true);
      expect(restore.elements).toEqual(expected);
      await save(restore.operations);
      expect(elements()).toEqual(expected);
    }
    return step;
  };

  return { api, layoutId, elements, create, checkUndoRedo };
};

describe("layout element history", () => {
  it("restores a field change with one update", async () => {
    const { api, layoutId, create, checkUndoRedo, elements } =
      await createLayout();
    await create("a", rect("A", 10));

    const step = await checkUndoRedo(() =>
      api.updateLayoutElement({
        layoutId,
        elementId: "a",
        data: { x: 300 },
        replace: false,
      }),
    );

    // The check ends on the before side.
    expect(Object.keys(step.before)).toEqual(["a"]);
    expect(
      restoreLayoutElementSnapshot({
        elements: elements(),
        target: step.after,
      }).operations,
    ).toEqual([
      {
        type: "update",
        elementId: "a",
        data: rect("A", 300),
        replace: true,
      },
    ]);
  });

  it("restores a deleted container with its children, ids, and order", async () => {
    const { api, layoutId, create, checkUndoRedo } = await createLayout();
    await create("first", rect("First"));
    await create("box", container("Box"));
    await create("last", rect("Last"));
    await create("child-1", rect("Child 1"), { parentId: "box" });
    await create("child-2", rect("Child 2"), { parentId: "box" });

    await checkUndoRedo(() =>
      api.deleteLayoutElement({ layoutId, elementIds: ["box"] }),
    );
  });

  it("restores a create at the top without moving the siblings it shifted", async () => {
    const { create, checkUndoRedo, elements } = await createLayout();
    for (const id of ["a", "b", "c"]) {
      await create(id, rect(id));
    }

    const step = await checkUndoRedo(() =>
      create("new", rect("New"), { index: 0 }),
    );

    // The siblings' indexes changed, so they are in the step, but undoing
    // needs only the delete.
    expect(Object.keys(step.before).sort()).toEqual(["a", "b", "c", "new"]);
    const created = restoreLayoutElementSnapshot({
      elements: elements(),
      target: step.after,
    }).elements;
    expect(
      restoreLayoutElementSnapshot({ elements: created, target: step.before })
        .operations,
    ).toEqual([{ type: "delete", elementIds: ["new"] }]);
  });

  it("restores a reorder and a move into another container", async () => {
    const { api, layoutId, create, checkUndoRedo } = await createLayout();
    await create("a", rect("A"));
    await create("b", rect("B"));
    await create("box", container("Box"));
    await create("inside", rect("Inside"), { parentId: "box" });

    await checkUndoRedo(() =>
      api.moveLayoutElement({ layoutId, elementId: "a", index: 2 }),
    );
    await checkUndoRedo(() =>
      api.moveLayoutElement({
        layoutId,
        elementId: "b",
        parentId: "box",
        index: 0,
      }),
    );
  });

  it("restores a container created with an existing element moved into it", async () => {
    const { api, layoutId, create, checkUndoRedo } = await createLayout();
    await create("a", rect("A"));
    await create("b", rect("B"));

    await checkUndoRedo(async () => {
      await create("box", container("Box"));
      await api.moveLayoutElement({
        layoutId,
        elementId: "a",
        parentId: "box",
        index: 0,
      });
    });
  });

  it("restores a renamed folder with only the fields folders accept", async () => {
    const { api, layoutId, create, checkUndoRedo } = await createLayout();
    await create("folder", { type: "folder", name: "Folder" });

    await checkUndoRedo(() =>
      api.updateLayoutElement({
        layoutId,
        elementId: "folder",
        data: { name: "Renamed" },
        replace: false,
      }),
    );
  });

  it("refuses to delete an element the snapshot does not cover", async () => {
    const { create, elements } = await createLayout();
    await create("box", container("Box"));
    await create("child", rect("Child"), { parentId: "box" });

    expect(
      restoreLayoutElementSnapshot({
        elements: elements(),
        target: { box: null },
      }),
    ).toEqual({ valid: false });
  });
});
