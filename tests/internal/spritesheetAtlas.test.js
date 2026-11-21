import { describe, expect, it } from "vitest";
import {
  getSpritesheetFrameDisplayName,
  mergeSpritesheetAtlasPages,
  parseSpritesheetAtlasFile,
} from "../../src/internal/spritesheetAtlas.js";

const atlasFile = (atlas) => ({
  name: "hero.json",
  text: async () => JSON.stringify(atlas),
});

const frame = (x) => ({
  frame: { x, y: 0, w: 32, h: 32 },
  sourceSize: { w: 32, h: 32 },
});

describe("parseSpritesheetAtlasFile", () => {
  it("imports every named animation at 12 fps", async () => {
    const result = await parseSpritesheetAtlasFile({
      atlasFile: atlasFile({
        frames: { "walk-0": frame(0), "walk-1": frame(32), stand: frame(64) },
        animations: { walk: ["walk-0", "walk-1"], stand: ["stand"] },
      }),
    });

    expect(result.animations).toEqual({
      walk: { frames: [0, 1], fps: 12, loop: true },
      stand: { frames: [2], fps: 12, loop: true },
    });
  });

  it("reads a Phaser 3 sheet, which lists frames under textures", async () => {
    const result = await parseSpritesheetAtlasFile({
      atlasFile: atlasFile({
        textures: [
          {
            image: "hero.png",
            frames: [
              { filename: "run/frame0002", ...frame(32) },
              { filename: "run/frame0001", ...frame(0) },
            ],
          },
        ],
        meta: { app: "https://www.codeandweb.com/texturepacker" },
      }),
    });

    expect(Object.keys(result.jsonData.frames)).toEqual([
      "run/frame0002",
      "run/frame0001",
    ]);
    // Frames in a folder form one animation, in number order.
    expect(result.animations).toEqual({
      run: { frames: [1, 0], fps: 12, loop: true },
    });
  });

  it("makes an animation of each frame name before its number", async () => {
    const result = await parseSpritesheetAtlasFile({
      atlasFile: atlasFile({
        frames: {
          "walk 10.png": frame(0),
          "walk 2.png": frame(32),
          "walk 1.png": frame(64),
          "jump_01.png": frame(96),
          "jump_02.png": frame(128),
          "idle.png": frame(160),
          "fall_1.png": frame(192),
        },
      }),
    });

    // A frame with no number, or alone with its name, is an animation of its
    // own, so it can still be shown.
    expect(result.animations).toEqual({
      walk: { frames: [2, 1, 0], fps: 12, loop: true },
      jump: { frames: [3, 4], fps: 12, loop: true },
      idle: { frames: [5], fps: 12, loop: true },
      fall_1: { frames: [6], fps: 12, loop: true },
    });
    expect(result.frameCount).toBe(7);
  });

  it("splits a folder that holds several sequences", async () => {
    const result = await parseSpritesheetAtlasFile({
      atlasFile: atlasFile({
        frames: {
          "hero/walk_01.png": frame(0),
          "hero/walk_02.png": frame(32),
          "hero/run_01.png": frame(64),
          "hero/run_02.png": frame(96),
          "hero/idle.png": frame(128),
          "slime/0001.png": frame(160),
          "slime/0002.png": frame(192),
        },
      }),
    });

    expect(result.animations).toEqual({
      "hero/walk": { frames: [0, 1], fps: 12, loop: true },
      "hero/run": { frames: [2, 3], fps: 12, loop: true },
      "hero/idle": { frames: [4], fps: 12, loop: true },
      slime: { frames: [5, 6], fps: 12, loop: true },
    });
  });

  it("asks for the PNG files of a sheet split over several images", async () => {
    await expect(
      parseSpritesheetAtlasFile({
        atlasFile: atlasFile({
          textures: [
            { image: "hero-0.png", frames: [] },
            { image: "hero-1.png", frames: [] },
          ],
        }),
      }),
    ).rejects.toMatchObject({
      code: "spritesheet_images_missing",
      missingImages: ["hero-0.png", "hero-1.png"],
    });
  });

  it("puts every frame in one animation when names do not group", async () => {
    const result = await parseSpritesheetAtlasFile({
      atlasFile: atlasFile({
        frames: { head: frame(0), arm: frame(32), leg: frame(64) },
      }),
    });

    expect(result.animations).toEqual({
      default: { frames: [0, 1, 2], fps: 12, loop: true },
    });
  });
});

describe("mergeSpritesheetAtlasPages", () => {
  it("lays images out in rows and moves each frame with its image", () => {
    const page = (name, x) => ({
      image: `${name}.png`,
      frames: [{ filename: name, frame: { x, y: 1, w: 4, h: 4 } }],
    });
    const merged = mergeSpritesheetAtlasPages({
      atlas: { textures: [page("a", 0), page("b", 5), page("c", 9)], meta: {} },
      pageSizes: [
        { width: 100, height: 50 },
        { width: 80, height: 60 },
        { width: 30, height: 40 },
      ],
      imageName: "sheet.png",
      padding: 2,
    });

    expect(merged.placements).toEqual([
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 102, y: 0, width: 80, height: 60 },
      { x: 0, y: 62, width: 30, height: 40 },
    ]);
    expect([merged.sheetWidth, merged.sheetHeight]).toEqual([182, 102]);
    expect(merged.atlas.frames.map((frame) => frame.frame)).toEqual([
      { x: 0, y: 1, w: 4, h: 4 },
      { x: 107, y: 1, w: 4, h: 4 },
      { x: 9, y: 63, w: 4, h: 4 },
    ]);
  });
});

describe("getSpritesheetFrameDisplayName", () => {
  it("drops only a picture's file extension", () => {
    expect(
      [
        "walk_01.png",
        "hero.idle.v2.png",
        "walk.001",
        "hero 0.aseprite",
        "10",
      ].map(getSpritesheetFrameDisplayName),
    ).toEqual(["walk_01", "hero.idle.v2", "walk.001", "hero 0", "10"]);
    // A name saved without its extension stays the same when read again.
    expect(getSpritesheetFrameDisplayName("hero.idle.v2")).toBe("hero.idle.v2");
  });
});
