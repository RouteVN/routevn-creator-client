import { describe, expect, it, vi } from "vitest";
import { createResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/index.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import {
  createProjectRepository,
  createRepositoryCommandEvent,
} from "../../src/deps/services/shared/projectRepository.js";
import {
  applyTextStyleColorChange,
  applyTextStyleFormChange,
  toTextStyleUpdateData,
  toTextStyleValues,
} from "../../src/pages/textStyleEditor/support/textStyleEditorForm.js";

// The text style editor saves through the command API, which turns the update
// into the JSON that is stored. These tests save the editor's updates the way
// it does, and check what the project holds, and that no update holds a value
// JSON would change.

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
  const errorTracker = { capture: vi.fn() };
  let index = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `id-${++index}`,
    now: () => 1,
    errorTracker,
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
  const resources = createResourceCommandApi(shared);

  const create = async (result) => {
    expect(result?.error?.message).toBeUndefined();
  };
  await create(
    await resources.createColor({
      colorId: "color-1",
      data: { type: "color", name: "White", hex: "#ffffff" },
    }),
  );
  await create(
    await resources.createColor({
      colorId: "color-2",
      data: { type: "color", name: "Black", hex: "#000000" },
    }),
  );
  await create(
    await resources.createFont({
      fontId: "font-1",
      fileRecords: [
        {
          id: "font-file",
          mimeType: "font/woff2",
          size: 1,
          sha256: "a".repeat(64),
        },
      ],
      data: {
        type: "font",
        name: "Font One",
        fileId: "font-file",
        fontFamily: "Font One",
      },
    }),
  );

  const createTextStyle = async (textStyleId, fields = {}) => {
    await create(
      await resources.createTextStyle({
        textStyleId,
        data: {
          type: "textStyle",
          name: "Style One",
          fontId: "font-1",
          colorId: "color-1",
          fontSize: 24,
          lineHeight: 1.4,
          fontWeight: "400",
          ...fields,
        },
      }),
    );
    errorTracker.capture.mockClear();
  };

  const getTextStyle = (textStyleId) =>
    repository.getState().textStyles.items[textStyleId];

  // Saves values over the ones the editor opened with, as the editor does.
  const save = async ({ textStyleId, values, savedValues }) => {
    const result = await resources.updateTextStyle({
      textStyleId,
      data: toTextStyleUpdateData(values, savedValues),
    });
    expect(result).toMatchObject({ valid: true });
    return result;
  };

  const reload = () =>
    createProjectRepository({
      projectId: "project-1",
      store: createStore(),
      events: storedCommands.map((command) =>
        createRepositoryCommandEvent({ command }),
      ),
      historyLoaded: true,
    });

  return { createTextStyle, errorTracker, getTextStyle, reload, save };
};

describe("text style editor saves", () => {
  it("saves a text style without an outline without a non-JSON report", async () => {
    const { createTextStyle, errorTracker, getTextStyle, save } = await setup();
    await createTextStyle("style-1");
    const savedValues = toTextStyleValues(getTextStyle("style-1"));
    const { values } = applyTextStyleFormChange(savedValues, {
      name: "fontSize",
      value: 32,
    });

    await save({ textStyleId: "style-1", values, savedValues });

    expect(errorTracker.capture).not.toHaveBeenCalled();
    expect(getTextStyle("style-1")).toMatchObject({ fontSize: 32 });
    expect(getTextStyle("style-1")).not.toHaveProperty("strokeColorId");
  });

  it("clears a removed outline, in the open project and after a load", async () => {
    const { createTextStyle, errorTracker, getTextStyle, reload, save } =
      await setup();
    await createTextStyle("style-1", {
      strokeColorId: "color-2",
      strokeWidth: 3,
    });
    const savedValues = toTextStyleValues(getTextStyle("style-1"));
    expect(savedValues.strokeColorId).toBe("color-2");
    const values = applyTextStyleColorChange(savedValues, {
      field: "strokeColorId",
      colorId: undefined,
    });

    await save({ textStyleId: "style-1", values, savedValues });

    expect(errorTracker.capture).not.toHaveBeenCalled();
    expect(getTextStyle("style-1")).not.toHaveProperty("strokeColorId");
    expect(getTextStyle("style-1")).toMatchObject({ strokeWidth: 0 });
    // The command is replayed from its stored JSON on every platform.
    const reloaded = (await reload()).getState().textStyles.items["style-1"];
    expect(reloaded).toEqual(getTextStyle("style-1"));
  });

  it("sets an outline on a text style that had none", async () => {
    const { createTextStyle, errorTracker, getTextStyle, reload, save } =
      await setup();
    await createTextStyle("style-1");
    const savedValues = toTextStyleValues(getTextStyle("style-1"));
    const values = applyTextStyleColorChange(savedValues, {
      field: "strokeColorId",
      colorId: "color-2",
    });

    await save({ textStyleId: "style-1", values, savedValues });

    expect(errorTracker.capture).not.toHaveBeenCalled();
    expect(getTextStyle("style-1")).toMatchObject({
      strokeColorId: "color-2",
      strokeWidth: 2,
    });
    const reloaded = (await reload()).getState().textStyles.items["style-1"];
    expect(reloaded).toEqual(getTextStyle("style-1"));
  });

  it("changes the outline of a text style that had one", async () => {
    const { createTextStyle, errorTracker, getTextStyle, save } = await setup();
    await createTextStyle("style-1", {
      strokeColorId: "color-2",
      strokeWidth: 3,
    });
    const savedValues = toTextStyleValues(getTextStyle("style-1"));
    const values = applyTextStyleColorChange(savedValues, {
      field: "strokeColorId",
      colorId: "color-1",
    });

    await save({ textStyleId: "style-1", values, savedValues });

    expect(errorTracker.capture).not.toHaveBeenCalled();
    expect(getTextStyle("style-1")).toMatchObject({
      strokeColorId: "color-1",
      strokeWidth: 3,
    });
  });

  it("keeps an outline when another field changes", async () => {
    const { createTextStyle, errorTracker, getTextStyle, save } = await setup();
    await createTextStyle("style-1", {
      strokeColorId: "color-2",
      strokeWidth: 3,
    });
    const savedValues = toTextStyleValues(getTextStyle("style-1"));
    const { values } = applyTextStyleFormChange(savedValues, {
      name: "fontSize",
      value: 32,
    });

    await save({ textStyleId: "style-1", values, savedValues });

    expect(errorTracker.capture).not.toHaveBeenCalled();
    expect(getTextStyle("style-1")).toMatchObject({
      fontSize: 32,
      strokeColorId: "color-2",
      strokeWidth: 3,
    });
  });
});
