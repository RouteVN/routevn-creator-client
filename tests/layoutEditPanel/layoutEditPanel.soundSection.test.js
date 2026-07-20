import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openSoundFormDialog,
  selectViewData,
  setSoundsData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { EN_I18N } from "../support/i18n.js";

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
  it("builds the sound form with a sound slot and volume control", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text",
          text: "hello",
          hoverSoundId: "sound-hover",
          hover: {
            soundVolume: 45,
          },
        },
      },
    );
    setSoundsData(
      { state },
      {
        soundsData: SOUNDS_DATA,
      },
    );
    openSoundFormDialog(
      { state },
      {
        name: "hoverSoundId",
        volumeName: "hover.soundVolume",
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps("text"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.soundForm.fields).toEqual([
      expect.objectContaining({
        type: "slot",
        slot: "sound-item",
        label: "Sound",
      }),
      expect.objectContaining({
        name: "volume",
        type: "slider-with-input",
        min: 0,
        max: 100,
      }),
    ]);
    expect(viewData.soundForm.actions.buttons).toEqual([
      expect.objectContaining({
        id: "submit",
        label: "Save",
      }),
    ]);
    expect(viewData.soundFormDefaults.volume).toBe(45);
    expect(viewData.soundFormSoundItem).toMatchObject({
      id: "sound-hover",
      name: "Hover Sound",
    });
  });

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
      i18n: EN_I18N,
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

  it("shows the reveal sound picker row in the revealing section for text-revealing items", () => {
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
      i18n: EN_I18N,
    });
    const revealingSection = viewData.config.sections.find(
      (section) => section.id === "textRevealing",
    );
    const indicatorSection = viewData.config.sections.find(
      (section) => section.id === "textRevealIndicator",
    );

    expect(revealingSection?.label).toBe("Revealing");
    expect(revealingSection?.labelAction).toBeUndefined();
    expect(indicatorSection?.labelAction).toBe("plus");
    expect(indicatorSection?.items.flatMap((item) => item.items ?? [])).toEqual(
      [],
    );
    expect(revealingSection?.items[1]?.items.map((item) => item.name)).toEqual([
      "revealSoundId",
    ]);
    expect(revealingSection?.items[1]?.items[0]).toMatchObject({
      label: "Sound",
      soundId: "sound-hover",
      soundName: "Hover Sound",
      waveformDataFileId: "waveform-hover",
    });
    expect(revealingSection?.items[2]).toMatchObject({
      type: "segmented-control",
      label: "Stop",
      name: "revealSoundStopTiming",
      value: "immediate",
      options: [
        { label: "Immediate", value: "immediate" },
        { label: "Loop End", value: "loopEnd" },
      ],
    });
  });

  it("offers adding a reveal sound from the revealing section", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text-revealing",
          text: "hello",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps("text-revealing"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      i18n: EN_I18N,
    });
    const revealingSection = viewData.config.sections.find(
      (section) => section.id === "textRevealing",
    );

    expect(revealingSection?.labelAction).toBe("plus");
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
        i18n: EN_I18N,
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
