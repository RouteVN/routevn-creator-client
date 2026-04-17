import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleSceneFormAction,
  handleWhiteboardItemDelete,
  handleWhiteboardPanChanged,
  handleWhiteboardZoomChanged,
} from "../../src/pages/scenes/scenes.handlers.js";

const originalWindow = globalThis.window;

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
    projectService: {
      ensureRepository: vi.fn(async () => {}),
      deleteSceneIfUnused: vi.fn(async () => ({
        deleted: true,
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
  });

  afterEach(() => {
    globalThis.window = originalWindow;
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
    expect(deps.render).toHaveBeenCalled();

    resolveOverviews({});
    await Promise.resolve();
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

  it("shows an error when scene creation is rejected", async () => {
    const deps = createDeps();
    deps.projectService.createSceneItem.mockResolvedValue({
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

    expect(deps.projectService.createSectionItem).not.toHaveBeenCalled();
    expect(deps.projectService.createLineItem).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "cannot create scene",
    });
    expect(deps.store.addWhiteboardItem).not.toHaveBeenCalled();
  });
});
