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
  handleLanguageDialogClose,
  handleLanguageFormAction,
  handleMobileActionMenuClickItem,
  handleMobileCreateMenuButtonClick,
  handleOpenButtonClick,
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

const PROJECT_ONE = { id: "project-one", name: "Project One" };
const IMPORTED_TOAST = { message: 'Project "Project One" imported.' };
const IMPORT_FAILED =
  "Failed to import project. Please select a valid project folder.";

// The import resolves with Project One, and the refreshed list holds it.
const mockImportedProject = (deps, method) => {
  deps.appService[method].mockResolvedValue(PROJECT_ONE);
  deps.appService.loadAllProjects.mockResolvedValue([PROJECT_ONE]);
};

const pickZip = (deps) => {
  deps.appService.openArchivePicker.mockResolvedValue({
    uri: "content://archives/project-one.zip",
    name: "project-one.zip",
  });
};

// Android and iOS "From local": answer the folder-or-zip source dialog.
const chooseLocalSource = (deps, dialogResult) => {
  deps.appService.showFormDialog.mockResolvedValue(dialogResult);
  return handleMobileActionMenuClickItem(
    deps,
    createMenuClickPayload("import-local"),
  );
};

const chooseDesktopLocal = (deps) => {
  return handleImportSourceMenuClickItem(
    deps,
    createMenuClickPayload("import-local"),
  );
};

const submitUrl = (deps, url = "https://example.com/project-one.zip") => {
  return handleUrlImportFormAction(deps, createUrlFormPayload(url));
};

const progressDialogOf = (deps) => {
  return deps.appService.showProgressDialog.mock.results[0].value;
};

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

describe("projects.handleOpenButtonClick", () => {
  it("opens the import source choice menu at the button on desktop", () => {
    const deps = createDeps({ platform: "tauri" });

    handleOpenButtonClick(deps, createOpenButtonClickPayload());

    expect(deps.store.openImportSourceMenu).toHaveBeenCalledWith({
      x: 100,
      y: 40,
      items: importMenuLeaves(),
    });
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
  });
});

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

  it.each([
    ["tauri", handleImportSourceMenuClickItem, "closeImportSourceMenu"],
    ["android", handleMobileActionMenuClickItem, "closeMobileActionMenu"],
  ])(
    "opens the URL dialog from the %s import menu without opening another menu",
    async (platform, handleMenuClick, closeMenu) => {
      const deps = createDeps({ platform });

      await handleMenuClick(deps, createMenuClickPayload("import-url"));

      expect(deps.store[closeMenu]).toHaveBeenCalledTimes(1);
      expect(deps.store.openUrlImportDialog).toHaveBeenCalledTimes(1);
      expect(deps.store.openImportSourceMenu).not.toHaveBeenCalled();
    },
  );
});

describe("projects import source choice", () => {
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
      "tooLarge",
      "tooLarge: download passed the limit of 4294967296 bytes",
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
    ["writeFailed", "writeFailed: cannot create out.zip", IMPORT_FAILED],
    ["importFailed", "importFailed: rename rolled back", IMPORT_FAILED],
    ["unknown code", "Something else went wrong", IMPORT_FAILED],
  ])(
    "maps the %s error code to a localized alert",
    async (_label, message, expectedBase) => {
      const deps = createDeps({ platform: "android" });
      pickZip(deps);
      deps.appService.importProjectFromArchive.mockRejectedValue(
        new Error(message),
      );

      await chooseLocalSource(deps, { actionId: "import-zip" });

      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: `${expectedBase}\n\nDetails:\n${message}`,
      });
      expect(deps.appService.showToast).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["folder", "tauri", chooseDesktopLocal],
    [
      "archive",
      "ios",
      (deps) => chooseLocalSource(deps, { actionId: "import-zip" }),
    ],
    ["destination", "tauri", (deps) => submitUrl(deps)],
  ])(
    "alerts without importing when the %s picker rejects",
    async (_label, platform, run) => {
      const deps = createDeps({ platform });
      const pickerError = new Error("importFailed: Cannot open the picker.");
      deps.appService.openFolderPicker.mockRejectedValue(pickerError);
      deps.appService.openArchivePicker.mockRejectedValue(pickerError);

      await run(deps);

      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: `${IMPORT_FAILED}\n\nDetails:\nimportFailed: Cannot open the picker.`,
      });
      expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    },
  );
});

