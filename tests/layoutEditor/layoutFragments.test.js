import { describe, expect, it } from "vitest";
import { getFragmentLayoutOptions } from "../../src/pages/layoutEditor/support/layoutFragments.js";

describe("layoutFragments", () => {
  it("uses plain layout names for fragment selector options", () => {
    const layoutsData = {
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Dialogs",
        },
        "fragment-1": {
          id: "fragment-1",
          type: "layout",
          parentId: "folder-1",
          name: "Choice Menu",
          isFragment: true,
        },
        "fragment-2": {
          id: "fragment-2",
          type: "layout",
          parentId: "folder-1",
          name: "A Prompt",
          isFragment: true,
        },
      },
      tree: [
        {
          id: "folder-1",
          children: [{ id: "fragment-1" }, { id: "fragment-2" }],
        },
      ],
    };

    expect(getFragmentLayoutOptions(layoutsData)).toEqual([
      {
        label: "A Prompt",
        value: "fragment-2",
      },
      {
        label: "Choice Menu",
        value: "fragment-1",
      },
    ]);
  });
});
