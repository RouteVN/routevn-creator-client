import { describe, expect, it } from "vitest";
import {
  commitDetailTagIds,
  createInitialState,
  setDetailTagIds,
  setItems,
  setSelectedItemId,
  setTagsData,
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
