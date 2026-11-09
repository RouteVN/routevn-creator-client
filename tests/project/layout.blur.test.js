import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

const emptyCollection = { items: {}, tree: [] };

describe("layout sprite blur projection", () => {
  it.each([
    [
      { x: -2, y: -3, quality: 0 },
      { x: 0, y: 0, quality: 1 },
    ],
    [
      { x: 0, y: 1, quality: -4 },
      { x: 0, y: 1, quality: 1 },
    ],
    [
      { x: 2, y: 3, quality: 2.5 },
      { x: 2, y: 3, quality: 2.5 },
    ],
    [
      { x: Infinity, y: "-2", quality: undefined },
      { x: Infinity, y: "-2", quality: undefined },
    ],
  ])(
    "clamps finite blur values without changing source data",
    (values, expected) => {
      const blur = { ...values, kernelSize: 9, repeatEdgePixels: false };
      const original = structuredClone(blur);
      const { elements } = buildLayoutElements(
        [{ id: "sprite", type: "sprite", blur }],
        {},
        emptyCollection,
        emptyCollection,
        emptyCollection,
      );

      expect(elements[0].blur).toEqual({
        ...expected,
        kernelSize: 9,
        repeatEdgePixels: false,
      });
      expect(blur).toEqual(original);
    },
  );
});
