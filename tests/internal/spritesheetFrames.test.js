import { describe, expect, it } from "vitest";
import {
  animationFramesFromEntries,
  buildAnimationsFromSourceIndexes,
  buildSpritesheetFramesOutput,
  clipsFromAnimations,
  createUniqueFrameNames,
  entriesFromAnimationFrames,
  fitFrameInCell,
  getSpritesheetFrameCrops,
  getSpritesheetFramesDraftError,
  getSpritesheetSizeLimitError,
  getUnusedFrameKeys,
  layoutSpritesheetCells,
  moveArrayItem,
  normalizeFrameHold,
  resolveAutoFrameSize,
  resolveFrameCellSizes,
  sortFrameFilesByName,
} from "../../src/internal/spritesheetFrames.js";

const createKeyFactory = () => {
  let next = 0;
  return () => {
    next += 1;
    return `entry-${next}`;
  };
};

describe("frame file names", () => {
  it("sorts numbered file names in natural order", () => {
    const files = ["blink_10.png", "blink_2.png", "blink_1.png"].map(
      (name) => ({ name }),
    );

    expect(sortFrameFilesByName(files).map((file) => file.name)).toEqual([
      "blink_1.png",
      "blink_2.png",
      "blink_10.png",
    ]);
  });

  it("makes repeated frame names unique", () => {
    expect(createUniqueFrameNames(["a", "a", "b", "a", ""])).toEqual([
      "a",
      "a_2",
      "b",
      "a_3",
      "frame_5",
    ]);
  });
});

describe("holds", () => {
  it("keeps holds between 1 and 99", () => {
    expect(normalizeFrameHold(0)).toBe(1);
    expect(normalizeFrameHold("3")).toBe(3);
    expect(normalizeFrameHold(250)).toBe(99);
    expect(normalizeFrameHold("x")).toBe(1);
  });

  it("collapses repeated frames into holds and expands them back", () => {
    const entries = entriesFromAnimationFrames({
      frames: [0, 1, 1, 2, 1],
      frameKeys: ["a", "b", "c"],
      createEntryKey: createKeyFactory(),
    });

    expect(entries).toEqual([
      { key: "entry-1", frameKey: "a", hold: 1 },
      { key: "entry-2", frameKey: "b", hold: 2 },
      { key: "entry-3", frameKey: "c", hold: 1 },
      { key: "entry-4", frameKey: "b", hold: 1 },
    ]);

    expect(
      animationFramesFromEntries({
        entries,
        frameIndexByKey: new Map([
          ["a", 0],
          ["b", 1],
          ["c", 2],
        ]),
      }),
    ).toEqual([0, 1, 1, 2, 1]);
  });

  it("skips animation frames that point past the frame list", () => {
    expect(
      entriesFromAnimationFrames({
        frames: [0, 5],
        frameKeys: ["a"],
        createEntryKey: createKeyFactory(),
      }),
    ).toEqual([{ key: "entry-1", frameKey: "a", hold: 1 }]);
  });
});

