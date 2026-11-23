import { describe, expect, it, vi } from "vitest";
import { createResourceFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";
import { EN_I18N } from "../support/i18n.js";

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

  // A visual on a line can hold its own layout, with text in a text style.
  it("blocks deleting a text style that a line's visual uses", async () => {
    const deleteTextStyles = vi.fn(async () => ({ valid: true }));
    const deps = {
      i18n: EN_I18N,
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
                name: "Caption",
              },
              "text-style-2": {
                id: "text-style-2",
                type: "textStyle",
                name: "Dialogue",
              },
            },
          },
        }),
        checkResourceUsage: vi.fn(async () => ({
          isUsed: true,
          count: 1,
          inProps: {
            lines: [{ property: "textStyleId" }],
          },
        })),
        deleteTextStyles,
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "textStyles",
      refresh: vi.fn(async () => {}),
    });

    await handlers.handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "text-style-1",
          item: {
            value: "delete-item",
          },
        },
      },
    });

    expect(deps.projectService.checkResourceUsage).toHaveBeenCalledWith({
      itemId: "text-style-1",
      checkTargets: ["scenes", "layouts", "controls"],
    });
    expect(deleteTextStyles).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Cannot delete resource, it is currently in use.",
    });
  });
});
