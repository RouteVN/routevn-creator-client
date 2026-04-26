import { describe, expect, it, vi } from "vitest";
import {
  createLayoutTemplate,
  handleItemDuplicate,
  handleLayoutFormActionClick,
  handleLayoutItemClick,
} from "../../src/pages/layouts/layouts.handlers.js";

describe("createLayoutTemplate", () => {
  const projectResolution = {
    width: 1920,
    height: 1080,
  };

  it("creates an NVL layout template without throwing", () => {
    const template = createLayoutTemplate("nvl", projectResolution);

    expect(template).toBeDefined();
    expect(Array.isArray(template.tree)).toBe(true);
    expect(Object.keys(template.items).length).toBeGreaterThan(0);
  });

  it("creates a save-load layout template without throwing", () => {
    const template = createLayoutTemplate("save-load", projectResolution);

    expect(template).toBeDefined();
    expect(Array.isArray(template.tree)).toBe(true);
    expect(Object.keys(template.items).length).toBeGreaterThan(0);
  });

  it("creates a confirm dialog layout template without throwing", () => {
    const template = createLayoutTemplate("confirmDialog", projectResolution);

    expect(template).toBeDefined();
    expect(Array.isArray(template.tree)).toBe(true);
    expect(Object.keys(template.items).length).toBeGreaterThan(0);
  });

  it("creates a history layout template without throwing", () => {
    const template = createLayoutTemplate("history", projectResolution);
    const historyItems = Object.values(template.items);
    const closeText = historyItems.find(
      (item) => item.name === "Close Button Text",
    );

    expect(template).toBeDefined();
    expect(Array.isArray(template.tree)).toBe(true);
    expect(Object.keys(template.items).length).toBeGreaterThan(0);
    expect(
      historyItems.some((item) => item.type === "container-ref-history-line"),
    ).toBe(true);
    expect(
      historyItems.some(
        (item) =>
          item.type === "rect" && item.name === "Close Button Background",
      ),
    ).toBe(false);
    expect(closeText).toMatchObject({
      type: "text",
      click: {
        payload: {
          actions: {
            popOverlay: {},
          },
        },
      },
    });
  });

  it("creates layouts with description and fragment data", async () => {
    const createLayoutItem = vi.fn(async () => "layout-1");
    const deps = {
      store: {
        getState: () => ({
          targetGroupId: "group-1",
        }),
        closeAddDialog: vi.fn(),
        setItems: vi.fn(),
        setTagsData: vi.fn(),
      },
      projectService: {
        createLayoutItem,
        getRepositoryState: () => ({
          project: {
            resolution: projectResolution,
          },
          layouts: {
            items: {},
            tree: [],
          },
        }),
      },
      appService: {
        showAlert: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleLayoutFormActionClick(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Save",
            layoutType: "save-load",
            description: "Reusable save fragment",
            isFragment: "true",
          },
        },
      },
    });

    expect(createLayoutItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Save",
        layoutType: "save-load",
        parentId: "group-1",
        position: "last",
        data: expect.objectContaining({
          description: "Reusable save fragment",
          isFragment: true,
          tagIds: [],
        }),
      }),
    );
    expect(deps.store.closeAddDialog).toHaveBeenCalled();
  });

  it("prints the selected layout data after selecting a layout", () => {
    const layoutData = {
      id: "layout-1",
      type: "layout",
      name: "Layout One",
      layoutType: "general",
    };
    let selectedItemId;
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => selectedItemId),
        setSelectedItemId: vi.fn(({ itemId } = {}) => {
          selectedItemId = itemId;
        }),
        selectLayoutItemById: vi.fn(({ itemId } = {}) =>
          itemId === "layout-1" ? layoutData : undefined,
        ),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    try {
      handleLayoutItemClick(deps, {
        _event: {
          detail: {
            itemId: "layout-1",
          },
        },
      });

      expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
        itemId: "layout-1",
      });
      expect(consoleLog).toHaveBeenCalledWith(
        "[layouts] selected layout data",
        {
          selectedItemId: "layout-1",
          layoutData,
        },
      );
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("duplicates a layout and selects the duplicate", async () => {
    const duplicateLayoutItem = vi.fn(async () => "layout-copy");
    const deps = {
      store: {
        setItems: vi.fn(),
        setTagsData: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      projectService: {
        duplicateLayoutItem,
        getRepositoryState: () => ({
          layouts: {
            items: {
              "layout-1": {
                id: "layout-1",
                type: "layout",
                name: "Layout One",
              },
              "layout-copy": {
                id: "layout-copy",
                type: "layout",
                name: "Layout One",
              },
            },
            tree: [{ id: "layout-1" }, { id: "layout-copy" }],
          },
        }),
      },
      appService: {
        showAlert: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleItemDuplicate(deps, {
      _event: {
        detail: {
          itemId: "layout-1",
        },
      },
    });

    expect(duplicateLayoutItem).toHaveBeenCalledWith({
      layoutId: "layout-1",
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "layout-copy",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "layout-copy",
    });
  });
});
