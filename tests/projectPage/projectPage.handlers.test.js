import { describe, expect, it, vi } from "vitest";
import {
  handleBackButtonKeyDown,
  handleProjectActionMenuClickItem,
} from "../../src/pages/project/project.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = () => ({
  appService: {
    navigate: vi.fn(),
  },
});

const createKeyEvent = (key) => ({
  key,
  preventDefault: vi.fn(),
});

describe("project page handlers", () => {
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
});
