import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sceneEditorStore from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleAfterMount,
  handleBackgroundTransformCustomize,
  handleBackgroundTransformEditorChange,
  handleBeforeMount,
  handleCommandLineSubmit,
  handleDownloadCanvasClick,
  handleEditorDataChanged,
  handleHidePreviewScene,
  handleMobileKeyboardToolbarActionClick,
  handlePreviewClick,
  handlePreviewShortcut,
  handleSelectedLineChanged,
  handleUndoButtonClick,
  prepareSceneEditorNavigation,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import { createGraphicsUnavailableNotifier } from "../../src/deps/services/shared/graphicsUnavailableNotice.js";
import Subject from "../../src/deps/subject.js";
import { EN_I18N } from "../support/i18n.js";

// What Pixi throws when the device has no WebGL at all.
const NO_WEBGL_MESSAGE =
  "This browser does not support WebGL. Try using the canvas renderer";

const dialogueLine = (id, text, actions = {}) => ({
  id,
  actions: { ...actions, dialogue: { content: [{ text }] } },
});

const toLineItems = (lines) => ({
  items: Object.fromEntries(lines.map((line) => [line.id, line])),
  tree: lines.map((line) => ({ id: line.id })),
});

// A graphics service that cannot start, as on a device without WebGL. Like
// the real one, it tells the user and rejects. It records every call.
const createUnavailableGraphicsService = ({ onGraphicsUnavailable }) => {
  const calls = [];
  const service = new Proxy(
    {},
    {
      get: (_target, name) => {
        if (typeof name !== "string") {
          return undefined;
        }
        return () => {
          calls.push(name);
          if (name === "init") {
            const error = new Error(NO_WEBGL_MESSAGE);
            onGraphicsUnavailable(error);
            return Promise.reject(error);
          }
          if (name === "destroy") {
            return Promise.resolve();
          }
          return undefined;
        };
      },
    },
  );
  return { service, calls };
};

