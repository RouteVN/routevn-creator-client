import { describe, expect, it } from "vitest";

import { buildLayoutElements } from "../../src/internal/project/layout.js";

const buildElements = (layout, options = {}) =>
  buildLayoutElements(
    layout,
    {},
    { items: {} },
    { items: {} },
    { items: {} },
    options,
  ).elements;

const createNode = (id, data = {}) => ({
  id,
  type: "container",
  name: id,
  ...data,
});

const createTreeCollection = (items, tree) => ({
  items,
  tree,
});

const selectIds = (nodes = []) => nodes.map((node) => node.id);

describe("buildLayoutElements layout schema version", () => {
  it("keeps existing order for layouts below schema version 2", () => {
    const elements = buildElements([
      createNode("back"),
      createNode("front"),
    ]);

    expect(selectIds(elements)).toEqual(["back", "front"]);
  });

  it("reverses stacking contexts for schema version 2 layouts", () => {
    const elements = buildElements(
      [
        createNode("root", {
          children: [
            createNode("a"),
            createNode("flow", {
              direction: "horizontal",
              children: [
                createNode("flow-a"),
                createNode("nested-stack", {
                  children: [createNode("inner-a"), createNode("inner-b")],
                }),
                createNode("flow-b"),
              ],
            }),
            createNode("b"),
          ],
        }),
      ],
      {
        layoutSchemaVersion: 2,
      },
    );

    expect(selectIds(elements[0].children)).toEqual(["b", "flow", "a"]);
    expect(selectIds(elements[0].children[1].children)).toEqual([
      "flow-a",
      "nested-stack",
      "flow-b",
    ]);
    expect(selectIds(elements[0].children[1].children[1].children)).toEqual([
      "inner-b",
      "inner-a",
    ]);
  });

  it("uses fragment layout schema version when resolving fragment children", () => {
    const oldFragment = {
      id: "fragment-old",
      type: "layout",
      isFragment: true,
      elements: createTreeCollection(
        {
          "old-a": createNode("old-a"),
          "old-b": createNode("old-b"),
        },
        [{ id: "old-a", children: [] }, { id: "old-b", children: [] }],
      ),
    };
    const newFragment = {
      ...oldFragment,
      id: "fragment-new",
      layoutSchemaVersion: 2,
      elements: createTreeCollection(
        {
          "new-a": createNode("new-a"),
          "new-b": createNode("new-b"),
        },
        [{ id: "new-a", children: [] }, { id: "new-b", children: [] }],
      ),
    };

    const oldElements = buildElements(
      [
        createNode("old-slot", {
          type: "fragment-ref",
          fragmentLayoutId: "fragment-old",
        }),
      ],
      {
        layoutSchemaVersion: 2,
        layoutsData: {
          "fragment-old": oldFragment,
        },
      },
    );
    const newElements = buildElements(
      [
        createNode("new-slot", {
          type: "fragment-ref",
          fragmentLayoutId: "fragment-new",
        }),
      ],
      {
        layoutSchemaVersion: 1,
        layoutsData: {
          "fragment-new": newFragment,
        },
      },
    );

    expect(selectIds(oldElements[0].children)).toEqual([
      "old-slot--old-a",
      "old-slot--old-b",
    ]);
    expect(selectIds(newElements[0].children)).toEqual([
      "new-slot--new-b",
      "new-slot--new-a",
    ]);
  });
});
