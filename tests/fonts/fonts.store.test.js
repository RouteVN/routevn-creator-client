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
  const selectFontDetailFields = (item, fontInfo) => {
    const context = {
      state: createInitialState(),
      i18n: EN_I18N,
    };
    setItems(context, {
      data: {
        tree: [{ id: "font-1" }],
        items: {
          "font-1": item,
        },
      },
    });
    setSelectedItemId(context, { itemId: "font-1" });
    if (fontInfo) {
      cacheFontInfo(context, {
        itemId: "font-1",
        fontInfo,
      });
    }

    return selectViewData(context).detailFields;
  };

  const baseFont = {
    id: "font-1",
    type: "font",
    name: "Test Font",
    fileId: "file-1",
  };

  it("shows one supported weight for a static font", () => {
    const detailFields = selectFontDetailFields({
      ...baseFont,
      minWeight: 400,
      defaultWeight: 400,
      maxWeight: 400,
    });

    expect(detailFields).toContainEqual({
      type: "text",
      label: "Supported Font Weights",
      value: "400",
    });
  });

  it("shows the supported range for a variable font", () => {
    const detailFields = selectFontDetailFields({
      ...baseFont,
      minWeight: 100,
      defaultWeight: 400,
      maxWeight: 900,
    });

    expect(detailFields).toContainEqual({
      type: "text",
      label: "Supported Font Weights",
      value: "100\u2013900",
    });
  });

  it("shows unknown without exposing removed extracted font metadata", () => {
    const detailFields = selectFontDetailFields(baseFont, {
      itemId: "font-1",
      format: "WOFF2",
      weightClass: "Normal",
      isVariableFont: "No",
      supportsItalics: "No",
      glyphCount: 100,
    });

    expect(detailFields).toContainEqual({
      type: "text",
      label: "Supported Font Weights",
      value: "Unknown",
    });

    expect(detailFields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "section",
        }),
      ]),
    );
    expect(JSON.stringify(detailFields)).not.toMatch(
      /Metadata|Variable Font|Supports Italics|Glyph Count/,
    );
  });
});
