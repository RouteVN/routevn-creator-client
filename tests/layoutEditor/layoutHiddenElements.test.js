import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

const emptyCollection = { items: {}, tree: [] };

const buildElements = (nodes, options = {}) => {
  return buildLayoutElements(
    nodes,
    {},
    emptyCollection,
    emptyCollection,
    emptyCollection,
    options,
  ).elements;
};

describe("layout hidden elements", () => {
  it("filters hidden top-level elements before render projection", () => {
    const elements = buildElements([
      {
        id: "hidden-rect",
        type: "rect",
        hidden: true,
      },
      {
        id: "visible-rect",
        type: "rect",
      },
    ]);

    expect(elements.map((element) => element.id)).toEqual(["visible-rect"]);
  });

  it("filters a hidden parent and its complete subtree", () => {
    const elements = buildElements([
      {
        id: "hidden-folder",
        type: "folder",
        hidden: true,
        children: [
          {
            id: "child-rect",
            type: "rect",
          },
        ],
      },
    ]);

    expect(elements).toEqual([]);
  });

  it("filters an individually hidden child without changing its siblings", () => {
    const elements = buildElements([
      {
        id: "container",
        type: "container",
        children: [
          {
            id: "hidden-child",
            type: "rect",
            hidden: true,
          },
          {
            id: "visible-child",
            type: "rect",
            hidden: false,
          },
        ],
      },
    ]);

    expect(elements[0].children.map((element) => element.id)).toEqual([
      "visible-child",
    ]);
    expect(elements[0].children[0]).not.toHaveProperty("hidden");
  });

  it("filters hidden elements inside fragment projections", () => {
    const elements = buildElements(
      [
        {
          id: "fragment-instance",
          type: "fragment-ref",
          fragmentLayoutId: "fragment-layout",
        },
      ],
      {
        layoutsData: {
          "fragment-layout": {
            id: "fragment-layout",
            type: "layout",
            isFragment: true,
            elements: {
              items: {
                hidden: {
                  id: "hidden",
                  type: "rect",
                  hidden: true,
                },
                visible: {
                  id: "visible",
                  type: "rect",
                },
              },
              tree: [{ id: "hidden" }, { id: "visible" }],
            },
          },
        },
      },
    );

    expect(elements[0].children.map((element) => element.id)).toEqual([
      "fragment-instance--visible",
    ]);
  });
});
