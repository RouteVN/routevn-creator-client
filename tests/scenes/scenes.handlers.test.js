import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
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
    },
    projectService: {
      ensureRepository: vi.fn(async () => {}),
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
});
