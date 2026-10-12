import { describe, expect, it, vi } from "vitest";
import { createControlCommandApi } from "../../src/deps/services/shared/commandApi/controls.js";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/index.js";
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

const fileRecord = (id, mimeType) => ({
  id,
  mimeType,
  size: 1,
  sha256: "a".repeat(64),
});

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
  it("keeps a cleared outline color and frame size cleared after a load", async () => {
    const { repository, reload, shared } = await setup();
    const resources = createResourceCommandApi(shared);
    const steps = [
      () =>
        resources.createColor({
          colorId: "color-1",
          data: { type: "color", name: "White", hex: "#ffffff" },
        }),
      () =>
        resources.createFont({
          fontId: "font-1",
          fileRecords: [fileRecord("font-file", "font/woff2")],
          data: {
            type: "font",
            name: "Font One",
            fileId: "font-file",
            fontFamily: "Font One",
          },
        }),
      () =>
        resources.createTextStyle({
          textStyleId: "style-1",
          data: {
            type: "textStyle",
            name: "Style One",
            fontId: "font-1",
            colorId: "color-1",
            fontSize: 24,
            lineHeight: 1.4,
            fontWeight: "400",
            strokeColorId: "color-1",
            strokeWidth: 2,
          },
        }),
      () =>
        resources.createSpritesheet({
          spritesheetId: "sheet-1",
          fileRecords: [fileRecord("sheet-file", "image/png")],
          data: {
            type: "spritesheet",
            name: "Sheet One",
            fileId: "sheet-file",
            width: 64,
            height: 64,
            jsonData: { meta: { image: "sheet.png" } },
            animations: { idle: { frames: [0] } },
          },
        }),
      () =>
        resources.updateTextStyle({
          textStyleId: "style-1",
          data: { strokeColorId: null, strokeWidth: 0 },
        }),
      () =>
        resources.updateSpritesheet({
          spritesheetId: "sheet-1",
          data: { width: null, height: null },
        }),
    ];
    for (const step of steps) {
      const result = await step();
      expect(result?.error?.message).toBeUndefined();
    }

    const { textStyles, spritesheets } = repository.getState();
    expect(textStyles.items["style-1"]).not.toHaveProperty("strokeColorId");
    expect(spritesheets.items["sheet-1"]).not.toHaveProperty("width");
    expect(spritesheets.items["sheet-1"]).not.toHaveProperty("height");
    const reloaded = (await reload()).getState();
    expect(reloaded.textStyles.items["style-1"]).toEqual(
      textStyles.items["style-1"],
    );
    expect(reloaded.spritesheets.items["sheet-1"]).toEqual(
      spritesheets.items["sheet-1"],
    );
  });
});
