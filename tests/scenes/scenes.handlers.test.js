import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleFileExplorerSelectionChanged,
  handleMobileFileExplorerClose,
  handleMobileFileExplorerOpen,
  handleSceneFormAction,
  handleWhiteboardItemDelete,
  handleWhiteboardItemDoubleClick,
  handleWhiteboardPanChanged,
  handleWhiteboardZoomChanged,
} from "../../src/pages/scenes/scenes.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const originalWindow = globalThis.window;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalRequestIdleCallback = globalThis.requestIdleCallback;
const originalCancelIdleCallback = globalThis.cancelIdleCallback;

const createDeps = ({ userConfig = {}, projectId = "project-1" } = {}) => {
  const getUserConfig = vi.fn((key) => userConfig[key]);
  let sceneOverviewRequestId = 0;

  return {
    appService: {
      getPayload: vi.fn(() => ({ p: projectId })),
      getUserConfig,
      setUserConfig: vi.fn(),
      navigate: vi.fn(),
      showAlert: vi.fn(),
    },
    i18n: EN_I18N,
    projectService: {
      ensureRepository: vi.fn(async () => {}),
      deleteSceneIfUnused: vi.fn(async () => ({
        deleted: true,
      })),
      createSceneWithInitialContent: vi.fn(async () => ({
        valid: true,
        sceneId: "scene-2",
        sectionId: "section-1",
        lineId: "line-1",
      })),
      createSceneItem: vi.fn(async () => "scene-2"),
      createSectionItem: vi.fn(async () => "section-1"),
      createLineItem: vi.fn(async () => "line-1"),
      getRepositoryState: vi.fn(() => ({
        scenes: {
          tree: [],
          items: {
            "scene-1": {
              id: "scene-1",
              name: "Scene 1",
              position: {
                x: 0,
                y: 0,
              },
            },
          },
        },
        layouts: {
          tree: [],
          items: {},
        },
      })),
      getDomainState: vi.fn(() => ({
        scenes: {
          "scene-1": {
            id: "scene-1",
            name: "Scene 1",
            position: {
              x: 0,
              y: 0,
            },
          },
        },
        story: {
          sceneOrder: ["scene-1"],
        },
      })),
      loadSceneOverviews: vi.fn(async () => ({})),
    },
    store: {
      selectWhiteboardItems: vi.fn(() => []),
      setItems: vi.fn(),
      setLayouts: vi.fn(),
      setSceneOverviews: vi.fn(),
      selectSceneOverviewRequestId: vi.fn(() => sceneOverviewRequestId),
      setSceneOverviewRequestId: vi.fn(({ requestId }) => {
        sceneOverviewRequestId = requestId;
      }),
      setWhiteboardItems: vi.fn(),
      hideMapAddHint: vi.fn(),
      setSelectedItemId: vi.fn(),
      selectSelectedItemId: vi.fn(() => undefined),
      selectSelectedFolderId: vi.fn(() => undefined),
      openMobileFileExplorer: vi.fn(),
      closeMobileFileExplorer: vi.fn(),
      selectIsMobileFileExplorerOpen: vi.fn(() => false),
      selectShowSceneForm: vi.fn(() => true),
      resetSceneForm: vi.fn(),
      addWhiteboardItem: vi.fn(),
      selectSceneWhiteboardPosition: vi.fn(() => ({
        x: 0,
        y: 0,
      })),
      getState: vi.fn(() => ({
        showSceneForm: true,
      })),
    },
    refs: {
      whiteboard: {
        ensureItemVisible: vi.fn(),
        transformedHandlers: {
          handleInitialZoomAndPanSetup: vi.fn(),
        },
      },
      fileexplorer: {
        selectItem: vi.fn(),
      },
    },
    render: vi.fn(),
  };
};

