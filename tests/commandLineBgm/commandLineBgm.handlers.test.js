import { describe, expect, it, vi } from "vitest";
import {
  handleButtonSelectClick,
  handleAfterMount,
  handleChannelClick,
  handleChannelContextMenu,
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

const audioEffects = {
  items: {
    "channel-transition": {
      id: "channel-transition",
      type: "audioEffect",
      name: "Channel Transition",
      audioEffect: {
        type: "transition",
        prev: { fade: { keyframes: [{ value: 0, duration: 600 }] } },
        next: { fade: { keyframes: [{ value: 100, duration: 900 }] } },
      },
    },
    crossfade: {
      id: "crossfade",
      type: "audioEffect",
      name: "Crossfade",
      audioEffect: {
        type: "update",
        tween: {
          volume: { keyframes: [{ value: 100, duration: 600 }] },
        },
      },
    },
  },
  tree: [{ id: "channel-transition" }, { id: "crossfade" }],
};

const i18n = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

const contextMenuItems = [
  {
    type: "item",
    label: "Replace Audio",
    key: "replace",
  },
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
  bgmStore.setRepositoryState({ state }, { sounds, audioEffects });
  return state;
};

describe("commandLineBgm.handlers", () => {
  it("loads Sounds and Audio Effects before rendering the channel form", async () => {
    const state = bgmStore.createInitialState();
    const store = createStore(state);
    const ensureRepository = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();

    await handleAfterMount({
      projectService: {
        ensureRepository,
        getState: vi.fn(() => ({ sounds, audioEffects })),
      },
      store,
      props: {
        bgm: {
          sounds: [{ id: "intro-clip", resourceId: "intro" }],
        },
      },
      render,
    });

    expect(ensureRepository).toHaveBeenCalledOnce();
    expect(state.items).toEqual(sounds);
    expect(state.audioEffectItems).toEqual(audioEffects);
    expect(state.bgm.sounds[0]).toMatchObject({
      id: "intro-clip",
      resourceId: "intro",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("preserves a loaded channel update effect", async () => {
    const state = bgmStore.createInitialState();
    const updateAudioEffects = structuredClone(audioEffects);
    updateAudioEffects.items["smooth-volume"] = {
      id: "smooth-volume",
      type: "audioEffect",
      name: "Smooth Volume",
      audioEffect: {
        type: "update",
        tween: {
          volume: { keyframes: [{ value: 50, duration: 500 }] },
        },
      },
    };
    updateAudioEffects.tree.push({ id: "smooth-volume" });

    await handleAfterMount({
      projectService: {
        ensureRepository: vi.fn().mockResolvedValue(undefined),
        getState: vi.fn(() => ({
          sounds,
          audioEffects: updateAudioEffects,
        })),
      },
      store: createStore(state),
      props: {
        bgm: {
          sounds: [{ id: "main", resourceId: "intro" }],
          audioEffects: { resourceId: "smooth-volume" },
        },
      },
      render: vi.fn(),
    });

    expect(state.bgm.audioEffects).toEqual({
      resourceId: "smooth-volume",
    });
  });

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
              volume: 60,
            },
          },
        },
      },
    );

    expect(state.bgm).toEqual({
      interruption: "loopEnd",
      loop: true,
      volume: 60,
      sounds: [],
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("updates and clears a channel Audio Effect", () => {
    const state = createState();
    const render = vi.fn();
    const store = createStore(state);

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: {
            values: {
              audioEffectId: "channel-transition",
              audioEffectPlaybackSpeed: 0.01,
            },
          },
        },
      },
    );

    expect(state.bgm.audioEffects).toEqual({
      resourceId: "channel-transition",
      playback: { speed: 1 },
    });

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: {
            name: "audioEffectId",
            value: undefined,
            values: {},
          },
        },
      },
    );

    expect(state.bgm.audioEffects).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("updates begin and end effects on the selected sound", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: {
            values: {
              beginEffectId: "crossfade",
              beginEffectPlaybackSpeed: 0.01,
              endEffectId: "crossfade",
              endEffectPlaybackSpeed: 0.01,
            },
          },
        },
      },
    );

    expect(state.bgm.audioEffects).toBeUndefined();
    expect(state.bgm.sounds[0]).toMatchObject({
      beginEffect: {
        resourceId: "crossfade",
        playback: { speed: 1 },
      },
      endEffect: {
        resourceId: "crossfade",
        playback: { speed: 1 },
      },
    });
    expect(render).toHaveBeenCalledOnce();

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: {
            values: {
              beginEffectPlaybackSpeed: 1.25,
              endEffectPlaybackSpeed: 0.75,
            },
          },
        },
      },
    );

    expect(state.bgm.sounds[0]).toMatchObject({
      beginEffect: {
        resourceId: "crossfade",
        playback: { speed: 1.25 },
      },
      endEffect: {
        resourceId: "crossfade",
        playback: { speed: 0.75 },
      },
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("clears sound boundary effects omitted from the form values", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    store.updateSound({
      soundId: "intro-clip",
      values: {
        beginEffectId: "crossfade",
        endEffectId: "crossfade",
      },
    });

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: {
            name: "beginEffectId",
            value: undefined,
            values: {
              endEffectId: "crossfade",
              endEffectPlaybackSpeed: 1,
            },
          },
        },
      },
    );

    expect(state.bgm.sounds[0].beginEffect).toBeUndefined();
    expect(state.bgm.sounds[0].endEffect).toEqual({
      resourceId: "crossfade",
      playback: { speed: 1 },
    });

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: {
            name: "endEffectId",
            value: undefined,
            values: {},
          },
        },
      },
    );

    expect(state.bgm.sounds[0].endEffect).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("updates only the selected clip timing, loop, and volume", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });

    handleFormChange(
      { store, render },
      {
        _event: {
          detail: { values: { startDelayMs: 750, loop: true, volume: 35 } },
        },
      },
    );

    expect(state.bgm.volume).toBe(75);
    expect(state.bgm.loop).toBe(false);
    expect(state.bgm.sounds[0].startDelayMs).toBe(750);
    expect(state.bgm.sounds[0].loop).toBe(true);
    expect(state.bgm.sounds[0].volume).toBe(35);
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the channel editor from the channel", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });

    const stopPropagation = vi.fn();
    const blurActiveElement = vi.fn();
    handleChannelClick(
      { store, render, appService: { blurActiveElement } },
      { _event: { stopPropagation } },
    );

    expect(state.isChannelEditorOpen).toBe(true);
    expect(state.channelSelected).toBe(false);
    expect(state.selectedSoundId).toBeUndefined();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(blurActiveElement).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the channel editor when a channel descendant is clicked", () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    const channel = {
      classList: { contains: vi.fn(() => true) },
    };
    const blurActiveElement = vi.fn();

    handleChannelClick(
      { store, render, appService: { blurActiveElement } },
      {
        _event: {
          currentTarget: channel,
          target: {},
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(state.isChannelEditorOpen).toBe(true);
    expect(state.selectedSoundId).toBeUndefined();
    expect(blurActiveElement).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("clears BGM from the channel context menu without leaving the page", async () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    store.updateChannel({ values: { interruption: "loopEnd", volume: 40 } });
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "delete" },
    });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await handleChannelContextMenu(
      {
        appService: { showDropdownMenu },
        store,
        render,
        i18n,
      },
      {
        _event: {
          clientX: 120,
          clientY: 240,
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: [{ type: "item", label: "Delete", key: "delete" }],
      x: 120,
      y: 240,
      place: "bs",
    });
    expect(store.selectBgm()).toEqual({
      interruption: "immediate",
      loop: true,
      volume: 75,
      sounds: [],
    });
    expect(state.mode).toBe("current");
    expect(state.isChannelEditorOpen).toBe(false);
    expect(render).toHaveBeenCalledOnce();
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

  it("replaces only the audio resource for an individual clip", async () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    store.updateSound({
      soundId: "intro-clip",
      values: { startDelayMs: 750, loop: true, volume: 35 },
    });
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "replace" },
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

    expect(state.mode).toBe("gallery");
    expect(state.pendingReplacementSoundId).toBe("intro-clip");

    store.setTempSelectedResource({ resourceId: "theme" });
    handleButtonSelectClick({ store, render });

    expect(state.mode).toBe("current");
    expect(state.bgm.sounds).toEqual([
      {
        id: "intro-clip",
        resourceId: "theme",
        startDelayMs: 750,
        loop: true,
        volume: 35,
      },
    ]);
    expect(state.selectedSoundId).toBe("intro-clip");
    expect(state.pendingReplacementSoundId).toBeUndefined();
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

  it("connects a clip to the previous clip from its context menu", async () => {
    const state = createState();
    const store = createStore(state);
    const render = vi.fn();
    const setValues = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    store.insertSound({ id: "theme-clip", resourceId: "theme", index: 1 });
    store.updateSound({
      soundId: "theme-clip",
      values: { startDelayMs: 5000 },
    });
    store.insertSound({ id: "outro-clip", resourceId: "intro", index: 2 });
    store.updateSound({
      soundId: "outro-clip",
      values: { startDelayMs: 12000 },
    });
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "connect-to-previous" },
    });

    await handleSoundContextMenu(
      {
        store,
        render,
        refs: { soundForm: { setValues } },
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

    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: [
        {
          type: "item",
          label: "Connect to Previous",
          key: "connect-to-previous",
        },
        ...contextMenuItems,
      ],
      x: 120,
      y: 240,
      place: "bs",
    });
    expect(state.bgm.sounds[1].startDelayMs).toBe(2000);
    expect(state.bgm.sounds[2].startDelayMs).toBe(9000);
    expect(state.selectedSoundId).toBe("theme-clip");
    expect(setValues).toHaveBeenCalledWith({
      values: {
        startDelayMs: 2000,
        loop: false,
        volume: 100,
        beginEffectId: undefined,
        beginEffectPlaybackSpeed: 1,
        endEffectId: undefined,
        endEffectPlaybackSpeed: 1,
      },
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("submits the canonical BGM channel", () => {
    const state = createState();
    const store = createStore(state);
    const dispatchEvent = vi.fn();
    store.insertSound({ id: "intro-clip", resourceId: "intro", index: 0 });
    store.updateSound({
      soundId: "intro-clip",
      values: {
        beginEffectId: "crossfade",
        endEffectId: "crossfade",
      },
    });
    store.updateSound({
      soundId: "intro-clip",
      values: {
        beginEffectPlaybackSpeed: 1.5,
      },
    });

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
            beginEffect: {
              resourceId: "crossfade",
              playback: { speed: 1.5 },
            },
            endEffect: {
              resourceId: "crossfade",
              playback: { speed: 1 },
            },
          },
        ],
      },
    });
  });
});
