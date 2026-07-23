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
  startSoundDrag,
  updateSoundDrag,
  finishSoundDrag,
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
      interruption: "immediate",
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
      "interruption",
      "volume",
    ]);
    expect(viewData.defaultValues).toEqual({
      interruption: "immediate",
      loop: true,
      volume: 75,
    });
  });

  it("migrates legacy single-sound BGM without losing its start delay", () => {
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
      interruption: "immediate",
      loop: false,
      volume: 50,
      sounds: [
        {
          id: "default",
          resourceId: "theme",
          loop: false,
          volume: 100,
          startDelayMs: 250,
        },
      ],
    });
    expect(selectViewData({ state, i18n }).sounds[0]).toMatchObject({
      name: "Theme",
      leftPercent: "4.0000",
      widthPercent: "96.0000",
    });
  });

  it("positions canonical clips by their preserved absolute start delays", () => {
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
        loop: false,
        volume: 90,
        startDelayMs: 0,
      },
      {
        id: "theme-clip",
        resourceId: "theme",
        loop: false,
        volume: 60,
        startDelayMs: 999,
      },
    ]);
    const viewData = selectViewData({ state, i18n });
    expect(viewData.channelDurationLabel).toBe("0:06");
    expect(viewData.channelHeightPx).toBe(276);
    expect(
      viewData.sounds.map((sound) => ({
        durationLabel: sound.durationLabel,
        leftPercent: sound.leftPercent,
        topPx: sound.topPx,
        widthPercent: sound.widthPercent,
      })),
    ).toEqual([
      {
        durationLabel: "0:02",
        leftPercent: "0.0000",
        topPx: 0,
        widthPercent: "28.5755",
      },
      {
        durationLabel: "0:06",
        leftPercent: "14.2735",
        topPx: 126,
        widthPercent: "85.7265",
      },
    ]);

    setSelectedSound({ state }, { soundId: "intro-clip" });
    const selectedViewData = selectViewData({ state, i18n });
    expect(selectedViewData.selectionHeading).toBe("Audio");
    expect(selectedViewData.selectionName).toBe("Intro");
    expect(selectedViewData.form.fields.map((field) => field.name)).toEqual([
      "startDelayMs",
      "volume",
    ]);
    expect(selectedViewData.defaultValues).toEqual({
      startDelayMs: 0,
      volume: 90,
    });
  });

  it("places inserted sounds sequentially without reflowing after removal", () => {
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
        loop: false,
        volume: 100,
        startDelayMs: 2000,
      },
    ]);
    expect(selectSelectedSoundId({ state })).toBeUndefined();
  });

  it("updates a sound start delay from a horizontal timeline drag", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    insertSound({ state }, { id: "intro-clip", resourceId: "intro", index: 0 });

    startSoundDrag(
      { state },
      {
        soundId: "intro-clip",
        pointerId: 7,
        clientX: 100,
        timelineDurationMs: 2000,
        timelineWidthPx: 400,
      },
    );
    updateSoundDrag(
      { state },
      {
        pointerId: 7,
        clientX: 300,
      },
    );

    expect(selectBgm({ state }).sounds[0].startDelayMs).toBe(1000);

    finishSoundDrag({ state }, { pointerId: 7 });
    expect(state.soundDrag).toBeUndefined();
    expect(selectViewData({ state, i18n }).channelDurationLabel).toBe("0:03");
  });
});
