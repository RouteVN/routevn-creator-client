import { describe, expect, it } from "vitest";
import {
  getSpritesheetAnimationPreview,
  resolveSpritesheetFrameName,
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
});
