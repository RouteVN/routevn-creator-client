import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  handleAppVersionClick,
  handleAppVersionMenuClickItem,
  handleAppVersionMenuClose,
  handleAppearanceDialogClose,
  handleAppearanceFormAction,
  handleCreateButtonClick,
  handleCreateDialogSubmit,
  handleDeleteConfirmationInput,
  handleDeleteDialogConfirm,
  handleImportSourceMenuClickItem,
  handleImportSourceMenuClose,
  handleLanguageDialogClose,
  handleLanguageFormAction,
  handleMobileActionMenuClickItem,
  handleMobileCreateMenuButtonClick,
  handleOpenButtonClick,
  handleUrlImportDialogClose,
  handleUrlImportFormAction,
  handleAfterMount,
  handleBeforeMount,
  handleCloudProjectLongPress,
  handleProjectContextMenu,
  handleProjectLongPress,
  handleProjectsClick,
} from "../../src/pages/projects/projects.handlers.js";

const EN_I18N_URL = new URL("../../src/i18n/en.yaml", import.meta.url);
const EN_I18N = yaml.load(readFileSync(EN_I18N_URL, "utf8"));

const createDeps = ({
  ensureProjectCompatibleById = vi.fn(async () => {}),
  ensureProjectCompatibleByPath = vi.fn(async () => {}),
  platform = "tauri",
} = {}) => {
  const progressDialog = {
    update: vi.fn(),
    close: vi.fn(),
    waitForPaint: vi.fn(async () => {}),
  };
  const appService = {
    getPlatform: vi.fn(() => platform),
    getAppVersion: vi.fn(() => "1.0.0"),
    openFolderPicker: vi.fn(),
    openArchivePicker: vi.fn(),
    openExistingProject: vi.fn(),
    importProjectFromArchive: vi.fn(),
    importProjectFromUrl: vi.fn(),
    loadAllProjects: vi.fn(async () => []),
    getCachedProjects: vi.fn(() => undefined),
    createNewProject: vi.fn(async () => ({
      id: "project-2",
      name: "New Project",
      projectPath: "/projects/new-project",
    })),
    showAlert: vi.fn(),
    triggerTestCrash: vi.fn(async () => true),
    showProgressDialog: vi.fn(() => progressDialog),
    showFormDialog: vi.fn(),
    showToast: vi.fn(),
    deleteProject: vi.fn(async () => ({ deleted: true })),
    removeProjectEntry: vi.fn(async () => {}),
    removeProjectEntryByPath: vi.fn(async () => {}),
    setCurrentProjectEntry: vi.fn(),
    getUserConfig: vi.fn(),
    setUserConfig: vi.fn(),
    getTheme: vi.fn(() => "dark"),
    setTheme: vi.fn((theme) => theme),
    navigate: vi.fn(),
  };

  return {
    appService,
    projectService: {
      ensureProjectCompatibleById,
      ensureProjectCompatibleByPath,
      releaseProjectRuntime: vi.fn(async () => {}),
    },
    store: {
      getState: vi.fn(() => ({
        projects: [
          {
            id: "project-1",
            name: "Project One",
          },
        ],
      })),
      setProjects: vi.fn(),
      setProjectsLoading: vi.fn(),
      setUiConfig: vi.fn(),
      setPlatform: vi.fn(),
      setAppVersion: vi.fn(),
      setAuthUser: vi.fn(),
      setCloudProjects: vi.fn(),
      selectShowCloudProjects: vi.fn(() => false),
      selectProjects: vi.fn(() => [
        {
          id: "project-1",
          name: "Project One",
          projectPath: "/projects/project-one",
        },
      ]),
      openDropdownMenu: vi.fn(),
      openMobileActionMenu: vi.fn(),
      closeMobileActionMenu: vi.fn(),
      openAppVersionMenu: vi.fn(),
      closeAppVersionMenu: vi.fn(),
      selectIsAppVersionMenuOpen: vi.fn(() => true),
      openImportSourceMenu: vi.fn(),
      closeImportSourceMenu: vi.fn(),
      selectIsImportSourceMenuOpen: vi.fn(() => true),
      openUrlImportDialog: vi.fn(),
      closeUrlImportDialog: vi.fn(),
      selectIsUrlImportDialogOpen: vi.fn(() => true),
      openLanguageDialog: vi.fn(),
      closeLanguageDialog: vi.fn(),
      selectIsLanguageDialogOpen: vi.fn(() => true),
      setCurrentLocale: vi.fn(),
      openAppearanceDialog: vi.fn(),
      closeAppearanceDialog: vi.fn(),
      selectIsAppearanceDialogOpen: vi.fn(() => true),
      setCurrentTheme: vi.fn(),
      openCreateDialog: vi.fn(),
      closeCreateDialog: vi.fn(),
      selectIsCreateDialogOpen: vi.fn(() => true),
      addProject: vi.fn(),
      selectDeleteDialogProjectId: vi.fn(() => ""),
      selectDeleteDialogProjectPath: vi.fn(() => ""),
      selectDeleteDialogConfirmationText: vi.fn(() => "Delete"),
      setDeleteDialogConfirmationText: vi.fn(),
      closeDeleteDialog: vi.fn(),
      removeProject: vi.fn(),
    },
    updaterService: {
      checkForUpdates: vi.fn(async () => {}),
    },
    apiService: {},
    i18n: EN_I18N,
    locale: {
      available: vi.fn(() => ["en", "ja", "zh-hans"]),
      current: vi.fn(() => "en"),
      set: vi.fn(async () => {}),
    },
    render: vi.fn(),
  };
};

const createPayload = (projectId = "project-1", projectPath = undefined) => {
  return {
    _event: {
      currentTarget: {
        dataset: {
          projectId,
          projectPath: projectPath
            ? encodeURIComponent(projectPath)
            : undefined,
        },
      },
    },
  };
};

