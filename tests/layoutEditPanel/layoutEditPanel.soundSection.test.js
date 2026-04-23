import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setSoundsData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";

const EMPTY_TREE = { items: {}, tree: [] };
const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

const SOUNDS_DATA = {
  items: {
    "sound-hover": {
      id: "sound-hover",
      type: "sound",
      name: "Hover Sound",
      fileId: "file-hover",
    },
    "sound-click": {
      id: "sound-click",
      type: "sound",
      name: "Click Sound",
      fileId: "file-click",
    },
  },
  tree: [{ id: "sound-hover" }, { id: "sound-click" }],
};

const createProps = (itemType = "text") => ({
  itemType,
  layoutType: "general",
  resourceType: "layouts",
  layoutsData: EMPTY_TREE,
  charactersData: EMPTY_TREE,
  isInsideSaveLoadSlot: false,
  isInsideDirectedContainer: false,
});

describe("layoutEditPanel sound section", () => {
  it("shows hover and click sound selectors for text items", () => {
    const state = createInitialState();

    setValues(
      { state },
      {
        values: {
          type: "text",
          text: "hello",
          hoverSoundId: "sound-hover",
          clickSoundId: "sound-click",
        },
      },
    );
    setSoundsData(
      { state },
      {
        soundsData: SOUNDS_DATA,
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps("text"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const soundSection = viewData.config.sections.find(
      (section) => section.id === "sounds",
    );

    expect(soundSection?.label).toBe("Sound");
    expect(soundSection?.items.map((item) => item.name)).toEqual([
      "hoverSoundId",
      "clickSoundId",
    ]);
    expect(soundSection?.items[0]?.options).toContainEqual({
      label: "Hover Sound",
      value: "sound-hover",
    });
    expect(soundSection?.items[1]?.options).toContainEqual({
      label: "Click Sound",
      value: "sound-click",
    });
  });

  it("does not show a sound section for container items yet", () => {
    const state = createInitialState();

    setValues(
      { state },
      {
        values: {
          type: "container",
          direction: "absolute",
        },
      },
    );
    setSoundsData(
      { state },
      {
        soundsData: SOUNDS_DATA,
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps("container"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });

    expect(
      viewData.config.sections.some((section) => section.id === "sounds"),
    ).toBe(false);
  });
});