// The scene editor on its real store, handlers and runtime, opening "Scene
// One" on a device where graphics cannot start.
const createPage = () => {
  let state = sceneEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return sceneEditorStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = sceneEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  let repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    images: {
      items: {
        "bg-1": {
          id: "bg-1",
          type: "image",
          name: "Background One",
          fileId: "file-bg-1",
          fileType: "image/png",
          width: 1920,
          height: 1080,
        },
      },
      tree: [{ id: "bg-1" }],
    },
    scenes: {
      items: {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene One",
          sections: {
            items: {
              "section-1": {
                id: "section-1",
                name: "Section One",
                lines: toLineItems([
                  dialogueLine("line-1", "Hello world", {
                    background: { resourceId: "bg-1" },
                  }),
                  dialogueLine("line-2", "Second"),
                ]),
              },
            },
            tree: [{ id: "section-1" }],
          },
        },
      },
      tree: [{ id: "scene-1" }],
    },
  };
  let revision = 1;
  const updateRepository = (recipe) => {
    repositoryState = produce(repositoryState, recipe);
    revision += 1;
  };
  const savedSection = () =>
    repositoryState.scenes.items["scene-1"].sections.items["section-1"];
  let payload = { p: "project-1", s: "scene-1" };
  const appService = {
    getPayload: () => payload,
    setPayload: vi.fn((nextPayload) => {
      payload = nextPayload;
    }),
    navigate: vi.fn(),
    showAlert: vi.fn(),
    showAlertWhenIdle: vi.fn(),
    showToast: vi.fn(),
    reportError: vi.fn(),
    saveFilePicker: vi.fn(),
    getUserConfig: () => undefined,
    registerBeforeNavigation: vi.fn(() => () => {}),
    getAppCopy: () => EN_I18N.appPage,
    blurActiveElement: vi.fn(),
    isInputFocused: () => false,
  };
  const graphics = createUnavailableGraphicsService({
    onGraphicsUnavailable: createGraphicsUnavailableNotifier({ appService }),
  });
  const editor = {
    dataset: { sectionId: "section-1" },
    getLines: () => [],
    focusLine: vi.fn(),
    focusContainer: vi.fn(),
    blurEditor: vi.fn(),
    scrollLineIntoView: vi.fn(),
    replaceLines: vi.fn(),
  };
  // The canvas host is mounted when the editor starts graphics.
  const canvasRoot = Object.assign(new EventTarget(), { isConnected: true });
  const deps = {
    store,
    render: vi.fn(),
    refs: {
      previewCanvasHost: { getCanvasRoot: () => canvasRoot },
      sectionEditor0: editor,
    },
    i18n: EN_I18N,
    subject: new Subject(),
    uiConfig: { id: "normal" },
    browserEventsClient: { subscribeWindowEvent: () => () => {} },
    graphicsService: graphics.service,
    appService,
    projectService: {
      ensureRepository: vi.fn(async () => {}),
      setActiveSceneId: vi.fn(async () => {}),
      clearActiveSceneId: vi.fn(async () => {}),
      getEnsuredProjectId: () => "project-1",
      getCurrentProjectInfo: vi.fn(async () => ({ language: "en" })),
      subscribeProjectState: () => () => {},
      getRepositoryState: () => repositoryState,
      getDomainState: () => ({}),
      getRepositoryRevision: () => revision,
      cacheSceneTextStats: vi.fn(async () => {}),
      getFileContent: vi.fn(async () => ({
        url: "blob:background-one",
        type: "image/png",
      })),
      syncSectionLinesSnapshot: vi.fn(async ({ lines }) => {
        updateRepository((draft) => {
          draft.scenes.items["scene-1"].sections.items["section-1"].lines =
            toLineItems(lines.map(({ id, actions }) => ({ id, actions })));
        });
        return { valid: true };
      }),
      updateLineActions: vi.fn(async ({ lineId, data }) => {
        updateRepository((draft) => {
          const line =
            draft.scenes.items["scene-1"].sections.items["section-1"].lines
              .items[lineId];
          Object.assign(line.actions, data);
        });
        return { valid: true };
      }),
    },
  };
  // The editor reporting its lines after typing in one of them.
  const type = (lineId, text) =>
    handleEditorDataChanged(deps, {
      _event: {
        currentTarget: { dataset: { sectionId: "section-1" } },
        detail: {
          reason: "text",
          selectedLineId: lineId,
          lines: store.selectScene().sections[0].lines.map((line) =>
            line.id === lineId
              ? {
                  ...line,
                  sectionId: "section-1",
                  actions: {
                    ...line.actions,
                    dialogue: { content: [{ text }] },
                  },
                }
              : { ...line, sectionId: "section-1" },
          ),
        },
      },
    });
  const pageText = (lineId) =>
    store
      .selectScene()
      .sections[0].lines.find((line) => line.id === lineId)
      .actions.dialogue.content.map((item) => item.text)
      .join("");
  const savedText = (lineId) =>
    savedSection()
      .lines.items[lineId].actions.dialogue.content.map((item) => item.text)
      .join("");
  const view = () => sceneEditorStore.selectViewData({ state, i18n: EN_I18N });
  // Every graphics call after startup asked for graphics.
  const graphicsCallsAfterStartup = () => graphics.calls.slice(1);

  const open = async () => {
    const cleanup = handleBeforeMount(deps);
    await handleAfterMount(deps);
    return cleanup;
  };

  return {
    deps,
    store,
    editor,
    graphics,
    open,
    type,
    pageText,
    savedText,
    savedSection,
    view,
    graphicsCallsAfterStartup,
  };
};

