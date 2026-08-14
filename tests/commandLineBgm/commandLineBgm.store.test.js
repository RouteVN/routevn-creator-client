import { describe, expect, it } from "vitest";
import * as bgmStore from "../../src/components/commandLineBgm/commandLineBgm.store.js";
import {
  clearSelectedSound,
  closeChannelEditor,
  connectSoundToPrevious,
  createInitialState,
  insertSound,
  openChannelEditor,
  removeSound,
  selectBgm,
  selectSelectedSoundId,
  selectViewData,
  setBgm,
  setRepositoryState,
  setSelectedSound,
  setUiConfig,
  startSoundDrag,
  updateSound,
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

const audioEffects = {
  items: {
    crossfade: {
      id: "crossfade",
      type: "audioEffect",
      name: "Crossfade",
      audioEffect: {
        type: "transition",
        prev: { volume: { keyframes: [{ value: 0, duration: 600 }] } },
        next: { volume: { keyframes: [{ value: 100, duration: 900 }] } },
      },
    },
    "fade-in": {
      id: "fade-in",
      type: "audioEffect",
      name: "Fade In",
      audioEffect: {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ startValue: 0, value: 100, duration: 500 }],
          },
        },
      },
    },
    "smooth-volume": {
      id: "smooth-volume",
      type: "audioEffect",
      name: "Smooth Volume",
      audioEffect: {
        type: "update",
        tween: {
          volume: { keyframes: [{ value: 50, duration: 500 }] },
        },
      },
    },
  },
  tree: [{ id: "crossfade" }, { id: "fade-in" }, { id: "smooth-volume" }],
};

const i18n = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

