import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  buildSpritesheetDataFromFramesDraft,
  getAwaitedSpritesheetImages,
  getEmptySpritesheetMissingSource,
  resolveSpritesheetImportFiles,
} from "../../src/internal/ui/spritesheetFramesSave.js";

const readyDraft = (overrides = {}) => ({
  status: "ready",
  sourceKind: "pictures",
  frames: [{ key: "a", name: "a", width: 32, height: 32 }],
  clips: [
    {
      name: "default",
      entries: [{ key: "e1", frameKey: "a", hold: 1 }],
      fps: 12,
    },
  ],
  keepFrameKeys: [],
  ...overrides,
});

// An atlas frame of `size` at `x`, as a saved sheet's JSON has it.
const atlasFrame = (x, size = 32) => ({
  frame: { x, y: 0, w: size, h: size },
  sourceSize: { w: size, h: size },
});

const createDeps = () => ({
  appService: {
    showAlert: vi.fn(),
    getAppCopy: vi.fn(() => ({})),
  },
  projectService: {
    buildSpritesheetFromFrames: vi.fn(async () => ({
      data: { fileId: "sheet" },
      fileRecords: [{ id: "sheet" }],
      fileIdByFrameKey: { a: "file-a" },
      sourceIndexByFrameKey: { a: 0 },
    })),
  },
  i18n: EN_I18N,
});

describe("buildSpritesheetDataFromFramesDraft", () => {
  it("builds the sheet from the draft", async () => {
    const deps = createDeps();
    const draft = readyDraft();

    const result = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft,
      name: "Blink",
    });

    expect(result).toEqual({
      ok: true,
      data: { fileId: "sheet" },
      fileRecords: [{ id: "sheet" }],
      fileIdByFrameKey: { a: "file-a" },
      sourceIndexByFrameKey: { a: 0 },
    });
    expect(deps.projectService.buildSpritesheetFromFrames).toHaveBeenCalledWith(
      {
        frames: draft.frames,
        clips: draft.clips,
        keepFrameKeys: [],
        name: "Blink",
      },
    );
  });

  it.each([
    [
      { status: "loading" },
      "The frames are still loading. Try again in a moment.",
    ],
    [{ frames: [], clips: [] }, "Add at least one picture."],
    [
      {
        clips: [
          {
            name: "default",
            entries: [{ key: "e1", frameKey: "a", hold: 1 }],
          },
          { name: "blink", entries: [] },
        ],
      },
      "Every clip needs at least one frame.",
    ],
  ])("explains why a draft cannot be saved", async (overrides, message) => {
    const deps = createDeps();

    const result = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft: readyDraft(overrides),
      name: "Blink",
    });

    expect(result.ok).toBe(false);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message,
      title: "Warning",
    });
    expect(
      deps.projectService.buildSpritesheetFromFrames,
    ).not.toHaveBeenCalled();
  });

  it("saves only the animations while the frames are already in the sheet", async () => {
    const deps = createDeps();
    // An uploaded PNG and JSON sheet: its frames come from the sheet itself.
    const existingItem = {
      fileId: "sheet-file",
      jsonData: { frames: { a: atlasFrame(0), b: atlasFrame(34) } },
      animations: { default: { frames: [0, 1], fps: 24, loop: true } },
    };
    const draft = readyDraft({
      sourceKind: "sheet",
      frames: [
        { key: "a", name: "a", width: 32, height: 32, sourceIndex: 0 },
        { key: "b", name: "b", width: 32, height: 32, sourceIndex: 1 },
      ],
      clips: [
        {
          name: "default",
          entries: [
            { key: "e2", frameKey: "b", hold: 2 },
            { key: "e1", frameKey: "a", hold: 1 },
          ],
          fps: 8,
          loop: true,
        },
      ],
    });

    const result = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft,
      existingItem,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        animations: { default: { frames: [1, 1, 0], fps: 8, loop: true } },
      },
      fileRecords: [],
      fileIdByFrameKey: {},
    });
    expect(
      deps.projectService.buildSpritesheetFromFrames,
    ).not.toHaveBeenCalled();
  });

  it("makes a new sheet once a picture is added", async () => {
    const deps = createDeps();
    const existingItem = {
      fileId: "sheet-file",
      jsonData: { frames: { a: atlasFrame(0) } },
      animations: { default: { frames: [0], fps: 12, loop: true } },
    };

    await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft: readyDraft({
        frames: [
          { key: "a", name: "a", width: 32, height: 32, sourceIndex: 0 },
          { key: "new", name: "new", width: 32, height: 32 },
        ],
        clips: [
          {
            name: "default",
            entries: [
              { key: "e1", frameKey: "a", hold: 1 },
              { key: "e2", frameKey: "new", hold: 1 },
            ],
            fps: 12,
          },
        ],
      }),
      existingItem,
    });

    expect(deps.projectService.buildSpritesheetFromFrames).toHaveBeenCalled();
  });

  it("updates a default size the import filled in, but not one set by hand", async () => {
    const deps = createDeps();
    deps.projectService.buildSpritesheetFromFrames.mockResolvedValue({
      data: {
        fileId: "sheet",
        jsonData: { frames: { big: atlasFrame(0, 128) } },
        animations: { default: { frames: [0], fps: 12, loop: true } },
      },
      fileRecords: [],
      fileIdByFrameKey: {},
      sourceIndexByFrameKey: {},
    });
    const importedItem = {
      fileId: "sheet-file",
      width: 64,
      height: 64,
      jsonData: { frames: { a: atlasFrame(0, 64) } },
      animations: { default: { frames: [0], fps: 12, loop: true } },
    };
    const draft = readyDraft({
      frames: [{ key: "big", name: "big", width: 128, height: 128 }],
      clips: [
        {
          name: "default",
          entries: [{ key: "e1", frameKey: "big", hold: 1 }],
          fps: 12,
        },
      ],
    });

    const imported = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft,
      existingItem: importedItem,
    });
    expect(imported.data).toMatchObject({ width: 128, height: 128 });

    const handSet = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft,
      existingItem: { ...importedItem, width: 200, height: 100 },
    });
    expect(handSet.data.width).toBeUndefined();
    expect(handSet.data.height).toBeUndefined();
  });

  it("explains a sheet that is too large for the device", async () => {
    const deps = createDeps();
    const error = new Error("too large");
    Object.assign(error, {
      code: "spritesheet_too_large",
      sheetWidth: 9000,
      sheetHeight: 100,
      limit: 4096,
    });
    deps.projectService.buildSpritesheetFromFrames.mockRejectedValue(error);

    const result = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft: readyDraft(),
      name: "Blink",
    });

    expect(result.ok).toBe(false);
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "4096 pixels on a side",
    );
  });

  it("returns the reason instead of showing it when asked not to notify", async () => {
    const deps = createDeps();

    const result = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft: readyDraft({ frames: [], clips: [] }),
      notify: false,
    });

    expect(result).toEqual({ ok: false, message: "Add at least one picture." });
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });
});

