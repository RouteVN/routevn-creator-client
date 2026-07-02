import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setProgressiveRenderedItemCount,
} from "../../src/components/charactersResourcesView/charactersResourcesView.store.js";

describe("charactersResourcesView.store", () => {
  it("limits character cards when progressive rendering is enabled", () => {
    const state = createInitialState();
    const props = {
      progressiveRender: true,
      groups: [
        {
          id: "folder-1",
          children: [
            { id: "character-1" },
            { id: "character-2" },
            { id: "character-3" },
            { id: "character-4" },
            { id: "character-5" },
          ],
        },
      ],
    };

    setProgressiveRenderedItemCount({ state }, { itemCount: 0 });
    const initialViewData = selectViewData({ state, props });
    expect(initialViewData.groups[0].children).toHaveLength(5);
    expect(initialViewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        isPlaceholder: true,
        domItemId: "",
        cursor: "default",
      }),
    );

    setProgressiveRenderedItemCount({ state }, { itemCount: 5 });
    const hydratedViewData = selectViewData({ state, props });
    expect(hydratedViewData.groups[0].children.map((item) => item.id)).toEqual([
      "character-1",
      "character-2",
      "character-3",
      "character-4",
      "character-5",
    ]);
  });

  it("does not show the empty add card for groups with child folders", () => {
    const state = createInitialState();
    const props = {
      groups: [
        {
          id: "parent-folder",
          children: [],
          hasChildFolders: true,
        },
        {
          id: "empty-folder",
          children: [],
        },
      ],
    };

    const viewData = selectViewData({ state, props });

    expect(viewData.groups[0]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
        showEmptyAdd: false,
      }),
    );
    expect(viewData.groups[1]).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
        showEmptyAdd: true,
      }),
    );
  });
});
