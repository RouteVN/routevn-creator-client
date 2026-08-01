import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleAnalyticsLinkClick,
  handleAnalyticsLinkKeyDown,
  handleBackButtonKeyDown,
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

describe("project page handlers", () => {
  it("loads resource counts before resolving per-scene text analytics", async () => {
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
        loadSceneOverviews: vi.fn(async () => ({
          "scene-1": {
            textStats: {
              lineCount: 2,
              wordCount: 45,
              characterCount: 180,
            },
          },
        })),
      },
      store: {
        setCurrentProject: vi.fn(),
        setProjectAnalytics: vi.fn(),
        setSceneTextAnalyticsError: vi.fn(),
        setSceneTextAnalyticsLoading: vi.fn(),
      },
      render: vi.fn(),
      i18n: EN_I18N,
    };

    await handleAfterMount(deps);

    expect(deps.projectService.loadSceneOverviews).toHaveBeenCalledWith({
      sceneIds: ["scene-1"],
    });
    expect(deps.store.setProjectAnalytics).toHaveBeenCalledTimes(2);
    expect(deps.store.setProjectAnalytics).toHaveBeenLastCalledWith({
      analytics: expect.objectContaining({
        scenes: [
          {
            id: "scene-1",
            name: "Opening",
            wordCount: 45,
            characterCount: 180,
          },
        ],
      }),
    });
    expect(deps.store.setSceneTextAnalyticsLoading).toHaveBeenCalledWith({
      isLoading: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
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
      },
      store: {
        selectEditIconFileId: vi.fn(() => "icon-1"),
        selectCurrentProject: vi.fn(() => ({
          name: "Project One",
          description: "Description",
          language: "en",
        })),
        setCurrentProject: vi.fn(),
        closeEditDialog: vi.fn(),
      },
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
  });
});
