import { describe, expect, it } from "vitest";
import { toSpritesheetAnimationSelectionItems } from "../../src/internal/spritesheets.js";

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
});