describe("projects lifecycle", () => {
  it("hydrates the first render from the in-memory project cache", () => {
    const deps = createDeps();
    const projects = [
      {
        id: "project-1",
        name: "Project One",
      },
    ];
    deps.appService.getCachedProjects.mockReturnValue(projects);

    handleBeforeMount(deps);

    expect(deps.store.setProjects).toHaveBeenCalledWith({ projects });
  });

  it("keeps loading active when the project cache is not initialized", () => {
    const deps = createDeps();

    handleBeforeMount(deps);

    expect(deps.store.setProjects).not.toHaveBeenCalled();
  });

  it("settles loading and shows feedback when local projects fail to load", async () => {
    const deps = createDeps();
    deps.appService.loadAllProjects.mockRejectedValueOnce(
      new Error("storage unavailable"),
    );

    await handleAfterMount(deps);

    expect(deps.store.setProjectsLoading).toHaveBeenCalledWith({
      loading: false,
    });
    expect(deps.store.setProjects).not.toHaveBeenCalled();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Failed to load projects. Please try again.",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });
});

describe("projects.handleProjectsClick", () => {
  it("shows an alert dialog for incompatible project versions", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        throw new Error(
          "You're trying to open an incompatible project with version 1 using RouteVN Creator project format 2. For assistance, please reach out to RouteVN staff for support.",
        );
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Incompatible Project",
      message:
        "You're trying to open an incompatible project with version 1 using RouteVN Creator project format 2. For assistance, please reach out to RouteVN staff for support.\nMake sure you're using the latest version of RouteVN Creator.",
      status: "error",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("shows an alert dialog for client store schema reset errors", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        throw new Error(
          "Client store requires reset for schema version 2; runtime expects 6",
        );
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Incompatible Project",
      message:
        "Unsupported project version. Make sure the project was created with RouteVN Creator v1 or later. Contact RouteVN for support on migrating the old project.\nMake sure you're using the latest version of RouteVN Creator.",
      status: "error",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("shows an alert dialog for stored projection gap incompatibility", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        const error = new Error(
          "This project contains committed changes that this RouteVN Creator build cannot project safely. Update RouteVN Creator before opening the project. Last incompatible command 'scene.update' uses schemaVersion 3, while this client supports 2. schemaVersion 3 is newer than supported 2",
        );
        error.code = "project_projection_gap_incompatible";
        throw error;
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Incompatible Project",
      message:
        "This project contains committed changes that this RouteVN Creator build cannot project safely. Update RouteVN Creator before opening the project. Last incompatible command 'scene.update' uses schemaVersion 3, while this client supports 2. schemaVersion 3 is newer than supported 2",
      status: "error",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("shows an alert dialog for unsupported project store formats", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        const error = new Error("unsupported bootstrap history");
        error.code = "project_store_format_unsupported";
        throw error;
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Incompatible Project",
      message:
        "Unsupported project store format. This RouteVN Creator build only supports the current project storage layout and will not repair older local stores automatically.\nMake sure you're using the latest version of RouteVN Creator.",
      status: "error",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("shows a generic alert for other open failures", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        throw new Error("Failed to open project.");
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Failed to open project. An unexpected error occurred while preparing the project.\nMake sure you're using the latest version of RouteVN Creator.",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("shows a clearer message for missing project resolution errors", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        throw new Error(
          "Project resolution is required. Missing width and height.",
        );
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Project is missing required resolution settings.\nMake sure you're using the latest version of RouteVN Creator.",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("shows project validation details and support guidance", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        const error = new Error(
          "payload.sectionId must reference an existing section",
        );
        error.code = "validation_failed";
        throw error;
      }),
    });
    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nPlease make sure you're using the latest version of RouteVN Creator. If the problem continues, please reach out to RouteVN for support.\n\nTechnical details: payload.sectionId must reference an existing section",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("suggests updating RouteVN Creator for generic model reference errors", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        throw new Error(
          "character.spriteGroups[0].tags[0] must reference an existing tag in scope 'characterSprites:g2PMeSgDVtoZ'",
        );
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Failed to open project. character.spriteGroups[0].tags[0] must reference an existing tag in scope 'characterSprites:g2PMeSgDVtoZ'.\nMake sure you're using the latest version of RouteVN Creator.",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("shows a clearer message for missing project database file errors", async () => {
    const deps = createDeps({
      ensureProjectCompatibleById: vi.fn(async () => {
        throw new Error(
          "error returned from database: (code: 14) unable to open database file",
        );
      }),
    });

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Failed to open the project database. Make sure the project folder still exists and RouteVN can access it.",
    });
  });

  it("opens compatible projects normally", async () => {
    const deps = createDeps();

    await handleProjectsClick(deps, createPayload());

    expect(deps.appService.setCurrentProjectEntry).toHaveBeenCalledWith({
      id: "project-1",
      name: "Project One",
      projectPath: "/projects/project-one",
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project",
      {
        p: "project-1",
      },
      {
        historyMode: "replace",
      },
    );
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("opens the selected local project by path when project ids match", async () => {
    const deps = createDeps();
    deps.store.selectProjects.mockReturnValue([
      {
        id: "shared-project-id",
        name: "Project One",
        projectPath: "/projects/project-one",
      },
      {
        id: "shared-project-id",
        name: "Project Two",
        projectPath: "/projects/project-two",
      },
    ]);

    await handleProjectsClick(
      deps,
      createPayload("shared-project-id", "/projects/project-two"),
    );

    expect(
      deps.projectService.ensureProjectCompatibleByPath,
    ).toHaveBeenCalledWith("/projects/project-two", "shared-project-id");
    expect(deps.appService.setCurrentProjectEntry).toHaveBeenCalledWith({
      id: "shared-project-id",
      name: "Project Two",
      projectPath: "/projects/project-two",
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project",
      {
        p: "shared-project-id",
        lp: "/projects/project-two",
      },
      {
        historyMode: "replace",
      },
    );
  });
});

describe("projects create dialog", () => {
  it("opens the page-owned create dialog", () => {
    const deps = createDeps();

    handleCreateButtonClick(deps);

    expect(deps.store.openCreateDialog).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();
  });

  it("creates a project from the sticky form submit event", async () => {
    const deps = createDeps();

    await handleCreateDialogSubmit(deps, {
      _event: {
        detail: {
          values: {
            name: "New Project",
            description: "",
            language: "ja",
            iconFile: undefined,
            template: "default",
            resolution: "1920x1080",
            resolutionWidth: 1920,
            resolutionHeight: 1080,
            projectPath: "/projects/new-project",
          },
        },
      },
    });

    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      title: "Creating Project…",
      message: "Please wait while your project is being created.",
      progress: {},
    });
    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.waitForPaint).toHaveBeenCalledOnce();
    expect(deps.store.closeCreateDialog).toHaveBeenCalledOnce();
    expect(
      deps.store.closeCreateDialog.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.appService.showProgressDialog.mock.invocationCallOrder[0],
    );
    expect(deps.appService.createNewProject).toHaveBeenCalledWith({
      name: "New Project",
      description: "",
      language: "ja",
      iconFile: undefined,
      projectPath: "/projects/new-project",
      template: "default",
      projectResolution: {
        width: 1920,
        height: 1080,
      },
    });
    expect(deps.store.addProject).toHaveBeenCalledWith({
      project: {
        id: "project-2",
        name: "New Project",
        projectPath: "/projects/new-project",
      },
    });
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(
      deps.appService.showProgressDialog.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.appService.createNewProject.mock.invocationCallOrder[0],
    );
  });

  it("crashes the app instead of creating a test crash project", async () => {
    const deps = createDeps({ platform: "android" });

    await handleCreateDialogSubmit(deps, {
      _event: {
        detail: {
          values: { name: "ROUTEVN_TEST_PANIC_CRASH", resolution: "1920x1080" },
        },
      },
    });

    expect(deps.appService.triggerTestCrash).toHaveBeenCalledWith("panic");
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.createNewProject).not.toHaveBeenCalled();
  });

  it("creates a test crash project normally where the platform cannot crash", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.triggerTestCrash.mockResolvedValue(false);

    await handleCreateDialogSubmit(deps, {
      _event: {
        detail: {
          values: {
            name: "ROUTEVN_TEST_WEBVIEW_CRASH",
            template: "default",
            resolution: "1920x1080",
          },
        },
      },
    });

    expect(deps.appService.triggerTestCrash).toHaveBeenCalledWith("webview");
    expect(deps.appService.createNewProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ROUTEVN_TEST_WEBVIEW_CRASH" }),
    );
  });

  it("closes the form before loading and closes progress when creation fails", async () => {
    const deps = createDeps();
    deps.appService.createNewProject.mockRejectedValue(
      new Error("creation failed"),
    );

    await handleCreateDialogSubmit(deps, {
      _event: {
        detail: {
          values: {
            name: "New Project",
            description: "",
            language: "ja",
            iconFile: undefined,
            template: "default",
            resolution: "1920x1080",
            resolutionWidth: 1920,
            resolutionHeight: 1080,
            projectPath: "/projects/new-project",
          },
        },
      },
    });

    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.store.closeCreateDialog).toHaveBeenCalledOnce();
    expect(
      deps.store.closeCreateDialog.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.appService.showProgressDialog.mock.invocationCallOrder[0],
    );
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "creation failed",
    });
  });
});

