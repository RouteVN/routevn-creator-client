import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectVoicePayload,
  selectViewData,
  setRepositoryState,
  setVoice,
  setVolume,
} from "../../src/components/commandLineVoice/commandLineVoice.store.js";

describe("commandLineVoice.store", () => {
  it("keeps voice volume optional until the user changes it", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        voices: {
          items: {
            "voice-1": {
              id: "voice-1",
              type: "voice",
              name: "Alice Line",
              fileId: "file-voice-1",
            },
          },
          tree: [{ id: "voice-1" }],
        },
      },
    );
    setVoice(
      { state },
      {
        voice: {
          resourceId: "voice-1",
          loop: false,
        },
      },
    );

    expect(selectViewData({ state }).voice.volume).toBe(75);
    expect(selectVoicePayload({ state })).toEqual({
      resourceId: "voice-1",
      loop: false,
    });

    setVolume({ state }, { volume: 80 });

    expect(selectVoicePayload({ state })).toEqual({
      resourceId: "voice-1",
      loop: false,
      volume: 80,
    });
  });
});
