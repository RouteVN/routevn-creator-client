import { describe, expect, it } from "vitest";
import {
  commitDetailTagIds,
  createInitialState,
  selectAdjacentImageItemId,
  setDetailTagIds,
  setItems,
  setSelectedItemId,
  setTagsData,
  showFullImagePreview,
} from "../../src/pages/images/images.store.js";

const createContext = () => ({
  state: createInitialState(),
});

describe("images store detail tag draft", () => {
  it("preserves a local detail tag draft across tag-only data refreshes", () => {
    const context = createContext();

    setTagsData(context, {
      tagsData: {
        tree: [{ id: "tag-1" }],
        items: {
          "tag-1": {
            id: "tag-1",
            type: "tag",
            name: "Background",
          },
        },
      },
    });
    setItems(context, {
      data: {
        tree: [{ id: "image-1" }],
        items: {
          "image-1": {
            id: "image-1",
            type: "image",
            name: "Hero",
            tagIds: [],
          },
        },
      },
    });
    setSelectedItemId(context, {
      itemId: "image-1",
    });

    setDetailTagIds(context, {
      tagIds: ["tag-1"],
    });
    setItems(context, {
      data: {
        tree: [{ id: "image-1" }],
        items: {
          "image-1": {
            id: "image-1",
            type: "image",
            name: "Hero",
            tagIds: [],
          },
        },
      },
    });

    expect(context.state.detailTagIds).toEqual(["tag-1"]);
    expect(context.state.detailTagIdsDirty).toBe(true);
  });

  it("clears the local draft after the detail tag selection is saved", () => {
    const context = createContext();

    setTagsData(context, {
      tagsData: {
        tree: [{ id: "tag-1" }],
        items: {
          "tag-1": {
            id: "tag-1",
            type: "tag",
            name: "Background",
          },
        },
      },
    });

    setDetailTagIds(context, {
      tagIds: ["tag-1"],
    });
    commitDetailTagIds(context, {
      tagIds: ["tag-1"],
    });

    expect(context.state.detailTagIds).toEqual(["tag-1"]);
    expect(context.state.detailTagIdsDirty).toBe(false);
  });
});

describe("images store preview navigation", () => {
  it("uses the original file for the full preview overlay", () => {
    const context = createContext();

    setItems(context, {
      data: {
        tree: [{ id: "image-1" }],
        items: {
          "image-1": {
            id: "image-1",
            type: "image",
            name: "Image 1",
            fileId: "original-file",
            thumbnailFileId: "thumbnail-file",
          },
        },
      },
    });

    showFullImagePreview(context, {
      itemId: "image-1",
    });

    expect(context.state.fullImagePreviewVisible).toBe(true);
    expect(context.state.fullImagePreviewFileId).toBe("original-file");
  });

  it("jumps adjacent image selection by distance and clamps to visible bounds", () => {
    const context = createContext();

    setItems(context, {
      data: {
        tree: [
          { id: "image-1" },
          { id: "image-2" },
          { id: "image-3" },
          { id: "image-4" },
          { id: "image-5" },
        ],
        items: {
          "image-1": {
            id: "image-1",
            type: "image",
            name: "Image 1",
          },
          "image-2": {
            id: "image-2",
            type: "image",
            name: "Image 2",
          },
          "image-3": {
            id: "image-3",
            type: "image",
            name: "Image 3",
          },
          "image-4": {
            id: "image-4",
            type: "image",
            name: "Image 4",
          },
          "image-5": {
            id: "image-5",
            type: "image",
            name: "Image 5",
          },
        },
      },
    });

    expect(
      selectAdjacentImageItemId(context, {
        itemId: "image-2",
        direction: "next",
        distance: 10,
        clamp: true,
      }),
    ).toBe("image-5");
    expect(
      selectAdjacentImageItemId(context, {
        itemId: "image-2",
        direction: "previous",
        distance: 10,
        clamp: true,
      }),
    ).toBe("image-1");
    expect(
      selectAdjacentImageItemId(context, {
        itemId: "image-5",
        direction: "next",
      }),
    ).toBeUndefined();
  });
});
