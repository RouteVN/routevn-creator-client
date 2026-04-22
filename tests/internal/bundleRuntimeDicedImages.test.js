import { describe, expect, it } from "vitest";

import { rasterizeDicedImagePixels } from "../../src/internal/bundleRuntimeDicedImages.js";

const toPixels = (rows) => {
  return new Uint8ClampedArray(rows.flat());
};

describe("bundleRuntimeDicedImages", () => {
  it("reconstructs a diced image quad from atlas pixels", () => {
    const atlasPixels = toPixels([
      [255, 0, 0, 255, 0, 255, 0, 255],
      [0, 0, 255, 255, 255, 255, 0, 255],
    ]);

    const pixels = rasterizeDicedImagePixels({
      width: 2,
      height: 2,
      atlas: {
        width: 2,
        height: 2,
        pixels: atlasPixels,
      },
      vertices: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
      uvs: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      indices: [0, 1, 2, 0, 2, 3],
      rect: { x: 0, y: 0, width: 2, height: 2 },
    });

    expect(Array.from(pixels)).toEqual(Array.from(atlasPixels));
  });

  it("samples a sub-region of the atlas through UV coordinates", () => {
    const atlasPixels = toPixels([
      [0, 0, 0, 0, 12, 34, 56, 255, 78, 90, 12, 255, 0, 0, 0, 0],
      [0, 0, 0, 0, 90, 12, 34, 255, 56, 78, 90, 255, 0, 0, 0, 0],
    ]);

    const pixels = rasterizeDicedImagePixels({
      width: 2,
      height: 2,
      atlas: {
        width: 4,
        height: 2,
        pixels: atlasPixels,
      },
      vertices: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
      uvs: [
        { x: 0.25, y: 0 },
        { x: 0.75, y: 0 },
        { x: 0.75, y: 1 },
        { x: 0.25, y: 1 },
      ],
      indices: [0, 1, 2, 0, 2, 3],
      rect: { x: 0, y: 0, width: 2, height: 2 },
    });

    expect(Array.from(pixels)).toEqual([
      12, 34, 56, 255, 78, 90, 12, 255, 90, 12, 34, 255, 56, 78, 90, 255,
    ]);
  });
});