describe("commandLineBgm.store", () => {
  it("uses two audio columns and hides the explorer in touch mode", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n })).toMatchObject({
      showResourceSelectorFileExplorer: true,
      resourceSelectorColumns: undefined,
      resourceSelectorGridStyle: "",
    });

    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });

    expect(selectViewData({ state, i18n })).toMatchObject({
      showResourceSelectorFileExplorer: false,
      resourceSelectorColumns: 2,
      resourceSelectorGridStyle:
        "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));",
    });
  });

  it("keeps every select-prefixed export read-only", () => {
    const state = Object.freeze(createInitialState());
    const selectors = Object.entries(bgmStore).filter(([name]) => {
      return name.startsWith("select");
    });

    selectors.forEach(([, selector]) => {
      expect(() => selector({ state, i18n }, {})).not.toThrow();
    });
  });

  it("starts with an unselected channel and selects it explicitly", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n });

    expect(selectBgm({ state })).toEqual({
      interruption: "immediate",
      loop: true,
      volume: 75,
      sounds: [],
    });
    expect(viewData.hasSelection).toBe(false);
    expect(viewData.showChannelControls).toBe(false);
    expect(viewData.channelBorderColor).toBe("bo");
    expect(viewData.selectionHeading).toBe("");
    expect(viewData.selectionName).toBe("");
    expect(viewData.channelLabel).toBe("BGM Channel");
    expect(viewData.channelDurationLabel).toBe("0:00");

    clearSelectedSound({ state });
    const selectedViewData = selectViewData({ state, i18n });
    expect(selectedViewData.hasSelection).toBe(true);
    expect(selectedViewData.channelBorderColor).toBe("pr");
    expect(selectedViewData.selectionHeading).toBe("Channel");
    expect(selectedViewData.selectionName).toBe("BGM Channel");
    expect(selectedViewData.form.fields).toMatchObject([
      {
        type: "row",
        fields: [
          { name: "interruption", type: "segmented-control" },
          { name: "volume", type: "slider-with-input" },
        ],
      },
      {
        type: "row",
        fields: [
          { name: "audioEffectId", type: "select" },
          {
            name: "audioEffectPlaybackSpeed",
            type: "slider-with-input",
          },
          { slot: "audioEffectPlaybackSpeedSpacer", type: "slot" },
        ],
      },
    ]);
    expect(selectedViewData.defaultValues).toEqual({
      interruption: "immediate",
      volume: 75,
      audioEffectId: undefined,
      audioEffectPlaybackSpeed: 1,
    });
    expect(selectedViewData.channelFormKey).toBe(
      "channel-without-audio-effect",
    );
    expect(selectedViewData.channelForm.fields).toMatchObject([
      {
        type: "row",
        fields: [
          { name: "interruption", type: "segmented-control" },
          { name: "volume", type: "slider-with-input" },
        ],
      },
      {
        type: "row",
        fields: [
          { name: "audioEffectId", type: "select" },
          {
            name: "audioEffectPlaybackSpeed",
            type: "slider-with-input",
          },
          { slot: "audioEffectPlaybackSpeedSpacer", type: "slot" },
        ],
      },
    ]);
    expect(selectedViewData.editChannelLabel).toBe("Edit Channel");
  });

  it("lists transition and update resources for the channel Audio Effect", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds, audioEffects });

    const viewData = selectViewData({ state, i18n });
    const audioEffectField = viewData.channelForm.fields[1].fields[0];

    expect(audioEffectField).toMatchObject({
      name: "audioEffectId",
      label: "Audio Effect",
      type: "select",
      clearable: true,
      placeholder: "Select audio effect",
    });
    expect(audioEffectField.options).toEqual([
      {
        value: "crossfade",
        label: "Crossfade",
        suffixText: "Transition",
      },
      { value: "fade-in", label: "Fade In", suffixText: "Update" },
      {
        value: "smooth-volume",
        label: "Smooth Volume",
        suffixText: "Update",
      },
    ]);
  });

  it("persists, loads, and clears the channel Audio Effect", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds, audioEffects });

    bgmStore.updateChannel(
      { state },
      {
        values: {
          audioEffectId: "crossfade",
          audioEffectPlaybackSpeed: 0.01,
        },
      },
    );

    expect(selectBgm({ state }).audioEffects).toEqual({
      resourceId: "crossfade",
      playback: { speed: 1 },
    });
    expect(selectViewData({ state, i18n })).toMatchObject({
      channelFormKey: "channel-with-audio-effect",
      channelDefaultValues: {
        audioEffectId: "crossfade",
        audioEffectPlaybackSpeed: 1,
      },
    });

    setBgm(
      { state },
      {
        bgm: {
          sounds: [{ id: "main", resourceId: "intro" }],
          audioEffects: {
            resourceId: "smooth-volume",
            playback: { speed: 1.5 },
          },
        },
      },
    );
    expect(selectViewData({ state, i18n }).channelDefaultValues).toMatchObject({
      audioEffectId: "smooth-volume",
      audioEffectPlaybackSpeed: 1.5,
    });

    bgmStore.updateChannel({ state }, { values: { audioEffectId: undefined } });
    expect(selectBgm({ state }).audioEffects).toBeUndefined();
  });

  it("lists update-effect resources for begin and end boundaries", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds, audioEffects });
    setBgm(
      { state },
      { bgm: { sounds: [{ id: "main", resourceId: "intro" }] } },
    );
    setSelectedSound({ state }, { soundId: "main" });

    const viewData = selectViewData({ state, i18n });
    const beginField = viewData.form.fields[2].fields[0];
    const endField = viewData.form.fields[3].fields[0];

    expect(beginField).toMatchObject({
      name: "beginEffectId",
      label: "Begin Effect",
      type: "select",
      placeholder: "Select audio effect",
    });
    expect(endField).toMatchObject({
      name: "endEffectId",
      label: "End Effect",
      type: "select",
    });
    expect(beginField.options).toEqual([
      { value: "fade-in", label: "Fade In", suffixText: "Update" },
      {
        value: "smooth-volume",
        label: "Smooth Volume",
        suffixText: "Update",
      },
    ]);
    expect(endField.options).toEqual([
      { value: "fade-in", label: "Fade In", suffixText: "Update" },
      {
        value: "smooth-volume",
        label: "Smooth Volume",
        suffixText: "Update",
      },
    ]);
    expect(viewData.form.fields[2].fields[1]).toMatchObject({
      $when: "beginEffectId",
      name: "beginEffectPlaybackSpeed",
      type: "slider-with-input",
      min: 0.01,
      max: 4,
      step: 0.01,
    });
    expect(viewData.form.fields[3].fields[2]).toEqual({
      $when: "!endEffectId",
      type: "slot",
      slot: "endEffectPlaybackSpeedSpacer",
    });
    expect(viewData.selectionKey).toBe("sound-main-begin-none-end-none");
  });

  it("persists and clears begin and end effects per sound", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds, audioEffects });
    setBgm(
      { state },
      {
        bgm: {
          sounds: [{ id: "main", resourceId: "intro" }],
        },
      },
    );
    updateSound(
      { state },
      {
        soundId: "main",
        values: {
          beginEffectId: "fade-in",
          beginEffectPlaybackSpeed: 0.01,
          endEffectId: "smooth-volume",
          endEffectPlaybackSpeed: 1.5,
        },
      },
    );

    expect(selectBgm({ state }).sounds[0]).toMatchObject({
      beginEffect: {
        resourceId: "fade-in",
        playback: { speed: 1 },
      },
      endEffect: {
        resourceId: "smooth-volume",
        playback: { speed: 1 },
      },
    });

    expect(selectViewData({ state, i18n })).toMatchObject({
      selectionKey: "none",
    });

    setSelectedSound({ state }, { soundId: "main" });
    expect(selectViewData({ state, i18n })).toMatchObject({
      selectionKey: "sound-main-begin-fade-in-end-smooth-volume",
      defaultValues: {
        beginEffectPlaybackSpeed: 1,
        endEffectPlaybackSpeed: 1,
      },
    });

    updateSound(
      { state },
      {
        soundId: "main",
        values: {
          endEffectPlaybackSpeed: 1.5,
        },
      },
    );

    updateSound(
      { state },
      {
        soundId: "main",
        values: {
          volume: 60,
          beginEffectId: undefined,
        },
      },
    );

    expect(selectBgm({ state }).sounds[0]).toMatchObject({
      volume: 60,
      endEffect: {
        resourceId: "smooth-volume",
        playback: { speed: 1.5 },
      },
    });
    expect(selectBgm({ state }).sounds[0].beginEffect).toBeUndefined();
  });

  it("loads per-sound boundary effects and defaults missing speeds to 1x", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds, audioEffects });
    setBgm(
      { state },
      {
        bgm: {
          sounds: [
            {
              id: "intro-clip",
              resourceId: "intro",
              beginEffect: { resourceId: "fade-in" },
              endEffect: {
                resourceId: "smooth-volume",
                playback: { speed: 2 },
              },
            },
          ],
        },
      },
    );
    setSelectedSound({ state }, { soundId: "intro-clip" });

    expect(selectViewData({ state, i18n }).defaultValues).toMatchObject({
      beginEffectId: "fade-in",
      beginEffectPlaybackSpeed: 1,
      endEffectId: "smooth-volume",
      endEffectPlaybackSpeed: 2,
    });
    expect(selectBgm({ state }).audioEffects).toBeUndefined();
  });

  it("edits sounds in the channel editor without submitting the draft", () => {
    const state = createInitialState();
    setBgm(
      { state },
      {
        bgm: {
          sounds: [{ id: "intro-clip", resourceId: "intro" }],
        },
      },
    );

    openChannelEditor({ state });
    expect(selectViewData({ state, i18n })).toMatchObject({
      isChannelEditorOpen: true,
      hasSoundSelection: false,
    });

    setSelectedSound({ state }, { soundId: "intro-clip" });
    updateSound({ state }, { soundId: "intro-clip", values: { volume: 35 } });
    const editorViewData = selectViewData({ state, i18n });
    expect(editorViewData.hasSoundSelection).toBe(true);
    expect(editorViewData.showChannelControls).toBe(true);
    expect(editorViewData.form.fields).toMatchObject([
      {
        type: "row",
        fields: [
          { name: "startDelayMs", type: "input-duration" },
          { type: "slot", slot: "startDelaySpacer" },
        ],
      },
      {
        type: "row",
        fields: [
          { name: "loop", type: "segmented-control" },
          { name: "volume", type: "slider-with-input" },
        ],
      },
      {
        type: "row",
        fields: [
          { name: "beginEffectId", type: "select" },
          {
            name: "beginEffectPlaybackSpeed",
            type: "slider-with-input",
          },
          { slot: "beginEffectPlaybackSpeedSpacer", type: "slot" },
        ],
      },
      {
        type: "row",
        fields: [
          { name: "endEffectId", type: "select" },
          {
            name: "endEffectPlaybackSpeed",
            type: "slider-with-input",
          },
          { slot: "endEffectPlaybackSpeedSpacer", type: "slot" },
        ],
      },
    ]);

    closeChannelEditor({ state });
    expect(selectViewData({ state, i18n }).isChannelEditorOpen).toBe(false);
    expect(selectBgm({ state }).sounds[0].volume).toBe(35);
    expect(selectSelectedSoundId({ state })).toBeUndefined();
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
    expect(selectedViewData.form.fields[0].fields[0]).toMatchObject({
      name: "startDelayMs",
      label: "Start Delay",
      type: "input-duration",
      min: 0,
      step: 10,
    });
    expect(selectedViewData.defaultValues).toEqual({
      startDelayMs: 0,
      loop: false,
      volume: 90,
      beginEffectId: undefined,
      beginEffectPlaybackSpeed: 1,
      endEffectId: undefined,
      endEffectPlaybackSpeed: 1,
    });
  });

  it("uses the channel loop by default unless an individual sound loops", () => {
    const state = createInitialState();
    setBgm(
      { state },
      {
        bgm: {
          loop: false,
          sounds: [{ id: "intro-clip", resourceId: "intro", loop: true }],
        },
      },
    );

    expect(selectBgm({ state }).loop).toBe(false);
    expect(selectBgm({ state }).sounds[0].loop).toBe(true);

    updateSound({ state }, { soundId: "intro-clip", values: { loop: false } });
    expect(selectBgm({ state }).loop).toBe(true);
    expect(selectBgm({ state }).sounds[0].loop).toBe(false);

    updateSound({ state }, { soundId: "intro-clip", values: { loop: true } });
    expect(selectBgm({ state }).loop).toBe(false);
    expect(selectBgm({ state }).sounds[0].loop).toBe(true);
  });

  it("restores the channel loop after removing the final looping sound", () => {
    const state = createInitialState();
    setBgm(
      { state },
      {
        bgm: {
          loop: false,
          sounds: [
            { id: "first-loop", resourceId: "intro", loop: true },
            { id: "second-loop", resourceId: "theme", loop: true },
            { id: "remaining-clip", resourceId: "intro", loop: false },
          ],
        },
      },
    );

    removeSound({ state }, { soundId: "first-loop" });
    expect(selectBgm({ state }).loop).toBe(false);

    removeSound({ state }, { soundId: "second-loop" });
    expect(selectBgm({ state }).loop).toBe(true);
    expect(selectBgm({ state }).sounds).toHaveLength(1);
    expect(selectBgm({ state }).sounds[0]).toMatchObject({
      id: "remaining-clip",
      loop: false,
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

  it("connects a sound to the exact end of the previous sound", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    setBgm(
      { state },
      {
        bgm: {
          sounds: [
            {
              id: "intro-clip",
              resourceId: "intro",
              startDelayMs: 500,
              startAt: 0.5,
              endAt: 1.5,
              playbackRate: 2,
            },
            {
              id: "theme-clip",
              resourceId: "theme",
              startDelayMs: 4000,
            },
            {
              id: "outro-clip",
              resourceId: "intro",
              startDelayMs: 7500,
            },
          ],
        },
      },
    );

    connectSoundToPrevious({ state }, { soundId: "theme-clip" });

    expect(selectBgm({ state }).sounds[1].startDelayMs).toBe(1000);
    expect(selectBgm({ state }).sounds[2].startDelayMs).toBe(4500);
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
