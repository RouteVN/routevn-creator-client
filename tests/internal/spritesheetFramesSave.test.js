import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  buildSpritesheetDataFromFramesDraft,
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
  frameWidth: 32,
  frameHeight: 32,
  framesChanged: true,
  fpsChanged: false,
  ...overrides,
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
      fileIdByFrameKey: undefined,
    });
    expect(deps.projectService.buildSpritesheetFromFrames).toHaveBeenCalledWith(
      {
        frames: draft.frames,
        clips: draft.clips,
        keepFrameKeys: [],
        frameWidth: 32,
        frameHeight: 32,
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

  it("keeps the saved sheet when the saved frames did not change", async () => {
    const deps = createDeps();
    const existingItem = {
      frameSource: { frameWidth: 32, frameHeight: 32, frames: [] },
      animations: { default: { frames: [0], fps: 24, loop: true } },
    };

    const unchanged = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft: readyDraft({ sourceKind: "frames", framesChanged: false }),
      existingItem,
    });
    expect(unchanged).toEqual({
      ok: true,
      data: {},
      fileRecords: [],
      fileIdByFrameKey: {},
    });

    const fpsOnly = await buildSpritesheetDataFromFramesDraft({
      ...deps,
      draft: readyDraft({
        sourceKind: "frames",
        framesChanged: false,
        fpsChanged: true,
      }),
      existingItem,
    });
    expect(fpsOnly.data).toEqual({
      animations: { default: { frames: [0], fps: 12, loop: true } },
    });
    expect(
      deps.projectService.buildSpritesheetFromFrames,
    ).not.toHaveBeenCalled();
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
