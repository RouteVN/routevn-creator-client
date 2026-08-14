import { validatePayload } from "@routevn/creator-model";
import { describe, expect, it } from "vitest";
import { buildAudioEffectKeyframe } from "../../src/pages/audioEffectsEditor/support/audioEffectsEditorValidation.js";

const validateDefinition = (audioEffect) =>
  validatePayload({
    type: "audioEffect.create",
    payload: {
      audioEffectId: "effect-1",
      data: {
        type: "audioEffect",
        name: "Effect One",
        audioEffect,
      },
    },
  });

describe("audioEffectsEditor validation", () => {
  it("enforces absolute property ranges and allows relative deltas", () => {
    const absoluteVolume = buildAudioEffectKeyframe({
      property: "volume",
      values: {
        useStartValue: true,
        startValue: 80,
        relative: false,
        value: 50,
        delay: 0,
        duration: 150,
        easing: "easeOutQuad",
      },
    });
    expect(absoluteVolume).toEqual({
      valid: true,
      keyframe: {
        startValue: 80,
        value: 50,
        duration: 150,
        easing: "easeOutQuad",
      },
    });

    expect(
      buildAudioEffectKeyframe({
        property: "volume",
        values: {
          useStartValue: false,
          relative: false,
          value: 101,
          delay: 0,
          duration: 1,
          easing: "linear",
        },
      }),
    ).toMatchObject({ valid: false });

    const relativePlaybackRate = buildAudioEffectKeyframe({
      property: "playbackRate",
      values: {
        useStartValue: true,
        startValue: -10,
        relative: true,
        value: -5,
        delay: 25,
        duration: 50,
        easing: "linear",
      },
    });
    expect(relativePlaybackRate).toEqual({
      valid: true,
      keyframe: {
        startValue: -10,
        value: -5,
        relative: true,
        delay: 25,
        duration: 50,
        easing: "linear",
      },
    });
  });

  it("uses an absolute numeric value for the final keyframe", () => {
    const result = buildAudioEffectKeyframe({
      finalKeyframe: true,
      property: "pan",
      values: {
        useStartValue: false,
        relative: true,
        value: 0.5,
        delay: 0,
        duration: 350,
        easing: "easeInOutSine",
      },
    });

    expect(result).toEqual({
      valid: true,
      keyframe: {
        value: 0.5,
        duration: 350,
        easing: "easeInOutSine",
      },
    });
    expect(
      validateDefinition({
        type: "update",
        tween: { pan: { keyframes: [result.keyframe] } },
      }),
    ).toEqual({ valid: true });

    expect(
      buildAudioEffectKeyframe({
        finalKeyframe: true,
        property: "volume",
        values: {
          relative: true,
          value: 101,
          delay: 0,
          duration: 100,
          easing: "linear",
        },
      }),
    ).toMatchObject({ valid: false });
  });

  it("validates property initial values independently from keyframe starts", () => {
    expect(
      validateDefinition({
        type: "update",
        tween: {
          volume: {
            initialValue: 90,
            keyframes: [
              { startValue: 75, value: 50, duration: 300, easing: "linear" },
            ],
          },
        },
      }),
    ).toEqual({ valid: true });

    expect(
      validateDefinition({
        type: "transition",
        prev: {
          fade: {
            initialValue: 90,
            keyframes: [
              { startValue: 75, value: 0, duration: 300, easing: "linear" },
            ],
          },
        },
        next: {
          fade: {
            initialValue: 10,
            keyframes: [
              { startValue: 25, value: 100, duration: 300, easing: "linear" },
            ],
          },
        },
      }),
    ).toEqual({ valid: true });
  });
});