describe("projects From local source dialog", () => {
  it.each(["android", "ios"])(
    "asks for a folder or a zip in a vertical two-button dialog on %s, without another menu",
    async (platform) => {
      const deps = createDeps({ platform });

      await chooseLocalSource(deps, undefined);

      expect(deps.store.closeMobileActionMenu).toHaveBeenCalledTimes(1);
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
      expect(deps.store.openImportSourceMenu).not.toHaveBeenCalled();
      expect(deps.store.openMobileActionMenu).not.toHaveBeenCalled();
    },
  );

  it("opens the folder picker for the folder button", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    mockImportedProject(deps, "openExistingProject");

    await chooseLocalSource(deps, { actionId: "import-folder" });

    expect(deps.appService.openFolderPicker).toHaveBeenCalledWith({
      title: "Select Existing Project Folder",
    });
    expect(deps.appService.openArchivePicker).not.toHaveBeenCalled();
    expect(deps.appService.openExistingProject).toHaveBeenCalledWith(
      "/projects/project-one",
    );
    expect(deps.appService.showToast).toHaveBeenCalledWith(IMPORTED_TOAST);
  });

  it.each([[undefined], [{ actionId: "other" }]])(
    "does nothing when the dialog is dismissed or unknown (%j)",
    async (result) => {
      const deps = createDeps({ platform: "android" });

      await chooseLocalSource(deps, result);

      expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
      expect(deps.appService.openArchivePicker).not.toHaveBeenCalled();
      expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
      expect(deps.appService.showAlert).not.toHaveBeenCalled();
    },
  );
});

describe("projects zip import", () => {
  it("imports a picked zip on mobile, starting with a preparing status and reporting extraction", async () => {
    const deps = createDeps({ platform: "android" });
    pickZip(deps);
    deps.appService.loadAllProjects.mockResolvedValue([PROJECT_ONE]);
    deps.appService.importProjectFromArchive.mockImplementation(
      async ({ onProgress }) => {
        onProgress({ stage: "extracting", current: 60, total: 120 });
        return PROJECT_ONE;
      },
    );

    await chooseLocalSource(deps, { actionId: "import-zip" });

    expect(deps.appService.openArchivePicker).toHaveBeenCalledWith({
      title: "Select Project Zip File",
    });
    expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
    expect(deps.appService.importProjectFromArchive).toHaveBeenCalledWith({
      uri: "content://archives/project-one.zip",
      onProgress: expect.any(Function),
    });
    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Preparing…" }),
    );
    expect(progressDialogOf(deps).update).toHaveBeenCalledWith({
      status: "Extracting files… 50%",
      progress: { current: 60, total: 120 },
    });
    expect(deps.store.setProjects).toHaveBeenCalledWith({
      projects: [PROJECT_ONE],
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith(IMPORTED_TOAST);
  });

  it("returns silently when the archive picker is cancelled", async () => {
    const deps = createDeps({ platform: "ios" });
    deps.appService.openArchivePicker.mockResolvedValue(undefined);

    await chooseLocalSource(deps, { actionId: "import-zip" });

    expect(deps.appService.importProjectFromArchive).not.toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});

describe("projects URL import", () => {
  it("alerts without starting when the URL is invalid", async () => {
    const deps = createDeps({ platform: "android" });

    await submitUrl(deps, "http://example.com/project.zip");

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
      return PROJECT_ONE;
    });
    deps.appService.loadAllProjects.mockResolvedValue([PROJECT_ONE]);

    await submitUrl(deps, "  https://example.com/project-one.zip  ");

    expect(callOrder).toEqual(["close-dialog", "pick-parent", "import"]);
    expect(deps.appService.openFolderPicker).toHaveBeenCalledWith({
      title: "Select Import Destination",
    });
    expect(deps.appService.importProjectFromUrl).toHaveBeenCalledWith({
      url: "https://example.com/project-one.zip",
      destinationFolder: "/projects",
      onProgress: expect.any(Function),
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith(IMPORTED_TOAST);
  });

  it("returns silently when the destination folder pick is cancelled", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockResolvedValue(undefined);

    await submitUrl(deps);

    expect(deps.appService.importProjectFromUrl).not.toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});

describe("projects Google Drive URL import", () => {
  const DRIVE_ID = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz012345";
  const DRIVE_SHARE_URL = `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`;
  const DRIVE_DOWNLOAD_URL = `https://drive.usercontent.google.com/download?id=${DRIVE_ID}&export=download&confirm=t`;
  const DRIVE_FAILED_MESSAGE =
    'Google Drive did not return a project zip file. Make sure the file is shared with "Anyone with the link" and has not reached its download limit.';

  it("imports a share link on mobile through the direct download URL, without a destination folder", async () => {
    const deps = createDeps({ platform: "android" });
    mockImportedProject(deps, "importProjectFromUrl");

    await submitUrl(deps, DRIVE_SHARE_URL);

    expect(deps.appService.openFolderPicker).not.toHaveBeenCalled();
    expect(deps.appService.importProjectFromUrl).toHaveBeenCalledWith({
      url: DRIVE_DOWNLOAD_URL,
      destinationFolder: undefined,
      onProgress: expect.any(Function),
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith(IMPORTED_TOAST);
  });

  // iOS and Android reject with an Error; Tauri's invoke rejects with the
  // native "<code>: <detail>" text itself.
  const REJECTION_SHAPES = [
    ["an Error", (message) => new Error(message)],
    ["a plain string", (message) => message],
  ];

  it.each(
    [
      "invalidArchive: End of central directory record not found.",
      "downloadFailed: HTTP 403",
    ].flatMap((nativeMessage) =>
      REJECTION_SHAPES.map(([shape, reject]) => [nativeMessage, shape, reject]),
    ),
  )(
    "explains what to check when Drive does not return a zip (%s, rejected with %s)",
    async (nativeMessage, _shape, reject) => {
      const deps = createDeps({ platform: "ios" });
      deps.appService.importProjectFromUrl.mockRejectedValue(
        reject(nativeMessage),
      );

      await submitUrl(deps, DRIVE_SHARE_URL);

      expect(progressDialogOf(deps).close).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: `${DRIVE_FAILED_MESSAGE}\n\nDetails:\ngoogleDriveFailed: ${nativeMessage}`,
      });
      expect(deps.appService.showToast).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "Drive was never reached",
      DRIVE_SHARE_URL,
      "downloadFailed: Network error: SocketTimeoutException",
      "Could not download the project archive. Check the URL and your connection, then try again.",
    ],
    [
      "the host is not Drive",
      "https://example.com/project-one.zip",
      "invalidArchive: End of central directory record not found.",
      "This archive is not a valid RouteVN project export.",
    ],
  ])(
    "keeps the error's own alert when %s",
    async (_label, url, message, expectedBase) => {
      const deps = createDeps({ platform: "android" });
      deps.appService.importProjectFromUrl.mockRejectedValue(
        new Error(message),
      );

      await submitUrl(deps, url);

      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: `${expectedBase}\n\nDetails:\n${message}`,
      });
    },
  );

  it("alerts for a Drive folder link without starting an import", async () => {
    const deps = createDeps({ platform: "android" });

    await submitUrl(deps, `https://drive.google.com/drive/folders/${DRIVE_ID}`);

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message:
        "This link type is not supported. Use a link to a project zip file.\n\nDetails:\nunsupportedUrl: Google Drive folder links cannot be imported. Share the project as a zip file instead.",
    });
    expect(deps.store.closeUrlImportDialog).not.toHaveBeenCalled();
    expect(deps.appService.importProjectFromUrl).not.toHaveBeenCalled();
  });
});

