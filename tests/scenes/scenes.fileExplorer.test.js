import { describe, expect, it, vi } from "vitest";
import { createScenesFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

describe("scenes file explorer", () => {
  it.each([
    {
      explorerPosition: "above",
      repositoryPosition: "before",
    },
    {
      explorerPosition: "below",
      repositoryPosition: "after",
    },
  ])(
    "preserves the drop target when moving a scene $explorerPosition a sibling",
    async ({ explorerPosition, repositoryPosition }) => {
      const refresh = vi.fn(async () => {});
      const reorderSceneItem = vi.fn(async () => {});
      const deps = {
        projectService: {
          ensureRepository: vi.fn(async () => {}),
          reorderSceneItem,
        },
      };
      const handlers = createScenesFileExplorerHandlers({ refresh });

      await handlers.handleFileExplorerTargetChanged(deps, {
        _event: {
          detail: {
            source: {
              id: "scene-3",
            },
            target: {
              id: "scene-1",
              parentId: "folder-1",
            },
            position: explorerPosition,
          },
        },
      });

      expect(reorderSceneItem).toHaveBeenCalledWith({
        sceneId: "scene-3",
        parentId: "folder-1",
        position: repositoryPosition,
        positionTargetId: "scene-1",
      });
      expect(refresh).toHaveBeenCalledWith(deps);
    },
  );

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
