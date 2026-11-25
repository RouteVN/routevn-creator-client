import { describe, expect, it } from "vitest";
import {
  applyAudioEffectMixToBgm,
  getAudioEffectFinalMix,
} from "../../src/internal/audioEffectDefinition.js";

describe("getAudioEffectFinalMix", () => {
  it("keeps the final values of an update that differ from the identities", () => {
    expect(
      getAudioEffectFinalMix({
        type: "update",
        tween: {
          volume: { keyframes: [{ value: 0 }, { value: 40, duration: 500 }] },
          pan: { keyframes: [{ value: 0, duration: 500 }] },
          playbackRate: { keyframes: [{ value: 1.5, duration: 500 }] },
        },
      }),
    ).toEqual({ volume: 40, playbackRate: 1.5 });
  });

  it("reads a transition's incoming side and skips relative final values", () => {
    expect(
      getAudioEffectFinalMix({
        type: "transition",
        prev: { volume: { keyframes: [{ value: 0, duration: 500 }] } },
        next: {
          volume: { keyframes: [{ value: 60, duration: 500 }] },
          pan: { keyframes: [{ value: -0.5, relative: true, duration: 500 }] },
        },
      }),
    ).toEqual({ volume: 60 });
  });

  it("leaves nothing for an effect that ends at the identities", () => {
    expect(
      getAudioEffectFinalMix({
        type: "update",
        tween: {
          volume: {
            initialValue: 0,
            keyframes: [{ value: 100, duration: 1000 }],
          },
        },
      }),
    ).toEqual({});
  });
});

describe("applyAudioEffectMixToBgm", () => {
  it("leaves legacy single-sound BGM as it is", () => {
    const bgm = { resourceId: "theme", volume: 50 };

    expect(applyAudioEffectMixToBgm(bgm, { volume: 30 })).toEqual(bgm);
  });

  it("returns the BGM unchanged without a mix", () => {
    const bgm = { volume: 75, sounds: [{ id: "main", resourceId: "theme" }] };

    const settled = applyAudioEffectMixToBgm(bgm);

    expect(settled).toEqual(bgm);
    expect(settled).not.toBe(bgm);
  });

  it("scales a missing channel volume from 100 and offsets the pan", () => {
    const bgm = {
      pan: -0.5,
      sounds: [{ id: "main", resourceId: "theme", volume: 50 }],
    };

    // Route Engine clamps the channel pan together with each sound's pan.
    expect(applyAudioEffectMixToBgm(bgm, { volume: 30, pan: -1 })).toEqual({
      volume: 30,
      pan: -1.5,
      sounds: [{ id: "main", resourceId: "theme", volume: 50 }],
    });
  });
});
