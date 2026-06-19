import { describe, expect, it, vi } from "vitest";
import {
  handleAudioWaveformClick,
  handleSubmitClick,
} from "../../src/components/commandLineVoice/commandLineVoice.handlers.js";
import {
  createInitialState,
  openAudioPlayer,
  selectSelectedResource,
  selectVoicePayload,
  selectViewData,
  setRepositoryState,
  setVoiceAudio,
} from "../../src/components/commandLineVoice/commandLineVoice.store.js";

const createStoreDeps = (state) => ({
  setRepositoryState: (payload) => setRepositoryState({ state }, payload),
  setVoiceAudio: (payload) => setVoiceAudio({ state }, payload),
  openAudioPlayer: (payload) => openAudioPlayer({ state }, payload),
  selectVoicePayload: () => selectVoicePayload({ state }),
  selectSelectedResource: () => selectSelectedResource({ state }),
});

describe("commandLineVoice.handlers", () => {
  it("uploads a picked audio file, creates a voice resource, and selects it", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const stopPropagation = vi.fn();
    const uploadResult = {
      fileId: "file-voice-1",
      displayName: "Alice Line",
      waveformDataFileId: "wave-voice-1",
      duration: 2.5,
      fileRecords: [{ fileId: "file-voice-1" }],
    };
    const file = {
      name: "alice-line.ogg",
      uploadSucessful: true,
      uploadSuccessful: true,
      uploadResult,
    };
    let createdVoiceId;
    const projectService = {
      ensureRepository: vi.fn(async () => {}),
      getState: vi.fn(() => ({
        voices: {
          items: createdVoiceId
            ? {
                [createdVoiceId]: {
                  id: createdVoiceId,
                  type: "voice",
                  name: "Alice Line",
                  sceneId: "scene-1",
                  fileId: "file-voice-1",
                  waveformDataFileId: "wave-voice-1",
                },
              }
            : {},
          tree: createdVoiceId ? [{ id: createdVoiceId }] : [],
        },
      })),
      createVoice: vi.fn(async ({ voiceId }) => {
        createdVoiceId = voiceId;
        return voiceId;
      }),
    };
    const appService = {
      pickFiles: vi.fn(async () => file),
      showAlert: vi.fn(),
    };

    await handleAudioWaveformClick(
      {
        appService,
        projectService,
        props: {
          currentSceneId: "scene-1",
        },
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
    expect(appService.pickFiles).toHaveBeenCalledWith({
      accept: ".mp3,.wav,.ogg",
      multiple: false,
      upload: true,
    });
    expect(projectService.createVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceId: createdVoiceId,
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
      }),
    );
    expect(selectVoicePayload({ state })).toEqual({
      resourceId: createdVoiceId,
      loop: false,
      volume: 100,
    });
    expect(render).toHaveBeenCalledTimes(1);
    expect(appService.showAlert).not.toHaveBeenCalled();
  });

  it("closes a stale preview player after uploading replacement voice audio", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const uploadResult = {
      fileId: "file-voice-2",
      displayName: "Alice Line 2",
      fileRecords: [{ fileId: "file-voice-2" }],
    };
    const file = {
      name: "alice-line-2.ogg",
      uploadSucessful: true,
      uploadSuccessful: true,
      uploadResult,
    };
    let createdVoiceId;
    const projectService = {
      ensureRepository: vi.fn(async () => {}),
      getState: vi.fn(() => ({
        voices: {
          items: createdVoiceId
            ? {
                [createdVoiceId]: {
                  id: createdVoiceId,
                  type: "voice",
                  name: "Alice Line 2",
                  sceneId: "scene-1",
                  fileId: "file-voice-2",
                },
              }
            : {},
          tree: createdVoiceId ? [{ id: createdVoiceId }] : [],
        },
      })),
      createVoice: vi.fn(async ({ voiceId }) => {
        createdVoiceId = voiceId;
        return voiceId;
      }),
    };
    const appService = {
      pickFiles: vi.fn(async () => file),
      showAlert: vi.fn(),
    };

    setVoiceAudio({ state }, { resourceId: "voice-1" });
    openAudioPlayer(
      { state },
      {
        fileId: "file-voice-1",
        fileName: "Alice Line 1",
      },
    );

    await handleAudioWaveformClick(
      {
        appService,
        projectService,
        props: {
          currentSceneId: "scene-1",
        },
        store: createStoreDeps(state),
        render,
      },
      {
        _event: {
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(selectVoicePayload({ state })).toEqual({
      resourceId: createdVoiceId,
      loop: false,
      volume: 100,
    });
    expect(selectViewData({ state })).toMatchObject({
      showAudioPlayer: false,
      playingSound: {
        fileId: undefined,
        title: "",
      },
    });
  });

  it("submits the selected voice payload", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const stopPropagation = vi.fn();

    setVoiceAudio({ state }, { resourceId: "voice-1" });

    handleSubmitClick(
      {
        appService: {
          showAlert: vi.fn(),
        },
        dispatchEvent,
        store: createStoreDeps(state),
      },
      {
        _event: {
          stopPropagation,
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      voice: {
        resourceId: "voice-1",
        loop: false,
        volume: 100,
      },
    });
  });
});