describe("resolveSpritesheetImportFiles", () => {
  const file = (name) => ({ name });

  it("takes one JSON with the PNG files it uses", () => {
    expect(
      resolveSpritesheetImportFiles([
        file("hero-0.png"),
        file("hero.json"),
        file("hero-1.png"),
      ]),
    ).toEqual({
      pngFiles: [file("hero-0.png"), file("hero-1.png")],
      atlasFile: file("hero.json"),
    });
  });

  it("refuses files without exactly one JSON and a PNG, or with others", () => {
    expect(resolveSpritesheetImportFiles([file("hero.png")])).toBeUndefined();
    expect(
      resolveSpritesheetImportFiles([file("a.json"), file("b.json")]),
    ).toBeUndefined();
    expect(
      resolveSpritesheetImportFiles([
        file("hero.png"),
        file("hero.json"),
        file("notes.txt"),
      ]),
    ).toBeUndefined();
  });
});

describe("getEmptySpritesheetMissingSource", () => {
  it("asks an empty spritesheet for its PNG and JSON together", () => {
    const empty = { type: "spritesheet", jsonData: {}, animations: {} };
    const png = { name: "hero.png" };
    const json = { name: "hero.json" };

    expect(
      getEmptySpritesheetMissingSource({
        existingItem: empty,
        sourceFiles: { pngFile: png },
      }),
    ).toBe("json");
    expect(
      getEmptySpritesheetMissingSource({
        existingItem: empty,
        sourceFiles: { atlasFile: json },
      }),
    ).toBe("png");
    expect(
      getEmptySpritesheetMissingSource({
        existingItem: empty,
        sourceFiles: { pngFile: png, atlasFile: json },
      }),
    ).toBeUndefined();
    // A spritesheet with a sheet can take a new PNG or JSON alone.
    expect(
      getEmptySpritesheetMissingSource({
        existingItem: { ...empty, fileId: "sheet" },
        sourceFiles: { pngFile: png },
      }),
    ).toBeUndefined();
  });
});

describe("getAwaitedSpritesheetImages", () => {
  const error = Object.assign(new Error("missing"), {
    code: "spritesheet_images_missing",
    missingImages: ["hero-0.png", "hero-1.png"],
  });

  it("keeps a JSON for several images picked before its PNG files", () => {
    expect(getAwaitedSpritesheetImages({ error, pngFiles: [] })).toEqual([
      "hero-0.png",
      "hero-1.png",
    ]);
  });

  it("does not wait once PNG files were picked, or for other errors", () => {
    expect(
      getAwaitedSpritesheetImages({ error, pngFiles: [{ name: "a.png" }] }),
    ).toBeUndefined();
    expect(
      getAwaitedSpritesheetImages({
        error: new Error("bad JSON"),
        pngFiles: [],
      }),
    ).toBeUndefined();
  });
});
