import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/mediaResourcesView/mediaResourcesView.store.js";

describe("mediaResourcesView.store", () => {
  it("does not show a strong hover border on non-selected cards while another card is selected", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        selectedItemId: "sprite-1",
        groups: [
          {
            id: "folder-1",
            children: [
              { id: "sprite-1", cardKind: "image" },
              { id: "sprite-2", cardKind: "image" },
            ],
          },
        ],
      },
    });

    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        itemBorderColor: "pr",
        itemHoverBorderColor: "pr",
      }),
    );
    expect(viewData.groups[0].children[1]).toEqual(
      expect.objectContaining({
        itemBorderColor: "bo",
        itemHoverBorderColor: "bo",
      }),
    );
  });

  it("keeps the hover border for interactive cards when nothing is selected", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        groups: [
          {
            id: "folder-1",
            children: [{ id: "sprite-1", cardKind: "image" }],
          },
        ],
      },
    });

    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        itemBorderColor: "bo",
        itemHoverBorderColor: "ac",
      }),
    );
  });
});