describe("projects app version menu", () => {
  it("opens the app version dropdown from the footer label", () => {
    const deps = createDeps();

    handleAppVersionClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({
            left: 100,
            width: 80,
            top: 700,
          }),
        },
      },
    });

    expect(deps.store.openAppVersionMenu).toHaveBeenCalledWith({
      x: 140,
      y: 700,
      items: [
        {
          label: EN_I18N.projectsPage.checkUpdateMenuItem,
          type: "item",
          value: "check-update",
        },
        {
          label: EN_I18N.projectsPage.languageMenuItem,
          type: "item",
          value: "language",
        },
        {
          label: EN_I18N.projectsPage.appearanceMenuItem,
          type: "item",
          value: "appearance",
        },
      ],
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens the app version dropdown on web without the update item", () => {
    const deps = createDeps({ platform: "web" });

    handleAppVersionClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({
            left: 100,
            width: 80,
            top: 700,
          }),
        },
      },
    });

    expect(deps.store.openAppVersionMenu).toHaveBeenCalledWith({
      x: 140,
      y: 700,
      items: [
        {
          label: EN_I18N.projectsPage.languageMenuItem,
          type: "item",
          value: "language",
        },
        {
          label: EN_I18N.projectsPage.appearanceMenuItem,
          type: "item",
          value: "appearance",
        },
      ],
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("opens the app version dropdown without the update item when updates are disabled", () => {
    const deps = createDeps();
    deps.updatesEnabled = false;

    handleAppVersionClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({
            left: 100,
            width: 80,
            top: 700,
          }),
        },
      },
    });

    expect(deps.store.openAppVersionMenu).toHaveBeenCalledWith({
      x: 140,
      y: 700,
      items: [
        {
          label: EN_I18N.projectsPage.languageMenuItem,
          type: "item",
          value: "language",
        },
        {
          label: EN_I18N.projectsPage.appearanceMenuItem,
          type: "item",
          value: "appearance",
        },
      ],
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("closes the app version dropdown", () => {
    const deps = createDeps();

    handleAppVersionMenuClose(deps);

    expect(deps.store.closeAppVersionMenu).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("checks for updates from the app version dropdown", async () => {
    const deps = createDeps();

    await handleAppVersionMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "check-update",
          },
        },
      },
    });

    expect(deps.store.closeAppVersionMenu).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.updaterService.checkForUpdates).toHaveBeenCalledWith(false, {
      copy: EN_I18N.appPage,
    });
  });

  it("opens the language dialog from the app version dropdown", async () => {
    const deps = createDeps();
    deps.appService.getUserConfig.mockReturnValue("ja");

    await handleAppVersionMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "language",
          },
        },
      },
    });

    expect(deps.store.closeAppVersionMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.openLanguageDialog).toHaveBeenCalledWith({
      locale: "ja",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.updaterService.checkForUpdates).not.toHaveBeenCalled();
  });

  it("opens the appearance dialog from the app version dropdown", async () => {
    const deps = createDeps();
    deps.appService.getTheme.mockReturnValue("light");

    await handleAppVersionMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "appearance",
          },
        },
      },
    });

    expect(deps.store.closeAppVersionMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.openAppearanceDialog).toHaveBeenCalledWith({
      theme: "light",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.updaterService.checkForUpdates).not.toHaveBeenCalled();
  });

  it("closes the appearance dialog", () => {
    const deps = createDeps();

    handleAppearanceDialogClose(deps);

    expect(deps.store.closeAppearanceDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("saves the selected appearance theme", () => {
    const deps = createDeps();
    deps.appService.setTheme.mockReturnValue("light");

    handleAppearanceFormAction(deps, {
      _event: {
        detail: {
          actionId: "save-appearance",
          values: {
            theme: "light",
          },
        },
      },
    });

    expect(deps.appService.setTheme).toHaveBeenCalledWith("light");
    expect(deps.store.setCurrentTheme).toHaveBeenCalledWith({
      theme: "light",
    });
    expect(deps.store.closeAppearanceDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("closes the language dialog", () => {
    const deps = createDeps();

    handleLanguageDialogClose(deps);

    expect(deps.store.closeLanguageDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("saves the selected language", async () => {
    const deps = createDeps();
    deps.locale.current.mockReturnValue("zh-hans");

    await handleLanguageFormAction(deps, {
      _event: {
        detail: {
          actionId: "save-language",
          values: {
            locale: "zh-hans",
          },
        },
      },
    });

    expect(deps.locale.set).toHaveBeenCalledWith("zh-hans");
    expect(deps.store.setCurrentLocale).toHaveBeenCalledWith({
      locale: "zh-hans",
    });
    expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
      "app.locale",
      "zh-hans",
    );
    expect(deps.store.closeLanguageDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("does not check for updates from a stale web menu event", async () => {
    const deps = createDeps({ platform: "web" });

    await handleAppVersionMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "check-update",
          },
        },
      },
    });

    expect(deps.store.closeAppVersionMenu).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.updaterService.checkForUpdates).not.toHaveBeenCalled();
  });

  it("does not check for updates when updates are disabled", async () => {
    const deps = createDeps();
    deps.updatesEnabled = false;

    await handleAppVersionMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "check-update",
          },
        },
      },
    });

    expect(deps.store.closeAppVersionMenu).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.updaterService.checkForUpdates).not.toHaveBeenCalled();
  });
});

const createOpenButtonClickPayload = () => {
  return {
    _event: {
      currentTarget: {
        getBoundingClientRect: () => ({
          left: 100,
          right: 200,
          top: 10,
          bottom: 40,
        }),
      },
    },
  };
};

const createMenuClickPayload = (value) => {
  return {
    _event: {
      detail: { item: { value, type: "item" } },
    },
  };
};

const createUrlFormPayload = (url) => {
  return {
    _event: {
      detail: { actionId: "import-url", values: { url } },
    },
  };
};

