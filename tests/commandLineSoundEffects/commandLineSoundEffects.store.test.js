import { describe, expect, it } from "vitest";
import * as sfxStore from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.store.js";
import {
  addChannel,
  createInitialState,
  finishSoundDrag,
  insertSound,
  moveChannel,
  removeChannel,
  removeSound,
  selectSfx,
  selectViewData,
  setRepositoryState,
  setSelectedSound,
  setSfx,
  startSoundDrag,
  updateSoundDrag,
} from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.store.js";

const sounds = {
  items: {
    "folder-sfx": {
      id: "folder-sfx",
      type: "folder",
      name: "SFX",
    },
    rain: {
      id: "rain",
      type: "sound",
      name: "Rain",
      fileId: "rain.mp3",
      waveformDataFileId: "rain-waveform",
      duration: 2,
      parentId: "folder-sfx",
    },
    thunder: {
      id: "thunder",
      type: "sound",
      name: "Thunder",
      fileId: "thunder.mp3",
      waveformDataFileId: "thunder-waveform",
      duration: 6,
      parentId: "folder-sfx",
    },
  },
  tree: [
    {
      id: "folder-sfx",
      children: [{ id: "rain" }, { id: "thunder" }],
    },
  ],
};

const i18n = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

describe("commandLineSoundEffects.store", () => {
  it("keeps every select-prefixed export read-only", () => {
    const state = Object.freeze(createInitialState());
    const selectors = Object.entries(sfxStore).filter(([name]) => {
      return name.startsWith("select");
    });

    selectors.forEach(([, selector]) => {
      expect(() => selector({ state, i18n }, {})).not.toThrow();
    });
  });

  it("starts without an implicit channel", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n });

    expect(selectSfx({ state })).toEqual({ channels: [] });
    expect(viewData.channels).toEqual([]);
    expect(viewData.hasSelection).toBe(false);
    expect(viewData.addChannelButtonLabel).toBe("+ Add Channel");
  });

  it("creates, reorders, and removes named channels", () => {
    const state = createInitialState();

    addChannel({ state }, { id: "Weather" });
    addChannel({ state }, { id: "UI" });
    addChannel({ state }, { id: "Weather" });

    expect(selectSfx({ state })).toEqual({
      channels: [
        {
          id: "Weather",
          interruption: "immediate",
          volume: 75,
          sounds: [],
        },
        {
          id: "UI",
          interruption: "immediate",
          volume: 75,
          sounds: [],
        },
      ],
    });
    expect(state.selectedChannelId).toBe("UI");

    moveChannel({ state }, { channelId: "UI", direction: "up" });
    expect(state.channels.map((channel) => channel.id)).toEqual([
      "UI",
      "Weather",
    ]);

    removeChannel({ state }, { channelId: "UI" });
    expect(state.channels.map((channel) => channel.id)).toEqual(["Weather"]);
    expect(state.selectedChannelId).toBe("Weather");
  });

  it("loads canonical channels and lays out overlapping clips in lanes", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    setSfx(
      { state },
      {
        sfx: {
          channels: [
            {
              id: "Weather",
              volume: 80,
              sounds: [
                {
                  id: "rain-clip",
                  resourceId: "rain",
                  loop: true,
                  volume: 90,
                },
                {
                  id: "thunder-clip",
                  resourceId: "thunder",
                  volume: 60,
                  startDelayMs: 999,
                },
              ],
            },
          ],
        },
      },
    );

    expect(selectSfx({ state }).channels[0].sounds).toEqual([
      {
        id: "rain-clip",
        resourceId: "rain",
        loop: true,
        volume: 90,
        startDelayMs: 0,
      },
      {
        id: "thunder-clip",
        resourceId: "thunder",
        loop: false,
        volume: 60,
        startDelayMs: 999,
      },
    ]);
    const channelView = selectViewData({ state, i18n }).channels[0];
    expect(channelView.durationLabel).toBe("0:06");
    expect(channelView.channelHeightPx).toBe(276);
    expect(
      channelView.sounds.map((sound) => ({
        durationLabel: sound.durationLabel,
        leftPercent: sound.leftPercent,
        topPx: sound.topPx,
        widthPercent: sound.widthPercent,
        insertBeforeIndex: sound.insertBeforeIndex,
        insertAfterIndex: sound.insertAfterIndex,
      })),
    ).toEqual([
      {
        durationLabel: "0:02",
        leftPercent: "0.0000",
        topPx: 0,
        widthPercent: "28.5755",
        insertBeforeIndex: 0,
        insertAfterIndex: 1,
      },
      {
        durationLabel: "0:06",
        leftPercent: "14.2735",
        topPx: 126,
        widthPercent: "85.7265",
        insertBeforeIndex: 1,
        insertAfterIndex: 2,
      },
    ]);

    const channelSelection = selectViewData({ state, i18n });
    expect(channelSelection.selectionHeading).toBe("Channel");
    expect(channelSelection.selectionName).toBe("Weather");
    expect(channelSelection.form.fields.map((field) => field.name)).toEqual([
      "interruption",
      "volume",
    ]);
    expect(channelSelection.defaultValues).toEqual({
      interruption: "immediate",
      volume: 80,
    });

    setSelectedSound({ state }, { channelId: "Weather", soundId: "rain-clip" });
    const soundSelection = selectViewData({ state, i18n });
    expect(soundSelection.selectionHeading).toBe("Audio");
    expect(soundSelection.selectionName).toBe("Rain");
    expect(soundSelection.form.fields.map((field) => field.name)).toEqual([
      "startDelayMs",
      "loop",
      "volume",
    ]);
    expect(soundSelection.defaultValues).toEqual({
      startDelayMs: 0,
      loop: true,
      volume: 90,
    });
  });

  it("uses the longest channel as the shared timeline width", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    setSfx(
      { state },
      {
        sfx: {
          channels: [
            {
              id: "Weather",
              sounds: [
                { id: "rain-clip", resourceId: "rain" },
                {
                  id: "thunder-clip",
                  resourceId: "thunder",
                  startDelayMs: 2000,
                },
              ],
            },
            {
              id: "UI",
              sounds: [{ id: "short-clip", resourceId: "rain" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n });
    expect(
      viewData.channels.map((channel) => ({
        id: channel.id,
        durationLabel: channel.durationLabel,
        timelineDurationMs: channel.timelineDurationMs,
      })),
    ).toEqual([
      {
        id: "Weather",
        durationLabel: "0:08",
        timelineDurationMs: 8000,
      },
      {
        id: "UI",
        durationLabel: "0:02",
        timelineDurationMs: 8000,
      },
    ]);
    expect(viewData.channels[1].sounds[0].widthPercent).toBe("25.0000");
  });

  it("migrates legacy items into a visible channel without changing their effective volume", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    setSfx(
      { state },
      {
        sfx: {
          items: [
            { id: "rain-clip", resourceId: "rain" },
            { id: "thunder-clip", resourceId: "thunder", volume: 500 },
          ],
        },
      },
    );

    expect(selectSfx({ state })).toEqual({
      channels: [
        {
          id: "default",
          interruption: "immediate",
          volume: 100,
          sounds: [
            {
              id: "rain-clip",
              resourceId: "rain",
              loop: false,
              volume: 75,
              startDelayMs: 0,
            },
            {
              id: "thunder-clip",
              resourceId: "thunder",
              loop: false,
              volume: 50,
              startDelayMs: 0,
            },
          ],
        },
      ],
    });
  });

  it("places inserted sounds without reflowing the channel after removal", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    addChannel({ state }, { id: "Weather" });
    addChannel({ state }, { id: "UI" });
    insertSound(
      { state },
      {
        channelId: "Weather",
        id: "thunder-clip",
        resourceId: "thunder",
        index: 0,
      },
    );
    insertSound(
      { state },
      {
        channelId: "Weather",
        id: "rain-clip",
        resourceId: "rain",
        index: 0,
      },
    );

    expect(state.channels[0].sounds.map((sound) => sound.id)).toEqual([
      "rain-clip",
      "thunder-clip",
    ]);
    expect(state.channels[0].sounds[1].startDelayMs).toBe(2000);
    expect(state.channels[1].sounds).toEqual([]);

    removeSound({ state }, { channelId: "Weather", soundId: "rain-clip" });
    expect(state.channels[0].sounds[0].startDelayMs).toBe(2000);
    expect(state.selectedChannelId).toBe("Weather");
    expect(state.selectedSoundId).toBeUndefined();
  });

  it("updates one SFX sound start delay from a horizontal timeline drag", () => {
    const state = createInitialState();
    setRepositoryState({ state }, { sounds });
    addChannel({ state }, { id: "Weather" });
    insertSound(
      { state },
      {
        channelId: "Weather",
        id: "rain-clip",
        resourceId: "rain",
        index: 0,
      },
    );

    startSoundDrag(
      { state },
      {
        channelId: "Weather",
        soundId: "rain-clip",
        pointerId: 9,
        clientX: 0,
        timelineDurationMs: 2000,
        timelineWidthPx: 400,
      },
    );
    updateSoundDrag(
      { state },
      {
        pointerId: 9,
        clientX: 200,
      },
    );

    expect(state.channels[0].sounds[0].startDelayMs).toBe(1000);

    finishSoundDrag({ state }, { pointerId: 9 });
    expect(state.soundDrag).toBeUndefined();
  });
});
