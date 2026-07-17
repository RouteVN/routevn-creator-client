import { afterEach, describe, expect, it, vi } from "vitest";
import { handleBeforeMount } from "../../src/components/audioPlayer/audioPlayer.handlers.js";

const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;

const createDeps = () => ({
  appService: {
    showAlert: vi.fn(),
  },
  audioService: {
    acquire: vi.fn(() => vi.fn()),
    off: vi.fn(),
    on: vi.fn(),
    stop: vi.fn(),
  },
  dispatchEvent: vi.fn(),
  i18n: {},
  props: {
    fileId: "file-1",
  },
  render: vi.fn(),
  store: {
    setCurrentTime: vi.fn(),
    setDuration: vi.fn(),
    setLoading: vi.fn(),
    setPlaying: vi.fn(),
  },
});

describe("audio player handlers", () => {
  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalCustomEvent;
  });

  it("captures Escape to close playback before fullscreen shortcuts", () => {
    let keyDownHandler;
    globalThis.window = {
      addEventListener: vi.fn((eventName, handler, capture) => {
        if (eventName === "keydown" && capture === true) {
          keyDownHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, options) {
        this.type = type;
        Object.assign(this, options);
      }
    };
    const deps = createDeps();
    const cleanup = handleBeforeMount(deps);
    const event = {
      key: "Escape",
      composedPath: () => [],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
    };

    keyDownHandler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(deps.audioService.stop).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "audio-player-close",
        bubbles: true,
        composed: true,
      }),
    );

    cleanup();

    expect(globalThis.window.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      keyDownHandler,
      true,
    );
    expect(deps.audioService.off).toHaveBeenCalledTimes(6);
    expect(
      deps.audioService.acquire.mock.results[0].value,
    ).toHaveBeenCalledOnce();
  });

  it("leaves Escape to an open dialog", () => {
    let keyDownHandler;
    globalThis.window = {
      addEventListener: vi.fn((_eventName, handler) => {
        keyDownHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    const deps = createDeps();
    const cleanup = handleBeforeMount(deps);
    const event = {
      key: "Escape",
      composedPath: () => [
        {
          matches: (selector) => selector === "dialog[open], rtgl-dialog[open]",
        },
      ],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
    };

    keyDownHandler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.audioService.stop).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();

    cleanup();
  });
});
