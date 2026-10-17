import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  hydratePreviewState,
  selectPreviewData,
  setDialogueDefaultValue,
  setLayoutState,
  setRepositoryState,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import {
  collectNonJsonFields,
  createCommandApiShared,
} from "../../src/deps/services/shared/commandApi/shared.js";
import { createRuntimeSaveSlots } from "../../src/internal/layoutEditorPreview/layoutEditorPreviewSaveLoad.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";

// The preview data the layout editor saves with `layout.update`
// (`data: { preview }`), built by the real Preview store and saved through the
// real command API, so that the change the user made is the change stored.

const SAVE_LOAD_LAYOUT_ID = "layout-save-load";
const DIALOGUE_LAYOUT_ID = "layout-dialogue";

const setup = async () => {
  const errorTracker = { capture: vi.fn() };
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
  const session = {
    getActor: vi.fn(() => ({ userId: "user-1", clientId: "client-1" })),
    submitCommand: vi.fn(async (command) => command.id),
    submitCommands: vi.fn(async (commands) =>
      commands.map((command) => command.id),
    ),
  };
  const shared = createCommandApiShared({
    idGenerator: (() => {
      let index = 0;
      return () => `cmd-${++index}`;
    })(),
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
  const api = createLayoutCommandApi(shared);

  await api.createLayoutItem({
    layoutId: SAVE_LOAD_LAYOUT_ID,
    name: "Layout One",
    layoutType: "save-load",
  });
  await api.createLayoutItem({
    layoutId: DIALOGUE_LAYOUT_ID,
    name: "Layout Two",
    layoutType: "dialogue-adv",
  });
  errorTracker.capture.mockClear();

  // The Preview of a layout, set up as the layout editor sets it up.
  const createPreviewState = (layoutId) => {
    const repositoryState = repository.getState();
    const layout = repositoryState.layouts.items[layoutId];
    const state = createInitialState();
    setLayoutState(
      { state },
      {
        layoutState: {
          id: layoutId,
          layoutType: layout.layoutType,
          layoutSchemaVersion: layout.layoutSchemaVersion,
          elements: layout.elements,
        },
      },
    );
    setRepositoryState({ state }, { repositoryState });
    return state;
  };

  // What the layout editor's preview autosave sends.
  const savePreview = (layoutId, previewData) =>
    api.updateLayoutItem({ layoutId, data: { preview: previewData } });

  return {
    createPreviewState,
    repository,
    reportError: errorTracker.capture,
    savePreview,
  };
};

// The names of the fields a layout update would report as non-JSON.
const nonJsonFieldsOf = (previewData) => {
  const fields = new Set();
  collectNonJsonFields(
    { layoutId: "layout-1", data: { preview: previewData } },
    "payload",
    fields,
  );
  return [...fields].sort();
};

describe("layout editor preview data payload", () => {
  it("builds the default save and load preview without undefined fields", async () => {
    const { createPreviewState } = await setup();

    const previewData = selectPreviewData({
      state: createPreviewState(SAVE_LOAD_LAYOUT_ID),
    });

    expect(nonJsonFieldsOf(previewData)).toEqual([]);
    // A slot with a date and no image, and slots with neither. Strict
    // equality tells a field set to undefined from a missing one.
    expect(previewData.saveSlots).toStrictEqual([
      {
        slotId: 1,
        savedAt: new Date("2026-03-10 18:00").getTime(),
        isAvailable: true,
      },
      { slotId: 2, isAvailable: false },
      { slotId: 3, isAvailable: false },
    ]);
  });

  it("keeps the image of a save slot that has one", async () => {
    const { createPreviewState } = await setup();
    const state = createPreviewState(SAVE_LOAD_LAYOUT_ID);
    state.saveLoadDefaultValues.saveImageIds = [
      "image-1",
      undefined,
      "image-3",
    ];

    const previewData = selectPreviewData({ state });

    expect(nonJsonFieldsOf(previewData)).toEqual([]);
    expect(previewData.saveSlots).toStrictEqual([
      {
        slotId: 1,
        image: "image-1",
        savedAt: new Date("2026-03-10 18:00").getTime(),
        isAvailable: true,
      },
      { slotId: 2, isAvailable: false },
      { slotId: 3, image: "image-3", isAvailable: true },
    ]);
  });

  it("passes a save slot's state through when it has one", () => {
    expect(
      createRuntimeSaveSlots({
        slots: [{ slotId: 1, state: { chapter: 1 } }, { slotId: 2 }],
      }),
    ).toStrictEqual([
      { slotId: 1, state: { chapter: 1 }, isAvailable: false },
      { slotId: 2, isAvailable: false },
    ]);
  });

  it("builds a dialogue avatar without a transform without an undefined field", async () => {
    const { createPreviewState } = await setup();
    const state = createPreviewState(DIALOGUE_LAYOUT_ID);
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-id", fieldValue: "sprite-1" },
    );
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-transform-id", fieldValue: undefined },
    );

    const previewData = selectPreviewData({ state });

    expect(nonJsonFieldsOf(previewData)).toEqual([]);
    expect(previewData.dialogue.character.sprite).toStrictEqual({
      items: [{ id: "base", resourceId: "sprite-1" }],
    });
  });

  it("saves the default save and load preview without a report", async () => {
    const { createPreviewState, reportError, repository, savePreview } =
      await setup();
    const previewData = selectPreviewData({
      state: createPreviewState(SAVE_LOAD_LAYOUT_ID),
    });

    const result = await savePreview(SAVE_LOAD_LAYOUT_ID, previewData);

    expect(result).toMatchObject({ valid: true });
    expect(reportError).not.toHaveBeenCalled();
    const savedPreview =
      repository.getState().layouts.items[SAVE_LOAD_LAYOUT_ID].preview;
    expect(savedPreview).toStrictEqual(previewData);

    // The Preview shows the saved slots as it did before they were saved.
    const reopened = createPreviewState(SAVE_LOAD_LAYOUT_ID);
    hydratePreviewState({ state: reopened }, { previewData: savedPreview });
    expect(reopened.saveLoadDefaultValues).toMatchObject({
      slotsNum: 3,
      saveDates: [new Date("2026-03-10 18:00").toISOString(), "", ""],
    });
    expect(selectPreviewData({ state: reopened }).saveSlots).toEqual(
      previewData.saveSlots,
    );
  });

  it("saves a dialogue avatar and then its removed transform without a report", async () => {
    const { createPreviewState, reportError, repository, savePreview } =
      await setup();
    const state = createPreviewState(DIALOGUE_LAYOUT_ID);
    const getSavedSprite = () =>
      repository.getState().layouts.items[DIALOGUE_LAYOUT_ID].preview.dialogue
        .character.sprite;

    // An avatar with a transform.
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-id", fieldValue: "sprite-1" },
    );
    setDialogueDefaultValue(
      { state },
      {
        name: "dialogue-character-sprite-transform-id",
        fieldValue: "transform-1",
      },
    );
    await savePreview(DIALOGUE_LAYOUT_ID, selectPreviewData({ state }));
    expect(getSavedSprite()).toStrictEqual({
      transformId: "transform-1",
      items: [{ id: "base", resourceId: "sprite-1" }],
    });

    // The transform removed: the saved preview is replaced as a whole, so the
    // saved avatar keeps no transform.
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-transform-id", fieldValue: undefined },
    );
    const result = await savePreview(
      DIALOGUE_LAYOUT_ID,
      selectPreviewData({ state }),
    );

    expect(result).toMatchObject({ valid: true });
    expect(getSavedSprite()).toStrictEqual({
      items: [{ id: "base", resourceId: "sprite-1" }],
    });
    expect(reportError).not.toHaveBeenCalled();

    // The Preview opens with no transform, as it was saved.
    const reopened = createPreviewState(DIALOGUE_LAYOUT_ID);
    hydratePreviewState(
      { state: reopened },
      {
        previewData:
          repository.getState().layouts.items[DIALOGUE_LAYOUT_ID].preview,
      },
    );
    expect(reopened.dialogueDefaultValues).toMatchObject({
      "dialogue-character-sprite-id": "sprite-1",
      "dialogue-character-sprite-transform-id": undefined,
    });
  });
});
