import { describe, expect, it, vi } from "vitest";
import { handleItemDuplicate } from "../../src/pages/textStyles/textStyles.handlers.js";

describe("textStyles.handlers", () => {
  it("duplicates a text style and selects the duplicate", async () => {
    const duplicateTextStyle = vi.fn(async () => "text-style-copy");
    const deps = {
      store: {
        setItems: vi.fn(),
        setColorsData: vi.fn(),
        setFontsData: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      projectService: {
        duplicateTextStyle,
        getState: () => ({
          textStyles: {
            items: {
              "text-style-1": {
                id: "text-style-1",
                type: "textStyle",
                name: "Dialogue",
              },
              "text-style-copy": {
                id: "text-style-copy",
                type: "textStyle",
                name: "Dialogue",
              },
            },
            tree: [{ id: "text-style-1" }, { id: "text-style-copy" }],
          },
          colors: {
            items: {},
            tree: [],
          },
          fonts: {
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

    await handleItemDuplicate(deps, {
      _event: {
        detail: {
          itemId: "text-style-1",
        },
      },
    });

    expect(duplicateTextStyle).toHaveBeenCalledWith({
      textStyleId: "text-style-1",
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "text-style-copy",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "text-style-copy",
    });
  });
});