describe("projects.handleOpenButtonClick", () => {
  it("opens the import source choice menu at the button on desktop", () => {
    const deps = createDeps({ platform: "tauri" });

    handleOpenButtonClick(deps, createOpenButtonClickPayload());

    expect(deps.store.openImportSourceMenu).toHaveBeenCalledWith({
      x: 100,
      y: 40,
      items: [
        {
          label: EN_I18N.projectsPage.importFromLocalMenuItem,
          type: "item",
          value: "import-local",
        },
        {
          label: EN_I18N.projectsPage.importFromUrlMenuItem,
          type: "item",
          value: "import-url",
        },
      ],
    });
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
  });

  it.each(["web", "android", "ios"])(
    "ignores the desktop open button on %s",
    (platform) => {
      const deps = createDeps({ platform });

      handleOpenButtonClick(deps, createOpenButtonClickPayload());

      expect(deps.store.openImportSourceMenu).not.toHaveBeenCalled();
      expect(deps.render).not.toHaveBeenCalled();
    },
  );

  it("closes the choice menu on the menu close event", () => {
    const deps = createDeps();

    handleImportSourceMenuClose(deps);

    expect(deps.store.closeImportSourceMenu).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("skips closing when the choice menu is already closed", () => {
    const deps = createDeps();
    deps.store.selectIsImportSourceMenuOpen.mockReturnValue(false);

    handleImportSourceMenuClose(deps);

    expect(deps.store.closeImportSourceMenu).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });
});

const importMenuLeaves = () => {
  const copy = EN_I18N.projectsPage;
  return [
    {
      label: copy.importFromLocalMenuItem,
      type: "item",
      value: "import-local",
    },
    {
      label: copy.importFromUrlMenuItem,
      type: "item",
      value: "import-url",
    },
  ];
};

describe("projects mobile Create menu (two-level dropdown)", () => {
  it.each(["android", "ios", "tauri"])(
    "nests the import choices under Import Project on %s",
    (platform) => {
      const deps = createDeps({ platform });

      handleMobileCreateMenuButtonClick(deps, createOpenButtonClickPayload());

      expect(deps.store.openMobileActionMenu).toHaveBeenCalledWith({
        x: 200,
        y: 40,
        items: [
          {
            label: EN_I18N.projectsPage.createProjectMenuItem,
            type: "item",
            value: "create-project",
          },
          {
            label: EN_I18N.projectsPage.importProjectMenuItem,
            type: "item",
            disabled: false,
            items: importMenuLeaves(),
          },
        ],
      });
      expect(deps.render).toHaveBeenCalledOnce();
    },
  );

  it("offers only From local and From URL under Import Project", () => {
    expect(importMenuLeaves().map((item) => item.label)).toEqual([
      "From local",
      "From URL",
    ]);
  });

  it("disables Import Project on the web", () => {
    const deps = createDeps({ platform: "web" });

    handleMobileCreateMenuButtonClick(deps, createOpenButtonClickPayload());

    const { items } = deps.store.openMobileActionMenu.mock.calls[0][0];
    expect(items[1].disabled).toBe(true);
  });

  it("opens the create dialog from the first level", async () => {
    const deps = createDeps({ platform: "android" });

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("create-project"),
    );

    expect(deps.store.closeMobileActionMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.openCreateDialog).toHaveBeenCalledTimes(1);
    expect(deps.store.openImportSourceMenu).not.toHaveBeenCalled();
  });

  it.each(["android", "ios"])(
    "asks for folder or zip with the source dialog from the second level on %s without opening another menu",
    async (platform) => {
      const deps = createDeps({ platform });

      await handleMobileActionMenuClickItem(
        deps,
        createMenuClickPayload("import-local"),
      );

      expect(deps.store.closeMobileActionMenu).toHaveBeenCalledTimes(1);
      expect(deps.appService.showFormDialog).toHaveBeenCalledTimes(1);
      expect(deps.store.openImportSourceMenu).not.toHaveBeenCalled();
      expect(deps.store.openMobileActionMenu).not.toHaveBeenCalled();
      expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
      expect(deps.appService.openArchivePicker).not.toHaveBeenCalled();
    },
  );

  it("opens the URL dialog from the second level without opening another menu", async () => {
    const deps = createDeps({ platform: "android" });

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-url"),
    );

    expect(deps.store.closeMobileActionMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.openUrlImportDialog).toHaveBeenCalledTimes(1);
    expect(deps.store.openImportSourceMenu).not.toHaveBeenCalled();
  });
});