describe("projects import of a project that already exists", () => {
  const EXPLANATION =
    "This project has already been added, so nothing was imported and the existing project was not changed.";
  const LIBRARY_HINT =
    "To use this copy instead, delete the project's folder in the Files app, then import it again.";

  const expectExistsAlert = (deps, message) => {
    expect(progressDialogOf(deps).close).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Project Already Added",
      message,
    });
    expect(deps.appService.showToast).not.toHaveBeenCalled();
    expect(deps.appService.loadAllProjects).not.toHaveBeenCalled();
    expect(deps.store.setProjects).not.toHaveBeenCalled();
  };

  it("explains it in an alert on iOS, including how to use the other copy", async () => {
    const deps = createDeps({ platform: "ios" });
    pickZip(deps);
    deps.appService.importProjectFromArchive.mockRejectedValue(
      new Error("projectExists: This project is already in the library."),
    );

    await chooseLocalSource(deps, { actionId: "import-zip" });

    expectExistsAlert(deps, `${EXPLANATION}\n\n${LIBRARY_HINT}`);
  });

  it("leaves out the delete-first hint on desktop, where there is nothing to replace", async () => {
    const deps = createDeps({ platform: "tauri" });
    deps.appService.openFolderPicker.mockResolvedValue("/projects/project-one");
    deps.appService.openExistingProject.mockRejectedValue(
      new Error("projectExists: This project has already been added."),
    );

    await chooseDesktopLocal(deps);

    expectExistsAlert(deps, EXPLANATION);
  });
});

describe("projects import progress dialog", () => {
  const MB = 1024 * 1024;

  it("walks a URL import from connecting through download, extraction and finishing", async () => {
    const deps = createDeps({ platform: "android" });
    deps.appService.importProjectFromUrl.mockImplementation(
      async ({ onProgress }) => {
        onProgress({ stage: "downloading", current: 0, total: 200 * MB });
        onProgress({ stage: "downloading", current: 50 * MB, total: 200 * MB });
        onProgress({ stage: "extracting", current: 30, total: 120 });
        onProgress({ stage: "finishing", current: 0, total: 0 });
        return PROJECT_ONE;
      },
    );

    await submitUrl(deps);

    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      title: "Importing Project…",
      message: "Please wait while your project is being imported.",
      status: "Connecting…",
      progress: {},
    });
    expect(
      progressDialogOf(deps).update.mock.calls.map(([view]) => view),
    ).toEqual([
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
