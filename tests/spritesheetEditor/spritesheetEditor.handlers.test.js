import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import Subject from "../../src/deps/subject.js";
import * as storeModule from "../../src/pages/spritesheetEditor/spritesheetEditor.store.js";
import {
  handleAfterMount,
  handleBackClick,
  handleBeforeMount,
  handleFramesChange,
  handleRedoButtonClick,
  handleUndoButtonClick,
} from "../../src/pages/spritesheetEditor/spritesheetEditor.handlers.js";
import { createRetainedEditHistoryService } from "../../src/deps/services/shared/retainedEditHistoryService.js";

// Edits save on their own a second after the last one.
const AUTOSAVE_DEBOUNCE_MS = 1000;

const createStore = () => {
  const state = storeModule.createInitialState();
  const store = { state };
  for (const [name, fn] of Object.entries(storeModule)) {
    if (name === "createInitialState") {
      continue;
    }
    store[name] = (payload) => fn({ state, i18n: EN_I18N }, payload);
  }
  return store;
};

const spritesheet = {
  id: "spritesheet-1",
  type: "spritesheet",
  name: "Blink",
  jsonData: {},
  animations: {},
};

const savedContent = { clips: [] };
const editedContent = {
  clips: [
    {
      name: "default",
      entries: [{ key: "e1", frameKey: "a", hold: 1 }],
      fps: 12,
    },
  ],
};

const readyDraft = {
  status: "ready",
  sourceKind: "pictures",
  frames: [{ key: "a", name: "a", width: 16, height: 16 }],
  clips: editedContent.clips,
  keepFrameKeys: [],
  hasChanges: true,
  content: editedContent,
};

const createDeps = ({
  payload = { p: "project-1", ss: "spritesheet-1" },
  repositoryState = {
    spritesheets: { items: { "spritesheet-1": spritesheet }, tree: [] },
  },
  draft = readyDraft,
  leave = true,
} = {}) => {
  let beforeNavigation;
  const windowListeners = {};
  let currentDraft = { ...draft, hasChanges: false, content: savedContent };
  const framesEditor = {
    loadSpritesheet: vi.fn(async () => {}),
    getDraft: vi.fn(() => currentDraft),
    markSaved: vi.fn(({ content }) => {
      currentDraft = {
        ...currentDraft,
        hasChanges: content !== currentDraft.content,
      };
    }),
    undo: vi.fn(async () => true),
    redo: vi.fn(async () => true),
  };
  const deps = {
    i18n: EN_I18N,
    render: vi.fn(),
    store: createStore(),
    refs: { framesEditor },
    subject: new Subject(),
    browserEventsClient: {
      subscribeWindowEvent: ({ type, listener }) => {
        windowListeners[type] = listener;
        return () => delete windowListeners[type];
      },
    },
    appService: {
      ...createRetainedEditHistoryService(),
      getPayload: vi.fn(() => payload),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      showDialog: vi.fn(async () => leave),
      getAppCopy: vi.fn(() => ({})),
      registerBeforeNavigation: vi.fn((handler) => {
        beforeNavigation = handler;
        return vi.fn();
      }),
    },
    projectService: {
      ensureRepository: vi.fn(async () => {}),
      getRepositoryState: vi.fn(() => repositoryState),
      buildSpritesheetFromFrames: vi.fn(async () => ({
        data: { fileId: "sheet", jsonData: {}, animations: {} },
        fileRecords: [{ id: "sheet" }],
        fileIdByFrameKey: { a: "frame-file-a" },
        sourceIndexByFrameKey: { a: 0 },
      })),
      updateSpritesheet: vi.fn(async () => ({})),
      updateCharacterSpriteItem: vi.fn(async () => ({})),
    },
    runBeforeNavigation: (navigationPayload) =>
      beforeNavigation(navigationPayload),
    pressKey: (event) => windowListeners.keydown(event),
    // The draft the next edit makes.
    draft,
    // An edit in the frames editor, as its frames-change event reports it.
    editFrames: (history = { canUndo: true, canRedo: false }) => {
      currentDraft = { ...deps.draft, hasChanges: true };
      handleFramesChange(deps, { _event: { detail: history } });
    },
  };
  return deps;
};

