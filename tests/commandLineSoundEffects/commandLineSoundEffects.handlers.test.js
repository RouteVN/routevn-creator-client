import { describe, expect, it, vi } from "vitest";
import {
  handleAddChannelFormAction,
  handleButtonSelectClick,
  handleChannelContextMenu,
  handleFormChange,
  handleSoundKeyDown,
  handleSoundContextMenu,
  handleSubmitClick,
} from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.handlers.js";
import * as sfxStore from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.store.js";

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
      duration: 2,
      parentId: "folder-sfx",
    },
  },
  tree: [
    {
      id: "folder-sfx",
      children: [{ id: "rain" }],
    },
  ],
};

const i18n = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

const createStore = (state) => {
  const store = {};
  for (const [name, implementation] of Object.entries(sfxStore)) {
    if (name === "createInitialState" || name === "selectViewData") {
      continue;
    }
    store[name] = (payload) => implementation({ state }, payload);
  }
  return store;
};

const createState = () => {
  const state = sfxStore.createInitialState();
  sfxStore.setRepositoryState({ state }, { sounds });
  return state;
};

describe("commandLineSoundEffects.handlers", () => {
  it("ignores sound keydowns bubbled from insertion buttons", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.addChannel({ id: "Weather" });
    store.insertSound({
      channelId: "Weather",
      id: "rain-clip",
      resourceId: "rain",
      index: 0,
    });
    store.setSelectedChannel({ channelId: "Weather" });
    const insertionButton = {};
    const soundClip = {
      dataset: { channelId: "Weather", soundId: "rain-clip" },
    };
    const preventDefault = vi.fn();

    handleSoundKeyDown(
      { store, render },
      {
        _event: {
          key: "Enter",
          target: insertionButton,
          currentTarget: soundClip,
          preventDefault,
        },
      },
    );

    expect(preventDefault).not.toHaveBeenCalled();
    expect(state.selectedSoundId).toBeUndefined();
    expect(render).not.toHaveBeenCalled();
  });

  it("moves a selected sound by keyboard timing steps", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.addChannel({ id: "Weather" });
    store.insertSound({
      channelId: "Weather",
      id: "rain-clip",
      resourceId: "rain",
      index: 0,
    });
    const soundClip = {
      dataset: { channelId: "Weather", soundId: "rain-clip" },
    };

    handleSoundKeyDown(
      {
        store,
        render,
        refs: { form: { setValues: vi.fn() } },
      },
      {
        _event: {
          key: "ArrowRight",
          shiftKey: false,
          target: soundClip,
          currentTarget: soundClip,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(state.channels[0].sounds[0].startDelayMs).toBe(100);
    expect(render).toHaveBeenCalledOnce();
  });

  it("creates a named channel and rejects a duplicate name", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    const showToast = vi.fn();
    const deps = {
      store,
      render,
      appService: { showToast },
      i18n,
    };

    handleAddChannelFormAction(deps, {
      _event: {
        detail: { actionId: "submit", values: { name: "Weather" } },
      },
    });

    expect(state.channels).toEqual([
      {
        id: "Weather",
        interruption: "immediate",
        volume: 75,
        sounds: [],
      },
    ]);
    expect(state.selectedChannelId).toBe("Weather");
    expect(render).toHaveBeenCalledOnce();

    handleAddChannelFormAction(deps, {
      _event: {
        detail: { actionId: "submit", values: { name: "Weather" } },
      },
    });

    expect(state.channels).toHaveLength(1);
    expect(showToast).toHaveBeenCalledWith({
      message: "Channel name must be unique.",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("moves a channel through its action menu", async () => {
    const state = createState();
    const store = createStore(state);
    store.addChannel({ id: "Weather" });
    store.addChannel({ id: "UI" });
    const render = vi.fn();
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "move-up" },
    });

    await handleChannelContextMenu(
      {
        store,
        render,
        appService: { showDropdownMenu },
        i18n,
      },
      {
        _event: {
          currentTarget: {
            dataset: { channelId: "UI" },
          },
          clientX: 100,
          clientY: 200,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: [
        { type: "item", label: "Move Up", key: "move-up" },
        { type: "item", label: "Delete", key: "delete" },
      ],
      x: 100,
      y: 200,
      place: "bs",
    });
    expect(state.channels.map((channel) => channel.id)).toEqual([
      "UI",
      "Weather",
    ]);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("inserts a gallery selection into the requested channel", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.addChannel({ id: "Weather" });
    store.setPendingInsertion({ channelId: "Weather", index: 0 });
    store.setTempSelectedResource({ resourceId: "rain" });
    store.setMode({ mode: "gallery" });

    handleButtonSelectClick({ store, render });

    expect(state.mode).toBe("current");
    expect(state.channels[0].sounds).toHaveLength(1);
    expect(state.channels[0].sounds[0]).toMatchObject({
      resourceId: "rain",
      loop: false,
      volume: 100,
      startDelayMs: 0,
    });
    expect(state.selectedSoundId).toBe(state.channels[0].sounds[0].id);
    expect(render).toHaveBeenCalledOnce();
  });

  it("updates the selected channel or sound controls", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.addChannel({ id: "Weather" });

    handleFormChange(
      { store, render },
      { _event: { detail: { values: { volume: 60 } } } },
    );
    expect(state.channels[0].volume).toBe(60);

    store.insertSound({
      channelId: "Weather",
      id: "rain-clip",
      resourceId: "rain",
      index: 0,
    });
    handleFormChange(
      { store, render },
      {
        _event: {
          detail: {
            values: { startDelayMs: 750, loop: true, volume: 35 },
          },
        },
      },
    );

    expect(state.channels[0].volume).toBe(60);
    expect(state.channels[0].sounds[0]).toMatchObject({
      startDelayMs: 750,
      loop: true,
      volume: 35,
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("removes an individual sound through its context menu", async () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.addChannel({ id: "Weather" });
    store.insertSound({
      channelId: "Weather",
      id: "rain-clip",
      resourceId: "rain",
      index: 0,
    });
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "remove" },
    });

    await handleSoundContextMenu(
      {
        store,
        render,
        appService: { showDropdownMenu },
        i18n,
      },
      {
        _event: {
          currentTarget: {
            dataset: { channelId: "Weather", soundId: "rain-clip" },
          },
          clientX: 120,
          clientY: 240,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(state.channels[0].sounds).toEqual([]);
    expect(state.selectedChannelId).toBe("Weather");
    expect(state.selectedSoundId).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("submits the canonical channels payload", () => {
    const state = createState();
    const store = createStore(state);
    store.addChannel({ id: "Weather" });
    store.insertSound({
      channelId: "Weather",
      id: "rain-clip",
      resourceId: "rain",
      index: 0,
    });
    const dispatchEvent = vi.fn();

    handleSubmitClick(
      { store, dispatchEvent },
      { _event: { stopPropagation: vi.fn() } },
    );

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      sfx: {
        channels: [
          {
            id: "Weather",
            interruption: "immediate",
            volume: 75,
            sounds: [
              {
                id: "rain-clip",
                resourceId: "rain",
                loop: false,
                volume: 100,
                startDelayMs: 0,
              },
            ],
          },
        ],
      },
    });
  });
});
