import { describe, expect, it } from "vitest";
import * as voiceStore from "../../src/components/commandLineVoice/commandLineVoice.store.js";
import {
  createInitialState,
  insertSound,
  removeSound,
  selectSelectedSoundId,
  selectViewData,
  selectVoicePayload,
  setRepositoryState,
  setSelectedSound,
  setVoice,
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

  it("starts with an empty selected Voice channel", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n });

    expect(selectVoicePayload({ state })).toEqual({
      loop: false,
      volume: 100,
      sounds: [],
    });
    expect(viewData.channelLabel).toBe("Voice Channel");
    expect(viewData.channelDurationLabel).toBe("0:00");
    expect(viewData.selectionHeading).toBe("Channel");
    expect(viewData.selectionName).toBe("Voice Channel");
    expect(viewData.form.fields.map((field) => field.name)).toEqual([
      "loop",
      "volume",
    ]);
    expect(viewData.defaultValues).toEqual({ loop: false, volume: 100 });
  });

  it("migrates a legacy Voice sound into the canonical channel", () => {
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
      loop: true,
      volume: 50,
      sounds: [
        {
          id: "default",
          resourceId: "response",
          volume: 100,
          startDelayMs: 0,
        },
      ],
    });
    expect(selectViewData({ state, i18n }).sounds[0]).toMatchObject({
      name: "Response",
      durationLabel: "0:06",
      widthPercent: "100.0000",
    });
  });

  it("sizes clips proportionally and exposes channel or clip controls", () => {
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
            { id: "response-clip", resourceId: "response", volume: 60 },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n });
    expect(viewData.channelDurationLabel).toBe("0:08");
    expect(
      viewData.sounds.map((sound) => ({
        durationLabel: sound.durationLabel,
        startDelayMs: sound.startDelayMs,
        widthPercent: sound.widthPercent,
      })),
    ).toEqual([
      {
        durationLabel: "0:02",
        startDelayMs: 0,
        widthPercent: "25.0000",
      },
      {
        durationLabel: "0:06",
        startDelayMs: 2000,
        widthPercent: "75.0000",
      },
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

  it("reflows the Voice timeline after insertion and removal", () => {
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
        volume: 100,
        startDelayMs: 0,
      },
    ]);
    expect(selectSelectedSoundId({ state })).toBeUndefined();
  });
});
