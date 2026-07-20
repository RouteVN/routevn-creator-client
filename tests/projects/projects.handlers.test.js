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
  handleDeleteDialogConfirm,
  handleLanguageDialogClose,
  handleLanguageFormAction,
  handleOpenButtonClick,
  handleBeforeMount,
  handleProjectContextMenu,
  handleProjectsClick,
} from "../../src/pages/projects/projects.handlers.js";

const EN_I18N_URL = new URL("../../src/i18n/en.yaml", import.meta.url);
const EN_I18N = yaml.load(readFileSync(EN_I18N_URL, "utf8"));

const createDeps = ({
  ensureProjectCompatibleById = vi.fn(async () => {}),
  platform = "tauri",
} = {}) => {
  const appService = {
    getPlatform: vi.fn(() => platform),
    openFolderPicker: vi.fn(),
    openExistingProject: vi.fn(),
    loadAllProjects: vi.fn(async () => []),
    getCachedProjects: vi.fn(() => undefined),
    createNewProject: vi.fn(async () => ({
      id: "project-2",
      name: "New Project",
      projectPath: "/projects/new-project",
    })),
    showAlert: vi.fn(),
    showToast: vi.fn(),
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
      setUiConfig: vi.fn(),
      selectProjects: vi.fn(() => [
        {
          id: "project-1",
          name: "Project One",
          projectPath: "/projects/project-one",
        },
      ]),
      openDropdownMenu: vi.fn(),
      openAppVersionMenu: vi.fn(),
      closeAppVersionMenu: vi.fn(),
      selectIsAppVersionMenuOpen: vi.fn(() => true),
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
      closeDeleteDialog: vi.fn(),
      removeProject: vi.fn(),
    },
    updaterService: {
      checkForUpdates: vi.fn(async () => {}),
    },
    i18n: EN_I18N,
    locale: {
      available: vi.fn(() => ["en", "ja", "zh-hans"]),
      current: vi.fn(() => "en"),
      set: vi.fn(async () => {}),
    },
    render: vi.fn(),
    refs: {
      projectCreateDialogBody: {
        validate: vi.fn(async () => ({ valid: true })),
        getValues: vi.fn(async () => ({
          name: "New Project",
          description: "",
          language: "ja",
          iconFile: undefined,
          template: "default",
          resolution: "1920x1080",
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          projectPath: "/projects/new-project",
        })),
      },
    },
  };
};

const createPayload = (projectId = "project-1") => {
  return {
    _event: {
      currentTarget: {
        dataset: {
          projectId,
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

  it("suggests updating RouteVN Creator for project data validation errors", async () => {
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
        "Project data structure failed validation.\nMake sure you're using the latest version of RouteVN Creator.",
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
});

describe("projects create dialog", () => {
  it("opens the page-owned create dialog", () => {
    const deps = createDeps();

    handleCreateButtonClick(deps);

    expect(deps.store.openCreateDialog).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();
  });

  it("creates a project from the page-owned dialog body methods", async () => {
    const deps = createDeps();

    await handleCreateDialogSubmit(deps);

    expect(deps.refs.projectCreateDialogBody.validate).toHaveBeenCalled();
    expect(deps.refs.projectCreateDialogBody.getValues).toHaveBeenCalled();
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
    expect(deps.store.closeCreateDialog).toHaveBeenCalled();
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

describe("projects.handleOpenButtonClick", () => {
  it("reloads the project list and shows a toast after a successful import", async () => {
    const deps = createDeps();
    deps.appService.openFolderPicker.mockResolvedValue(
      "/projects/project-two-migrated",
    );
    deps.appService.openExistingProject.mockResolvedValue({
      id: "project-2",
      name: "Project Two",
      projectPath: "/projects/project-two-migrated",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      {
        id: "project-1",
        name: "Project One",
        projectPath: "/projects/project-one",
      },
      {
        id: "project-2",
        name: "Project Two",
        projectPath: "/projects/project-two-migrated",
      },
    ]);

    await handleOpenButtonClick(deps);

    expect(deps.store.setProjects).toHaveBeenCalledWith({
      projects: [
        {
          id: "project-1",
          name: "Project One",
          projectPath: "/projects/project-one",
        },
        {
          id: "project-2",
          name: "Project Two",
          projectPath: "/projects/project-two-migrated",
        },
      ],
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: 'Project "Project Two" imported.',
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});

describe("projects.handleDeleteDialogConfirm", () => {
  it("releases a local project runtime before removing its project entry", async () => {
    const deps = createDeps();
    deps.store.selectDeleteDialogProjectId.mockReturnValue("project-1");

    deps.appService.removeProjectEntry = vi.fn(async () => {});

    await handleDeleteDialogConfirm(deps);

    expect(deps.projectService.releaseProjectRuntime).toHaveBeenCalledWith(
      "project-1",
    );
    expect(deps.appService.removeProjectEntry).toHaveBeenCalledWith(
      "project-1",
    );
    expect(deps.store.removeProject).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(deps.store.closeDeleteDialog).toHaveBeenCalledTimes(1);
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
            projectIndex: "0",
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

  it("derives the project path from store for a normal local project row", () => {
    const deps = createDeps();

    handleProjectContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            projectId: "project-1",
            projectIndex: "0",
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
});
