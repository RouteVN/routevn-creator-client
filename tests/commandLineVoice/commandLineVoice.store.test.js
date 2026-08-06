import { describe, expect, it } from "vitest";
import * as voiceStore from "../../src/components/commandLineVoice/commandLineVoice.store.js";
import {
  clearSelectedSound,
  closeChannelEditor,
  connectSoundToPrevious,
  createInitialState,
  insertSound,
  openChannelEditor,
  removeSound,
  selectSelectedSoundId,
  selectViewData,
  selectVoicePayload,
  finishSoundDrag,
  setRepositoryState,
  setSelectedSound,
  setVoice,
  startSoundDrag,
  updateChannel,
  updateSound,
  updateSoundDrag,
} from "../../src/components/commandLineVoice/commandLineVoice.store.js";

const voices = {
  items: {
    intro: {
      id: "intro",
      type: "voice",
      name: "Intro",
      fileId: "intro.ogg",
      waveformDataFileId: "intro-waveform",
      duration: 2,
    },
    response: {
      id: "response",
      type: "voice",
      name: "Response",
      fileId: "response.ogg",
      waveformDataFileId: "response-waveform",
      duration: 6,
    },
  },
  tree: [{ id: "intro" }, { id: "response" }],
};

const i18n = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

describe("commandLineVoice.store", () => {
  it("keeps every select-prefixed export read-only", () => {
    const state = Object.freeze(createInitialState());
    const selectors = Object.entries(voiceStore).filter(([name]) => {
      return name.startsWith("select");
    });

    selectors.forEach(([, selector]) => {
      expect(() => selector({ state, i18n }, {})).not.toThrow();
    });
  });

  it("starts with an unselected Voice channel and selects it explicitly", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n });

    expect(selectVoicePayload({ state })).toEqual({
      interruption: "immediate",
      loop: false,
      volume: 100,
      sounds: [],
    });
    expect(viewData.channelLabel).toBe("Voice Channel");
    expect(viewData.channelDurationLabel).toBe("0:00");
    expect(viewData.hasSelection).toBe(false);
    expect(viewData.channelBorderColor).toBe("bo");
    expect(viewData.channelHoverBorderColor).toBe("ac");
    expect(viewData.selectionHeading).toBe("");
    expect(viewData.selectionName).toBe("");

    clearSelectedSound({ state });
    const selectedViewData = selectViewData({ state, i18n });
    expect(selectedViewData.hasSelection).toBe(true);
    expect(selectedViewData.channelBorderColor).toBe("pr");
    expect(selectedViewData.channelHoverBorderColor).toBe("pr");
    expect(selectedViewData.selectionHeading).toBe("Channel");
    expect(selectedViewData.selectionName).toBe("Voice Channel");
    expect(selectedViewData.form.fields.map((field) => field.name)).toEqual([
      "loop",
      "interruption",
      "volume",
    ]);
    expect(selectedViewData.defaultValues).toEqual({
      interruption: "immediate",
      loop: false,
      volume: 100,
    });
    expect(
      selectedViewData.channelForm.fields.map(({ name, type }) => ({
        name,
        type,
      })),
    ).toEqual([
      { name: "loop", type: "segmented-control" },
      { name: "interruption", type: "segmented-control" },
      { name: "volume", type: "slider-with-input" },
    ]);
    expect(selectedViewData.editChannelLabel).toBe("Edit Channel");
  });

  it("edits sounds in the channel editor without submitting the draft", () => {
    const state = createInitialState();
    setVoice(
      { state },
      {
        voice: {
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
    updateSound({ state }, { soundId: "intro-clip", values: { volume: 40 } });
    const editorViewData = selectViewData({ state, i18n });
    expect(editorViewData.hasSoundSelection).toBe(true);
    expect(editorViewData.form.fields.map((field) => field.name)).toEqual([
      "startDelayMs",
      "loop",
      "volume",
    ]);

    closeChannelEditor({ state });
    expect(selectViewData({ state, i18n }).isChannelEditorOpen).toBe(false);
    expect(selectVoicePayload({ state }).sounds[0].volume).toBe(40);
    expect(selectSelectedSoundId({ state })).toBeUndefined();
  });

  it("migrates a legacy Voice sound without losing its start delay", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { voices });
    setVoice(
      { state },
      {
        voice: {
          resourceId: "response",
          loop: true,
          volume: 500,
          startDelayMs: 250,
        },
      },
    );

    expect(selectVoicePayload({ state })).toEqual({
      interruption: "immediate",
      loop: true,
      volume: 50,
      sounds: [
        {
          id: "default",
          resourceId: "response",
          loop: false,
          volume: 100,
          startDelayMs: 250,
        },
      ],
    });
    expect(selectViewData({ state, i18n }).sounds[0]).toMatchObject({
      name: "Response",
      durationLabel: "0:06",
      leftPercent: "4.0000",
      widthPercent: "96.0000",
    });
  });

  it("lays out parallel clips and exposes their start delay controls", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { voices });
    setVoice(
      { state },
      {
        voice: {
          loop: false,
          volume: 80,
          sounds: [
            { id: "intro-clip", resourceId: "intro", volume: 90 },
            {
              id: "response-clip",
              resourceId: "response",
              volume: 60,
              startDelayMs: 1000,
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n });
    expect(viewData.channelDurationLabel).toBe("0:07");
    expect(viewData.channelHeightPx).toBe(276);
    expect(
      viewData.sounds.map((sound) => ({
        durationLabel: sound.durationLabel,
        leftPercent: sound.leftPercent,
        startDelayMs: sound.startDelayMs,
        topPx: sound.topPx,
        widthPercent: sound.widthPercent,
      })),
    ).toEqual([
      {
        durationLabel: "0:02",
        leftPercent: "0.0000",
        startDelayMs: 0,
        topPx: 0,
        widthPercent: "28.5714",
      },
      {
        durationLabel: "0:06",
        leftPercent: "14.2857",
        startDelayMs: 1000,
        topPx: 126,
        widthPercent: "85.7143",
      },
    ]);

    setSelectedSound({ state }, { soundId: "intro-clip" });
    const selectedViewData = selectViewData({ state, i18n });
    expect(selectedViewData.selectionHeading).toBe("Audio");
    expect(selectedViewData.selectionName).toBe("Intro");
    expect(selectedViewData.form.fields.map((field) => field.name)).toEqual([
      "startDelayMs",
      "loop",
      "volume",
    ]);
    expect(selectedViewData.form.fields[0]).toMatchObject({
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
    });
  });

  it("keeps whole-channel and individual Voice loops mutually exclusive", () => {
    const state = createInitialState();
    setVoice(
      { state },
      {
        voice: {
          loop: false,
          sounds: [{ id: "intro-clip", resourceId: "intro", loop: true }],
        },
      },
    );

    expect(selectVoicePayload({ state }).sounds[0].loop).toBe(true);

    updateChannel({ state }, { values: { loop: true } });
    expect(selectVoicePayload({ state }).loop).toBe(true);
    expect(selectVoicePayload({ state }).sounds[0].loop).toBe(false);

    updateSound({ state }, { soundId: "intro-clip", values: { loop: true } });
    expect(selectVoicePayload({ state }).loop).toBe(false);
    expect(selectVoicePayload({ state }).sounds[0].loop).toBe(true);
  });

  it("places inserted Voice sounds without reflowing after removal", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { voices });
    insertSound(
      { state },
      { id: "response-clip", resourceId: "response", index: 0 },
    );
    insertSound({ state }, { id: "intro-clip", resourceId: "intro", index: 0 });

    expect(
      selectVoicePayload({ state }).sounds.map((sound) => sound.id),
    ).toEqual(["intro-clip", "response-clip"]);
    expect(selectVoicePayload({ state }).sounds[1].startDelayMs).toBe(2000);
    expect(selectSelectedSoundId({ state })).toBe("intro-clip");

    removeSound({ state }, { soundId: "intro-clip" });

    expect(selectVoicePayload({ state }).sounds).toEqual([
      {
        id: "response-clip",
        resourceId: "response",
        loop: false,
        volume: 100,
        startDelayMs: 2000,
      },
    ]);
    expect(selectSelectedSoundId({ state })).toBeUndefined();
  });

  it("connects a Voice sound and shifts every following sound with it", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { voices });
    setVoice(
      { state },
      {
        voice: {
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
              id: "response-clip",
              resourceId: "response",
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

    connectSoundToPrevious({ state }, { soundId: "response-clip" });

    expect(selectVoicePayload({ state }).sounds[1].startDelayMs).toBe(1000);
    expect(selectVoicePayload({ state }).sounds[2].startDelayMs).toBe(4500);
  });

  it("updates a Voice sound start delay from a horizontal timeline drag", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { voices });
    insertSound({ state }, { id: "intro-clip", resourceId: "intro", index: 0 });

    startSoundDrag(
      { state },
      {
        soundId: "intro-clip",
        pointerId: 4,
        clientX: 50,
        timelineDurationMs: 2000,
        timelineWidthPx: 400,
      },
    );
    updateSoundDrag(
      { state },
      {
        pointerId: 4,
        clientX: 250,
      },
    );

    expect(selectVoicePayload({ state }).sounds[0].startDelayMs).toBe(1000);

    finishSoundDrag({ state }, { pointerId: 4 });
    expect(state.soundDrag).toBeUndefined();
  });
});
