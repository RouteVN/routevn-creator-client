import { describe, expect, it, vi } from "vitest";
import {
  handleAudioWaveformClick,
  handleAudioWaveformRightClick,
} from "../../src/components/commandLineBgm/commandLineBgm.handlers.js";
import {
  clearBgmAudio,
  createInitialState,
  selectSelectedResource,
  selectTempSelectedResourceId,
  setBgm,
  setMode,
  setRepositoryState,
  setTempSelectedResource,
} from "../../src/components/commandLineBgm/commandLineBgm.store.js";

const sounds = {
  items: {
    "folder-bgm": {
      id: "folder-bgm",
      type: "folder",
      name: "BGM",
    },
    "sound-calm-theme": {
      id: "sound-calm-theme",
      type: "sound",
      name: "Calm Theme",
      fileId: "file-calm-theme",
      waveformDataFileId: "waveform-calm-theme",
      parentId: "folder-bgm",
    },
  },
  tree: [
    {
      id: "folder-bgm",
      children: [{ id: "sound-calm-theme" }],
    },
  ],
};

const createStoreDeps = (state) => ({
  selectSelectedResource: () => selectSelectedResource({ state }),
  selectTempSelectedResourceId: () => selectTempSelectedResourceId({ state }),
  setTempSelectedResource: (payload) =>
    setTempSelectedResource({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  clearBgmAudio: (payload) => clearBgmAudio({ state }, payload),
});

describe("commandLineBgm.handlers", () => {
  it("opens the gallery when the current BGM is clicked", () => {
    const state = createInitialState();
    const render = vi.fn();
    const stopPropagation = vi.fn();

    setRepositoryState({ state }, { sounds });
    setBgm(
      { state },
      {
        bgm: {
          resourceId: "sound-calm-theme",
        },
      },
    );

    handleAudioWaveformClick(
      {
        store: createStoreDeps(state),
        render,
      },
      {
        _event: {
          stopPropagation,
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(selectTempSelectedResourceId({ state })).toBe("sound-calm-theme");
    expect(state.mode).toBe("gallery");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("shows the context menu and removes the current BGM on right click", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: {
        key: "remove",
      },
    });

    setRepositoryState({ state }, { sounds });
    setBgm(
      { state },
      {
        bgm: {
          resourceId: "sound-calm-theme",
        },
      },
    );
    setTempSelectedResource(
      { state },
      {
        resourceId: "sound-calm-theme",
      },
    );

    await handleAudioWaveformRightClick(
      {
        store: createStoreDeps(state),
        render,
        globalUI: {
          showDropdownMenu,
        },
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

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(showDropdownMenu).toHaveBeenCalledWith({
      items: [{ type: "item", label: "Remove", key: "remove" }],
      x: 120,
      y: 240,
      place: "bs",
    });
    expect(state.bgm.resourceId).toBeUndefined();
    expect(selectTempSelectedResourceId({ state })).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
