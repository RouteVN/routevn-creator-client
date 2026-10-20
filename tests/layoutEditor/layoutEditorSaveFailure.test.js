import { produce } from "immer";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  handleBackClick,
  handleBeforeMount,
  handleLayoutEditorCanvasDragUpdate,
  handleLayoutEditorPreviewDataChange,
  handleUndoButtonClick,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { createLayoutEditorRepositoryStoreData } from "../../src/pages/layoutEditor/support/layoutEditorRepositoryState.js";
import { toLayoutEditorSaveError } from "../../src/pages/layoutEditor/support/layoutEditorSaveFailure.js";
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

const DISCARDED_MESSAGE = (elementName) =>
  `Your latest changes to element “${elementName}” in layout “Layout One” could not be saved and were removed. Please enter them again.`;

// The page on a real repository and store, with the hook the app runs before
// it leaves the page.
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
    requestLayoutThumbnails: vi.fn(async () => {}),
  };
  for (const name of ["updateLayoutElement", "updateLayoutItem"]) {
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
  let beforeNavigation;
  const deps = {
    projectService,
    store,
    subject,
    appService: {
      registerBeforeNavigation: (callback) => {
        beforeNavigation = callback;
        return () => {};
      },
      getPayload: () => ({ l: "layout-1" }),
      navigate: vi.fn(),
      reportError: vi.fn(),
      showAlert: vi.fn(),
      showAlertWhenIdle: vi.fn(),
      showToast: vi.fn(),
    },
    browserEventsClient: {
      subscribeWindowEvent: () => () => {},
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
  const drag = (id, change) =>
    handleLayoutEditorCanvasDragUpdate(deps, {
      _event: {
        detail: { itemId: id, updatedItem: { ...shown(id), ...change } },
      },
    });
  const changePreview = (previewData) =>
    handleLayoutEditorPreviewDataChange(deps, {
      _event: { detail: { previewData, edited: true } },
    });

  return {
    deps,
    store,
    projectService,
    shown,
    saved,
    drag,
    changePreview,
    // What the app does before it goes to another page, to the background,
    // or quits.
    leave: (navigation) => beforeNavigation(navigation),
    cleanup: async () => (await cleanup)?.(),
  };
};

describe("layout editor save failures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("leaves without throwing when the save of an edit is refused, puts the stored element back, and tells the user why", async () => {
    const page = await createPage();
    page.projectService.updateLayoutElement.mockResolvedValueOnce({
      valid: false,
      error: { message: "payload.data is not accepted", code: "invalid" },
    });
    page.drag("a", { x: 300 });
    expect(page.shown("a").x).toBe(300);

    await expect(page.leave({ reason: "background" })).resolves.toBeUndefined();

    expect(page.shown("a").x).toBe(0);
    expect(page.saved("a").x).toBe(0);
    expect(page.store.selectPendingPersistPayload()).toBeUndefined();
    expect(
      page.deps.refs.layoutEditorCanvas.discardPendingUpdate,
    ).toHaveBeenCalled();
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledWith({
      title: "Error",
      message: `${DISCARDED_MESSAGE("A")}\n\nDetails:\npayload.data is not accepted`,
    });
    expect(page.deps.appService.showAlert).not.toHaveBeenCalled();
    // The report gets the reason the store gave, not a generic message.
    expect(page.deps.appService.reportError).toHaveBeenCalledTimes(1);
    const [reported, context] = page.deps.appService.reportError.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe("payload.data is not accepted");
    expect(reported.code).toBe("invalid");
    expect(context).toEqual({ operation: "layoutEditor.saveElement" });

    // It is not saved again when the page closes, and the page can be left.
    await page.cleanup();
    await expect(page.leave({})).resolves.toBeUndefined();
    expect(page.projectService.updateLayoutElement).toHaveBeenCalledTimes(1);
    expect(page.deps.appService.reportError).toHaveBeenCalledTimes(1);
  });

  it("keeps the error a failed save threw, and shows the user a message in their language instead of its text", async () => {
    const page = await createPage();
    const failure = Object.assign(new Error("database is locked"), {
      code: "SQLITE_BUSY",
    });
    page.projectService.updateLayoutElement.mockRejectedValueOnce(failure);
    page.drag("a", { x: 300 });

    await expect(page.leave({ reason: "quit" })).resolves.toBeUndefined();

    expect(page.deps.appService.reportError).toHaveBeenCalledWith(failure, {
      operation: "layoutEditor.saveElement",
    });
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledWith({
      title: "Error",
      message: `${DISCARDED_MESSAGE("A")}\n\nDetails:\ndatabase is locked`,
    });
    expect(page.shown("a").x).toBe(0);

    await page.cleanup();
  });

  it("drops only the edit that failed", async () => {
    const page = await createPage();
    page.projectService.updateLayoutElement.mockResolvedValueOnce({
      valid: false,
      error: { message: "rejected" },
    });
    page.drag("a", { x: 300 });
    // Editing another element sends a's edit to save at once.
    page.drag("b", { x: 50 });

    await page.leave({ reason: "background" });

    expect(page.shown("a").x).toBe(0);
    expect(page.saved("a").x).toBe(0);
    expect(page.shown("b").x).toBe(50);
    expect(page.saved("b").x).toBe(50);
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);

    await page.cleanup();
  });

  it("saves what comes after a failed save, and reports every failure but explains them once", async () => {
    const page = await createPage();
    page.projectService.updateLayoutElement.mockResolvedValue({
      valid: false,
      error: { message: "rejected" },
    });
    page.drag("a", { x: 300 });
    page.drag("b", { x: 50 });
    page.changePreview({ backgroundImageId: "image-two" });
    page.projectService.updateLayoutItem.mockResolvedValueOnce({ valid: true });

    await page.leave({ reason: "background" });

    expect(page.projectService.updateLayoutItem).toHaveBeenCalledWith({
      layoutId: "layout-1",
      data: { preview: { backgroundImageId: "image-two" } },
    });
    expect(page.deps.appService.reportError).toHaveBeenCalledTimes(2);
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);

    await page.cleanup();
  });

  it("leaves without throwing when the preview cannot be saved, and does not save it again", async () => {
    const page = await createPage();
    page.projectService.updateLayoutItem.mockResolvedValueOnce({
      valid: false,
      error: { message: "preview is not accepted" },
    });
    page.changePreview({ backgroundImageId: "image-two" });

    await expect(page.leave({ reason: "background" })).resolves.toBeUndefined();

    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledWith({
      title: "Error",
      message:
        "Failed to save layout preview.\n\nDetails:\npreview is not accepted",
    });
    expect(page.deps.appService.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "preview is not accepted" }),
      { operation: "layoutEditor.savePreview" },
    );
    expect(page.store.selectUnsavedPreviewData()).toBeUndefined();

    await page.cleanup();
    await page.leave({});
    expect(page.projectService.updateLayoutItem).toHaveBeenCalledTimes(1);
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);
  });

  it("asks for the layout's thumbnail after a failed save when the page is left for another", async () => {
    const page = await createPage();
    page.projectService.updateLayoutElement.mockRejectedValueOnce(
      new Error("disk is full"),
    );
    page.drag("a", { x: 300 });

    await page.leave({});

    expect(page.projectService.requestLayoutThumbnails).toHaveBeenCalledWith({
      layoutIds: ["layout-1"],
    });

    await page.cleanup();
  });

  it("stays on the page for Back after a failed save, and goes on the next press", async () => {
    const page = await createPage();
    page.projectService.updateLayoutElement.mockResolvedValueOnce({
      valid: false,
      error: { message: "rejected" },
    });
    page.drag("a", { x: 300 });

    await handleBackClick(page.deps);
    expect(page.deps.appService.navigate).not.toHaveBeenCalled();
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(1);

    await handleBackClick(page.deps);
    expect(page.deps.appService.navigate).toHaveBeenCalledTimes(1);
    expect(page.projectService.updateLayoutElement).toHaveBeenCalledTimes(1);

    await page.cleanup();
  });

  it("cannot bring a dropped edit back with undo", async () => {
    const page = await createPage();
    page.projectService.updateLayoutElement.mockResolvedValueOnce({
      valid: false,
      error: { message: "rejected" },
    });
    page.drag("a", { x: 300 });
    await page.leave({ reason: "background" });

    handleUndoButtonClick(page.deps);
    await vi.advanceTimersByTimeAsync(1000);

    expect(page.shown("a").x).toBe(0);
    expect(page.saved("a").x).toBe(0);
    expect(page.projectService.updateLayoutElement).toHaveBeenCalledTimes(1);

    await page.cleanup();
  });
});

describe("toLayoutEditorSaveError", () => {
  it("keeps an Error as it is", () => {
    const error = new Error("disk is full");

    expect(toLayoutEditorSaveError(error, "Failed")).toBe(error);
  });

  it("says what a refusal or a rejection with a string or plain object said", () => {
    expect(
      toLayoutEditorSaveError({ message: "refused" }, "Failed").message,
    ).toBe("refused");
    expect(
      toLayoutEditorSaveError(
        { creatorModelError: { message: "invalid field" } },
        "Failed",
      ).message,
    ).toBe("invalid field");
    expect(
      toLayoutEditorSaveError("database is locked", "Failed").message,
    ).toBe("database is locked");
    expect(toLayoutEditorSaveError(undefined, "Failed").message).toBe("Failed");
    expect(toLayoutEditorSaveError({ code: "busy" }, "Failed").code).toBe(
      "busy",
    );
  });
});
