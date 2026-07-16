import { readFileSync } from "node:fs";
import { parseAndRender } from "jempl";
import { describe, expect, it } from "vitest";
import {
  buildLayoutElements,
  buildLayoutRenderElements,
} from "../../src/internal/project/layout.js";

const emptyCollection = { items: {}, tree: [] };
const defaultRepository = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);

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

  it("projects legacy text-only layout elements through rich text rendering", () => {
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

    expect(elements[0].content).toEqual([{ text: "Hello" }]);
  });

  it("preserves the default menu font weights for legacy text", () => {
    const cases = [
      {
        layoutId: "ob6i5RdAgrcK",
        itemId: "7YoNNxFhJ6Je",
        text: "Back",
      },
      {
        layoutId: "fKr5fa67MQWh",
        itemId: "icn4dknq2kyp",
        text: "Load",
      },
      {
        layoutId: "ob6i5RdAgrcK",
        itemId: "PFLWNXpZDXXU",
        text: "Options",
      },
    ];

    for (const { layoutId, itemId, text } of cases) {
      const layout = defaultRepository.layouts.items[layoutId];
      const item = layout.elements.items[itemId];
      const [element] = buildLayoutRenderElements(
        [item],
        defaultRepository.images,
        defaultRepository.textStyles,
        defaultRepository.colors,
        defaultRepository.fonts,
        {
          layoutId: layout.id,
          layoutSchemaVersion: layout.layoutSchemaVersion,
        },
      );

      expect(element.content).toEqual([{ text }]);
      expect(element.textStyle.fontWeight).toBe("700");
      expect(element.hover.textStyle.fontWeight).toBe("700");
    }
  });
});
