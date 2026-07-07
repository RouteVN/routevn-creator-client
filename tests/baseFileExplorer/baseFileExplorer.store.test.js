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

  it("uses the audio icon for sounds", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        items: [
          {
            id: "sound-1",
            type: "sound",
            name: "BGM",
            _level: 0,
            hasChildren: false,
            parentId: null,
          },
        ],
      },
    });

    expect(viewData.items).toHaveLength(1);
    expect(viewData.items[0].svg).toBe("audio");
  });

  it("preserves an explicit item icon", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        items: [
          {
            id: "custom-item-1",
            type: "custom-item",
            name: "Custom",
            svg: "component",
            _level: 0,
            hasChildren: false,
            parentId: null,
          },
        ],
      },
    });

    expect(viewData.items).toHaveLength(1);
    expect(viewData.items[0].svg).toBe("component");
  });

  it("keeps only the selected row highlighted while suppressing the post-drag touch click", () => {
    const state = createInitialState();
    state.selectedItemId = "item-1";
    state.suppressNextClick = true;

    const viewData = selectViewData({
      state,
      props: {
        items: [
          {
            id: "item-1",
            type: "image",
            name: "Image 1",
            _level: 0,
            hasChildren: false,
            parentId: null,
          },
          {
            id: "item-2",
            type: "image",
            name: "Image 2",
            _level: 0,
            hasChildren: false,
            parentId: null,
          },
        ],
      },
    });

    expect(viewData.items[0].bgc).toBe("mu");
    expect(viewData.items[0].hBgc).toBe("");
    expect(viewData.items[1].bgc).toBe("");
    expect(viewData.items[1].hBgc).toBe("");
  });

  it("keeps native touch panning when drag is disabled", () => {
    const state = createInitialState();
    const item = {
      id: "item-1",
      type: "image",
      name: "Image 1",
      _level: 0,
      hasChildren: false,
      parentId: null,
    };

    const disabledViewData = selectViewData({
      state,
      props: {
        items: [item],
      },
    });
    const enabledViewData = selectViewData({
      state,
      props: {
        items: [item],
        allowDrag: true,
      },
    });

    expect(disabledViewData.items[0].touchAction).toBe("pan-y");
    expect(enabledViewData.items[0].touchAction).toBe("none");
  });
});
