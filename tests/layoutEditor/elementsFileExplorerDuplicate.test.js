import { describe, expect, it, vi } from "vitest";
import { createLayoutElementsFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

const duplicateDetail = {
  _event: {
    detail: { itemId: "box", item: { value: "duplicate-item" } },
  },
};

const createDeps = (projectService) => ({
  appService: { showAlert: vi.fn() },
  projectService: {
    ensureRepository: vi.fn(async () => {}),
    getState: () => ({}),
    createLayoutElement: vi.fn(),
    updateLayoutElement: vi.fn(),
    deleteLayoutElement: vi.fn(),
    createControlElement: vi.fn(),
    updateControlElement: vi.fn(),
    deleteControlElement: vi.fn(),
    ...projectService,
  },
});

describe("createLayoutElementsFileExplorerHandlers duplicate", () => {
  it("duplicates a layout element and selects the copy", async () => {
    const refresh = vi.fn(async () => {});
    const duplicateLayoutElement = vi.fn(async () => "box-copy");
    const deps = createDeps({ duplicateLayoutElement });
    const handlers = createLayoutElementsFileExplorerHandlers({
      getLayoutId: () => "layout-1",
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, duplicateDetail);

    expect(duplicateLayoutElement).toHaveBeenCalledWith({
      layoutId: "layout-1",
      elementId: "box",
    });
    expect(refresh).toHaveBeenCalledWith(deps, { selectedItemId: "box-copy" });
  });

  it("duplicates a control element through the control API", async () => {
    const duplicateControlElement = vi.fn(async () => "box-copy");
    const deps = createDeps({ duplicateControlElement });
    const handlers = createLayoutElementsFileExplorerHandlers({
      getLayoutId: () => "control-1",
      getResourceType: () => "controls",
    });

    await handlers.handleFileExplorerAction(deps, duplicateDetail);

    expect(duplicateControlElement).toHaveBeenCalledWith({
      controlId: "control-1",
      elementId: "box",
    });
  });

  it("alerts and keeps the selection when the copy fails", async () => {
    const refresh = vi.fn(async () => {});
    const deps = createDeps({
      duplicateLayoutElement: vi.fn(async () => ({
        valid: false,
        error: { message: "nope" },
      })),
    });
    const handlers = createLayoutElementsFileExplorerHandlers({
      getLayoutId: () => "layout-1",
      refresh,
    });

    await handlers.handleFileExplorerAction(deps, duplicateDetail);

    expect(deps.appService.showAlert).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
