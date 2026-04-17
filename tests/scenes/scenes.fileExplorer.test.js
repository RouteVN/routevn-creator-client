import { describe, expect, it, vi } from "vitest";
import { createScenesFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

describe("scenes file explorer", () => {
  it("shows an error when creating a folder fails", async () => {
    const refresh = vi.fn(async () => {});
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        createSceneItem: vi.fn(async () => ({
          valid: false,
          error: {
            message: "cannot create folder",
          },
        })),
      },
    };
    const handlers = createScenesFileExplorerHandlers({
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          item: {
            value: "new-item",
          },
        },
      },
    });

    expect(deps.projectService.createSceneItem).toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "cannot create folder",
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
