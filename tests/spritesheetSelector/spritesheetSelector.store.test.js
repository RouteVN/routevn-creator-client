import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setSpritesheets,
} from "../../src/components/spritesheetSelector/spritesheetSelector.store.js";

describe("spritesheetSelector columns", () => {
  it("uses an equal-width grid when a column count is provided", () => {
    const state = createInitialState();
    setSpritesheets(
      { state },
      {
        spritesheets: {
          items: {
            characters: {
              id: "characters",
              type: "folder",
              name: "Characters",
            },
            hero: {
              id: "hero",
              type: "spritesheet",
              name: "Hero",
              parentId: "characters",
              animations: {
                idle: { frames: ["idle-1"] },
              },
            },
          },
          tree: [
            {
              id: "characters",
              children: [{ id: "hero" }],
            },
          ],
        },
      },
    );

    expect(selectViewData({ state, props: {} })).toMatchObject({
      spritesheetGridStyle: "",
      spritesheetCardStyle: "max-width: 100%; box-sizing: border-box;",
    });
    expect(selectViewData({ state, props: { columns: 2 } })).toMatchObject({
      spritesheetGridStyle:
        "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));",
      spritesheetCardStyle:
        "width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box;",
    });
  });
});
