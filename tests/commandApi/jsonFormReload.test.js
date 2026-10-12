import { describe, expect, it, vi } from "vitest";
import { createControlCommandApi } from "../../src/deps/services/shared/commandApi/controls.js";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import {
  createProjectRepository,
  createRepositoryCommandEvent,
} from "../../src/deps/services/shared/projectRepository.js";

// Saved changes are stored as JSON and replayed when the project loads. The
// state a change leaves in the open project must be the state that loads.

const createStore = () => ({
  appendEvents: vi.fn(async () => {}),
  loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
  saveMaterializedViewCheckpoint: vi.fn(async () => {}),
  deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
});

const setup = async () => {
  const repository = await createProjectRepository({
    projectId: "project-1",
    store: createStore(),
    events: [],
    historyLoaded: true,
  });
  // The session stores each submitted command as JSON.
  const storedCommands = [];
  const store = (command) => {
    storedCommands.push(JSON.parse(JSON.stringify(command)));
    return command.id;
  };
  const session = {
    getActor: () => ({ userId: "user-1", clientId: "client-1" }),
    submitCommand: vi.fn(async (command) => store(command)),
    submitCommands: vi.fn(async (commands) => commands.map(store)),
  };
  let index = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `id-${++index}`,
    now: () => 1,
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => ({ userId: "user-1", clientId: "client-1" }),
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
  });

  const reload = () =>
    createProjectRepository({
      projectId: "project-1",
      store: createStore(),
      events: storedCommands.map((command) =>
        createRepositoryCommandEvent({ command }),
      ),
      historyLoaded: true,
    });

  return { repository, reload, shared };
};

describe("a saved change loads back as it was made", () => {
  it("keeps a field set to undefined as it was, in the open project and after a load", async () => {
    const { repository, reload, shared } = await setup();
    const layouts = createLayoutCommandApi(shared);
    await layouts.createLayoutItem({
      layoutId: "layout-1",
      name: "Layout One",
      layoutType: "general",
    });
    await layouts.createLayoutElement({
      layoutId: "layout-1",
      elementId: "text-1",
      data: {
        type: "text",
        name: "Title",
        x: 0,
        y: 0,
        width: 120,
        height: 24,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        hidden: true,
      },
    });

    await layouts.updateLayoutElement({
      layoutId: "layout-1",
      elementId: "text-1",
      data: { name: "Heading", hidden: undefined },
      replace: false,
    });

    const getElement = (state) =>
      state.layouts.items["layout-1"].elements.items["text-1"];
    const element = getElement(repository.getState());
    expect(element).toMatchObject({ name: "Heading", hidden: true });
    expect(getElement((await reload()).getState())).toEqual(element);
  });

  it("keeps a control's last keyboard binding deleted after a load", async () => {
    const { repository, reload, shared } = await setup();
    const controls = createControlCommandApi(shared);
    await controls.createControlItem({
      controlId: "control-1",
      name: "Control One",
    });
    await controls.updateControlItem({
      controlId: "control-1",
      data: {
        keyboard: {
          enter: { payload: { actions: { toggleAutoMode: {} } } },
        },
      },
    });

    const result = await controls.updateControlItem({
      controlId: "control-1",
      data: { keyboard: {} },
    });

    expect(result).toMatchObject({ valid: true });
    const control = repository.getState().controls.items["control-1"];
    expect(control.keyboard ?? {}).toEqual({});
    expect((await reload()).getState().controls.items["control-1"]).toEqual(
      control,
    );
  });
});
