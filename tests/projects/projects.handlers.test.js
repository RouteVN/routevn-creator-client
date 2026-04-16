import { describe, expect, it, vi } from "vitest";
import { handleProjectsClick } from "../../src/pages/projects/projects.handlers.js";

const createDeps = ({
  ensureProjectCompatibleById = vi.fn(async () => {}),
} = {}) => {
  const appService = {
    showAlert: vi.fn(),
    setCurrentProjectEntry: vi.fn(),
    navigate: vi.fn(),
  };

  return {
    appService,
    projectService: {
      ensureProjectCompatibleById,
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
        "Unsupported project version. Make sure the project was created with RouteVN Creator v1 or later.",
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
      message: "Failed to open project.",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
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