describe("scene editor on a device where graphics cannot start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("stays open without the canvas, told once by the graphics service", async () => {
    const page = createPage();
    await page.open();

    const { appService } = page.deps;
    expect(page.graphics.calls).toEqual(["init"]);
    expect(appService.navigate).not.toHaveBeenCalled();
    // The graphics service's notice is the only message.
    expect(appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    expect(appService.showAlertWhenIdle.mock.calls[0][0].message).toMatch(
      /^This device cannot display the preview or the canvas editors/,
    );
    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(appService.showToast).not.toHaveBeenCalled();
    expect(appService.reportError).not.toHaveBeenCalled();
    expect(page.store.selectIsCanvasUnavailable()).toBe(true);
    expect(page.store.selectIsScenePageLoading()).toBe(false);
    expect(page.view()).toMatchObject({
      isCanvasUnavailable: true,
      canvasUnavailableMessage:
        "This device cannot show the preview. You can still edit the lines and their actions.",
      scene: { id: "scene-1", name: "Scene One" },
      selectedLineId: "line-1",
    });
    expect(page.view().sectionEditorItems).toHaveLength(1);
  });

  it("saves typed text, selects lines and undoes without graphics", async () => {
    const page = createPage();
    await page.open();

    await page.type("line-2", "Second line, typed");
    expect(page.pageText("line-2")).toBe("Second line, typed");
    await prepareSceneEditorNavigation(page.deps, { path: "/project/images" });
    expect(
      page.deps.projectService.syncSectionLinesSnapshot,
    ).toHaveBeenCalled();
    expect(page.savedText("line-2")).toBe("Second line, typed");

    handleSelectedLineChanged(page.deps, {
      _event: {
        currentTarget: { dataset: { sectionId: "section-1" } },
        detail: { lineId: "line-2", mode: "block" },
      },
    });
    expect(page.store.selectSelectedLineId()).toBe("line-2");
    await vi.advanceTimersByTimeAsync(2000);

    await page.type("line-1", "Hello there");
    handleUndoButtonClick(page.deps);
    expect(page.pageText("line-1")).toBe("Hello world");
    await vi.advanceTimersByTimeAsync(5000);

    const { appService } = page.deps;
    expect(page.graphicsCallsAfterStartup()).toEqual([]);
    expect(appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(appService.reportError).not.toHaveBeenCalled();
  });

  it("saves a line's actions without graphics", async () => {
    const page = createPage();
    await page.open();

    await handleCommandLineSubmit(page.deps, {
      _event: { detail: { background: { resourceId: "bg-2" } } },
    });
    // An overlay is saved, then shown on the canvas directly.
    await handleCommandLineSubmit(page.deps, {
      _event: { detail: { pushOverlay: { resourceId: "layout-1" } } },
    });
    await vi.advanceTimersByTimeAsync(2000);

    expect(page.deps.projectService.updateLineActions).toHaveBeenCalledWith({
      lineId: "line-1",
      data: { background: { resourceId: "bg-2" } },
      replace: false,
    });
    expect(page.savedSection().lines.items["line-1"].actions).toMatchObject({
      background: { resourceId: "bg-2" },
      pushOverlay: { resourceId: "layout-1" },
    });
    expect(page.store.selectSelectedLine().actions.background).toEqual({
      resourceId: "bg-2",
    });
    expect(page.graphicsCallsAfterStartup()).toEqual([]);
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    expect(page.deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("edits a background's position from the inspector without graphics", async () => {
    const page = createPage();
    await page.open();
    const event = (detail) => ({
      _event: { stopPropagation: vi.fn(), detail },
    });

    handleBackgroundTransformCustomize(
      page.deps,
      event({ background: { resourceId: "bg-1" } }),
    );
    handleBackgroundTransformEditorChange(
      page.deps,
      event({
        transient: true,
        transform: { x: 40, y: 20 },
        startTransform: { x: 0, y: 0 },
      }),
    );
    handleBackgroundTransformEditorChange(
      page.deps,
      event({ transform: { x: 80, y: 20 } }),
    );
    await vi.advanceTimersByTimeAsync(2000);

    expect(
      page.store.selectBackgroundTransformEditor().transform,
    ).toMatchObject({ x: 80, y: 20 });
    expect(page.graphicsCallsAfterStartup()).toEqual([]);
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    expect(page.deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("does nothing for the preview and the canvas download", async () => {
    const page = createPage();
    await page.open();

    handlePreviewClick(page.deps);
    handlePreviewShortcut(page.deps);
    handleMobileKeyboardToolbarActionClick(page.deps, {
      _event: { detail: { actionId: "preview" } },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(page.store.selectPreviewScene().previewVisible).toBe(false);

    await handleDownloadCanvasClick(page.deps);
    await handleHidePreviewScene(page.deps);
    await vi.advanceTimersByTimeAsync(2000);

    const { appService } = page.deps;
    expect(appService.saveFilePicker).not.toHaveBeenCalled();
    expect(appService.showToast).not.toHaveBeenCalled();
    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    expect(appService.reportError).not.toHaveBeenCalled();
    expect(page.graphicsCallsAfterStartup()).toEqual([]);
  });
});
