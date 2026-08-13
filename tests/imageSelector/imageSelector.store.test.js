import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setImages,
} from "../../src/components/imageSelector/imageSelector.store.js";

const createImages = () => ({
  items: {
    "folder-1": {
      id: "folder-1",
      type: "folder",
      name: "Folder One",
    },
    "image-1": {
      id: "image-1",
      type: "image",
      name: "Image One",
    },
  },
  tree: [{ id: "folder-1", children: [{ id: "image-1" }] }],
});

describe("imageSelector.store", () => {
  it("uses fixed card widths by default", () => {
    const state = createInitialState();
    setImages({ state }, { images: createImages() });

    const viewData = selectViewData({ state });

    expect(viewData.imageGridStyle).toBe("");
    expect(viewData.groups[0].children[0].imageCardStyle).toContain(
      "width: 200px",
    );
  });

  it("fills a requested two-column grid", () => {
    const state = createInitialState();
    setImages({ state }, { images: createImages() });

    const viewData = selectViewData({ state, props: { columns: 2 } });

    expect(viewData.imageGridStyle).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
    expect(viewData.groups[0].children[0].imageCardStyle).toContain(
      "width: 100%",
    );
  });
});
