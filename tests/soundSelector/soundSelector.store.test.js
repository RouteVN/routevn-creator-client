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

  it("lays sounds out in a full-width grid when columns are set", () => {
    const state = createInitialState();
    setSounds(
      { state },
      {
        sounds: {
          items: {
            "sound-one": { id: "sound-one", type: "sound", name: "Sound One" },
          },
          tree: [{ id: "sound-one" }],
        },
      },
    );

    const fixedWidth = selectViewData({ state });
    expect(fixedWidth.soundGridStyle).toBe("");
    expect(fixedWidth.soundPreviewStyle).toBe("height: 120px;");
    expect(fixedWidth.groups[0].children[0].soundCardStyle).toContain(
      "width: 220px;",
    );

    const twoColumns = selectViewData({ state, props: { columns: 2 } });
    expect(twoColumns.soundGridStyle).toBe(
      "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(twoColumns.soundPreviewStyle).toBe("aspect-ratio: 16 / 9;");
    expect(twoColumns.groups[0].children[0].soundCardStyle).toContain(
      "width: 100%;",
    );
  });

  it("caps the columns per row with a minimum column width", () => {
    const state = createInitialState();

    const upToFourColumns = selectViewData({
      state,
      props: { columns: 4, minColumnWidth: 120 },
    });
    expect(upToFourColumns.soundGridStyle).toBe(
      "display: grid; grid-template-columns: repeat(auto-fill, minmax(max(120px, calc((100% - 3 * var(--spacing-md)) / 4)), 1fr));",
    );
    expect(upToFourColumns.soundPreviewStyle).toBe("aspect-ratio: 16 / 9;");
  });
});