describe("projects import source choice", () => {
  it("runs the folder flow straight away when desktop chooses From local", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    deps.appService.openExistingProject.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      { id: "project-one", name: "Project One" },
    ]);

    await handleImportSourceMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.store.closeImportSourceMenu).toHaveBeenCalledTimes(1);
    expect(deps.appService.showFormDialog).not.toHaveBeenCalled();
    expect(deps.appService.openFolderPicker).toHaveBeenCalledWith({
      title: "Select Existing Project Folder",
    });
    expect(deps.appService.openExistingProject).toHaveBeenCalledWith(
      "/projects/project-one",
    );
  });

  it("keeps progress visible through import and list refresh", async () => {
    const deps = createDeps();
    const paint = Promise.withResolvers();
    const importing = Promise.withResolvers();
    const refreshing = Promise.withResolvers();
    const progressDialog = {
      waitForPaint: vi.fn(() => paint.promise),
      close: vi.fn(),
    };
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    deps.appService.showProgressDialog.mockReturnValue(progressDialog);
    deps.appService.openExistingProject.mockReturnValue(importing.promise);
    deps.appService.loadAllProjects.mockReturnValue(refreshing.promise);

    const task = handleImportSourceMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );
    await vi.waitFor(() => {
      expect(progressDialog.waitForPaint).toHaveBeenCalledOnce();
    });
    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      title: "Importing Project…",
      message: "Please wait while your project is being imported.",
      progress: {},
    });
    expect(deps.appService.openExistingProject).not.toHaveBeenCalled();

    paint.resolve();
    await vi.waitFor(() => {
      expect(deps.appService.openExistingProject).toHaveBeenCalledWith(
        "/projects/project-one",
      );
    });
    expect(progressDialog.close).not.toHaveBeenCalled();
    const project = { id: "project-one", name: "Project One" };
    importing.resolve(project);
    await vi.waitFor(() => {
      expect(deps.appService.loadAllProjects).toHaveBeenCalledOnce();
    });
    expect(progressDialog.close).not.toHaveBeenCalled();
    expect(deps.appService.showToast).not.toHaveBeenCalled();

    refreshing.resolve([project]);
    await task;
    expect(deps.store.setProjects).toHaveBeenCalledWith({
      projects: [project],
    });
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: 'Project "Project One" imported.',
    });
  });

  it("does not show progress when folder selection is cancelled", async () => {
    const deps = createDeps();
    deps.appService.openFolderPicker.mockResolvedValue(undefined);

    await handleImportSourceMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.openExistingProject).not.toHaveBeenCalled();
    expect(deps.appService.showToast).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it.each(["openExistingProject", "loadAllProjects"])(
    "closes progress before showing a mapped error when %s fails",
    async (method) => {
      const deps = createDeps();
      deps.appService.openFolderPicker.mockResolvedValue(
        "/projects/project-one",
      );
      deps.appService.openExistingProject.mockResolvedValue({
        id: "project-one",
        name: "Project One",
      });
      deps.appService[method].mockRejectedValue(
        new Error("fileNameConflict: abc.png and abc.jpg both map to abc"),
      );

      await handleImportSourceMenuClickItem(
        deps,
        createMenuClickPayload("import-local"),
      );

      const progressDialog =
        deps.appService.showProgressDialog.mock.results[0].value;
      expect(progressDialog.close).toHaveBeenCalledOnce();
      expect(progressDialog.close.mock.invocationCallOrder[0]).toBeLessThan(
        deps.appService.showAlert.mock.invocationCallOrder[0],
      );
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message:
          "The project contains files that resolve to the same name.\n\nDetails:\nfileNameConflict: abc.png and abc.jpg both map to abc",
      });
      expect(deps.store.setProjects).not.toHaveBeenCalled();
      expect(deps.appService.showToast).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "invalidUrl",
      "invalidUrl: Only https URLs are allowed (http is limited to localhost).",
      "Enter a valid https URL.",
    ],
    [
      "downloadFailed",
      "downloadFailed: 404 Not Found",
      "Could not download the project archive. Check the URL and your connection, then try again.",
    ],
    [
      "archiveTooLarge",
      "archiveTooLarge: archive exceeds 4 GiB",
      "The project archive is too large to import.",
    ],
    [
      "invalidArchive",
      "invalidArchive: not a zip file",
      "This archive is not a valid RouteVN project export.",
    ],
    [
      "unsafeArchiveEntry",
      "unsafeArchiveEntry: ../escape.zip",
      "The project archive contains unsafe entries.",
    ],
    [
      "invalidFileName",
      "invalidFileName: a b.png",
      "The project contains a file with an invalid name.",
    ],
    [
      "fileNameConflict",
      "fileNameConflict: abc.png and abc.jpg both map to abc",
      "The project contains files that resolve to the same name.",
    ],
    [
      "importFailed",
      "importFailed: rename rolled back",
      "Failed to import project. Please select a valid project folder.",
    ],
    [
      "unknown code",
      "Something else went wrong",
      "Failed to import project. Please select a valid project folder.",
    ],
  ])(
    "maps the %s error code to a localized alert",
    async (_label, message, expectedBase) => {
      const deps = createDeps({ platform: "android" });
      deps.appService.openArchivePicker.mockResolvedValue({
        uri: "content://archives/project-one.zip",
        name: "project-one.zip",
      });
      deps.appService.importProjectFromArchive.mockRejectedValue(
        new Error(message),
      );

      deps.appService.showFormDialog.mockResolvedValue({
        actionId: "import-zip",
      });

      await handleMobileActionMenuClickItem(
        deps,
        createMenuClickPayload("import-local"),
      );

      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: `${expectedBase}\n\nDetails:\n${message}`,
      });
      expect(deps.appService.showToast).not.toHaveBeenCalled();
    },
  );
});

describe("projects From local source dialog", () => {
  const chooseLocal = (deps) => {
    return handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );
  };

  it("uses a vertical two-button source dialog like the media picker", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.showFormDialog.mockResolvedValue(undefined);

    await chooseLocal(deps);

    expect(deps.appService.showFormDialog).toHaveBeenCalledWith({
      size: "sm",
      form: {
        title: "Import from local",
        fields: [],
        actions: {
          layout: "vertical",
          buttons: [
            { id: "import-folder", label: "Project folder", variant: "se" },
            { id: "import-zip", label: "Zip file", variant: "se" },
          ],
        },
      },
    });
  });

  it("opens the folder picker for the folder button", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-folder",
    });
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    deps.appService.openExistingProject.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      { id: "project-one", name: "Project One" },
    ]);

    await chooseLocal(deps);

    expect(deps.appService.openFolderPicker).toHaveBeenCalledWith({
      title: "Select Existing Project Folder",
    });
    expect(deps.appService.openArchivePicker).not.toHaveBeenCalled();
    expect(deps.appService.openExistingProject).toHaveBeenCalledWith(
      "/projects/project-one",
    );
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: 'Project "Project One" imported.',
    });
  });

  it("opens the zip picker for the zip button", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-zip",
    });
    deps.appService.openArchivePicker.mockResolvedValue(undefined);

    await chooseLocal(deps);

    expect(deps.appService.openArchivePicker).toHaveBeenCalledWith({
      title: "Select Project Zip File",
    });
    expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
  });

  it.each([[undefined], [{ actionId: "other" }]])(
    "does nothing when the dialog is dismissed or unknown (%j)",
    async (result) => {
      const deps = createDeps({ platform: "android" });
      deps.appService.showFormDialog.mockResolvedValue(result);

      await chooseLocal(deps);

      expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
      expect(deps.appService.openArchivePicker).not.toHaveBeenCalled();
      expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
      expect(deps.appService.showAlert).not.toHaveBeenCalled();
    },
  );
});

describe("projects zip import", () => {
  it("imports from a picked zip archive on mobile", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.openArchivePicker.mockResolvedValue({
      uri: "content://archives/project-one.zip",
      name: "project-one.zip",
    });
    deps.appService.importProjectFromArchive.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      { id: "project-one", name: "Project One" },
    ]);

    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-zip",
    });

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.appService.openArchivePicker).toHaveBeenCalledWith({
      title: "Select Project Zip File",
    });
    expect(deps.appService.importProjectFromArchive).toHaveBeenCalledWith({
      uri: "content://archives/project-one.zip",
      onProgress: expect.any(Function),
    });
    expect(deps.store.setProjects).toHaveBeenCalledWith({
      projects: [{ id: "project-one", name: "Project One" }],
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: 'Project "Project One" imported.',
    });
  });

  it("returns silently when the archive picker is cancelled", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.openArchivePicker.mockResolvedValue(undefined);

    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-zip",
    });

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.appService.importProjectFromArchive).not.toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("closes the progress dialog when the zip import fails", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.openArchivePicker.mockResolvedValue({
      uri: "content://archives/project-one.zip",
      name: "project-one.zip",
    });
    deps.appService.importProjectFromArchive.mockRejectedValue(
      new Error("invalidArchive: project.db is missing"),
    );

    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-zip",
    });

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });
});

