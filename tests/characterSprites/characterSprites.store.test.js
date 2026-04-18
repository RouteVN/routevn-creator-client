import { describe, expect, it } from "vitest";
import {
  addPendingUploads,
  createInitialState,
  removePendingUploads,
  selectViewData,
} from "../../src/pages/characterSprites/characterSprites.store.js";

describe("characterSprites store", () => {
  it("hides a resolved sprite item while its pending upload card is still visible", () => {
    const state = createInitialState();
    state.characterName = "Hero";
    state.spritesData = {
      tree: [
        {
          id: "folder-1",
          children: [{ id: "sprite-1" }],
        },
      ],
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Main",
        },
        "sprite-1": {
          id: "sprite-1",
          type: "image",
          name: "Hero Idle",
          fileId: "file-1",
          thumbnailFileId: "thumb-1",
        },
      },
    };

    addPendingUploads(
      { state },
      {
        items: [
          {
            id: "pending-sprite-1",
            parentId: "folder-1",
            name: "Hero Idle",
            resolvedItemId: "sprite-1",
          },
        ],
      },
    );

    const viewDataWhilePending = selectViewData({ state });
    expect(viewDataWhilePending.mediaGroups[0].children.map((child) => child.id))
      .toEqual(["pending-sprite-1"]);

    removePendingUploads(
      { state },
      {
        itemIds: ["pending-sprite-1"],
      },
    );

    const viewDataAfterPending = selectViewData({ state });
    expect(viewDataAfterPending.mediaGroups[0].children.map((child) => child.id))
      .toEqual(["sprite-1"]);
  });
});
