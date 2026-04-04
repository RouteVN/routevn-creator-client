import { describe, expect, it, vi } from "vitest";
import { createLayoutsFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

describe("createLayoutsFileExplorerHandlers", () => {
  it("duplicates a layout item and refreshes with the duplicate selected", async () => {
    const refresh = vi.fn(async () => {});
    const duplicateLayoutItem = vi.fn(async () => "layout-copy");
    const deps = {
      appService: {
        showToast: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          layouts: {
            items: {
              "layout-1": {
                id: "layout-1",
                type: "layout",
                name: "Layout One",
              },
            },
          },
        }),
        duplicateLayoutItem,
      },
    };
    const handlers = createLayoutsFileExplorerHandlers({ refresh });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "layout-1",
          item: {
            value: "duplicate-item",
          },
        },
      },
    });

    expect(duplicateLayoutItem).toHaveBeenCalledWith({
      layoutId: "layout-1",
    });
    expect(refresh).toHaveBeenCalledWith(deps, {
      selectedItemId: "layout-copy",
    });
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });
});
