import { describe, expect, it } from "vitest";
import { extractFileIdsFromRenderState } from "../../src/internal/project/layout.js";

describe("layout font families", () => {
  it("extracts every font file from an ordered font family array", () => {
    expect(
      extractFileIdsFromRenderState({
        textStyle: {
          fontFamily: ["font-latin", "font-cjk"],
        },
      }),
    ).toEqual([
      {
        url: "font-latin",
        type: "font/ttf",
      },
      {
        url: "font-cjk",
        type: "font/ttf",
      },
    ]);
  });
});
