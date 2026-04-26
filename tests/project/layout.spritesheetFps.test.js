import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

const createSpritesheet = (overrides = {}) => ({
  type: "spritesheet",
  fileId: "file-spritesheet",
  jsonData: {
    frames: {
      "idle-0.png": {
        frame: {
          x: 0,
          y: 0,
          w: 32,
          h: 32,
        },
      },
      "idle-1.png": {
        frame: {
          x: 32,
          y: 0,
          w: 32,
          h: 32,
        },
      },
    },
  },
  animations: {
    idle: {
      frames: [0, 1],
      loop: true,
    },
  },
  ...overrides,
});

const buildSpritesheetElement = (spritesheet, nodeOverrides = {}) => {
  const { elements } = buildLayoutElements(
    [
      {
        id: "spritesheet-node",
        type: "spritesheet-animation",
        resourceId: "spritesheet-1",
        animationName: "idle",
        ...nodeOverrides,
      },
    ],
    {},
    { items: {}, tree: [] },
    { items: {}, tree: [] },
    { items: {}, tree: [] },
    {
      spritesheetsData: {
        items: {
          "spritesheet-1": spritesheet,
        },
        tree: [{ id: "spritesheet-1" }],
      },
    },
  );

  return elements[0];
};

describe("buildLayoutElements spritesheet fps", () => {
  it("uses clip fps for spritesheet animation playback", () => {
    const element = buildSpritesheetElement(
      createSpritesheet({
        animations: {
          idle: {
            frames: [0, 1],
            fps: 12,
            loop: false,
          },
        },
      }),
    );

    expect(element.playback).toMatchObject({
      clip: "idle",
      fps: 12,
      loop: false,
    });
  });

  it("uses 24 fps when the clip does not define fps", () => {
    const element = buildSpritesheetElement(createSpritesheet());

    expect(element.playback.fps).toBe(24);
  });
});
