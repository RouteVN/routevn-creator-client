import { describe, expect, it } from "vitest";
import {
  addPendingUploads,
  cacheFontInfo,
  createInitialState,
  selectViewData,
  setItems,
  setSelectedItemId,
  updatePendingUpload,
} from "../../src/pages/fonts/fonts.store.js";
import { EN_I18N } from "../support/i18n.js";

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

describe("fonts store details", () => {
  it("does not expose extracted font metadata", () => {
    const context = {
      state: createInitialState(),
      i18n: EN_I18N,
    };
    setItems(context, {
      data: {
        tree: [{ id: "font-1" }],
        items: {
          "font-1": {
            id: "font-1",
            type: "font",
            name: "Test Font",
            fileId: "file-1",
          },
        },
      },
    });
    setSelectedItemId(context, { itemId: "font-1" });
    cacheFontInfo(context, {
      itemId: "font-1",
      fontInfo: {
        itemId: "font-1",
        format: "WOFF2",
        weightClass: "Normal",
        isVariableFont: "No",
        supportsItalics: "No",
        glyphCount: 100,
      },
    });

    const detailFields = selectViewData(context).detailFields;

    expect(detailFields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "section",
        }),
      ]),
    );
    expect(JSON.stringify(detailFields)).not.toMatch(
      /Metadata|Weight|Variable Font|Supports Italics|Glyph Count/,
    );
  });
});
