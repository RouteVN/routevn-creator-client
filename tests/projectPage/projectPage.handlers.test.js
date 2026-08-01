import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleAnalyticsLinkClick,
  handleAnalyticsLinkKeyDown,
  handleBackButtonKeyDown,
  handleBeforeMount,
  handleEditDialogIconClick,
  handleEditFormAction,
  handleProjectActionMenuClickItem,
} from "../../src/pages/project/project.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = () => ({
  appService: {
    getPayload: vi.fn(() => ({ p: "project-1" })),
    navigate: vi.fn(),
  },
});

const createKeyEvent = (key) => ({
  key,
  preventDefault: vi.fn(),
});

const withProjectAnalyticsRequestState = (store = {}) => {
  let requestId = 0;

  return {
    ...store,
    selectProjectAnalyticsRequestId: vi.fn(() => requestId),
    setProjectAnalyticsRequestId: vi.fn((payload) => {
      requestId = payload.requestId;
    }),
  };
};

describe("project page handlers", () => {
  it("loads resource counts before resolving per-scene text analytics", async () => {
    let resolveSceneTextStats;
    const sceneTextStatsPromise = new Promise((resolve) => {
      resolveSceneTextStats = resolve;
    });
    const repositoryState = {
      project: { resolution: { width: 1920, height: 1080 } },
      scenes: {
        items: {
          "scene-1": { id: "scene-1", name: "Opening", type: "scene" },
        },
        tree: [{ id: "scene-1" }],
      },
      images: {
        items: {
          "image-1": { id: "image-1", type: "image" },
        },
      },
    };
    const deps = {
      appService: {
        getCurrentProjectEntry: vi.fn(() => ({ source: "local" })),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getCurrentProjectInfo: vi.fn(async () => ({
          name: "Project One",
          language: "en",
        })),
        getRepositoryState: vi.fn(() => repositoryState),
        ensureSceneTextStats: vi.fn(() => sceneTextStatsPromise),
      },
      store: withProjectAnalyticsRequestState({
        setCurrentProject: vi.fn(),
        setProjectAnalytics: vi.fn(),
        selectCurrentProject: vi.fn(() => ({ language: "en" })),
      }),
      render: vi.fn(),
      i18n: EN_I18N,
    };

    const mountPromise = handleAfterMount(deps);

    await vi.waitFor(() => {
      expect(deps.projectService.ensureSceneTextStats).toHaveBeenCalledWith({
        sceneIds: ["scene-1"],
        language: "en",
      });
    });
    expect(deps.store.setProjectAnalytics).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);

    resolveSceneTextStats({
      "scene-1": {
        lineCount: 2,
        wordCount: 45,
        characterCount: 180,
        language: "en",
      },
    });
    await mountPromise;

    expect(deps.projectService.ensureSceneTextStats).toHaveBeenCalledWith({
      sceneIds: ["scene-1"],
      language: "en",
    });
    expect(deps.store.setProjectAnalytics).toHaveBeenCalledTimes(2);
    expect(deps.store.setProjectAnalytics).toHaveBeenLastCalledWith({
      analytics: expect.objectContaining({
        scenes: [
          {
            id: "scene-1",
            name: "Opening",
            textStats: {
              lineCount: 2,
              wordCount: 45,
              characterCount: 180,
              language: "en",
            },
          },
        ],
      }),
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("recalculates missing scene text analytics instead of completing with partial results", async () => {
    const repositoryState = {
      project: { resolution: { width: 1920, height: 1080 } },
      scenes: {
        items: {
          "scene-1": { id: "scene-1", name: "Opening", type: "scene" },
        },
        tree: [{ id: "scene-1" }],
      },
    };
    const ensureSceneTextStats = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary scene projection failure"))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        "scene-1": {
          lineCount: 2,
          wordCount: 45,
          characterCount: 180,
          language: "en",
        },
      });
    const deps = {
      appService: {
        getCurrentProjectEntry: vi.fn(() => ({ source: "local" })),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getCurrentProjectInfo: vi.fn(async () => ({
          name: "Project One",
          language: "en",
        })),
        getRepositoryState: vi.fn(() => repositoryState),
        ensureSceneTextStats,
      },
      store: withProjectAnalyticsRequestState({
        setCurrentProject: vi.fn(),
        setProjectAnalytics: vi.fn(),
        selectCurrentProject: vi.fn(() => ({ language: "en" })),
      }),
      render: vi.fn(),
      i18n: EN_I18N,
    };

    const mountPromise = handleAfterMount(deps);

    await vi.waitFor(
      () => {
        expect(ensureSceneTextStats).toHaveBeenCalledTimes(3);
      },
      { timeout: 1_500 },
    );
    await mountPromise;

    expect(deps.store.setProjectAnalytics).toHaveBeenLastCalledWith({
      analytics: expect.objectContaining({
        scenes: [
          expect.objectContaining({
            id: "scene-1",
            textStats: expect.objectContaining({ wordCount: 45 }),
          }),
        ],
      }),
    });
  });

  it("refreshes analytics from repository state subscriptions", async () => {
    let projectStateListener;
    const unsubscribe = vi.fn();
    const deps = {
      appService: {
        getPlatform: vi.fn(() => "web"),
        getCurrentProjectEntry: vi.fn(() => ({ source: "local" })),
      },
      projectService: {
        subscribeProjectState: vi.fn((listener) => {
          projectStateListener = listener;
          return unsubscribe;
        }),
        ensureSceneTextStats: vi.fn(async () => ({
          "scene-1": {
            lineCount: 2,
            wordCount: 45,
            characterCount: 180,
            language: "en",
          },
        })),
      },
      store: withProjectAnalyticsRequestState({
        setPlatform: vi.fn(),
        setCurrentProject: vi.fn(),
        setProjectAnalytics: vi.fn(),
        selectCurrentProject: vi.fn(() => ({ language: "en" })),
      }),
      render: vi.fn(),
    };

    const cleanup = handleBeforeMount(deps);
    projectStateListener({
      repositoryState: {
        images: {
          items: {
            "image-1": { id: "image-1", type: "image" },
            "image-2": { id: "image-2", type: "image" },
          },
        },
      },
    });

    expect(deps.projectService.subscribeProjectState).toHaveBeenCalledWith(
      expect.any(Function),
      { emitCurrent: false },
    );
    expect(deps.store.setProjectAnalytics).toHaveBeenCalledWith({
      analytics: expect.objectContaining({
        resourceGroups: expect.arrayContaining([
          expect.objectContaining({
            key: "assets",
            resources: expect.arrayContaining([{ key: "images", count: 2 }]),
          }),
        ]),
      }),
    });
    projectStateListener({
      repositoryState: {
        scenes: {
          items: {
            "scene-1": { id: "scene-1", name: "Opening", type: "scene" },
          },
          tree: [{ id: "scene-1" }],
        },
      },
    });

    await vi.waitFor(() => {
      expect(deps.projectService.ensureSceneTextStats).toHaveBeenCalledWith({
        sceneIds: ["scene-1"],
        language: "en",
      });
      expect(deps.store.setProjectAnalytics).toHaveBeenLastCalledWith({
        analytics: expect.objectContaining({
          scenes: [
            expect.objectContaining({
              id: "scene-1",
              textStats: expect.objectContaining({ language: "en" }),
            }),
          ],
        }),
      });
    });

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not let an older manual refresh overwrite newer repository analytics", async () => {
    let projectStateListener;
    let resolveManualSceneTextStats;
    let currentProject = { language: "en" };
    const manualSceneTextStatsPromise = new Promise((resolve) => {
      resolveManualSceneTextStats = resolve;
    });
    const initialRepositoryState = {
      project: { resolution: { width: 1920, height: 1080 } },
      images: {
        items: {
          "image-1": { id: "image-1", type: "image" },
        },
      },
      scenes: {
        items: {
          "scene-1": { id: "scene-1", name: "Older Scene", type: "scene" },
        },
        tree: [{ id: "scene-1" }],
      },
    };
    const newerRepositoryState = {
      ...initialRepositoryState,
      images: {
        items: {
          "image-1": { id: "image-1", type: "image" },
          "image-2": { id: "image-2", type: "image" },
        },
      },
      scenes: {
        items: {
          "scene-1": { id: "scene-1", name: "Newer Scene", type: "scene" },
        },
        tree: [{ id: "scene-1" }],
      },
    };
    const ensureSceneTextStats = vi
      .fn()
      .mockImplementationOnce(() => manualSceneTextStatsPromise)
      .mockResolvedValueOnce({
        "scene-1": {
          lineCount: 2,
          wordCount: 22,
          characterCount: 88,
          language: "en",
        },
      });
    const deps = {
      appService: {
        getPlatform: vi.fn(() => "web"),
        getCurrentProjectEntry: vi.fn(() => ({ source: "local" })),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getCurrentProjectInfo: vi.fn(async () => ({
          name: "Project One",
          language: "en",
        })),
        getRepositoryState: vi.fn(() => initialRepositoryState),
        subscribeProjectState: vi.fn((listener) => {
          projectStateListener = listener;
          return vi.fn();
        }),
        ensureSceneTextStats,
      },
      store: withProjectAnalyticsRequestState({
        setPlatform: vi.fn(),
        setCurrentProject: vi.fn(({ project }) => {
          currentProject = { ...currentProject, ...project };
        }),
        selectCurrentProject: vi.fn(() => currentProject),
        setProjectAnalytics: vi.fn(),
      }),
      render: vi.fn(),
      i18n: EN_I18N,
    };

    const cleanup = handleBeforeMount(deps);
    const mountPromise = handleAfterMount(deps);
    await vi.waitFor(() => {
      expect(ensureSceneTextStats).toHaveBeenCalledTimes(1);
    });

    projectStateListener({ repositoryState: newerRepositoryState });
    await vi.waitFor(() => {
      expect(ensureSceneTextStats).toHaveBeenCalledTimes(2);
      expect(deps.store.setProjectAnalytics).toHaveBeenLastCalledWith({
        analytics: expect.objectContaining({
          resourceGroups: expect.arrayContaining([
            expect.objectContaining({
              key: "assets",
              resources: expect.arrayContaining([{ key: "images", count: 2 }]),
            }),
          ]),
          scenes: [
            expect.objectContaining({
              name: "Newer Scene",
              textStats: expect.objectContaining({ wordCount: 22 }),
            }),
          ],
        }),
      });
    });
    const renderCountAfterNewerRefresh = deps.render.mock.calls.length;

    resolveManualSceneTextStats({
      "scene-1": {
        lineCount: 1,
        wordCount: 11,
        characterCount: 44,
        language: "en",
      },
    });
    await mountPromise;

    expect(deps.render).toHaveBeenCalledTimes(renderCountAfterNewerRefresh);
    expect(deps.store.setProjectAnalytics).toHaveBeenLastCalledWith({
      analytics: expect.objectContaining({
        resourceGroups: expect.arrayContaining([
          expect.objectContaining({
            key: "assets",
            resources: expect.arrayContaining([{ key: "images", count: 2 }]),
          }),
        ]),
        scenes: [
          expect.objectContaining({
            name: "Newer Scene",
            textStats: expect.objectContaining({ wordCount: 22 }),
          }),
        ],
      }),
    });
    cleanup();
  });

  it("requires project icon sources to be at least 512px", async () => {
    const deps = {
      appService: {
        pickFiles: vi.fn(async () => undefined),
      },
      store: {},
      render: vi.fn(),
      i18n: EN_I18N,
    };

    await handleEditDialogIconClick(deps);

    expect(deps.appService.pickFiles).toHaveBeenCalledWith({
      accept: "image/*",
      multiple: false,
      validations: [
        {
          type: "image-min-size",
          minWidth: 512,
          minHeight: 512,
        },
      ],
    });
  });

  it("activates Back to Projects from Enter and Space", () => {
    const deps = createDeps();
    const enterEvent = createKeyEvent("Enter");
    const spaceEvent = createKeyEvent(" ");

    handleBackButtonKeyDown(deps, {
      _event: enterEvent,
    });
    handleBackButtonKeyDown(deps, {
      _event: spaceEvent,
    });

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(spaceEvent.preventDefault).toHaveBeenCalledTimes(1);
    const expectedOptions = {
      historyMode: "replace",
      historyState: { preserveProjectsEntryOnProjectOpen: true },
    };
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(
      1,
      "/projects",
      undefined,
      expectedOptions,
    );
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(
      2,
      "/projects",
      undefined,
      expectedOptions,
    );
  });

  it("ignores unrelated Back to Projects key presses", () => {
    const deps = createDeps();
    const event = createKeyEvent("ArrowRight");

    handleBackButtonKeyDown(deps, {
      _event: event,
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("opens resource analytics in their resource pages", () => {
    const deps = createDeps();

    handleAnalyticsLinkClick(deps, {
      _event: {
        currentTarget: {
          dataset: { resourceKey: "images" },
        },
      },
    });

    expect(deps.appService.navigate).toHaveBeenCalledWith("/project/images", {
      p: "project-1",
    });
  });

  it("opens character and scene analytics in their editors", () => {
    const deps = createDeps();

    handleAnalyticsLinkClick(deps, {
      _event: {
        currentTarget: {
          dataset: { characterId: "character-1" },
        },
      },
    });
    handleAnalyticsLinkClick(deps, {
      _event: {
        currentTarget: {
          dataset: { sceneId: "scene-1" },
        },
      },
    });

    expect(deps.appService.navigate).toHaveBeenNthCalledWith(
      1,
      "/project/character-sprites",
      {
        p: "project-1",
        characterId: "character-1",
      },
    );
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(
      2,
      "/project/scene-editor",
      {
        p: "project-1",
        s: "scene-1",
      },
    );
  });

  it("supports keyboard activation for analytics links", () => {
    const deps = createDeps();
    const enterEvent = {
      ...createKeyEvent("Enter"),
      currentTarget: {
        dataset: { resourceKey: "scenes" },
      },
    };
    const unrelatedEvent = {
      ...createKeyEvent("ArrowRight"),
      currentTarget: {
        dataset: { resourceKey: "images" },
      },
    };

    handleAnalyticsLinkKeyDown(deps, { _event: enterEvent });
    handleAnalyticsLinkKeyDown(deps, { _event: unrelatedEvent });

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(unrelatedEvent.preventDefault).not.toHaveBeenCalled();
    expect(deps.appService.navigate).toHaveBeenCalledTimes(1);
    expect(deps.appService.navigate).toHaveBeenCalledWith("/project/scenes", {
      p: "project-1",
    });
  });

  it("exports local iOS projects from the action menu", async () => {
    const deps = {
      appService: {
        getPlatform: vi.fn(() => "ios"),
        getCurrentProjectEntry: vi.fn(() => ({
          id: "project-1",
          source: "local",
        })),
        openFolderPicker: vi.fn(() =>
          Promise.resolve({ uri: "file:///exports" }),
        ),
        showAlert: vi.fn(),
      },
      projectService: {
        exportProjectFolder: vi.fn(() =>
          Promise.resolve({ name: "Project Export" }),
        ),
      },
      store: {
        closeProjectActionMenu: vi.fn(),
        setProjectExportLoading: vi.fn(),
      },
      render: vi.fn(),
      i18n: EN_I18N,
    };

    await handleProjectActionMenuClickItem(deps, {
      _event: {
        detail: {
          item: { value: "export" },
        },
      },
    });

    expect(deps.projectService.exportProjectFolder).toHaveBeenCalledWith({
      projectId: "project-1",
      destinationUri: "file:///exports",
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: EN_I18N.projectPage.exportCompleteTitle,
      }),
    );
  });

  it("persists project language from the edit form", async () => {
    const nextProjectInfo = {
      name: "Project One Updated",
      description: "Updated description",
      language: "zh-Hans",
      iconFileId: "icon-1",
    };
    let currentProjectInfo = {
      name: "Project One",
      description: "Description",
      language: "en",
    };
    const deps = {
      appService: {
        getCurrentProjectEntry: vi.fn(() => ({
          id: "project-1",
          source: "local",
        })),
        showAlert: vi.fn(),
        updateCachedProject: vi.fn(),
      },
      projectService: {
        updateCurrentProjectInfo: vi.fn(async () => nextProjectInfo),
        getRepositoryState: vi.fn(() => ({
          scenes: {
            items: {
              "scene-1": { id: "scene-1", name: "Opening", type: "scene" },
            },
            tree: [{ id: "scene-1" }],
          },
        })),
        ensureSceneTextStats: vi.fn(async () => ({
          "scene-1": {
            lineCount: 2,
            wordCount: 45,
            characterCount: 180,
            language: "zh-Hans",
          },
        })),
      },
      store: withProjectAnalyticsRequestState({
        selectEditIconFileId: vi.fn(() => "icon-1"),
        selectCurrentProject: vi.fn(() => currentProjectInfo),
        setCurrentProject: vi.fn(({ project }) => {
          currentProjectInfo = project;
        }),
        closeEditDialog: vi.fn(),
        setProjectAnalytics: vi.fn(),
      }),
      subject: {
        dispatch: vi.fn(),
      },
      render: vi.fn(),
      i18n: EN_I18N,
    };

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Project One Updated",
            description: "Updated description",
            language: "zh-Hans",
          },
        },
      },
    });

    expect(deps.projectService.updateCurrentProjectInfo).toHaveBeenCalledWith({
      name: "Project One Updated",
      description: "Updated description",
      language: "zh-Hans",
      iconFileId: "icon-1",
    });
    expect(deps.appService.updateCachedProject).toHaveBeenCalledWith(
      "project-1",
      nextProjectInfo,
    );
    expect(deps.store.setCurrentProject).toHaveBeenCalledWith({
      project: {
        name: "Project One Updated",
        description: "Updated description",
        language: "zh-Hans",
        iconFileId: "icon-1",
      },
    });
    expect(deps.projectService.ensureSceneTextStats).toHaveBeenCalledWith({
      sceneIds: ["scene-1"],
      language: "zh-Hans",
    });
    expect(deps.store.setProjectAnalytics).toHaveBeenLastCalledWith({
      analytics: expect.objectContaining({
        scenes: [
          expect.objectContaining({
            textStats: expect.objectContaining({ language: "zh-Hans" }),
          }),
        ],
      }),
    });
  });
});