describe("layout", () => {
  it("uses the largest frame as the cell size", () => {
    expect(
      resolveAutoFrameSize([
        { width: 32, height: 64 },
        { width: 48, height: 40 },
      ]),
    ).toEqual({ width: 48, height: 64 });
    expect(resolveAutoFrameSize([])).toBeUndefined();
  });

  it("centers smaller frames and scales larger frames down to fit", () => {
    expect(
      fitFrameInCell({ width: 30, height: 20, cellWidth: 40, cellHeight: 40 }),
    ).toEqual({ x: 5, y: 10, width: 30, height: 20 });
    expect(
      fitFrameInCell({ width: 80, height: 40, cellWidth: 40, cellHeight: 40 }),
    ).toEqual({ x: 0, y: 10, width: 40, height: 20 });
  });

  it("lays frames of one size out in a near-square grid with padding", () => {
    const square = { width: 10, height: 10 };
    expect(
      layoutSpritesheetCells({ sizes: [square, square, square, square] }),
    ).toEqual({
      sheetWidth: 22,
      sheetHeight: 22,
      cells: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 12, y: 0, width: 10, height: 10 },
        { x: 0, y: 12, width: 10, height: 10 },
        { x: 12, y: 12, width: 10, height: 10 },
      ],
    });
    expect(
      layoutSpritesheetCells({ sizes: [{ width: 10, height: 20 }] }),
    ).toMatchObject({ sheetWidth: 10, sheetHeight: 20 });
  });

  it("packs taller frames first, without changing frame order", () => {
    const small = { width: 32, height: 32 };
    const large = { width: 64, height: 48 };
    expect(
      layoutSpritesheetCells({ sizes: [small, small, large, large] }),
    ).toEqual({
      sheetWidth: 130,
      sheetHeight: 82,
      cells: [
        { x: 0, y: 50, width: 32, height: 32 },
        { x: 34, y: 50, width: 32, height: 32 },
        { x: 0, y: 0, width: 64, height: 48 },
        { x: 66, y: 0, width: 64, height: 48 },
      ],
    });
  });

  it("keeps a sheet of mixed frame sizes close to square", () => {
    // Frames in an order that puts one tall frame in every row.
    const sizes = Array.from({ length: 60 }, (_value, index) =>
      index % 6 === 0 ? { width: 40, height: 200 } : { width: 120, height: 40 },
    );
    const { sheetWidth, sheetHeight, cells } = layoutSpritesheetCells({
      sizes,
    });
    const area = sizes.reduce(
      (total, size) => total + (size.width + 2) * (size.height + 2),
      0,
    );

    expect(Math.max(sheetWidth, sheetHeight)).toBeLessThan(
      Math.sqrt(area) * 1.25,
    );
    // No two cells overlap.
    for (const [index, cell] of cells.entries()) {
      for (const other of cells.slice(index + 1)) {
        expect(
          cell.x + cell.width <= other.x ||
            other.x + other.width <= cell.x ||
            cell.y + cell.height <= other.y ||
            other.y + other.height <= cell.y,
        ).toBe(true);
      }
    }
  });

  it("gives each clip's frames the size of its largest picture", () => {
    const cells = resolveFrameCellSizes({
      frames: [
        { key: "a", width: 30, height: 32 },
        { key: "b", width: 32, height: 28 },
        { key: "c", width: 64, height: 48 },
        { key: "loose", width: 8, height: 8 },
      ],
      clips: [
        {
          name: "small",
          entries: [
            { frameKey: "a", hold: 1 },
            { frameKey: "b", hold: 1 },
          ],
        },
        { name: "large", entries: [{ frameKey: "c", hold: 1 }] },
      ],
    });

    expect(Object.fromEntries(cells)).toEqual({
      a: { width: 32, height: 32 },
      b: { width: 32, height: 32 },
      c: { width: 64, height: 48 },
      loose: { width: 8, height: 8 },
    });
  });

  it("reports a sheet larger than the device texture or canvas limit", () => {
    expect(
      getSpritesheetSizeLimitError({
        sheetWidth: 4096,
        sheetHeight: 4096,
        maxTextureSize: 8192,
      }),
    ).toBeUndefined();
    expect(
      getSpritesheetSizeLimitError({
        sheetWidth: 5000,
        sheetHeight: 100,
        maxTextureSize: 4096,
      }),
    ).toEqual({
      code: "spritesheet_too_large",
      sheetWidth: 5000,
      sheetHeight: 100,
      limit: 4096,
    });
    expect(
      getSpritesheetSizeLimitError({
        sheetWidth: 8000,
        sheetHeight: 8000,
        maxTextureSize: 16384,
      }),
    ).toMatchObject({ code: "spritesheet_too_large", limit: 4096 });
  });
});

describe("draft validation", () => {
  it("asks for at least one frame and a frame in every clip", () => {
    expect(getSpritesheetFramesDraftError({ frames: [], clips: [] })).toBe(
      "noFrames",
    );
    expect(
      getSpritesheetFramesDraftError({
        frames: [{ key: "a" }],
        clips: [
          { name: "idle", entries: [{ frameKey: "a", hold: 1 }] },
          { name: "blink", entries: [] },
        ],
      }),
    ).toBe("emptyClip");
    expect(
      getSpritesheetFramesDraftError({
        frames: [{ key: "a" }],
        clips: [{ name: "idle", entries: [{ frameKey: "a", hold: 1 }] }],
      }),
    ).toBeUndefined();
  });
});

