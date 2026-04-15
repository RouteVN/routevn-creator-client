import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

describe("buildLayoutElements spacing axis support", () => {
  it("maps horizontal container spacing axes", () => {
    const layout = [
      {
        id: "container-1",
        type: "container",
        direction: "horizontal",
        gapX: 40,
        gapY: 12,
      },
    ];

    const { elements } = buildLayoutElements(
      layout,
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      {},
    );

    expect(elements[0]).toMatchObject({
      id: "container-1",
      type: "container",
      direction: "horizontal",
      gapX: 40,
      gapY: 12,
    });
  });
});