describe("projects URL import", () => {
  it("closes the URL dialog on the dialog close event", () => {
    const deps = createDeps();

    handleUrlImportDialogClose(deps);

    expect(deps.store.closeUrlImportDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("skips closing when the URL dialog is already closed", () => {
    const deps = createDeps();
    deps.store.selectIsUrlImportDialogOpen.mockReturnValue(false);

    handleUrlImportDialogClose(deps);

    expect(deps.store.closeUrlImportDialog).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("opens the URL dialog when choosing From URL", async () => {
    const deps = createDeps();

    await handleImportSourceMenuClickItem(
      deps,
      createMenuClickPayload("import-url"),
    );

    expect(deps.store.closeImportSourceMenu).toHaveBeenCalledTimes(1);
    expect(deps.store.openUrlImportDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("alerts without starting when the URL is invalid", async () => {
    const deps = createDeps({ platform: "android" });

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("http://example.com/project.zip"),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Enter a valid https URL.\n\nDetails:\ninvalidUrl: Only https URLs are allowed (http is limited to localhost).",
    });
    expect(deps.store.closeUrlImportDialog).not.toHaveBeenCalled();
    expect(deps.appService.importProjectFromUrl).not.toHaveBeenCalled();
  });

  it("asks for a destination parent folder on desktop before running", async () => {
    const deps = createDeps({ platform: "tauri" });
    const callOrder = [];
    deps.store.closeUrlImportDialog.mockImplementation(() => {
      callOrder.push("close-dialog");
    });
    deps.appService.openFolderPicker.mockImplementation(async () => {
      callOrder.push("pick-parent");
      return "/projects";
    });
    deps.appService.importProjectFromUrl.mockImplementation(async () => {
      callOrder.push("import");
      return { id: "project-one", name: "Project One" };
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      { id: "project-one", name: "Project One" },
    ]);

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("  https://example.com/project-one.zip  "),
    );

    expect(callOrder).toEqual(["close-dialog", "pick-parent", "import"]);
    expect(deps.appService.openFolderPicker).toHaveBeenCalledWith({
      title: "Select Import Destination",
    });
    expect(deps.appService.importProjectFromUrl).toHaveBeenCalledWith({
      url: "https://example.com/project-one.zip",
      destinationFolder: "/projects",
      onProgress: expect.any(Function),
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: 'Project "Project One" imported.',
    });
  });

  it("returns silently when the destination folder pick is cancelled", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockResolvedValue(undefined);

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );

    expect(deps.appService.importProjectFromUrl).not.toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("runs the import directly on mobile without a destination folder", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.importProjectFromUrl.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      { id: "project-one", name: "Project One" },
    ]);

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );

    expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
    expect(deps.appService.importProjectFromUrl).toHaveBeenCalledWith({
      url: "https://example.com/project-one.zip",
      destinationFolder: undefined,
      onProgress: expect.any(Function),
    });
    expect(deps.store.setProjects).toHaveBeenCalledWith({
      projects: [{ id: "project-one", name: "Project One" }],
    });
  });

  it("closes the progress dialog and maps errors when the URL import fails", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockRejectedValue(
      new Error("downloadFailed: 404 Not Found"),
    );

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );

    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Could not download the project archive. Check the URL and your connection, then try again.\n\nDetails:\ndownloadFailed: 404 Not Found",
    });
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });
});

describe("projects Google Drive URL import", () => {
  const DRIVE_ID = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz012345";
  const DRIVE_SHARE_URL = `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`;
  const DRIVE_DOWNLOAD_URL = `https://drive.usercontent.google.com/download?id=${DRIVE_ID}&export=download&confirm=t`;
  const DRIVE_FAILED_MESSAGE =
    'Google Drive did not return a project zip file. Make sure the file is shared with "Anyone with the link" and has not reached its download limit.';

  it.each([
    ["share link", DRIVE_SHARE_URL],
    [
      "shared download link",
      `https://drive.google.com/uc?export=download&id=${DRIVE_ID}`,
    ],
  ])("imports a %s through the direct download URL", async (_label, input) => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      { id: "project-one", name: "Project One" },
    ]);

    await handleUrlImportFormAction(deps, createUrlFormPayload(input));

    expect(deps.appService.importProjectFromUrl).toHaveBeenCalledWith({
      url: DRIVE_DOWNLOAD_URL,
      destinationFolder: undefined,
      onProgress: expect.any(Function),
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: 'Project "Project One" imported.',
    });
  });

  it.each([
    "invalidArchive: End of central directory record not found.",
    "downloadFailed: HTTP 403",
  ])(
    "explains what to check when Drive does not return a zip (%s)",
    async (nativeMessage) => {
      const deps = createDeps({ platform: "ios" });
      deps.appService.importProjectFromUrl.mockRejectedValue(
        new Error(nativeMessage),
      );

      await handleUrlImportFormAction(
        deps,
        createUrlFormPayload(DRIVE_SHARE_URL),
      );

      const progressDialog =
        deps.appService.showProgressDialog.mock.results[0].value;
      expect(progressDialog.close).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: `${DRIVE_FAILED_MESSAGE}\n\nDetails:\ngoogleDriveFailed: ${nativeMessage}`,
      });
      expect(deps.appService.showToast).not.toHaveBeenCalled();
    },
  );

  it("keeps the download message when Drive was never reached", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockRejectedValue(
      new Error("downloadFailed: Network error: SocketTimeoutException"),
    );

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload(DRIVE_SHARE_URL),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "Could not download the project archive. Check the URL and your connection, then try again.\n\nDetails:\ndownloadFailed: Network error: SocketTimeoutException",
    });
  });

  it("keeps other Drive import errors unchanged", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockRejectedValue(
      new Error("fileNameConflict: abc.png and abc.jpg both map to abc"),
    );

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload(DRIVE_SHARE_URL),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "The project contains files that resolve to the same name.\n\nDetails:\nfileNameConflict: abc.png and abc.jpg both map to abc",
    });
  });

  it("does not add the Drive message for other hosts", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockRejectedValue(
      new Error("invalidArchive: End of central directory record not found."),
    );

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "This archive is not a valid RouteVN project export.\n\nDetails:\ninvalidArchive: End of central directory record not found.",
    });
  });

  it("alerts for a Drive folder link without starting an import", async () => {
    const deps = createDeps({ platform: "android" });

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload(
        `https://drive.google.com/drive/folders/${DRIVE_ID}`,
      ),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "This link type is not supported. Use a link to a project zip file.\n\nDetails:\nunsupportedUrl: Google Drive folder links cannot be imported. Share the project as a zip file instead.",
    });
    expect(deps.store.closeUrlImportDialog).not.toHaveBeenCalled();
    expect(deps.appService.importProjectFromUrl).not.toHaveBeenCalled();
  });

  it("passes the normalized URL and chosen folder on desktop", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockResolvedValue("/projects");
    deps.appService.importProjectFromUrl.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      { id: "project-one", name: "Project One" },
    ]);

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload(DRIVE_SHARE_URL),
    );

    expect(deps.appService.importProjectFromUrl).toHaveBeenCalledWith({
      url: DRIVE_DOWNLOAD_URL,
      destinationFolder: "/projects",
      onProgress: expect.any(Function),
    });
  });
});

