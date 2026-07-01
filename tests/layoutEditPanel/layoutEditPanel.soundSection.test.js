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
      waveformDataFileId: "waveform-hover",
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
  it("shows hover and click sound picker rows for text items", () => {
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
    expect(soundSection?.items[0]?.type).toBe("list-bar");
    expect(soundSection?.items[0]?.items.map((item) => item.name)).toEqual([
      "hoverSoundId",
      "clickSoundId",
    ]);
    expect(soundSection?.items[0]?.items[0]).toMatchObject({
      label: "Hover",
      soundId: "sound-hover",
      soundName: "Hover Sound",
      waveformDataFileId: "waveform-hover",
    });
    expect(soundSection?.items[0]?.items[1]).toMatchObject({
      label: "Click",
      soundId: "sound-click",
      soundName: "Click Sound",
    });
  });

  it("shows the reveal sound picker row in the indicator section for text-revealing items", () => {
    const state = createInitialState();

    setValues(
      { state },
      {
        values: {
          type: "text-revealing",
          text: "hello",
          revealSoundId: "sound-hover",
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
      props: createProps("text-revealing"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const indicatorSection = viewData.config.sections.find(
      (section) => section.id === "textRevealIndicator",
    );

    expect(indicatorSection?.labelAction).toBe("plus");
    expect(indicatorSection?.items[0]?.items.map((item) => item.name)).toEqual([
      "revealSoundId",
    ]);
    expect(indicatorSection?.items[0]?.items[0]).toMatchObject({
      label: "Sound",
      soundId: "sound-hover",
      soundName: "Hover Sound",
      waveformDataFileId: "waveform-hover",
    });
  });

  it("shows hover and click sound picker rows for sprite and container items", () => {
    for (const itemType of ["sprite", "container"]) {
      const state = createInitialState();
      const values = {
        type: itemType,
        hoverSoundId: "sound-hover",
        clickSoundId: "sound-click",
      };

      if (itemType === "container") {
        values.direction = "absolute";
      } else {
        values.imageId = "image-1";
      }

      setValues(
        { state },
        {
          values,
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
        props: createProps(itemType),
        constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      });
      const soundSection = viewData.config.sections.find(
        (section) => section.id === "sounds",
      );

      expect(soundSection?.label).toBe("Sound");
      expect(soundSection?.items[0]?.type).toBe("list-bar");
      expect(soundSection?.items[0]?.items.map((item) => item.name)).toEqual([
        "hoverSoundId",
        "clickSoundId",
      ]);
    }
  });
});
