import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  syncRepositoryState,
  setLayout,
  setSelectedItemId,
  setDetailPanelSelectedItemId,
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

const LAYOUT_EDITOR_CONSTANTS_URL = new URL(
  "../../src/pages/layoutEditor/layoutEditor.constants.yaml",
  import.meta.url,
);
const LAYOUT_EDITOR_CONSTANTS = yaml.load(
  readFileSync(LAYOUT_EDITOR_CONSTANTS_URL, "utf8"),
);

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

  it("shows fragment creation in all layout menus", () => {
    for (const layoutType of [
      "general",
      "save-load",
      "confirmDialog",
      "dialogue-adv",
      "dialogue-nvl",
      "history",
      "choice",
    ]) {
      const state = createInitialState();

      setLayout(
        { state },
        {
          id: `layout-${layoutType}`,
          layout: {
            id: `layout-${layoutType}`,
            layoutType,
          },
        },
      );

      const viewData = selectViewData({
        state,
        constants: LAYOUT_EDITOR_CONSTANTS,
      });

      const contextMenuFragmentItem = viewData.contextMenuItems.find(
        (item) =>
          item.label === "Fragment" &&
          item.value?.action === "new-child-item" &&
          item.value?.type === "fragment-ref",
      );
      const emptyMenuFragmentItem = viewData.emptyContextMenuItems.find(
        (item) =>
          item.label === "Fragment" &&
          item.value?.action === "new-child-item" &&
          item.value?.type === "fragment-ref",
      );

      expect(contextMenuFragmentItem).toBeTruthy();
      expect(contextMenuFragmentItem.value).not.toHaveProperty("width");
      expect(contextMenuFragmentItem.value).not.toHaveProperty("height");
      expect(emptyMenuFragmentItem).toBeTruthy();
      expect(emptyMenuFragmentItem.value).not.toHaveProperty("width");
      expect(emptyMenuFragmentItem.value).not.toHaveProperty("height");
    }
  });

  it("adds the component badge to special layout editor items", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            "text-bound": {
              type: "text-ref-character-name",
              name: "Character Name",
            },
            "text-free": {
              type: "text",
              name: "Text",
            },
          },
          tree: [{ id: "text-bound" }, { id: "text-free" }],
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
    });

    expect(
      viewData.flatItems.find((item) => item.id === "text-bound")?.trailingSvg,
    ).toBe("component");
    expect(
      viewData.flatItems.find((item) => item.id === "text-free")?.trailingSvg,
    ).toBeUndefined();
  });

  it("keeps child creation actions only on container items", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            container1: {
              type: "container",
              name: "Container",
            },
            text1: {
              type: "text",
              name: "Text",
            },
          },
          tree: [{ id: "container1" }, { id: "text1" }],
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: {
        ...TEST_CONSTANTS,
        contextMenuItems: [
          {
            label: "Container",
            type: "item",
            createType: "container",
          },
          {
            label: "Rename",
            type: "item",
            value: "rename-item",
          },
          {
            label: "Delete",
            type: "item",
            value: "delete-item",
          },
        ],
      },
    });

    const containerMenuItems = viewData.flatItems.find(
      (item) => item.id === "container1",
    )?.contextMenuItems;
    const textMenuItems = viewData.flatItems.find(
      (item) => item.id === "text1",
    )?.contextMenuItems;

    expect(
      containerMenuItems?.some(
        (item) => item?.value?.action === "new-child-item",
      ),
    ).toBe(true);
    expect(
      textMenuItems?.some((item) => item?.value?.action === "new-child-item"),
    ).toBe(false);
    expect(textMenuItems?.map((item) => item.label)).toEqual([
      "Rename",
      "Delete",
    ]);
  });

  it("keeps canvas selection state based on the selected item while the detail panel lags behind", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            "container-directed": {
              type: "container",
              name: "Directed Container",
              direction: "horizontal",
            },
            "child-selected": {
              type: "text",
              name: "Selected Child",
            },
            "panel-item": {
              type: "text",
              name: "Panel Item",
            },
          },
          tree: [
            {
              id: "container-directed",
              children: [{ id: "child-selected" }],
            },
            { id: "panel-item" },
          ],
        },
      },
    );

    setSelectedItemId({ state }, { itemId: "child-selected" });
    setDetailPanelSelectedItemId({ state }, { itemId: "panel-item" });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
    });

    expect(viewData.selectedItemIsInsideDirectedContainer).toBe(true);
    expect(viewData.isInsideDirectedContainer).toBe(false);
    expect(viewData.selectedItemId).toBe("child-selected");
    expect(viewData.detailPanelSelectedItemId).toBe("panel-item");
  });
});
