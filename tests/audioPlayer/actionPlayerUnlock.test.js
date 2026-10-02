import { describe, expect, it, vi } from "vitest";
import * as bgm from "../../src/components/commandLineBgm/commandLineBgm.handlers.js";
import * as soundEffects from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.handlers.js";
import * as voice from "../../src/components/commandLineVoice/commandLineVoice.handlers.js";

const resource = { fileId: "file-one", name: "Sound One", resourceId: "one" };

const createDeps = () => {
  const calls = [];
  const find = vi.fn(() => resource);
  return {
    calls,
    deps: {
      store: {
        setSelectedSound: vi.fn(),
        setTempSelectedResource: vi.fn(),
        selectBgmSoundById: find,
        selectSoundById: find,
        selectVoiceSoundById: find,
        selectSoundItemById: find,
        selectVoiceItemById: find,
        openAudioPlayer: vi.fn(() => calls.push("open")),
      },
      render: vi.fn(),
      audioService: {
        unlock: vi.fn(async () => calls.push("unlock")),
      },
    },
  };
};

const createPayload = () => ({
  _event: {
    stopPropagation: vi.fn(),
    currentTarget: {
      dataset: { soundId: "one", channelId: "main", resourceId: "one" },
    },
  },
});

describe("action audio players", () => {
  it.each([
    ["BGM sound", bgm.handleSoundDoubleClick],
    ["BGM resource", bgm.handleResourceItemDoubleClick],
    ["sound effect", soundEffects.handleSoundDoubleClick],
    ["sound effect resource", soundEffects.handleResourceItemDoubleClick],
    ["voice sound", voice.handleSoundDoubleClick],
  ])("start audio inside the tap that opens a %s", (_name, handler) => {
    const { calls, deps } = createDeps();

    handler(deps, createPayload());

    expect(calls).toEqual(["unlock", "open"]);
  });
});
