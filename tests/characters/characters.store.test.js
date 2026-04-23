import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/pages/characters/characters.store.js";

describe("characters store sprite group tags", () => {
  it("uses character sprite tags for sprite group labels and options", () => {
    const state = createInitialState();

    state.tagsData = {
      items: {
        "character-tag-main": {
          id: "character-tag-main",
          type: "tag",
          name: "Main Cast",
        },
      },
      tree: [{ id: "character-tag-main" }],
    };
    state.spriteTagsByCharacterId = {
      "character-hero": {
        items: {
          "sprite-tag-smile": {
            id: "sprite-tag-smile",
            type: "tag",
            name: "Smile",
          },
        },
        tree: [{ id: "sprite-tag-smile" }],
      },
    };
    state.charactersData = {
      items: {
        "character-hero": {
          id: "character-hero",
          type: "character",
          name: "Hero",
          tagIds: ["character-tag-main"],
          spriteGroups: [
            {
              id: "group-face",
              name: "Face",
              tags: ["sprite-tag-smile"],
            },
          ],
        },
      },
      tree: [{ id: "character-hero" }],
    };
    state.selectedItemId = "character-hero";
    state.editItemId = "character-hero";
    state.editSpriteGroups = [
      {
        id: "group-face",
        name: "Face",
        tags: ["sprite-tag-smile"],
      },
    ];

    const viewData = selectViewData({ state });

    expect(viewData.tagFilterOptions).toEqual([
      {
        label: "Main Cast",
        value: "character-tag-main",
      },
    ]);
    expect(viewData.selectedItemSpriteGroups).toEqual([
      {
        id: "group-face",
        name: "Face",
        tags: ["sprite-tag-smile"],
        tagNames: ["Smile"],
        tagSummary: "Smile",
      },
    ]);
    expect(viewData.editSpriteGroupTagOptions).toEqual([
      {
        label: "Smile",
        value: "sprite-tag-smile",
      },
    ]);
  });
});
