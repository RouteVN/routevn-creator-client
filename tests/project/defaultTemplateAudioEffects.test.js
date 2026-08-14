import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAudioEffectDefinitionDuration } from "../../src/internal/audioEffectDefinition.js";

const repository = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);

const selectDefaultAudioEffects = () => {
  const collection = repository.audioEffects;
  const folder = Object.values(collection.items).find(
    (item) => item.type === "folder" && item.name === "Default",
  );
  const folderNode = collection.tree.find((node) => node.id === folder.id);

  return folderNode.children.map(({ id }) => collection.items[id]);
};

describe("default template audio effects", () => {
  it("ships the default update and transition presets", () => {
    const audioEffects = selectDefaultAudioEffects();

    expect(audioEffects.map(({ name }) => name)).toEqual([
      "Fade in 1s",
      "Fade out 1s",
      "Crossfade 1s",
      "Partial crossfade 1s",
      "Fade-through 1s",
    ]);
    expect(
      audioEffects.map(({ type, description, audioEffect }) => ({
        type,
        description,
        audioEffect,
      })),
    ).toEqual([
      {
        type: "audioEffect",
        description: "",
        audioEffect: {
          type: "update",
          tween: {
            volume: {
              keyframes: [
                {
                  startValue: 0,
                  value: 100,
                  duration: 1000,
                  easing: "linear",
                },
              ],
            },
          },
        },
      },
      {
        type: "audioEffect",
        description: "",
        audioEffect: {
          type: "update",
          tween: {
            volume: {
              keyframes: [
                {
                  startValue: 100,
                  value: 0,
                  duration: 1000,
                  easing: "linear",
                },
              ],
            },
          },
        },
      },
      {
        type: "audioEffect",
        description: "",
        audioEffect: {
          type: "transition",
          prev: {
            fade: {
              keyframes: [{ value: 0, duration: 1000, easing: "linear" }],
            },
          },
          next: {
            fade: {
              keyframes: [{ value: 100, duration: 1000, easing: "linear" }],
            },
          },
        },
      },
      {
        type: "audioEffect",
        description: "",
        audioEffect: {
          type: "transition",
          prev: {
            fade: {
              keyframes: [{ value: 0, duration: 750, easing: "linear" }],
            },
          },
          next: {
            fade: {
              keyframes: [
                {
                  value: 100,
                  delay: 250,
                  duration: 750,
                  easing: "linear",
                },
              ],
            },
          },
        },
      },
      {
        type: "audioEffect",
        description: "",
        audioEffect: {
          type: "transition",
          prev: {
            fade: {
              keyframes: [{ value: 0, duration: 500, easing: "linear" }],
            },
          },
          next: {
            fade: {
              keyframes: [
                {
                  value: 100,
                  delay: 500,
                  duration: 500,
                  easing: "linear",
                },
              ],
            },
          },
        },
      },
    ]);
    expect(
      audioEffects.map(({ audioEffect }) =>
        getAudioEffectDefinitionDuration(audioEffect),
      ),
    ).toEqual([1000, 1000, 1000, 1000, 1000]);
  });
});
