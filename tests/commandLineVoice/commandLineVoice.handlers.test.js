import { describe, expect, it, vi } from "vitest";
import {
  handleChannelClick,
  handleEdgeAddClick,
  handleEmptyAddClick,
  handleFormChange,
  handleSoundContextMenu,
  handleSubmitClick,
} from "../../src/components/commandLineVoice/commandLineVoice.handlers.js";
import * as voiceStore from "../../src/components/commandLineVoice/commandLineVoice.store.js";

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
  for (const [name, implementation] of Object.entries(voiceStore)) {
    if (name === "createInitialState" || name === "selectViewData") {
      continue;
    }
    store[name] = (payload) => implementation({ state }, payload);
  }
  return store;
};

const createUploadHarness = () => {
  const resources = {};
  const tree = [];
  const projectService = {
    ensureRepository: vi.fn(async () => {}),
    getState: vi.fn(() => ({
      voices: { items: resources, tree },
    })),
    createVoice: vi.fn(async ({ voiceId, data }) => {
      resources[voiceId] = {
        id: voiceId,
        ...data,
      };
      tree.push({ id: voiceId });
      return voiceId;
    }),
  };
  const uploadResult = {
    fileId: "file-voice-1",
    displayName: "Alice Line",
    waveformDataFileId: "wave-voice-1",
    duration: 2.5,
    fileRecords: [{ fileId: "file-voice-1" }],
  };
  const appService = {
    pickFiles: vi.fn(async () => ({
      name: "alice-line.ogg",
      uploadSucessful: true,
      uploadSuccessful: true,
      uploadResult,
    })),
    showAlert: vi.fn(),
    showDropdownMenu: vi.fn(),
  };

  return { appService, projectService, uploadResult };
};

const createUploadDeps = (state) => {
  const store = createStore(state);
  const render = vi.fn();
  const harness = createUploadHarness();
  return {
    ...harness,
    deps: {
      ...harness,
      i18n,
      props: { currentSceneId: "scene-1" },
      store,
      render,
    },
    render,
    store,
  };
};

describe("commandLineVoice.handlers", () => {
  it("opens the file picker, creates a Voice resource, and inserts a clip", async () => {
    const state = voiceStore.createInitialState();
    const { appService, projectService, uploadResult, deps, render } =
      createUploadDeps(state);
    const stopPropagation = vi.fn();

    await handleEmptyAddClick(deps, {
      _event: { stopPropagation },
    });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(appService.pickFiles).toHaveBeenCalledWith({
      accept: ".mp3,.wav,.ogg",
      multiple: false,
      upload: true,
    });
    const { voiceId } = projectService.createVoice.mock.calls[0][0];
    expect(projectService.createVoice).toHaveBeenCalledWith({
      voiceId,
      fileRecords: uploadResult.fileRecords,
      data: {
        type: "voice",
        fileId: "file-voice-1",
        name: "Alice Line",
        description: "",
        sceneId: "scene-1",
        waveformDataFileId: "wave-voice-1",
        duration: 2.5,
      },
      position: "last",
    });
    expect(voiceStore.selectVoicePayload({ state })).toEqual({
      loop: false,
      volume: 100,
      sounds: [
        {
          id: voiceId,
          resourceId: voiceId,
          volume: 100,
          startDelayMs: 0,
        },
      ],
    });
    expect(state.selectedSoundId).toBe(voiceId);
    expect(render).toHaveBeenCalledOnce();
    expect(appService.showAlert).not.toHaveBeenCalled();
  });

  it("uses the file picker when adding at a channel edge", async () => {
    const state = voiceStore.createInitialState();
    const { deps, projectService } = createUploadDeps(state);
    voiceStore.setVoice(
      { state },
      {
        voice: {
          sounds: [{ id: "existing", resourceId: "existing", volume: 100 }],
        },
      },
    );

    await handleEdgeAddClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: { dataset: { insertIndex: "0" } },
      },
    });

    const { voiceId } = projectService.createVoice.mock.calls[0][0];
    expect(state.voice.sounds.map((sound) => sound.id)).toEqual([
      voiceId,
      "existing",
    ]);
  });

  it("updates channel controls or only the selected clip volume", () => {
    const state = voiceStore.createInitialState();
    const store = createStore(state);
    const render = vi.fn();

    handleFormChange(
      { store, render },
      { _event: { detail: { values: { loop: true, volume: 70 } } } },
    );
    expect(state.voice).toMatchObject({ loop: true, volume: 70 });

    store.insertSound({ id: "clip", resourceId: "voice-1", index: 0 });
    handleFormChange(
      { store, render },
      { _event: { detail: { values: { volume: 35 } } } },
    );

    expect(state.voice.volume).toBe(70);
    expect(state.voice.sounds[0].volume).toBe(35);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("selects the whole Voice channel from its header", () => {
    const state = voiceStore.createInitialState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "clip", resourceId: "voice-1", index: 0 });

    handleChannelClick(
      { store, render },
      { _event: { stopPropagation: vi.fn() } },
    );

    expect(state.selectedSoundId).toBeUndefined();
    expect(render).toHaveBeenCalledOnce();
  });

  it("removes a Voice clip from its context menu", async () => {
    const state = voiceStore.createInitialState();
    const store = createStore(state);
    const render = vi.fn();
    store.insertSound({ id: "clip", resourceId: "voice-1", index: 0 });
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "remove" },
    });

    await handleSoundContextMenu(
      {
        appService: { showDropdownMenu },
        i18n,
        render,
        store,
      },
      {
        _event: {
          currentTarget: { dataset: { soundId: "clip" } },
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
    expect(state.voice.sounds).toEqual([]);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("uses the file picker for context-menu insertion", async () => {
    const state = voiceStore.createInitialState();
    const { deps, appService, projectService } = createUploadDeps(state);
    deps.store.insertSound({ id: "existing", resourceId: "old", index: 0 });
    appService.showDropdownMenu.mockResolvedValue({
      item: { key: "insert-before" },
    });

    await handleSoundContextMenu(deps, {
      _event: {
        currentTarget: { dataset: { soundId: "existing" } },
        clientX: 120,
        clientY: 240,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    });

    const { voiceId } = projectService.createVoice.mock.calls[0][0];
    expect(state.voice.sounds.map((sound) => sound.id)).toEqual([
      voiceId,
      "existing",
    ]);
  });

  it("submits the canonical Voice channel", () => {
    const state = voiceStore.createInitialState();
    const store = createStore(state);
    const dispatchEvent = vi.fn();
    store.insertSound({ id: "clip", resourceId: "voice-1", index: 0 });

    handleSubmitClick(
      {
        appService: { showAlert: vi.fn() },
        dispatchEvent,
        i18n,
        store,
      },
      { _event: { stopPropagation: vi.fn() } },
    );

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      voice: {
        loop: false,
        volume: 100,
        sounds: [
          {
            id: "clip",
            resourceId: "voice-1",
            volume: 100,
            startDelayMs: 0,
          },
        ],
      },
    });
  });
});
