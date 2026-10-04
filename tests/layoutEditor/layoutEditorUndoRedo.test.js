import { produce } from "immer";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerAction,
  handleLayoutEditorCanvasDragUpdate,
  handleRedoButtonClick,
  handleUndoButtonClick,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { createLayoutEditorRepositoryStoreData } from "../../src/pages/layoutEditor/support/layoutEditorRepositoryState.js";
import { EN_I18N } from "../support/i18n.js";

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

// The page on a real repository, so every save is checked by the model.
const createPage = async () => {
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
  for (const id of ["a", "b"]) {
    await api.createLayoutElement({
      layoutId: "layout-1",
      elementId: id,
      data: rect(id.toUpperCase()),
    });
  }

  const projectService = {
    ...api,
    getRepositoryState: () => repository.getState(),
    getState: () => repository.getState(),
    ensureRepository: async () => {},
  };
  for (const name of [
    "updateLayoutElement",
    "createLayoutElement",
    "deleteLayoutElement",
  ]) {
    vi.spyOn(projectService, name);
  }

  let state = produce(layoutEditorStore.createInitialState(), (draft) => {
    layoutEditorStore.syncRepositoryState(
      { state: draft },
      createLayoutEditorRepositoryStoreData({
        repositoryState: repository.getState(),
        layoutId: "layout-1",
      }),
    );
  });
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return layoutEditorStore[name]({ state }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = layoutEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );

  const subject = new Subject();
  subject.dispatch = (action, payload) => subject.next({ action, payload });
  let keydown;
  const deps = {
    projectService,
    store,
    subject,
    appService: {
      registerBeforeNavigation: () => () => {},
      getPayload: () => ({ l: "layout-1" }),
      showAlert: vi.fn(),
      showToast: vi.fn(),
    },
    browserEventsClient: {
      subscribeWindowEvent: ({ listener }) => {
        keydown = listener;
        return () => {};
      },
    },
    uiConfig: {},
    i18n: EN_I18N,
    refs: {
      layoutEditorCanvas: { discardPendingUpdate: vi.fn() },
      fileExplorer: { clearSelection: vi.fn(), selectItem: vi.fn() },
    },
    render: vi.fn(),
  };
  const cleanup = handleBeforeMount(deps);

  const shown = (id) => store.selectItemDataById({ itemId: id });
  const saved = (id) =>
    repository.getState().layouts.items["layout-1"].elements.items[id];
  const press = (init) => {
    const event = {
      code: "KeyZ",
      key: "z",
      metaKey: true,
      composedPath: () => [],
      preventDefault: vi.fn(),
      ...init,
    };
    keydown(event);
    return event;
  };
  const drag = (id, change) =>
    handleLayoutEditorCanvasDragUpdate(deps, {
      _event: {
        detail: { itemId: id, updatedItem: { ...shown(id), ...change } },
      },
    });
  const view = () =>
    layoutEditorStore.selectViewData({
      state,
      constants: {
        contextMenuItems: [],
        emptyContextMenuItems: [],
        controlContextMenuItems: [],
        controlEmptyContextMenuItems: [],
      },
      i18n: EN_I18N,
    });

  return {
    api,
    deps,
    store,
    projectService,
    shown,
    saved,
    press,
    drag,
    view,
    cleanup: async () => (await cleanup)?.(),
  };
};

describe("layout editor undo and redo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("undoes a drag at once, and saves nothing for an edit not saved yet", async () => {
    const page = await createPage();
    page.drag("a", { x: 300 });
    page.drag("a", { x: 320 });
    expect(page.view()).toMatchObject({
      undoDisabled: false,
      redoDisabled: true,
    });

    handleUndoButtonClick(page.deps);

    expect(page.shown("a").x).toBe(0);
    expect(
      page.deps.refs.layoutEditorCanvas.discardPendingUpdate,
    ).toHaveBeenCalled();
    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.projectService.updateLayoutElement).not.toHaveBeenCalled();
    expect(page.saved("a").x).toBe(0);

    handleRedoButtonClick(page.deps);
    expect(page.shown("a").x).toBe(320);
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.saved("a").x).toBe(320);

    await page.cleanup();
  });

  it("undoes a saved edit with the keyboard and saves the old value", async () => {
    const page = await createPage();
    page.drag("b", { x: 50 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.saved("b").x).toBe(50);

    const undo = page.press();
    expect(undo.preventDefault).toHaveBeenCalled();
    expect(page.shown("b").x).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.saved("b").x).toBe(0);

    page.press({ shiftKey: true });
    expect(page.shown("b").x).toBe(50);

    await page.cleanup();
  });

  it("leaves the keys to a focused field", async () => {
    const page = await createPage();
    page.drag("a", { x: 300 });

    const event = page.press({
      composedPath: () => [{ tagName: "INPUT" }],
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(page.shown("a").x).toBe(300);

    await page.cleanup();
  });

  it("undoes a delete at once and saves it in the background", async () => {
    const page = await createPage();
    page.store.setSelectedItemId({ itemId: "a" });
    await handleFileExplorerAction(page.deps, {
      _event: { detail: { itemId: "a", item: { value: "delete-item" } } },
    });
    expect(page.saved("a")).toBeUndefined();

    handleUndoButtonClick(page.deps);
    // Shown before the save runs.
    expect(page.shown("a")).toMatchObject({ name: "A" });
    expect(page.saved("a")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.saved("a")).toMatchObject({ name: "A" });
    expect(page.projectService.createLayoutElement).toHaveBeenLastCalledWith(
      expect.objectContaining({
        layoutId: "layout-1",
        elementId: "a",
        index: 0,
      }),
    );

    // Redo removes it again, along with the selection on it.
    page.store.setSelectedItemId({ itemId: "a" });
    handleRedoButtonClick(page.deps);
    expect(page.shown("a")).toBeUndefined();
    expect(page.store.selectSelectedItemId()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.saved("a")).toBeUndefined();

    await page.cleanup();
  });

  it("keeps an undone delete on screen while its save waits", async () => {
    const page = await createPage();
    await handleFileExplorerAction(page.deps, {
      _event: { detail: { itemId: "a", item: { value: "delete-item" } } },
    });
    let finishSave;
    page.projectService.createLayoutElement.mockImplementationOnce(
      async (options) => {
        await new Promise((resolve) => {
          finishSave = resolve;
        });
        return page.api.createLayoutElement(options);
      },
    );

    handleUndoButtonClick(page.deps);
    await vi.advanceTimersByTimeAsync(0);
    // A refresh from the repository, which does not have it yet.
    await handleDataChanged(page.deps);
    expect(page.saved("a")).toBeUndefined();
    expect(page.shown("a")).toMatchObject({ name: "A" });

    finishSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.saved("a")).toMatchObject({ name: "A" });
    expect(page.shown("a")).toMatchObject({ name: "A" });

    await page.cleanup();
  });

  it("starts with no history", async () => {
    const page = await createPage();

    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
      undoLabel: "Undo",
      redoLabel: "Redo",
    });
    handleUndoButtonClick(page.deps);
    expect(page.shown("a").x).toBe(0);

    await page.cleanup();
  });
});
