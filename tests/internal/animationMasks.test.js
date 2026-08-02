import { describe, expect, it } from "vitest";
import { validatePayload } from "@routevn/creator-model";
import {
  compileTransitionMaskForRuntime,
  getTransitionMaskDuration,
  normalizeTransitionMaskForEditor,
  serializeTransitionMask,
} from "../../src/internal/animationMasks.js";

describe("animationMasks", () => {
  it("preserves transition-mask progress delay through editing and runtime compilation", () => {
    const imageItems = {
      "mask-image": {
        fileId: "masks/spiral.png",
      },
    };
    const delayedMask = {
      kind: "single",
      imageId: "mask-image",
      channel: "red",
      progress: {
        initialValue: 0,
        keyframes: [
          {
            delay: 500,
            duration: 1000,
            value: 1,
            easing: "linear",
          },
        ],
      },
    };

    const editorMask = normalizeTransitionMaskForEditor(
      delayedMask,
      imageItems,
    );

    expect(editorMask).toMatchObject({
      progressDelay: 500,
      progressDuration: 1000,
      progressEasing: "linear",
    });
    expect(getTransitionMaskDuration(editorMask)).toBe(1500);
    expect(
      compileTransitionMaskForRuntime(editorMask, imageItems)?.progress,
    ).toEqual(delayedMask.progress);

    const serializedMask = serializeTransitionMask(editorMask);
    expect(serializedMask.progress).toEqual({
      initialValue: 0,
      keyframes: [
        {
          duration: 500,
          value: 0,
          easing: "linear",
        },
        {
          duration: 1000,
          value: 1,
          easing: "linear",
        },
      ],
    });
    expect(serializedMask).not.toHaveProperty("progressDuration");
    expect(serializedMask).not.toHaveProperty("progressEasing");
    expect(
      validatePayload({
        type: "animation.create",
        payload: {
          animationId: "animation-a",
          data: {
            type: "animation",
            name: "Transition",
            animation: {
              type: "transition",
              mask: serializedMask,
            },
          },
        },
      }),
    ).toEqual({ valid: true });

    expect(
      normalizeTransitionMaskForEditor(serializedMask, imageItems),
    ).toMatchObject({
      progressDelay: 500,
      progressDuration: 1000,
      progressEasing: "linear",
    });

    expect(
      serializeTransitionMask({
        ...editorMask,
        progress: undefined,
      }).progress,
    ).toEqual(serializedMask.progress);
  });
});
