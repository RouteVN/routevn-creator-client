import { describe, expect, it, vi } from "vitest";
import {
  handleButtonSelectClick,
  handleChannelClick,
  handleEdgeAddClick,
  handleEmptyAddClick,
  handleFormChange,
  handleSoundContextMenu,
  handleSubmitClick,
} from "../../src/components/commandLineBgm/commandLineBgm.handlers.js";
import * as bgmStore from "../../src/components/commandLineBgm/commandLineBgm.store.js";

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

const contextMenuItems = [
  {
    type: "item",
    label: "Insert Sound Before",
    key: "insert-before",
  },
  {
    type: "item",
    label: "Insert Sound After",
    key: "insert-after",
  },
  { type: "item", label: "Remove", key: "remove" },
];

const createStore = (state) => {
  const store = {};
  for (const [name, implementation] of Object.entries(bgmStore)) {
    if (name === "createInitialState" || name === "selectViewData") {
      continue;
    }
    store[name] = (payload) => implementation({ state }, payload);
  }
  return store;
};

const createState = () => {
  const state = bgmStore.createInitialState();
  bgmStore.setRepositoryState({ state }, { sounds });
  return state;
};

describe("commandLineBgm.handlers", () => {
  it("updates channel controls while the channel is selected", () => {
    const state = createState();
    const render = vi.fn();

    handleFormChange(
      { store: createStore(state), render },
      {
        _event: {
          detail: {
            values: {
              interruption: "loopEnd",
              loop: false,
              volume: 60,
            },
          },
        },
      },
    );

    expect(state.bgm).toEqual({
      interruption: "loopEnd",
      loop: false,
      volume: 60,
      sounds: [],
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("updates only the selected clip timing and volume", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: { values: { startDelayMs: 750, volume: 35 } },
        },
      },
    );

    expect(state.bgm.volume).toBe(75);
    expect(state.bgm.sounds[0].startDelayMs).toBe(750);
    expect(state.bgm.sounds[0].volume).toBe(35);
    expect(render).toHaveBeenCalledOnce();
  });

  it("selects the whole channel from the channel header", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });

    const stopPropagation = vi.fn();
    handleChannelClick({ store, render }, { _event: { stopPropagation } });

    expect(state.selectedSoundId).toBeUndefined();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("ignores a channel click synthesized from a replaced drag surface", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    const channel = {
      classList: { contains: vi.fn(() => true) },
    };

    handleChannelClick(
      { store, render },
      {
        _event: {
          currentTarget: channel,
          target: {},
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(state.selectedSoundId).toBe("intro-clip");
    expect(render).not.toHaveBeenCalled();
  });

  it("keeps the sound selected when a post-drag click targets the channel", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    store.startSoundDrag({
      soundId: "intro-clip",
      pointerId: 7,
      clientX: 100,
      timelineDurationMs: 2000,
      timelineWidthPx: 400,
    });
    store.finishSoundDrag({
      pointerId: 7,
      suppressChannelClickUntil: 500,
    });
    const channel = {
      classList: { contains: vi.fn(() => true) },
    };

    handleChannelClick(
      { store, render },
      {
        _event: {
          currentTarget: channel,
          target: channel,
          timeStamp: 300,
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(state.selectedSoundId).toBe("intro-clip");
    expect(render).not.toHaveBeenCalled();
  });

  it("opens the gallery with the requested insertion index", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    const stopPropagation = vi.fn();
    store.setTempSelectedResource({ resourceId: "theme" });

    handleEmptyAddClick({ store, render }, { _event: { stopPropagation } });

    expect(state.mode).toBe("gallery");
    expect(state.pendingInsertIndex).toBe(0);
    expect(state.tempSelectedResourceId).toBeUndefined();

    handleEdgeAddClick(
      { store, render },
      {
        _event: {
          stopPropagation,
          currentTarget: { dataset: { insertIndex: "2" } },
        },
      },
    );

    expect(state.pendingInsertIndex).toBe(2);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
  });

  it("inserts the gallery selection and selects the new clip", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.setPendingInsertIndex({ index: 0 });
    store.setTempSelectedResource({ resourceId: "intro" });
    store.setMode({ mode: "gallery" });

    handleButtonSelectClick({ store, render });

    expect(state.mode).toBe("current");
    expect(state.bgm.sounds).toHaveLength(1);
    expect(state.bgm.sounds[0]).toMatchObject({
      resourceId: "intro",
      volume: 100,
      startDelayMs: 0,
    });
    expect(state.selectedSoundId).toBe(state.bgm.sounds[0].id);
    expect(render).toHaveBeenCalledOnce();
  });

  it("selects and removes an individual clip from its context menu", async () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
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
          currentTarget: { dataset: { soundId: "intro-clip" } },
          clientX: 120,
          clientY: 240,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: contextMenuItems,
      x: 120,
      y: 240,
      place: "bs",
    });
    expect(state.bgm.sounds).toEqual([]);
    expect(state.selectedSoundId).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["before", "insert-before", 1],
    ["after", "insert-after", 2],
  ])(
    "opens the gallery to insert a sound %s the right-clicked clip",
    async (_position, key, expectedIndex) => {
      const state = createState();
      const store = createStore(state);
      const render = vi.fn();
      store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
      store.insertSound({ id: "theme-clip", resourceId: "theme", index: 1 });
      const showDropdownMenu = vi.fn().mockResolvedValue({ item: { key } });

      await handleSoundContextMenu(
        {
          store,
          render,
          appService: { showDropdownMenu },
          i18n,
        },
        {
          _event: {
            currentTarget: { dataset: { soundId: "theme-clip" } },
            clientX: 120,
            clientY: 240,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          },
        },
      );

      expect(state.mode).toBe("gallery");
      expect(state.pendingInsertIndex).toBe(expectedIndex);
      expect(state.selectedSoundId).toBe("theme-clip");
      expect(state.bgm.sounds.map((sound) => sound.id)).toEqual([
        "intro-clip",
        "theme-clip",
      ]);
      expect(render).toHaveBeenCalledTimes(2);
    },
  );

  it("submits the canonical BGM channel", () => {
    const state = createState();
    const store = createStore(state);
    const dispatchEvent = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });

    handleSubmitClick(
      { store, dispatchEvent },
      { _event: { stopPropagation: vi.fn() } },
    );

    const event = dispatchEvent.mock.calls[0][0];
    expect(event.detail).toEqual({
      bgm: {
        interruption: "immediate",
        loop: true,
        volume: 75,
        sounds: [
          {
            id: "intro-clip",
            resourceId: "intro",
            loop: false,
            volume: 100,
            startDelayMs: 0,
          },
        ],
      },
    });
  });
});
