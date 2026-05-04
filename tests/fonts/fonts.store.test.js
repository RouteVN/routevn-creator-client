import { describe, expect, it } from "vitest";
import {
  addPendingUploads,
  createInitialState,
  updatePendingUpload,
} from "../../src/pages/fonts/fonts.store.js";

describe("fonts store pending uploads", () => {
  it("can attach the created font id to a pending upload", () => {
    const state = createInitialState();

    addPendingUploads(
      { state },
      {
        items: [
          {
            id: "pending-font-1",
            parentId: "folder-1",
            name: "Inter",
          },
        ],
      },
    );
    updatePendingUpload(
      { state },
      {
        itemId: "pending-font-1",
        updates: {
          resolvedItemId: "font-1",
        },
      },
    );

    expect(state.pendingUploads).toEqual([
      {
        id: "pending-font-1",
        parentId: "folder-1",
        name: "Inter",
        resolvedItemId: "font-1",
      },
    ]);
  });
});
