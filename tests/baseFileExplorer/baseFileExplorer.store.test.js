import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/baseFileExplorer/baseFileExplorer.store.js";

describe("baseFileExplorer.store", () => {
  it("uses the fragment icon for fragment layouts", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        items: [
          {
            id: "layout-fragment",
            type: "layout",
            name: "Save Slot",
            isFragment: true,
            _level: 0,
            hasChildren: false,
            parentId: null,
          },
        ],
      },
    });

    expect(viewData.items).toHaveLength(1);
    expect(viewData.items[0].svg).toBe("fragment");
  });

  it("uses the fragment icon for fragment references", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        items: [
          {
            id: "fragment-ref-1",
            type: "fragment-ref",
            name: "Fragment",
            _level: 0,
            hasChildren: false,
            parentId: null,
          },
        ],
      },
    });

    expect(viewData.items).toHaveLength(1);
    expect(viewData.items[0].svg).toBe("fragment");
  });
});
