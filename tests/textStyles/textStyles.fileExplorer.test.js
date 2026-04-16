import { describe, expect, it, vi } from "vitest";
import { createResourceFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

describe("createResourceFileExplorerHandlers", () => {
  it("duplicates a text style item and refreshes with the duplicate selected", async () => {
    const refresh = vi.fn(async () => {});
    const duplicateTextStyle = vi.fn(async () => "text-style-copy");
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          textStyles: {
            items: {
              "text-style-1": {
                id: "text-style-1",
                type: "textStyle",
                name: "Dialogue",
              },
            },
          },
        }),
        duplicateTextStyle,
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "textStyles",
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "text-style-1",
          item: {
            value: "duplicate-item",
          },
        },
      },
    });

    expect(duplicateTextStyle).toHaveBeenCalledWith({
      textStyleId: "text-style-1",
    });
    expect(refresh).toHaveBeenCalledWith(deps, {
      selectedItemId: "text-style-copy",
    });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});
