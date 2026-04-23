import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setExistingCharacters,
  setItems,
  setMode,
  setSelectedCharacterIndex,
  setSelectedSpriteGroupId,
} from "../../src/components/commandLineCharacters/commandLineCharacters.store.js";

const createSpriteSelectState = () => {
  const state = createInitialState();

  setItems(
    { state },
    {
      items: {
        items: {
          "character-hero": {
            id: "character-hero",
            type: "character",
            name: "Hero",
            spriteGroups: [
              {
                id: "body",
                name: "Body",
                tags: [],
              },
              {
                id: "face",
                name: "Face",
                tags: ["tag-face"],
              },
            ],
            sprites: {
              items: {
                "folder-variants": {
                  id: "folder-variants",
                  type: "folder",
                  name: "Variants",
                },
                "sprite-face": {
                  id: "sprite-face",
                  type: "image",
                  name: "Smile",
                  fileId: "file-face",
                  tagIds: ["tag-face"],
                },
                "sprite-body": {
                  id: "sprite-body",
                  type: "image",
                  name: "Body A",
                  fileId: "file-body",
                  tagIds: ["tag-body"],
                },
                "sprite-untagged": {
                  id: "sprite-untagged",
                  type: "image",
                  name: "Fallback",
                  fileId: "file-untagged",
                },
              },
              tree: [
                {
                  id: "folder-variants",
                  children: [{ id: "sprite-face" }, { id: "sprite-body" }],
                },
                { id: "sprite-untagged" },
              ],
            },
          },
        },
        tree: [{ id: "character-hero" }],
      },
    },
  );
  setExistingCharacters(
    { state },
    {
      characters: [
        {
          id: "character-hero",
          sprites: [],
        },
      ],
    },
  );
  setMode({ state }, { mode: "sprite-select" });
  setSelectedCharacterIndex({ state }, { index: 0 });

  return state;
};

describe("commandLineCharacters.store sprite group filtering", () => {
  it("exposes current-mode sprite group boxes for multipart characters", () => {
    const state = createSpriteSelectState();

    setMode({ state }, { mode: "current" });

    const viewData = selectViewData({ state });

    expect(viewData.defaultValues.characters[0].showSpriteGroupBoxes).toBe(
      true,
    );
    expect(viewData.defaultValues.characters[0].spriteGroupBoxes).toEqual([
      {
        id: "body",
        name: "Body",
        selectedSpriteId: undefined,
        selectedSpriteName: "No sprite",
        hasSelection: false,
      },
      {
        id: "face",
        name: "Face",
        selectedSpriteId: undefined,
        selectedSpriteName: "No sprite",
        hasSelection: false,
      },
    ]);
  });

  it("builds stacked preview file ids for multipart characters in group order", () => {
    const state = createSpriteSelectState();

    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "body",
                resourceId: "sprite-body",
              },
              {
                id: "face",
                resourceId: "sprite-face",
              },
            ],
          },
        ],
      },
    );
    setMode({ state }, { mode: "current" });

    const viewData = selectViewData({ state });

    expect(viewData.defaultValues.characters[0].spritePreviewFileIds).toEqual([
      "file-body",
      "file-face",
    ]);
  });

  it("filters sprites by the selected sprite group tags", () => {
    const state = createSpriteSelectState();
    setSelectedSpriteGroupId({ state }, { spriteGroupId: "face" });

    const viewData = selectViewData({ state });

    expect(viewData.spriteItems.map((item) => item.id)).toEqual([
      "folder-variants",
    ]);
    expect(viewData.spriteGroups).toHaveLength(1);
    expect(viewData.spriteGroups[0].children.map((item) => item.id)).toEqual([
      "sprite-face",
    ]);
  });

  it("does not filter sprites when the selected sprite group has no tags", () => {
    const state = createSpriteSelectState();
    setSelectedSpriteGroupId({ state }, { spriteGroupId: "body" });

    const viewData = selectViewData({ state });
    const visibleSpriteIds = viewData.spriteGroups.flatMap((group) =>
      group.children.map((item) => item.id),
    );

    expect(visibleSpriteIds).toEqual([
      "sprite-untagged",
      "sprite-face",
      "sprite-body",
    ]);
    expect(viewData.spriteItems).toHaveLength(2);
  });
});
