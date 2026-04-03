import { describe, expect, it } from "vitest";
import { cloneLayoutElementsWithFreshIds } from "../../src/internal/project/layout.js";

describe("cloneLayoutElementsWithFreshIds", () => {
  it("duplicates layout elements with fresh ids and preserved structure", () => {
    const elements = {
      items: {
        root: {
          id: "root",
          type: "container",
          name: "Root",
        },
        text: {
          id: "text",
          type: "text",
          name: "Text",
          textStyleId: "text-style-1",
        },
        fragment: {
          id: "fragment",
          type: "container",
          name: "Fragment",
          fragmentLayoutId: "fragment-layout-1",
        },
      },
      tree: [
        {
          id: "root",
          children: [{ id: "text" }, { id: "fragment" }],
        },
      ],
    };

    let nextId = 0;
    const duplicated = cloneLayoutElementsWithFreshIds(elements, () => {
      nextId += 1;
      return `dup-${nextId}`;
    });

    expect(Object.keys(duplicated.items)).toEqual(["dup-1", "dup-2", "dup-3"]);
    expect(duplicated.tree).toEqual([
      {
        id: "dup-1",
        children: [{ id: "dup-2" }, { id: "dup-3" }],
      },
    ]);
    expect(duplicated.items["dup-1"]).toEqual({
      id: "dup-1",
      type: "container",
      name: "Root",
    });
    expect(duplicated.items["dup-2"]).toEqual({
      id: "dup-2",
      type: "text",
      name: "Text",
      textStyleId: "text-style-1",
    });
    expect(duplicated.items["dup-3"]).toEqual({
      id: "dup-3",
      type: "container",
      name: "Fragment",
      fragmentLayoutId: "fragment-layout-1",
    });
  });
});