describe("scenes.handlers config keys", () => {
  beforeEach(() => {
    globalThis.window = {
      innerWidth: 1200,
      innerHeight: 800,
    };
    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    globalThis.requestIdleCallback = undefined;
    globalThis.cancelIdleCallback = undefined;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.requestIdleCallback = originalRequestIdleCallback;
    globalThis.cancelIdleCallback = originalCancelIdleCallback;
  });

  it("loads the scenes viewport from project-scoped userConfig keys", async () => {
    const deps = createDeps({
      userConfig: {
        "scenesMap.hideAddSceneHint": false,
        "scenesMap.viewportByProject.project-1.zoomLevel": 1.25,
        "scenesMap.viewportByProject.project-1.panX": 48,
        "scenesMap.viewportByProject.project-1.panY": 72,
      },
    });

    await handleAfterMount(deps);

    expect(deps.appService.getUserConfig).toHaveBeenCalledWith(
      "scenesMap.viewportByProject.project-1.zoomLevel",
    );
    expect(deps.appService.getUserConfig).toHaveBeenCalledWith(
      "scenesMap.viewportByProject.project-1.panX",
    );
    expect(deps.appService.getUserConfig).toHaveBeenCalledWith(
      "scenesMap.viewportByProject.project-1.panY",
    );
    expect(deps.appService.getUserConfig).not.toHaveBeenCalledWith(
      "scenesMap.zoomLevel",
    );
    expect(
      deps.refs.whiteboard.transformedHandlers.handleInitialZoomAndPanSetup,
    ).toHaveBeenCalledWith({
      zoomLevel: 1.25,
      panX: 48,
      panY: 72,
    });
  });

  it("writes zoom and pan changes to project-scoped viewport keys", () => {
    const deps = createDeps();

    handleWhiteboardZoomChanged(deps, {
      _event: {
        detail: {
          zoomLevel: 1.4,
        },
      },
    });

    handleWhiteboardPanChanged(deps, {
      _event: {
        detail: {
          panX: 120,
          panY: 160,
        },
      },
    });

    expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
      "scenesMap.viewportByProject.project-1.zoomLevel",
      1.4,
    );
    expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
      "scenesMap.viewportByProject.project-1.panX",
      120,
    );
    expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
      "scenesMap.viewportByProject.project-1.panY",
      160,
    );
    expect(deps.appService.setUserConfig).toHaveBeenCalledTimes(3);
  });

  it("renders base scene items before scene overviews finish loading", async () => {
    let resolveOverviews;
    const loadSceneOverviews = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveOverviews = resolve;
        }),
    );
    const deps = createDeps();
    deps.projectService.loadSceneOverviews = loadSceneOverviews;

    await handleAfterMount(deps);

    expect(deps.store.setItems).toHaveBeenCalled();
    expect(deps.store.setLayouts).toHaveBeenCalled();
    expect(deps.store.setWhiteboardItems).toHaveBeenCalledWith({
      items: [
        {
          id: "scene-1",
          isInit: false,
          name: "Scene 1",
          transitions: [],
          x: 0,
          y: 0,
        },
      ],
    });
    expect(deps.render).toHaveBeenCalledTimes(1);

    resolveOverviews({});
    await Promise.resolve();
  });

  it("waits for idle time before loading scene overviews", async () => {
    let idleCallback;
    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallback = callback;
      return 1;
    });
    globalThis.cancelIdleCallback = vi.fn();

    const deps = createDeps();

    await handleAfterMount(deps);

    expect(deps.projectService.loadSceneOverviews).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);

    idleCallback();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.projectService.loadSceneOverviews).toHaveBeenCalledWith({
      sceneIds: ["scene-1"],
    });
  });

  it("animates scene map centering from file explorer scene selection", () => {
    const deps = createDeps();

    handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "scene-1",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "scene-1",
    });
    expect(deps.refs.whiteboard.ensureItemVisible).toHaveBeenCalledWith({
      itemId: "scene-1",
      behavior: "smooth",
      durationMs: 160,
    });
    expect(deps.render).toHaveBeenCalled();
  });

  it("closes the mobile file explorer after selecting a scene", () => {
    const deps = createDeps();
    deps.store.selectIsMobileFileExplorerOpen.mockReturnValue(true);

    handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "scene-1",
        },
      },
    });

    expect(deps.store.closeMobileFileExplorer).toHaveBeenCalledTimes(1);
    expect(deps.refs.whiteboard.ensureItemVisible).toHaveBeenCalledWith({
      itemId: "scene-1",
      behavior: "smooth",
      durationMs: 160,
    });
  });

  it("opens and closes the mobile file explorer", () => {
    const deps = createDeps();
    deps.store.selectSelectedItemId.mockReturnValue("scene-1");

    handleMobileFileExplorerOpen(deps);

    expect(deps.store.openMobileFileExplorer).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.refs.fileexplorer.selectItem).toHaveBeenCalledWith({
      itemId: "scene-1",
    });

    handleMobileFileExplorerClose(deps);

    expect(deps.store.closeMobileFileExplorer).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("opens the scene editor from a whiteboard item double click", () => {
    const deps = createDeps();

    handleWhiteboardItemDoubleClick(deps, {
      _event: {
        detail: {
          itemId: "scene-1",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "scene-1",
    });
    expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
      "scenesMap.selectedSceneIdByProject.project-1",
      "scene-1",
    );
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/scene-editor",
      {
        p: "project-1",
        s: "scene-1",
      },
    );
  });

  it("blocks whiteboard scene delete when another scene points to it", async () => {
    const deps = createDeps();
    deps.projectService.deleteSceneIfUnused.mockResolvedValue({
      deleted: false,
      usage: {
        isUsed: true,
      },
    });
    deps.store.selectSelectedItemId.mockReturnValue("scene-1");

    await handleWhiteboardItemDelete(deps, {
      _event: {
        detail: {
          itemId: "scene-1",
        },
      },
    });

    expect(deps.projectService.deleteSceneIfUnused).toHaveBeenCalledWith({
      sceneId: "scene-1",
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Cannot delete resource, it is currently in use.",
    });
    expect(deps.store.setSelectedItemId).not.toHaveBeenCalled();
  });

  it("creates scene, first section, and first line as one project command batch", async () => {
    const deps = createDeps({
      userConfig: {
        "sceneEditor.recentSceneIdsByProject": {
          "project-1": ["scene-1"],
        },
      },
    });

    await handleSceneFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Scene 2",
            folderId: "",
          },
        },
      },
    });

    expect(
      deps.projectService.createSceneWithInitialContent,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.projectService.createSceneWithInitialContent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: expect.stringMatching(/^scene-/),
        parentId: null,
        position: "last",
        data: {
          name: "Scene 2",
          position: {
            x: 0,
            y: 0,
          },
        },
        sectionId: expect.any(String),
        sectionData: {
          name: "Section 1",
        },
        lineId: expect.any(String),
        lineData: {
          actions: {
            dialogue: {
              mode: "adv",
              content: [{ text: "" }],
            },
          },
        },
      }),
    );
    expect(deps.projectService.createSceneItem).not.toHaveBeenCalled();
    expect(deps.projectService.createSectionItem).not.toHaveBeenCalled();
    expect(deps.projectService.createLineItem).not.toHaveBeenCalled();
    expect(deps.store.addWhiteboardItem).toHaveBeenCalledWith({
      newItem: {
        id: expect.stringMatching(/^scene-/),
        name: "Scene 2",
        x: 0,
        y: 0,
      },
    });
    const createdSceneId =
      deps.projectService.createSceneWithInitialContent.mock.calls[0][0]
        .sceneId;
    expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
      "sceneEditor.recentSceneIdsByProject",
      {
        "project-1": [createdSceneId, "scene-1"],
      },
    );
  });

  it("shows an error when scene creation is rejected", async () => {
    const deps = createDeps();
    deps.projectService.createSceneWithInitialContent.mockResolvedValue({
      valid: false,
      error: {
        message: "cannot create scene",
      },
    });

    await handleSceneFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Scene 2",
            folderId: "",
          },
        },
      },
    });

    expect(deps.projectService.createSceneItem).not.toHaveBeenCalled();
    expect(deps.projectService.createSectionItem).not.toHaveBeenCalled();
    expect(deps.projectService.createLineItem).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "cannot create scene",
    });
    expect(deps.store.addWhiteboardItem).not.toHaveBeenCalled();
    expect(deps.appService.setUserConfig).not.toHaveBeenCalledWith(
      "sceneEditor.recentSceneIdsByProject",
      expect.anything(),
    );
  });
});
