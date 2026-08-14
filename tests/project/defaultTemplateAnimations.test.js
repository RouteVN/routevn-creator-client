import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repository = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);

const selectDefaultTransitions = () => {
  const collection = repository.animations;
  const folder = Object.values(collection.items).find(
    (item) => item.type === "folder" && item.name === "Transitions",
  );
  const folderNode = collection.tree.find((node) => node.id === folder.id);

  return folderNode.children.map(({ id }) => collection.items[id]);
};

describe("default template animations", () => {
  it("ships Crossfade and Fade-through from the essential transition pack", () => {
    const transitions = selectDefaultTransitions();

    expect(transitions.map(({ name }) => name)).toEqual([
      "Crossfade",
      "Fade-through",
      "Slide Mask 1s",
    ]);
    expect(transitions.slice(0, 2)).toMatchObject([
      {
        type: "animation",
        description: "",
        animation: {
          type: "transition",
          prev: {
            tween: {
              alpha: {
                keyframes: [
                  {
                    duration: 1000,
                    value: 0,
                    easing: "linear",
                    relative: false,
                  },
                ],
                initialValue: 1,
              },
            },
          },
          next: {
            tween: {
              alpha: {
                keyframes: [
                  {
                    duration: 1000,
                    value: 1,
                    easing: "linear",
                    relative: false,
                  },
                ],
                initialValue: 0,
              },
            },
          },
        },
      },
      {
        type: "animation",
        description: "",
        animation: {
          type: "transition",
          prev: {
            tween: {
              alpha: {
                keyframes: [
                  {
                    duration: 1000,
                    value: 0,
                    easing: "easeInQuad",
                    relative: false,
                  },
                ],
                initialValue: 1,
              },
            },
          },
          next: {
            tween: {
              alpha: {
                keyframes: [
                  {
                    duration: 1000,
                    value: 1,
                    easing: "easeOutQuad",
                    relative: false,
                    delay: 1000,
                  },
                ],
                initialValue: 0,
              },
            },
          },
        },
      },
    ]);
  });

  it("names the bundled transition mask image Wipe", () => {
    const wipeTransition = selectDefaultTransitions().find(
      ({ animation }) => animation.mask?.imageId,
    );
    const maskImage =
      repository.images.items[wipeTransition.animation.mask.imageId];

    expect(maskImage.name).toBe("wipe");
  });
});
