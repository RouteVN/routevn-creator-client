import { parseAndRender } from "jempl";
import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

const emptyCollection = { items: {}, tree: [] };

describe("layout rich text projection", () => {
  it("projects layout text references as variable template segments", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "text-1",
          type: "text",
          content: [
            { text: "Hello " },
            { reference: { resourceId: "player-name" } },
            { text: "!" },
          ],
          text: "Legacy fallback",
        },
      ],
      emptyCollection,
      emptyCollection,
      emptyCollection,
      emptyCollection,
      { layoutId: "layout-1" },
    );

    expect(elements[0].content).toEqual([
      { text: "Hello " },
      { text: '${variables["player-name"]}' },
      { text: "!" },
    ]);

    expect(
      parseAndRender(elements, {
        variables: {
          "player-name": "Aki",
        },
      })[0].content,
    ).toEqual([{ text: "Hello " }, { text: "Aki" }, { text: "!" }]);
  });

  it("keeps legacy text-only layout elements unchanged", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "text-1",
          type: "text",
          text: "Hello",
        },
      ],
      emptyCollection,
      emptyCollection,
      emptyCollection,
      emptyCollection,
      { layoutId: "layout-1" },
    );

    expect(elements[0].content).toBe("Hello");
  });
});
