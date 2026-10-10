import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  createLayoutTemplate,
  handleAfterMount,
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

  it("creates an empty input layout template", () => {
    const template = createLayoutTemplate("input", projectResolution);

    expect(template).toEqual({
      items: {},
      tree: [],
    });
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

  it("creates layouts with empty elements and metadata, and has their thumbnails drawn", async () => {
    const createLayoutItem = vi.fn(async () => "layout-1");
    const deps = {
      i18n: EN_I18N,
      store: {
        selectTargetGroupId: () => "group-1",
        closeAddDialog: vi.fn(),
        setItems: vi.fn(),
        setTagsData: vi.fn(),
      },
      projectService: {
        createLayoutItem,
        requestLayoutThumbnails: vi.fn(async () => {}),
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
            name: "Choices",
            layoutType: "choice",
            description: "Choice menu",
            isFragment: "true",
          },
        },
      },
    });

    expect(createLayoutItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Choices",
        layoutType: "choice",
        parentId: "group-1",
        position: "last",
        elements: {
          items: {},
          tree: [],
        },
        data: expect.objectContaining({
          description: "Choice menu",
          isFragment: true,
          tagIds: [],
        }),
      }),
    );
    expect(deps.store.closeAddDialog).toHaveBeenCalled();
    // Its thumbnail is drawn in the background.
    const { layoutId } = createLayoutItem.mock.calls[0][0];
    expect(deps.projectService.requestLayoutThumbnails).toHaveBeenCalledWith({
      layoutIds: [layoutId],
    });
  });

  it("selects a layout without logging", () => {
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
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("ignores a repeated layout click without logging", () => {
    const layoutData = {
      id: "layout-1",
      type: "layout",
      name: "Layout One",
      layoutType: "general",
    };
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "layout-1"),
        setSelectedItemId: vi.fn(),
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

      expect(deps.store.setSelectedItemId).not.toHaveBeenCalled();
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("duplicates a layout and selects the duplicate", async () => {
    const duplicateLayoutItem = vi.fn(async () => "layout-copy");
    const deps = {
      i18n: EN_I18N,
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

  it("has out-of-date thumbnails drawn in the background when it opens", () => {
    // Opening also focuses the explorer on the next frame.
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const deps = {
      i18n: EN_I18N,
      appService: { getPayload: vi.fn(() => ({ p: "project-1" })) },
      projectService: {
        getRepositoryState: () => ({
          project: { resolution: projectResolution },
          layouts: { items: {}, tree: [] },
        }),
        requestLayoutThumbnails: vi.fn(async () => {}),
      },
      store: {
        setItems: vi.fn(),
        setTagsData: vi.fn(),
        setSelectedItemId: vi.fn(),
        selectSelectedItemId: vi.fn(() => undefined),
      },
      refs: { fileExplorer: { selectItem: vi.fn() } },
      render: vi.fn(),
    };

    try {
      handleAfterMount(deps);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(deps.projectService.requestLayoutThumbnails).toHaveBeenCalledWith();
  });
});
