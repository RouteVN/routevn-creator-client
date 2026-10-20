import { describe, expect, it } from "vitest";
import {
  getSpritesheetAnimationPreview,
  getSpritesheetResourceDefaultSize,
  resolveSpritesheetFrameName,
  resolveSpritesheetSize,
  toSpritesheetAnimationSelectionItems,
} from "../../src/internal/spritesheets.js";

describe("spritesheets", () => {
  it("uses spritesheet names instead of folder paths for animation selector labels", () => {
    const selectionItems = toSpritesheetAnimationSelectionItems({
      items: {
        "spritesheet-1": {
          id: "spritesheet-1",
          type: "spritesheet",
          name: "Hero Sheet",
          fullLabel: "Characters > Hero Sheet",
          animations: {
            Idle: {},
            Talk: {},
          },
        },
      },
      tree: [{ id: "spritesheet-1" }],
    });

    expect(selectionItems.map((item) => item.label)).toEqual([
      "Hero Sheet / Idle",
      "Hero Sheet / Talk",
    ]);
  });

  it("uses the source file for spritesheet animation previews when a thumbnail is available", () => {
    const preview = getSpritesheetAnimationPreview(
      {
        items: {
          "spritesheet-1": {
            id: "spritesheet-1",
            type: "spritesheet",
            fileId: "sheet-source-file",
            thumbnailFileId: "sheet-preview-file",
            jsonData: {
              frames: {},
            },
            animations: {
              Idle: {
                frames: [],
              },
            },
          },
        },
        tree: [{ id: "spritesheet-1" }],
      },
      "spritesheet-1",
      "Idle",
    );

    expect(preview.fileId).toBe("sheet-source-file");
  });

  it("resolves spritesheet animation frame names from numeric and string refs", () => {
    const frameNames = ["idle-0", "idle-1"];

    expect(resolveSpritesheetFrameName(frameNames, 1)).toBe("idle-1");
    expect(resolveSpritesheetFrameName(frameNames, "idle-0")).toBe("idle-0");
    expect(resolveSpritesheetFrameName(frameNames, 99)).toBeUndefined();
    expect(resolveSpritesheetFrameName(frameNames, "missing")).toBeUndefined();
  });

  describe("resolveSpritesheetSize", () => {
    const spritesheet = {
      jsonData: {
        frames: {
          icon: {
            frame: { x: 0, y: 0, w: 32, h: 32 },
            sourceSize: { w: 32, h: 32 },
          },
          "walk-0": {
            frame: { x: 32, y: 0, w: 200, h: 480 },
            sourceSize: { w: 256, h: 512 },
          },
        },
      },
      animations: { walk: { frames: [1, 0], fps: 12 } },
      sheetWidth: 288,
      sheetHeight: 512,
    };

    it("keeps the default size that is set", () => {
      expect(
        resolveSpritesheetSize({ ...spritesheet, width: 128, height: 256 }),
      ).toEqual({ width: 128, height: 256 });
    });

    it("uses the first clip's first frame, before trimming, without a default size", () => {
      expect(resolveSpritesheetSize(spritesheet)).toEqual({
        width: 256,
        height: 512,
      });
    });

    it("fills only the missing side of the default size", () => {
      expect(resolveSpritesheetSize({ ...spritesheet, width: 128 })).toEqual({
        width: 128,
        height: 512,
      });
    });

    it("uses the first frame when there are no clips", () => {
      expect(
        resolveSpritesheetSize({ ...spritesheet, animations: {} }),
      ).toEqual({ width: 32, height: 32 });
    });

    it("uses the sheet's size when the atlas has no frames", () => {
      expect(
        resolveSpritesheetSize({ ...spritesheet, jsonData: { frames: {} } }),
      ).toEqual({ width: 288, height: 512 });
    });
  });

  // The size the layout editor gives a new Spritesheet Animation element.
  describe("getSpritesheetResourceDefaultSize", () => {
    const spritesheetsData = {
      items: {
        sheet: {
          type: "spritesheet",
          jsonData: {
            frames: {
              "walk-0": {
                frame: { x: 0, y: 0, w: 200, h: 480 },
                sourceSize: { w: 256, h: 512 },
              },
            },
          },
          animations: { walk: { frames: [0], fps: 12 } },
          sheetWidth: 1024,
          sheetHeight: 512,
        },
        folder: { type: "folder" },
      },
    };

    it("gives a spritesheet without a default size its frame size", () => {
      expect(
        getSpritesheetResourceDefaultSize(spritesheetsData, "sheet"),
      ).toEqual({ width: 256, height: 512 });
    });

    it("fills only the missing side of the default size", () => {
      const sheet = { ...spritesheetsData.items.sheet, width: 128 };

      expect(
        getSpritesheetResourceDefaultSize({ items: { sheet } }, "sheet"),
      ).toEqual({ width: 128, height: 512 });
    });

    it("keeps the default size that is set", () => {
      const sheet = { ...spritesheetsData.items.sheet, width: 128, height: 64 };

      expect(
        getSpritesheetResourceDefaultSize({ items: { sheet } }, "sheet"),
      ).toEqual({ width: 128, height: 64 });
    });

    it("gives no size for a folder or a missing item", () => {
      expect(
        getSpritesheetResourceDefaultSize(spritesheetsData, "folder"),
      ).toEqual({});
      expect(
        getSpritesheetResourceDefaultSize(spritesheetsData, "missing"),
      ).toEqual({});
    });
  });
});
