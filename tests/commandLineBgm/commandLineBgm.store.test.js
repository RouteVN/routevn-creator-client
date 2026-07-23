import { describe, expect, it } from "vitest";
import * as bgmStore from "../../src/components/commandLineBgm/commandLineBgm.store.js";
import {
  createInitialState,
  insertSound,
  removeSound,
  selectBgm,
  selectSelectedSoundId,
  selectViewData,
  setBgm,
  setRepositoryState,
  setSelectedSound,
} from "../../src/components/commandLineBgm/commandLineBgm.store.js";

const sounds = {
  items: {
    "folder-bgm": {
      id: "folder-bgm",
      type: "folder",
      name: "BGM",
    },
    intro: {
      id: "intro",
      type: "sound",
      name: "Intro",
      fileId: "intro.mp3",
      waveformDataFileId: "intro-waveform",
      duration: 2,
      parentId: "folder-bgm",
    },
    theme: {
      id: "theme",
      type: "sound",
      name: "Theme",
      fileId: "theme.mp3",
      waveformDataFileId: "theme-waveform",
      duration: 6,
      parentId: "folder-bgm",
    },
  },
  tree: [
    {
      id: "folder-bgm",
      children: [{ id: "intro" }, { id: "theme" }],
    },
  ],
};

const i18n = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

describe("commandLineBgm.store", () => {
  it("keeps every select-prefixed export read-only", () => {
    const state = Object.freeze(createInitialState());
    const selectors = Object.entries(bgmStore).filter(([name]) => {
      return name.startsWith("select");
    });

    selectors.forEach(([, selector]) => {
      expect(() => selector({ state, i18n }, {})).not.toThrow();
    });
  });

  it("starts with an empty selected channel and channel controls", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n });

    expect(selectBgm({ state })).toEqual({
      loop: true,
      volume: 75,
      sounds: [],
    });
    expect(viewData.selectionHeading).toBe("Channel");
    expect(viewData.selectionName).toBe("BGM Channel");
    expect(viewData.channelLabel).toBe("BGM Channel");
    expect(viewData.channelDurationLabel).toBe("0:00");
    expect(viewData.form.fields.map((field) => field.name)).toEqual([
      "loop",
      "volume",
    ]);
    expect(viewData.defaultValues).toEqual({ loop: true, volume: 75 });
  });

  it("migrates legacy single-sound BGM into a full-width canonical clip", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    setBgm(
      { state },
      {
        bgm: {
          resourceId: "theme",
          loop: false,
          volume: 500,
          startDelayMs: 250,
        },
      },
    );

    expect(selectBgm({ state })).toEqual({
      loop: false,
      volume: 50,
      sounds: [
        {
          id: "default",
          resourceId: "theme",
          volume: 100,
          startDelayMs: 0,
        },
      ],
    });
    expect(selectViewData({ state, i18n }).sounds[0]).toMatchObject({
      name: "Theme",
      widthPercent: "100.0000",
    });
  });

  it("sizes canonical clips proportionally and derives their sequential delays", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    setBgm(
      { state },
      {
        bgm: {
          loop: true,
          volume: 80,
          sounds: [
            { id: "intro-clip", resourceId: "intro", volume: 90 },
            {
              id: "theme-clip",
              resourceId: "theme",
              volume: 60,
              startDelayMs: 999,
            },
          ],
        },
      },
    );

    expect(selectBgm({ state }).sounds).toEqual([
      {
        id: "intro-clip",
        resourceId: "intro",
        volume: 90,
        startDelayMs: 0,
      },
      {
        id: "theme-clip",
        resourceId: "theme",
        volume: 60,
        startDelayMs: 2000,
      },
    ]);
    const viewData = selectViewData({ state, i18n });
    expect(viewData.channelDurationLabel).toBe("0:08");
    expect(
      viewData.sounds.map((sound) => ({
        durationLabel: sound.durationLabel,
        widthPercent: sound.widthPercent,
      })),
    ).toEqual([
      { durationLabel: "0:02", widthPercent: "25.0000" },
      { durationLabel: "0:06", widthPercent: "75.0000" },
    ]);

    setSelectedSound({ state }, { soundId: "intro-clip" });
    const selectedViewData = selectViewData({ state, i18n });
    expect(selectedViewData.selectionHeading).toBe("Audio");
    expect(selectedViewData.selectionName).toBe("Intro");
    expect(selectedViewData.form.fields.map((field) => field.name)).toEqual([
      "volume",
    ]);
    expect(selectedViewData.defaultValues).toEqual({ volume: 90 });
  });

  it("reflows the timeline after insertion and removal", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    insertSound({ state }, { id: "theme-clip", resourceId: "theme", index: 0 });
    insertSound({ state }, { id: "intro-clip", resourceId: "intro", index: 0 });

    expect(selectBgm({ state }).sounds.map((sound) => sound.id)).toEqual([
      "intro-clip",
      "theme-clip",
    ]);
    expect(selectBgm({ state }).sounds[1].startDelayMs).toBe(2000);
    expect(selectSelectedSoundId({ state })).toBe("intro-clip");

    removeSound({ state }, { soundId: "intro-clip" });

    expect(selectBgm({ state }).sounds).toEqual([
      {
        id: "theme-clip",
        resourceId: "theme",
        volume: 100,
        startDelayMs: 0,
      },
    ]);
    expect(selectSelectedSoundId({ state })).toBeUndefined();
  });
});
