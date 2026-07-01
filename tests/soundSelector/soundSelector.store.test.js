import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setSelectedSoundId,
  setSounds,
} from "../../src/components/soundSelector/soundSelector.store.js";

describe("soundSelector.store", () => {
  it("includes root-level sounds and marks the selected sound", () => {
    const state = createInitialState();

    setSounds(
      { state },
      {
        sounds: {
          items: {
            "sound-root": {
              id: "sound-root",
              type: "sound",
              name: "Root Sound",
            },
            "folder-1": {
              id: "folder-1",
              type: "folder",
              name: "Folder",
            },
            "sound-child": {
              id: "sound-child",
              type: "sound",
              name: "Child Sound",
            },
          },
          tree: [
            { id: "sound-root" },
            { id: "folder-1", children: [{ id: "sound-child" }] },
          ],
        },
      },
    );
    setSelectedSoundId(
      { state },
      {
        soundId: "sound-root",
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.groups.map((group) => group.fullLabel)).toEqual([
      "Sounds",
      "Folder",
    ]);
    expect(viewData.groups[0].children[0]).toMatchObject({
      id: "sound-root",
      itemBorderColor: "pr",
      itemHoverBorderColor: "pr",
    });
    expect(viewData.groups[1].children[0]).toMatchObject({
      id: "sound-child",
      itemBorderColor: "bo",
    });
  });
});