describe("buildSpritesheetFramesOutput", () => {
  const frames = [
    { key: "open", name: "open", width: 32, height: 32 },
    { key: "half", name: "half", width: 32, height: 32 },
    { key: "unused", name: "unused", width: 32, height: 32 },
    { key: "closed", name: "closed", width: 16, height: 16 },
  ];

  it("builds the atlas and animations, dropping frames no clip uses", () => {
    const output = buildSpritesheetFramesOutput({
      frames,
      clips: [
        {
          name: "default",
          entries: [
            { key: "e1", frameKey: "open", hold: 1 },
            { key: "e2", frameKey: "half", hold: 2 },
            { key: "e3", frameKey: "closed", hold: 1 },
          ],
          fps: 12,
          loop: true,
        },
      ],
      imageName: "blink.png",
    });

    expect(output.frames.map((frame) => frame.key)).toEqual([
      "open",
      "half",
      "closed",
    ]);
    expect(output.frameWidth).toBe(32);
    expect(output.frameHeight).toBe(32);
    expect(output.sheetWidth).toBe(32 * 2 + 2);
    expect(output.sheetHeight).toBe(32 * 2 + 2);
    expect(output.animations).toEqual({
      default: { frames: [0, 1, 1, 2], fps: 12, loop: true },
    });
    expect(output.jsonData.animations).toEqual({
      default: ["open", "half", "half", "closed"],
    });
    expect(output.jsonData.meta).toEqual({
      image: "blink.png",
      size: { w: 66, h: 66 },
      scale: "1",
    });
    expect(output.jsonData.frames.closed).toEqual({
      frame: { x: 0, y: 34, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
    });
    expect(output.placements[2]).toEqual({
      frameKey: "closed",
      x: 8,
      y: 42,
      width: 16,
      height: 16,
    });
  });

  it("keeps frames that were already unused, at their own size", () => {
    const output = buildSpritesheetFramesOutput({
      frames,
      clips: [
        {
          name: "default",
          entries: [{ key: "e1", frameKey: "closed", hold: 1 }],
          fps: 24,
        },
      ],
      keepFrameKeys: ["unused"],
    });

    expect(output.frames.map((frame) => frame.key)).toEqual([
      "unused",
      "closed",
    ]);
    expect(output.jsonData.frames.unused.sourceSize).toEqual({ w: 32, h: 32 });
    expect(output.jsonData.frames.closed.sourceSize).toEqual({ w: 16, h: 16 });
    expect(output.frameWidth).toBe(32);
    expect(output.animations.default).toEqual({
      frames: [1],
      fps: 24,
      loop: true,
    });
  });

  it("keeps each animation at its own frame size", () => {
    const output = buildSpritesheetFramesOutput({
      frames: [
        { key: "fish1", name: "fish1", width: 40, height: 20 },
        { key: "fish2", name: "fish2", width: 40, height: 20 },
        { key: "crab1", name: "crab1", width: 24, height: 24 },
      ],
      clips: [
        {
          name: "fish",
          entries: [
            { key: "e1", frameKey: "fish1", hold: 1 },
            { key: "e2", frameKey: "fish2", hold: 1 },
          ],
          fps: 12,
        },
        {
          name: "crab",
          entries: [{ key: "e3", frameKey: "crab1", hold: 1 }],
          fps: 12,
        },
      ],
    });

    expect(output.jsonData.frames.fish1.sourceSize).toEqual({ w: 40, h: 20 });
    expect(output.jsonData.frames.crab1.sourceSize).toEqual({ w: 24, h: 24 });
    expect(output.placements[2]).toMatchObject({ width: 24, height: 24 });
  });

  it("never names a frame with a bare number, so frames keep sheet order", () => {
    const numbered = ["1", "0", "10", "2"].map((name) => ({
      key: name,
      name,
      width: 8,
      height: 8,
    }));
    const output = buildSpritesheetFramesOutput({
      frames: numbered,
      clips: [
        {
          name: "default",
          entries: numbered.map((frame) => ({
            key: `e${frame.key}`,
            frameKey: frame.key,
            hold: 1,
          })),
          fps: 12,
        },
      ],
    });
    const frameNames = Object.keys(output.jsonData.frames);

    // The engine finds animation frame i at Object.keys(atlas.frames)[i].
    expect(frameNames).toEqual(["1.png", "0.png", "10.png", "2.png"]);
    expect(
      output.animations.default.frames.map((index) => frameNames[index]),
    ).toEqual(["1.png", "0.png", "10.png", "2.png"]);
  });
});

describe("buildAnimationsFromSourceIndexes", () => {
  const clip = (name, frameKeys) => ({
    name,
    entries: frameKeys.map(([frameKey, hold]) => ({
      key: `e-${frameKey}`,
      frameKey,
      hold,
    })),
    fps: 8,
    loop: false,
  });

  it("points animations at the frames already in the sheet", () => {
    expect(
      buildAnimationsFromSourceIndexes({
        frames: [
          { key: "a", sourceIndex: 0 },
          { key: "b", sourceIndex: 1 },
          { key: "c", sourceIndex: 2 },
        ],
        clips: [
          clip("walk", [
            ["c", 1],
            ["a", 2],
          ]),
        ],
      }),
    ).toEqual({ walk: { frames: [2, 0, 0], fps: 8, loop: false } });
  });

  it("needs a new sheet once a clip uses a picture the sheet lacks", () => {
    expect(
      buildAnimationsFromSourceIndexes({
        frames: [{ key: "a", sourceIndex: 0 }, { key: "new" }],
        clips: [
          clip("walk", [
            ["a", 1],
            ["new", 1],
          ]),
        ],
      }),
    ).toBeUndefined();
  });
});

describe("getSpritesheetFrameCrops", () => {
  it("restores trimmed frames to their original size", () => {
    expect(
      getSpritesheetFrameCrops({
        frames: {
          walk: {
            frame: { x: 10, y: 20, w: 30, h: 40 },
            rotated: false,
            trimmed: true,
            spriteSourceSize: { x: 5, y: 6, w: 30, h: 40 },
            sourceSize: { w: 64, h: 64 },
          },
        },
      }),
    ).toEqual([
      {
        name: "walk",
        sourceX: 10,
        sourceY: 20,
        sourceWidth: 30,
        sourceHeight: 40,
        rotated: false,
        outputWidth: 64,
        outputHeight: 64,
        drawX: 5,
        drawY: 6,
        drawWidth: 30,
        drawHeight: 40,
      },
    ]);
  });

  it("swaps the sheet region of a rotated frame and ignores untrimmed offsets", () => {
    expect(
      getSpritesheetFrameCrops({
        frames: {
          spin: {
            frame: { x: 0, y: 0, w: 30, h: 40 },
            rotated: true,
            trimmed: false,
            spriteSourceSize: { x: 9, y: 9, w: 30, h: 40 },
            sourceSize: { w: 99, h: 99 },
          },
        },
      })[0],
    ).toMatchObject({
      sourceWidth: 40,
      sourceHeight: 30,
      rotated: true,
      outputWidth: 30,
      outputHeight: 40,
      drawX: 0,
      drawY: 0,
    });
  });
});

describe("clipsFromAnimations", () => {
  it("turns every resource animation into a clip with holds", () => {
    const clips = clipsFromAnimations({
      animations: {
        spin: { frames: [0, 1, 1], fps: 8, loop: false },
        look: { frames: [2] },
      },
      frameKeys: ["a", "b", "c"],
      createEntryKey: createKeyFactory(),
      missingClipFps: 24,
    });

    expect(clips).toEqual([
      {
        name: "spin",
        entries: [
          { key: "entry-1", frameKey: "a", hold: 1 },
          { key: "entry-2", frameKey: "b", hold: 2 },
        ],
        fps: 8,
        loop: false,
      },
      {
        name: "look",
        entries: [{ key: "entry-3", frameKey: "c", hold: 1 }],
        fps: 24,
        loop: true,
      },
    ]);
    expect(
      getUnusedFrameKeys({
        frames: [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }],
        clips,
      }),
    ).toEqual(["d"]);
  });
});

describe("moveArrayItem", () => {
  it("moves an item and ignores moves out of range", () => {
    expect(moveArrayItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveArrayItem(["a", "b", "c"], 0, 5)).toEqual(["a", "b", "c"]);
  });
});

describe("clipsFromAnimations", () => {
  it("keeps each saved animation's speed", () => {
    let nextKey = 0;
    const clips = clipsFromAnimations({
      animations: {
        current: { frames: [0], fps: 8 },
        older: { frames: [0, 1], animationSpeed: 0.2 },
        unset: { frames: [1], loop: false },
      },
      frameKeys: ["a", "b"],
      createEntryKey: () => `e${(nextKey += 1)}`,
      missingClipFps: 24,
    });

    expect(clips.map(({ name, fps, loop }) => ({ name, fps, loop }))).toEqual([
      { name: "current", fps: 8, loop: true },
      // An older animation speed is per 60 ticks: 0.2 plays at 12 FPS.
      { name: "older", fps: 12, loop: true },
      { name: "unset", fps: 24, loop: false },
    ]);
  });
});