const waitForAutosave = async () => {
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

describe("spritesheet editor page", () => {
  beforeEach(() => {
    // The debounce reads Date.now() as well as timers.
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends the undo history kept for another editor when it is edited", () => {
    const deps = createDeps();
    deps.appService.retainEditHistory({
      owner: "transform:transform-1",
      history: { undo: [{ before: {}, after: {}, time: 0 }], redo: [] },
    });

    deps.editFrames();

    expect(
      deps.appService.getRetainedEditHistory({
        owner: "transform:transform-1",
      }),
    ).toBeUndefined();
  });

  it("loads the spritesheet from the route into the frames editor", async () => {
    const deps = createDeps();

    await handleAfterMount(deps);

    expect(deps.refs.framesEditor.loadSpritesheet).toHaveBeenCalledWith({
      spritesheet,
    });
    expect(deps.store.selectTarget()).toMatchObject({
      spritesheetId: "spritesheet-1",
    });
    expect(deps.store.selectViewData()).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
    });
  });

  it("goes back when the spritesheet does not exist", async () => {
    const deps = createDeps({ payload: { p: "project-1", ss: "missing" } });

    await handleAfterMount(deps);

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message: "Spritesheet not found.",
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/spritesheets",
      { p: "project-1" },
      { historyMode: "replace" },
    );
  });

  it("saves an edit a moment later and records the saved files", async () => {
    const deps = createDeps();
    handleBeforeMount(deps);
    await handleAfterMount(deps);

    deps.editFrames();
    expect(deps.store.selectViewData().undoDisabled).toBe(false);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 100);
    expect(deps.projectService.updateSpritesheet).not.toHaveBeenCalled();
    await waitForAutosave();

    expect(deps.projectService.updateSpritesheet).toHaveBeenCalledTimes(1);
    expect(deps.projectService.updateSpritesheet).toHaveBeenCalledWith({
      spritesheetId: "spritesheet-1",
      fileRecords: [{ id: "sheet" }],
      data: { fileId: "sheet", jsonData: {}, animations: {} },
    });
    expect(deps.refs.framesEditor.markSaved).toHaveBeenCalledWith({
      fileIdByFrameKey: { a: "frame-file-a" },
      sourceIndexByFrameKey: { a: 0 },
      content: editedContent,
    });
  });

  it("keeps autosaving after a save fails unexpectedly", async () => {
    const deps = createDeps();
    deps.refs.framesEditor.getDraft.mockImplementationOnce(() => {
      throw new Error("draft unavailable");
    });
    handleBeforeMount(deps);
    await handleAfterMount(deps);

    deps.editFrames();
    await waitForAutosave();
    expect(deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Failed to save the spritesheet."),
      }),
    );
    expect(deps.projectService.updateSpritesheet).not.toHaveBeenCalled();

    deps.editFrames();
    await waitForAutosave();
    expect(deps.projectService.updateSpritesheet).toHaveBeenCalledTimes(1);
  });

  it("saves several quick edits once", async () => {
    const deps = createDeps();
    handleBeforeMount(deps);
    await handleAfterMount(deps);

    deps.editFrames();
    await vi.advanceTimersByTimeAsync(500);
    deps.editFrames();
    await waitForAutosave();

    expect(deps.projectService.updateSpritesheet).toHaveBeenCalledTimes(1);
  });

  it("saves a character's spritesheet sprite", async () => {
    const deps = createDeps({
      payload: {
        p: "project-1",
        characterId: "character-1",
        sprite: "sprite-1",
      },
      repositoryState: {
        characters: {
          items: {
            "character-1": {
              sprites: { items: { "sprite-1": spritesheet } },
            },
          },
        },
      },
    });
    handleBeforeMount(deps);
    await handleAfterMount(deps);

    deps.editFrames();
    await waitForAutosave();

    expect(deps.projectService.updateCharacterSpriteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "character-1",
        spriteId: "sprite-1",
      }),
    );
  });

  it("saves nothing when the frames are as saved", async () => {
    const deps = createDeps();
    handleBeforeMount(deps);
    await handleAfterMount(deps);

    handleFramesChange(deps, {
      _event: { detail: { canUndo: false, canRedo: true } },
    });
    await waitForAutosave();
    await handleBackClick(deps);

    expect(
      deps.projectService.buildSpritesheetFromFrames,
    ).not.toHaveBeenCalled();
    expect(deps.appService.navigate).toHaveBeenCalled();
  });

  it("undoes and redoes from the buttons and keyboard", async () => {
    const deps = createDeps();
    handleBeforeMount(deps);
    await handleAfterMount(deps);
    const { framesEditor } = deps.refs;

    await handleUndoButtonClick(deps);
    await handleRedoButtonClick(deps);
    const preventDefault = vi.fn();
    await deps.pressKey({
      key: "z",
      ctrlKey: true,
      shiftKey: true,
      composedPath: () => [],
      preventDefault,
    });

    expect(framesEditor.undo).toHaveBeenCalledTimes(1);
    expect(framesEditor.redo).toHaveBeenCalledTimes(2);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("waits quietly while the frames cannot be saved, then offers to leave without them", async () => {
    const deps = createDeps({
      draft: { ...readyDraft, frames: [], clips: [] },
      leave: false,
    });
    handleBeforeMount(deps);
    await handleAfterMount(deps);

    deps.editFrames();
    await waitForAutosave();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.projectService.updateSpritesheet).not.toHaveBeenCalled();

    await expect(deps.runBeforeNavigation({})).rejects.toThrow();
    expect(deps.appService.showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Leave without saving?",
        message:
          "Your changes to this spritesheet couldn't be saved. Add at least one picture.",
      }),
    );

    deps.appService.showDialog.mockResolvedValue(true);
    await handleBackClick(deps);
    expect(deps.appService.navigate).toHaveBeenCalled();
    // Leaving after that does not ask again.
    await expect(deps.runBeforeNavigation({})).resolves.toBeUndefined();
    expect(deps.appService.showDialog).toHaveBeenCalledTimes(2);
  });

  it("saves again after choosing to leave when the page stays open", async () => {
    const deps = createDeps({
      draft: { ...readyDraft, frames: [], clips: [] },
    });
    handleBeforeMount(deps);
    await handleAfterMount(deps);
    deps.editFrames();
    await expect(deps.runBeforeNavigation({})).resolves.toBeUndefined();

    // The navigation did not happen, and the user kept editing.
    deps.draft = readyDraft;
    deps.editFrames();
    await waitForAutosave();

    expect(deps.projectService.updateSpritesheet).toHaveBeenCalledTimes(1);
  });

  it("shows why an autosave failed to make the sheet", async () => {
    const deps = createDeps();
    deps.projectService.buildSpritesheetFromFrames.mockRejectedValue(
      new Error("canvas failed"),
    );
    handleBeforeMount(deps);
    await handleAfterMount(deps);

    deps.editFrames();
    await waitForAutosave();

    expect(deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "Failed to make the spritesheet from the pictures.",
        ),
      }),
    );
  });

  it("saves quietly for a backup and never blocks it", async () => {
    const deps = createDeps({
      draft: { ...readyDraft, frames: [], clips: [] },
    });
    handleBeforeMount(deps);
    await handleAfterMount(deps);
    deps.editFrames();

    await expect(
      deps.runBeforeNavigation({ reason: "backup" }),
    ).resolves.toBeUndefined();
    expect(deps.appService.showDialog).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("stops autosaving after it unmounts", async () => {
    const deps = createDeps();
    const cleanup = handleBeforeMount(deps);
    await handleAfterMount(deps);

    deps.editFrames();
    cleanup();
    await waitForAutosave();

    expect(deps.projectService.updateSpritesheet).not.toHaveBeenCalled();
  });
});
