import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setLayout,
} from "../../src/pages/layoutEditor/layoutEditor.store.js";

const TEST_CONSTANTS = {
  contextMenuItems: [
    {
      label: "Container",
      type: "item",
      createType: "container",
    },
    {
      $when: 'layoutType == "save-load"',
      label: "Container (Save/Load Slot)",
      type: "item",
      createType: "container-save-load-slot",
    },
  ],
  emptyContextMenuItems: [
    {
      $when: 'layoutType == "save-load"',
      label: "Container (Save/Load Slot)",
      type: "item",
      createType: "container-save-load-slot",
    },
  ],
  controlContextMenuItems: [],
  controlEmptyContextMenuItems: [],
};

describe("layoutEditor.store", () => {
  it("normalizes a legacy save layout to save-load", () => {
    const state = createInitialState();

    setLayout(
      { state },
      {
        id: "layout-save",
        layout: {
          id: "layout-save",
          layoutType: "save",
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
    });

    expect(state.layout.layoutType).toBe("save-load");
    expect(
      viewData.contextMenuItems.some(
        (item) => item.label === "Container (Save/Load Slot)",
      ),
    ).toBe(true);
    expect(
      viewData.emptyContextMenuItems.some(
        (item) => item.label === "Container (Save/Load Slot)",
      ),
    ).toBe(true);
  });

  it("normalizes a legacy load layout to save-load", () => {
    const state = createInitialState();

    setLayout(
      { state },
      {
        id: "layout-load",
        layout: {
          id: "layout-load",
          layoutType: "load",
        },
      },
    );

    expect(state.layout.layoutType).toBe("save-load");
  });
});