describe("projects import picker failures", () => {
  const FAILURE =
    "Failed to import project. Please select a valid project folder.";

  it("alerts when the folder picker rejects", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockRejectedValue(
      new Error("importFailed: Cannot open the folder picker."),
    );

    await handleImportSourceMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: `${FAILURE}\n\nDetails:\nimportFailed: Cannot open the folder picker.`,
    });
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.openExistingProject).not.toHaveBeenCalled();
  });

  it("alerts when the archive picker rejects", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-zip",
    });
    deps.appService.openArchivePicker.mockRejectedValue(
      new Error("invalidArchive: Failed to read selected project archive."),
    );

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "This archive is not a valid RouteVN project export.\n\nDetails:\ninvalidArchive: Failed to read selected project archive.",
    });
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.importProjectFromArchive).not.toHaveBeenCalled();
  });

  it("alerts when the desktop destination picker rejects", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockRejectedValue(
      new Error("importFailed: Cannot open the folder picker."),
    );

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.appService.importProjectFromUrl).not.toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
  });
});

describe("projects import of a project that already exists", () => {
  const EXISTS = "projectExists: This project is already in the library.";
  const EXPLANATION =
    "This project has already been added, so nothing was imported and the existing project was not changed.";
  const LIBRARY_HINT =
    "To use this copy instead, remove the existing project first, then import it again.";

  const expectExistsAlert = (deps, { withLibraryHint }) => {
    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Project Already Added",
      message: [EXPLANATION, ...(withLibraryHint ? [LIBRARY_HINT] : [])].join(
        "\n\n",
      ),
    });
    expect(deps.appService.showToast).not.toHaveBeenCalled();
    expect(deps.appService.loadAllProjects).not.toHaveBeenCalled();
    expect(deps.store.setProjects).not.toHaveBeenCalled();
  };

  it("explains it in an alert for a zip import on iOS, including how to use the other copy", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-zip",
    });
    deps.appService.openArchivePicker.mockResolvedValue({
      uri: "file:///tmp/project-one.zip",
      name: "project-one.zip",
    });
    deps.appService.importProjectFromArchive.mockRejectedValue(
      new Error(EXISTS),
    );

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expectExistsAlert(deps, { withLibraryHint: true });
  });

  it("shows the same alert for a URL import on iOS", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.importProjectFromUrl.mockRejectedValue(new Error(EXISTS));

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );

    expectExistsAlert(deps, { withLibraryHint: true });
  });

  it("shows the same alert for a folder import on iOS", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-folder",
    });
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    deps.appService.openExistingProject.mockRejectedValue(new Error(EXISTS));

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expectExistsAlert(deps, { withLibraryHint: true });
  });

  it("leaves out the delete-first hint on desktop, where it is the same folder added twice", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    deps.appService.openExistingProject.mockRejectedValue(
      new Error("projectExists: This project has already been added."),
    );

    await handleImportSourceMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expectExistsAlert(deps, { withLibraryHint: false });
  });

  it("keeps the failure alert, without this title, for other errors", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.importProjectFromUrl.mockRejectedValue(
      new Error("importFailed: Cannot write the download: disk full"),
    );

    await handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert.mock.calls[0][0].title).toBeUndefined();
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });
});

describe("projects import progress dialog", () => {
  const MB = 1024 * 1024;

  const runUrlImport = (deps) => {
    return handleUrlImportFormAction(
      deps,
      createUrlFormPayload("https://example.com/project-one.zip"),
    );
  };

  it("starts a URL import with a connecting status and an indeterminate bar", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([]);

    await runUrlImport(deps);

    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      title: "Importing Project…",
      message: "Please wait while your project is being imported.",
      status: "Connecting…",
      progress: {},
    });
  });

  it("walks the dialog through download, extraction and finishing", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockImplementation(
      async ({ onProgress }) => {
        onProgress({ stage: "downloading", current: 0, total: 200 * MB });
        onProgress({ stage: "downloading", current: 50 * MB, total: 200 * MB });
        onProgress({ stage: "extracting", current: 30, total: 120 });
        onProgress({ stage: "finishing", current: 0, total: 0 });
        return { id: "project-one", name: "Project One" };
      },
    );
    deps.appService.loadAllProjects.mockResolvedValue([]);

    await runUrlImport(deps);

    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.update.mock.calls.map(([view]) => view)).toEqual([
      {
        status: "Downloading…\n0 B of 200 MB (0%)",
        progress: { current: 0, total: 200 * MB },
      },
      {
        status: "Downloading…\n50 MB of 200 MB (25%)",
        progress: { current: 50 * MB, total: 200 * MB },
      },
      {
        status: "Extracting files… 25%",
        progress: { current: 30, total: 120 },
      },
      { status: "Finishing up…", progress: {} },
    ]);
  });

  it("starts a zip import with a preparing status and reports extraction", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.showFormDialog.mockResolvedValue({
      actionId: "import-zip",
    });
    deps.appService.openArchivePicker.mockResolvedValue({
      uri: "file:///tmp/project-one.zip",
      name: "project-one.zip",
    });
    deps.appService.importProjectFromArchive.mockImplementation(
      async ({ onProgress }) => {
        onProgress({ stage: "extracting", current: 60, total: 120 });
        return { id: "project-one", name: "Project One" };
      },
    );
    deps.appService.loadAllProjects.mockResolvedValue([]);

    await handleMobileActionMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Preparing…" }),
    );
    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.update).toHaveBeenCalledWith({
      status: "Extracting files… 50%",
      progress: { current: 60, total: 120 },
    });
  });

  it("shows no status for a folder import", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    deps.appService.openExistingProject.mockResolvedValue({
      id: "project-one",
      name: "Project One",
    });
    deps.appService.loadAllProjects.mockResolvedValue([]);

    await handleImportSourceMenuClickItem(
      deps,
      createMenuClickPayload("import-local"),
    );

    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      title: "Importing Project…",
      message: "Please wait while your project is being imported.",
      status: undefined,
      progress: {},
    });
  });

  it("keeps the dialog open and closes it once when a download fails midway", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockImplementation(
      async ({ onProgress }) => {
        onProgress({ stage: "downloading", current: 10, total: 100 });
        throw new Error(
          "downloadFailed: Network error: SocketTimeoutException",
        );
      },
    );

    await runUrlImport(deps);

    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(progressDialog.update).toHaveBeenCalledTimes(1);
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledTimes(1);
  });
});

