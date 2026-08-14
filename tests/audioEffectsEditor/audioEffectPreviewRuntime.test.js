import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAudioEffectPreviewStates,
  playAudioEffectPreview,
  stopAudioEffectPreview,
} from "../../src/pages/audioEffectsEditor/support/audioEffectPreviewRuntime.js";

describe("audio effect preview runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds a Route Graphics handoff for outgoing and incoming sounds", () => {
    const { renderState, resetState } = createAudioEffectPreviewStates({
      occurrenceId: "transition-1",
      outgoingSound: { fileId: "outgoing.mp3" },
      incomingSound: { fileId: "incoming.mp3" },
      definition: {
        type: "transition",
        prev: {
          volume: {
            initialValue: 75,
            keyframes: [
              {
                value: 40,
                delay: 25,
                duration: 200,
                easing: "easeOutSine",
              },
              { value: 0, duration: 400, easing: "easeInSine" },
            ],
          },
        },
        next: {
          volume: {
            initialValue: 25,
            keyframes: [
              {
                value: 60,
                delay: 50,
                duration: 300,
                easing: "easeOutSine",
              },
              { value: 65, duration: 600, easing: "easeInSine" },
            ],
          },
        },
      },
    });

    expect(resetState.audio).toEqual([
      expect.objectContaining({
        id: "audio-effect-preview-bgm",
        src: "outgoing.mp3",
        volume: 100,
      }),
    ]);
    expect(renderState.audio).toEqual([
      expect.objectContaining({
        id: "audio-effect-preview-bgm",
        src: "incoming.mp3",
        volume: 65,
      }),
    ]);
    expect(renderState.audioEffects).toEqual([
      {
        id: "audio-effect-preview:transition-1",
        type: "audio-transition",
        targetId: "audio-effect-preview-bgm",
        properties: {
          volume: {
            exit: {
              initialValue: 75,
              keyframes: [
                {
                  delay: 25,
                  duration: 200,
                  easing: "easeOutSine",
                  value: 40,
                },
                { value: 0, duration: 400, easing: "easeInSine" },
              ],
            },
            enter: {
              initialValue: 25,
              keyframes: [
                {
                  delay: 50,
                  duration: 300,
                  easing: "easeOutSine",
                  value: 60,
                },
                { value: 65, duration: 600, easing: "easeInSine" },
              ],
            },
          },
        },
      },
    ]);
  });

  it("builds an update preview with the numeric endpoint persisted", () => {
    const { renderState, resetState } = createAudioEffectPreviewStates({
      occurrenceId: "update-1",
      targetSound: { fileId: "target.mp3" },
      definition: {
        type: "update",
        tween: {
          volume: {
            initialValue: 80,
            keyframes: [
              { value: 50, duration: 150, easing: "easeOutQuad" },
              { value: 30, duration: 350, easing: "easeInOutSine" },
            ],
          },
        },
      },
    });

    expect(resetState.audio[0]).toMatchObject({
      src: "target.mp3",
      volume: 100,
    });
    expect(renderState.audio[0]).toMatchObject({
      src: "target.mp3",
      volume: 30,
    });
    expect(renderState.audioEffects[0]).toMatchObject({
      properties: {
        volume: {
          update: {
            initialValue: 80,
            keyframes: [
              { value: 50, duration: 150, easing: "easeOutQuad" },
              { value: 30, duration: 350, easing: "easeInOutSine" },
            ],
          },
        },
      },
    });
  });

  it("previews transition pan and playback-rate tracks", () => {
    const { renderState } = createAudioEffectPreviewStates({
      occurrenceId: "transition-properties",
      outgoingSound: { fileId: "outgoing.mp3" },
      incomingSound: { fileId: "incoming.mp3" },
      definition: {
        type: "transition",
        prev: {
          pan: {
            initialValue: 0,
            keyframes: [{ value: -1, duration: 300, easing: "linear" }],
          },
        },
        next: {
          playbackRate: {
            initialValue: 0.5,
            keyframes: [{ value: 0.75, duration: 500, easing: "linear" }],
          },
        },
      },
    });

    expect(renderState.audio[0]).toMatchObject({
      src: "incoming.mp3",
      playbackRate: 0.75,
    });
    expect(renderState.audioEffects[0].properties).toEqual({
      pan: {
        exit: {
          initialValue: 0,
          keyframes: [{ value: -1, duration: 300, easing: "linear" }],
        },
      },
      playbackRate: {
        enter: {
          initialValue: 0.5,
          keyframes: [{ value: 0.75, duration: 500, easing: "linear" }],
        },
      },
    });
  });

  it("uses a distinct preview baseline when an update ends at an audio default", () => {
    const { renderState, resetState } = createAudioEffectPreviewStates({
      occurrenceId: "update-defaults",
      targetSound: { fileId: "target.mp3" },
      definition: {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 100, duration: 250, easing: "easeInOutSine" }],
          },
          pan: {
            keyframes: [{ value: 0, duration: 250, easing: "easeInOutSine" }],
          },
          playbackRate: {
            keyframes: [{ value: 1, duration: 250, easing: "easeInOutSine" }],
          },
        },
      },
    });

    expect(resetState.audio[0]).toMatchObject({
      volume: 0,
      pan: -1,
      playbackRate: 0,
    });
    expect(renderState.audio[0]).toMatchObject({
      volume: 100,
      pan: 0,
      playbackRate: 1,
    });
  });

  it("loads both sounds and renders then stops a transition preview", async () => {
    vi.useFakeTimers();
    let runtimeReady = false;
    let playbackRequestId;
    let playbackStartedAtMs;
    let playbackDurationMs;
    let playbackFrameId;
    let animationFrameCallback;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        animationFrameCallback = callback;
        return 7;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const outgoingSound = {
      id: "outgoing",
      type: "sound",
      fileId: "outgoing.mp3",
    };
    const incomingSound = {
      id: "incoming",
      type: "sound",
      fileId: "incoming.mp3",
    };
    const store = {
      selectAudioEffectPreview: vi.fn(() => ({
        outgoingSound,
        incomingSound,
      })),
      selectAudioEffectDefinition: vi.fn(() => ({
        type: "transition",
        prev: {
          volume: {
            keyframes: [{ value: 0, duration: 600, easing: "easeOutSine" }],
          },
        },
        next: {
          volume: {
            initialValue: 0,
            keyframes: [{ value: 100, duration: 900, easing: "easeInSine" }],
          },
        },
      })),
      selectPreviewRuntimeReady: vi.fn(() => runtimeReady),
      selectPreviewLoopEnabled: vi.fn(() => false),
      selectPreviewPlaybackFrameId: vi.fn(() => playbackFrameId),
      selectPreviewPlaybackStartedAtMs: vi.fn(() => playbackStartedAtMs),
      selectPreviewPlaybackDurationMs: vi.fn(() => playbackDurationMs),
      selectPreviewPlaybackRequestId: vi.fn(() => playbackRequestId),
      selectAudioEffectDuration: vi.fn(() => 950),
      setPreviewLoading: vi.fn(),
      setPreviewPlaying: vi.fn(),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        playbackRequestId = requestId;
      }),
      startPreviewPlayback: vi.fn(({ startedAtMs, durationMs }) => {
        playbackStartedAtMs = startedAtMs;
        playbackDurationMs = durationMs;
      }),
      setPreviewPlaybackFrameId: vi.fn(({ frameId }) => {
        playbackFrameId = frameId;
      }),
      setPreviewPlayhead: vi.fn(),
      stopPreviewPlayback: vi.fn(() => {
        playbackStartedAtMs = undefined;
        playbackDurationMs = undefined;
        playbackFrameId = undefined;
      }),
      setPreviewRuntimeReady: vi.fn(({ ready }) => {
        runtimeReady = ready;
      }),
    };
    const graphicsService = {
      init: vi.fn(async () => {}),
      loadAssets: vi.fn(async () => {}),
      render: vi.fn(async () => {}),
    };
    const projectService = {
      getRepositoryState: vi.fn(() => ({
        files: {
          items: {
            "outgoing.mp3": { mimeType: "audio/mpeg" },
            "incoming.mp3": { mimeType: "audio/mpeg" },
          },
        },
      })),
      getFileContent: vi.fn(async (fileId) => ({
        url: `blob:${fileId}`,
      })),
    };
    const canvas = {};
    const render = vi.fn();
    const deps = {
      appService: { showToast: vi.fn() },
      graphicsService,
      projectService,
      refs: { audioPreviewCanvas: canvas },
      render,
      store,
    };

    await playAudioEffectPreview(deps);

    expect(graphicsService.init).toHaveBeenCalledWith({
      canvas,
      width: 1,
      height: 1,
    });
    expect(projectService.getFileContent).toHaveBeenCalledTimes(2);
    expect(graphicsService.loadAssets).toHaveBeenCalledWith({
      "outgoing.mp3": {
        type: "audio/mpeg",
        url: "blob:outgoing.mp3",
      },
      "incoming.mp3": {
        type: "audio/mpeg",
        url: "blob:incoming.mp3",
      },
    });
    expect(graphicsService.render).toHaveBeenCalledTimes(2);
    expect(graphicsService.render.mock.calls[0][0].audio[0].src).toBe(
      "outgoing.mp3",
    );
    expect(graphicsService.render.mock.calls[1][0].audio[0].src).toBe(
      "incoming.mp3",
    );
    expect(store.setPreviewPlaying).toHaveBeenCalledWith({ playing: true });
    expect(store.setPreviewLoading.mock.calls).toEqual([
      [{ loading: true }],
      [{ loading: false }],
    ]);
    expect(render).toHaveBeenCalledTimes(2);

    animationFrameCallback(playbackStartedAtMs + 475);
    expect(store.setPreviewPlayhead).toHaveBeenCalledWith({ timeMs: 475 });
    expect(render).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(949);
    expect(graphicsService.render).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);

    expect(store.setPreviewPlaying).toHaveBeenLastCalledWith({
      playing: false,
    });
    expect(graphicsService.render).toHaveBeenCalledTimes(3);
    expect(graphicsService.render.mock.calls[2][0]).toMatchObject({
      audio: [],
      audioEffects: [],
    });
    expect(render).toHaveBeenCalledTimes(4);
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(7);
  });

  it("restarts both sounds and the ruler while looping, then stops after loop is disabled", async () => {
    vi.useFakeTimers();
    let loopEnabled = true;
    let playbackRequestId;
    let playbackFrameId;
    let playbackStartedAtMs;
    let playbackDurationMs;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 7),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const outgoingSound = {
      id: "outgoing",
      type: "sound",
      fileId: "outgoing.mp3",
    };
    const incomingSound = {
      id: "incoming",
      type: "sound",
      fileId: "incoming.mp3",
    };
    const store = {
      selectAudioEffectPreview: vi.fn(() => ({
        outgoingSound,
        incomingSound,
      })),
      selectAudioEffectDefinition: vi.fn(() => ({
        type: "transition",
        prev: {
          volume: {
            keyframes: [{ value: 0, duration: 600, easing: "easeOutSine" }],
          },
        },
        next: {
          volume: {
            initialValue: 0,
            keyframes: [{ value: 100, duration: 900, easing: "easeInSine" }],
          },
        },
      })),
      selectAudioEffectDuration: vi.fn(() => 900),
      selectPreviewLoopEnabled: vi.fn(() => loopEnabled),
      selectPreviewRuntimeReady: vi.fn(() => true),
      selectPreviewPlaybackFrameId: vi.fn(() => playbackFrameId),
      selectPreviewPlaybackRequestId: vi.fn(() => playbackRequestId),
      selectPreviewPlaybackStartedAtMs: vi.fn(() => playbackStartedAtMs),
      selectPreviewPlaybackDurationMs: vi.fn(() => playbackDurationMs),
      setPreviewLoading: vi.fn(),
      setPreviewPlaying: vi.fn(),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        playbackRequestId = requestId;
      }),
      startPreviewPlayback: vi.fn(({ startedAtMs, durationMs }) => {
        playbackStartedAtMs = startedAtMs;
        playbackDurationMs = durationMs;
      }),
      setPreviewPlaybackFrameId: vi.fn(({ frameId }) => {
        playbackFrameId = frameId;
      }),
      setPreviewPlayhead: vi.fn(),
      stopPreviewPlayback: vi.fn(() => {
        playbackFrameId = undefined;
        playbackStartedAtMs = undefined;
        playbackDurationMs = undefined;
      }),
    };
    const graphicsService = {
      init: vi.fn(),
      loadAssets: vi.fn(),
      render: vi.fn(),
    };
    const projectService = {
      getRepositoryState: vi.fn(() => ({
        files: {
          items: {
            "outgoing.mp3": { mimeType: "audio/mpeg" },
            "incoming.mp3": { mimeType: "audio/mpeg" },
          },
        },
      })),
      getFileContent: vi.fn(async (fileId) => ({
        url: `blob:${fileId}`,
      })),
    };
    const deps = {
      appService: { showToast: vi.fn() },
      graphicsService,
      projectService,
      refs: { audioPreviewCanvas: {} },
      render: vi.fn(),
      store,
    };

    await playAudioEffectPreview(deps);
    await vi.advanceTimersByTimeAsync(900);

    expect(graphicsService.render).toHaveBeenCalledTimes(4);
    expect(graphicsService.render.mock.calls[2][0].audio[0].src).toBe(
      "outgoing.mp3",
    );
    expect(graphicsService.render.mock.calls[3][0].audio[0].src).toBe(
      "incoming.mp3",
    );
    expect(store.startPreviewPlayback).toHaveBeenCalledTimes(2);
    expect(store.setPreviewPlaying).not.toHaveBeenCalledWith({
      playing: false,
    });
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(7);

    loopEnabled = false;
    await vi.advanceTimersByTimeAsync(900);

    expect(graphicsService.render).toHaveBeenCalledTimes(5);
    expect(graphicsService.render.mock.calls[4][0]).toMatchObject({
      audio: [],
      audioEffects: [],
    });
    expect(store.setPreviewPlaying).toHaveBeenLastCalledWith({
      playing: false,
    });
  });

  it("invalidates automatic stopping when playback is stopped manually", async () => {
    const store = {
      selectPreviewRuntimeReady: vi.fn(() => true),
      selectPreviewPlaybackFrameId: vi.fn(() => 7),
      setPreviewLoading: vi.fn(),
      setPreviewPlaybackRequestId: vi.fn(),
      setPreviewPlaying: vi.fn(),
      stopPreviewPlayback: vi.fn(),
    };
    const graphicsService = { render: vi.fn(async () => {}) };
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    await stopAudioEffectPreview({ graphicsService, store });

    expect(store.setPreviewPlaybackRequestId).toHaveBeenCalledWith({
      requestId: undefined,
    });
    expect(store.setPreviewPlaying).toHaveBeenCalledWith({ playing: false });
    expect(store.stopPreviewPlayback).toHaveBeenCalledOnce();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(graphicsService.render).toHaveBeenCalledWith(
      expect.objectContaining({ audio: [], audioEffects: [] }),
    );
  });

  it("does not start playback when startup is cancelled during asset loading", async () => {
    let playbackRequestId;
    let resolveFileContent;
    const fileContent = new Promise((resolve) => {
      resolveFileContent = resolve;
    });
    const store = {
      selectAudioEffectPreview: vi.fn(() => ({
        targetSound: { id: "target", type: "sound", fileId: "target.mp3" },
      })),
      selectAudioEffectDefinition: vi.fn(() => ({
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 50, duration: 300, easing: "linear" }],
          },
        },
      })),
      selectAudioEffectDuration: vi.fn(() => 300),
      selectPreviewRuntimeReady: vi.fn(() => true),
      selectPreviewPlaybackFrameId: vi.fn(),
      selectPreviewPlaybackRequestId: vi.fn(() => playbackRequestId),
      setPreviewLoading: vi.fn(),
      setPreviewPlaying: vi.fn(),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        playbackRequestId = requestId;
      }),
      startPreviewPlayback: vi.fn(),
      stopPreviewPlayback: vi.fn(),
    };
    const graphicsService = {
      loadAssets: vi.fn(async () => {}),
      render: vi.fn(async () => {}),
    };
    const deps = {
      graphicsService,
      projectService: {
        getRepositoryState: vi.fn(() => ({ files: { items: {} } })),
        getFileContent: vi.fn(() => fileContent),
      },
      refs: { audioPreviewCanvas: {} },
      render: vi.fn(),
      store,
    };

    const playPromise = playAudioEffectPreview(deps);
    await Promise.resolve();
    await stopAudioEffectPreview(deps);
    resolveFileContent({ url: "blob:target.mp3", type: "audio/mpeg" });
    await playPromise;

    expect(graphicsService.loadAssets).not.toHaveBeenCalled();
    expect(graphicsService.render).toHaveBeenCalledTimes(1);
    expect(graphicsService.render).toHaveBeenCalledWith(
      expect.objectContaining({ audio: [], audioEffects: [] }),
    );
    expect(store.startPreviewPlayback).not.toHaveBeenCalled();
    expect(store.setPreviewPlaying).not.toHaveBeenCalledWith({ playing: true });
  });
});
