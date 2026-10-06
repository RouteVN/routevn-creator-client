import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectFontCapabilities,
  setFontCapabilities,
  setResourceData,
} from "../../src/pages/textStyleEditor/textStyleEditor.store.js";

const createFontsData = (font) => ({
  tree: [{ id: "font-1" }],
  items: { "font-1": { id: "font-1", type: "font", ...font } },
});

const staticCapabilities = (weight) => ({
  kind: "static",
  minWeight: weight,
  defaultWeight: weight,
  maxWeight: weight,
});

describe("text style editor store", () => {
  it("reads a font's weights again when its file or saved weights change", () => {
    const state = createInitialState();
    const fontOne = { fileId: "file-1", minWeight: 400, defaultWeight: 400 };
    setResourceData({ state }, { fontsData: createFontsData(fontOne) });
    setFontCapabilities(
      { state },
      { fontId: "font-1", capabilities: staticCapabilities(400) },
    );

    // Another color changes nothing about the font.
    setResourceData(
      { state },
      {
        colorsData: { tree: [], items: {} },
        fontsData: createFontsData(fontOne),
      },
    );
    expect(selectFontCapabilities({ state }, { fontId: "font-1" })).toEqual(
      staticCapabilities(400),
    );

    setResourceData(
      { state },
      { fontsData: createFontsData({ ...fontOne, fileId: "file-2" }) },
    );
    expect(
      selectFontCapabilities({ state }, { fontId: "font-1" }),
    ).toBeUndefined();

    setFontCapabilities(
      { state },
      { fontId: "font-1", capabilities: staticCapabilities(400) },
    );
    setResourceData(
      { state },
      {
        fontsData: createFontsData({
          fileId: "file-2",
          minWeight: 100,
          defaultWeight: 400,
          maxWeight: 900,
        }),
      },
    );
    expect(
      selectFontCapabilities({ state }, { fontId: "font-1" }),
    ).toBeUndefined();
  });
});
