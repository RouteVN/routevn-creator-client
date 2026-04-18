import { describe, expect, it, vi } from "vitest";
import {
  handleDeleteDialogConfirm,
  handleOpenButtonClick,
  handleProjectContextMenu,
  handleProjectsClick,
} from "../../src/pages/projects/projects.handlers.js";

const createDeps = ({
  ensureProjectCompatibleById = vi.fn(async () => {}),
} = {}) => {
  const appService = {
    getPlatform: vi.fn(() => "tauri"),
    openFolderPicker: vi.fn(),
    openExistingProject: vi.fn(),
    loadAllProjects: vi.fn(async () => []),
    showAlert: vi.fn(),
    showToast: vi.fn(),
    setCurrentProjectEntry: vi.fn(),
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
      selectProjects: vi.fn(() => [
        {
          id: "project-1",
          name: "Project One",
          projectPath: "/projects/project-one",
        },
      ]),
      openDropdownMenu: vi.fn(),
      selectDeleteDialogProjectId: vi.fn(() => ""),
      selectDeleteDialogProjectPath: vi.fn(() => ""),
      closeDeleteDialog: vi.fn(),
      removeProject: vi.fn(),
    },
    render: vi.fn(),
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
        "You're trying to open an incompatible project with version 1 using RouteVN Creator project format 2. For assistance, please reach out to RouteVN staff for support.",
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
        "Unsupported project version. Make sure the project was created with RouteVN Creator v1 or later. Contact RouteVN for support on migrating the old project.",
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
        "Unsupported project store format. This RouteVN Creator build only supports the current project storage layout and will not repair older local stores automatically.",
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
        "Failed to open project. An unexpected error occurred while preparing the project.",
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
      message: "Project is missing required resolution settings.",
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
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith("/project", {
      p: "project-1",
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});

describe("projects.handleOpenButtonClick", () => {
  it("reloads the project list and shows a toast after a successful import", async () => {
    const deps = createDeps();
    deps.appService.openFolderPicker.mockResolvedValue(
      "/projects/DiaLune-migrated",
    );
    deps.appService.openExistingProject.mockResolvedValue({
      id: "project-2",
      name: "DiaLune",
      projectPath: "/projects/DiaLune-migrated",
    });
    deps.appService.loadAllProjects.mockResolvedValue([
      {
        id: "project-1",
        name: "Project One",
        projectPath: "/projects/project-one",
      },
      {
        id: "project-2",
        name: "DiaLune",
        projectPath: "/projects/DiaLune-migrated",
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
          name: "DiaLune",
          projectPath: "/projects/DiaLune-migrated",
        },
      ],
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: 'Project "DiaLune" imported.',
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
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});
