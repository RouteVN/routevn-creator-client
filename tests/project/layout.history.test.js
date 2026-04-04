import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

describe("buildLayoutElements history layout support", () => {
  it("maps history repeater nodes to historyDialogue template bindings", () => {
    const layout = [
      {
        id: "history-root",
        type: "container",
        children: [
          {
            id: "history-item",
            type: "container-ref-history-line",
            children: [
              {
                id: "history-character",
                type: "text-ref-history-line-character-name",
              },
              {
                id: "history-content",
                type: "text-ref-history-line-content",
              },
            ],
          },
        ],
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

    expect(elements[0].children[0]).toMatchObject({
      type: "container",
      $each: "item, i in historyDialogue",
      id: "history-item-instance-${i}",
    });
    expect(elements[0].children[0].children[0]).toMatchObject({
      id: "history-character-instance-${i}",
      type: "text",
      content: "${item.characterName}",
    });
    expect(elements[0].children[0].children[1]).toMatchObject({
      id: "history-content-instance-${i}",
      type: "text",
      content: "${item.text}",
    });
  });

  it("ignores legacy inline rect fill while preserving rect rendering", () => {
    const layout = [
      {
        id: "legacy-rect",
        type: "rect",
        x: 0,
        y: 0,
        width: 120,
        height: 48,
        fill: "#444444",
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
      id: "legacy-rect",
      type: "rect",
      width: 120,
      height: 48,
    });
    expect(elements[0].fill).toBeUndefined();
  });
});
