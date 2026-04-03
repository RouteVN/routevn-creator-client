import { describe, expect, it, vi } from "vitest";
import {
  createLayoutTemplate,
  handleLayoutFormActionClick,
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

  it("creates layouts with description and fragment data", async () => {
    const createLayoutItem = vi.fn(async () => "layout-1");
    const deps = {
      store: {
        getState: () => ({
          targetGroupId: "group-1",
        }),
        closeAddDialog: vi.fn(),
        setItems: vi.fn(),
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
        showToast: vi.fn(),
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
            isFragment: true,
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
        data: {
          description: "Reusable save fragment",
          isFragment: true,
        },
      }),
    );
    expect(deps.store.closeAddDialog).toHaveBeenCalled();
  });
});