describe("projects.handleDeleteDialogConfirm", () => {
  it("releases a local project runtime before removing its project entry", async () => {
    const deps = createDeps();
    deps.store.selectDeleteDialogProjectId.mockReturnValue("project-1");
    deps.store.selectDeleteDialogProjectPath.mockReturnValue(
      "/projects/project-one",
    );

    await handleDeleteDialogConfirm(deps);

    expect(deps.projectService.releaseProjectRuntime).toHaveBeenCalledWith(
      "project-1",
    );
    expect(deps.appService.removeProjectEntryByPath).toHaveBeenCalledWith(
      "/projects/project-one",
    );
    expect(deps.store.removeProject).toHaveBeenCalledWith({
      projectPath: "/projects/project-one",
    });
    expect(deps.store.closeDeleteDialog).toHaveBeenCalledTimes(1);
  });

  it("permanently deletes Android project storage before removing the entry", async () => {
    const deps = createDeps({ platform: "android" });
    deps.store.selectDeleteDialogProjectId.mockReturnValue("project-1");

    await handleDeleteDialogConfirm(deps);

    expect(deps.projectService.releaseProjectRuntime).toHaveBeenCalledWith(
      "project-1",
    );
    expect(deps.appService.deleteProject).toHaveBeenCalledWith("project-1");
    expect(deps.appService.removeProjectEntry).toHaveBeenCalledWith(
      "project-1",
    );
    expect(deps.store.removeProject).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(
      deps.projectService.releaseProjectRuntime.mock.invocationCallOrder[0],
    ).toBeLessThan(deps.appService.deleteProject.mock.invocationCallOrder[0]);
    expect(
      deps.appService.deleteProject.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.appService.removeProjectEntry.mock.invocationCallOrder[0],
    );
    expect(deps.store.closeDeleteDialog).toHaveBeenCalledTimes(1);
  });

  it("requires the exact Android deletion confirmation text", async () => {
    const deps = createDeps({ platform: "android" });
    deps.store.selectDeleteDialogProjectId.mockReturnValue("project-1");
    deps.store.selectDeleteDialogConfirmationText.mockReturnValue("delete");

    await handleDeleteDialogConfirm(deps);

    expect(deps.projectService.releaseProjectRuntime).not.toHaveBeenCalled();
    expect(deps.appService.deleteProject).not.toHaveBeenCalled();
    expect(deps.appService.removeProjectEntry).not.toHaveBeenCalled();
    expect(deps.store.closeDeleteDialog).not.toHaveBeenCalled();
  });

  it("keeps the Android confirmation open when native deletion fails", async () => {
    const deps = createDeps({ platform: "android" });
    deps.store.selectDeleteDialogProjectId.mockReturnValue("project-1");
    deps.appService.deleteProject.mockRejectedValue(
      new Error("Native deletion failed"),
    );

    await handleDeleteDialogConfirm(deps);

    expect(deps.appService.removeProjectEntry).not.toHaveBeenCalled();
    expect(deps.store.removeProject).not.toHaveBeenCalled();
    expect(deps.store.closeDeleteDialog).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to delete project data. Please try again.",
    });
  });

  it("commits Android deletion in the UI when cache removal fails", async () => {
    const deps = createDeps({ platform: "android" });
    deps.store.selectDeleteDialogProjectId.mockReturnValue("project-1");
    deps.appService.removeProjectEntry.mockRejectedValue(
      new Error("Cache write failed"),
    );

    await handleDeleteDialogConfirm(deps);

    expect(deps.appService.deleteProject).toHaveBeenCalledWith("project-1");
    expect(deps.store.removeProject).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(deps.store.closeDeleteDialog).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to remove project. Please try again.",
    });
    expect(deps.store.removeProject.mock.invocationCallOrder[0]).toBeLessThan(
      deps.appService.removeProjectEntry.mock.invocationCallOrder[0],
    );
  });

  it("tracks Android deletion confirmation input", () => {
    const deps = createDeps({ platform: "android" });

    handleDeleteConfirmationInput(deps, {
      _event: { detail: { value: "Delete" } },
    });

    expect(deps.store.setDeleteDialogConfirmationText).toHaveBeenCalledWith({
      confirmationText: "Delete",
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });
});

describe("projects long-press menus", () => {
  it("opens the iOS project menu at the hold coordinates without navigating", () => {
    const deps = createDeps({ platform: "ios" });

    handleProjectLongPress(deps, {
      _event: {
        detail: { clientX: 42, clientY: 180, pointerType: "touch" },
        currentTarget: {
          dataset: {
            projectId: "project-1",
            projectPath: encodeURIComponent('/projects/Project "One"'),
          },
        },
      },
    });

    expect(deps.store.openDropdownMenu).toHaveBeenCalledWith({
      x: 42,
      y: 180,
      scope: "local",
      projectId: "project-1",
      projectPath: '/projects/Project "One"',
      items: [
        {
          label: EN_I18N.projectsPage.removeButton,
          type: "item",
          value: "delete",
        },
      ],
    });
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("allows a stale project entry to be removed by long press", () => {
    const deps = createDeps({ platform: "ios" });

    handleProjectLongPress(deps, {
      _event: {
        detail: { clientX: 20, clientY: 120, pointerType: "touch" },
        currentTarget: { dataset: { projectPath: "/projects/project-one" } },
      },
    });

    expect(deps.store.openDropdownMenu).toHaveBeenCalledWith({
      x: 20,
      y: 120,
      scope: "local",
      projectPath: "/projects/project-one",
      items: [
        {
          label: EN_I18N.projectsPage.removeButton,
          type: "item",
          value: "delete",
        },
      ],
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("opens the cloud project menu from a touch hold", () => {
    const deps = createDeps({ platform: "web" });
    deps.store.selectCloudProjects = vi.fn(() => [{ id: "project-2" }]);

    handleCloudProjectLongPress(deps, {
      _event: {
        detail: { clientX: 50, clientY: 210, pointerType: "touch" },
        currentTarget: { dataset: { projectId: "project-2" } },
      },
    });

    expect(deps.store.openDropdownMenu).toHaveBeenCalledWith({
      x: 50,
      y: 210,
      scope: "cloud",
      projectId: "project-2",
      items: [
        {
          label: EN_I18N.projectsPage.addMemberMenuItem,
          type: "item",
          value: "add-member",
        },
      ],
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });
});

describe("projects.handleProjectContextMenu", () => {
  it("shows an alert when the project item is missing its id", () => {
    const deps = createDeps();

    handleProjectsClick(deps, {
      _event: {
        currentTarget: {
          dataset: {},
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "This project entry is invalid. Remove it from the list and import the project again.",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("opens the dropdown for a stale project row when only the path is available", () => {
    const deps = createDeps();

    handleProjectContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            projectPath: "/projects/project-one",
          },
        },
      },
    });

    expect(deps.store.openDropdownMenu).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      scope: "local",
      projectPath: "/projects/project-one",
      items: [
        {
          label: EN_I18N.projectsPage.removeButton,
          type: "item",
          value: "delete",
        },
      ],
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("uses the row path for a normal local project", () => {
    const deps = createDeps();

    handleProjectContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            projectId: "project-1",
            projectPath: "/projects/project-one",
          },
        },
      },
    });

    expect(deps.store.openDropdownMenu).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      scope: "local",
      projectId: "project-1",
      projectPath: "/projects/project-one",
      items: [
        {
          label: EN_I18N.projectsPage.removeButton,
          type: "item",
          value: "delete",
        },
      ],
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("labels the Android project action as Delete", () => {
    const deps = createDeps({ platform: "android" });

    handleProjectContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            projectId: "project-1",
          },
        },
      },
    });

    expect(deps.store.openDropdownMenu).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      scope: "local",
      projectId: "project-1",
      projectPath: "",
      items: [
        {
          label: EN_I18N.projectsPage.deleteButton,
          type: "item",
          value: "delete",
        },
      ],
    });
  });
});
