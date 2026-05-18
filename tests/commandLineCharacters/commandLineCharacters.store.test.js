import { describe, expect, it } from "vitest";
import {
  createInitialState,
  moveCharacter,
  selectViewData,
  setAnimations,
  setExistingCharacters,
  setItems,
  setMode,
  setSelectedCharacterIndex,
  setSelectedSpriteGroupId,
  setTransforms,
  showDropdownMenu,
  updateCharacterBlurEnabled,
  updateCharacterBlurField,
  updateCharacterOpacity,
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
  it("exposes a single clearable animation option list with type suffix text", () => {
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
            },
          },
          tree: [{ id: "character-hero" }],
        },
      },
    );
    setTransforms(
      { state },
      {
        transforms: {
          items: {
            "character-center": {
              id: "character-center",
              type: "transform",
              name: "Center",
            },
          },
          tree: [{ id: "character-center" }],
        },
      },
    );
    setAnimations(
      { state },
      {
        animations: {
          items: {
            "character-idle": {
              id: "character-idle",
              type: "animation",
              name: "Idle",
              animation: {
                type: "update",
              },
            },
            "character-enter": {
              id: "character-enter",
              type: "animation",
              name: "Enter",
              animation: {
                type: "transition",
              },
            },
          },
          tree: [{ id: "character-idle" }, { id: "character-enter" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
            animations: {
              resourceId: "character-enter",
            },
          },
        ],
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.defaultValues.characters[0]).toMatchObject({
      id: "character-hero",
      animationMode: "transition",
      animationId: "character-enter",
    });
    expect(viewData.defaultValues.animationOptions).toEqual([
      {
        value: "character-idle",
        label: "Idle",
        suffixText: "Update",
      },
      {
        value: "character-enter",
        label: "Enter",
        suffixText: "Transition",
      },
    ]);
  });

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
        backgroundColor: "bg",
      },
      {
        id: "face",
        name: "Face",
        selectedSpriteId: undefined,
        selectedSpriteName: "No sprite",
        hasSelection: false,
        backgroundColor: "bg",
      },
    ]);
  });

  it("displays selected characters in reverse order while preserving source indices", () => {
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
            },
            "character-rival": {
              id: "character-rival",
              type: "character",
              name: "Rival",
            },
          },
          tree: [{ id: "character-hero" }, { id: "character-rival" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-hero",
          },
          {
            id: "character-rival",
          },
        ],
      },
    );

    const viewData = selectViewData({ state });

    expect(
      viewData.selectedCharacters.map((character) => character.id),
    ).toEqual(["character-hero", "character-rival"]);
    expect(
      viewData.defaultValues.characters.map((character) => ({
        id: character.id,
        characterIndex: character.characterIndex,
      })),
    ).toEqual([
      {
        id: "character-rival",
        characterIndex: 1,
      },
      {
        id: "character-hero",
        characterIndex: 0,
      },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        characterIndex: 0,
      },
    );
    expect(state.dropdownMenu.items).toEqual([
      { label: "Move Up", type: "item", value: "move-up" },
      { label: "Delete", type: "item", value: "delete" },
    ]);

    moveCharacter({ state }, { index: 0, offset: 1 });
    expect(state.selectedCharacters.map((character) => character.id)).toEqual([
      "character-rival",
      "character-hero",
    ]);
    expect(
      selectViewData({ state }).defaultValues.characters.map((character) => ({
        id: character.id,
        characterIndex: character.characterIndex,
      })),
    ).toEqual([
      {
        id: "character-hero",
        characterIndex: 1,
      },
      {
        id: "character-rival",
        characterIndex: 0,
      },
    ]);
  });

  it("normalizes character opacity and blur controls", () => {
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
            opacity: "0.6",
            blur: {
              x: "7",
              y: "8",
              quality: "4",
              kernelSize: 12,
              repeatEdgePixels: "false",
            },
          },
        ],
      },
    );

    let selectedCharacter = state.selectedCharacters[0];
    expect(selectedCharacter.opacity).toBe(0.6);
    expect(selectedCharacter.blur).toEqual({
      x: 7,
      y: 8,
      quality: 4,
      kernelSize: 11,
      repeatEdgePixels: false,
    });

    let viewData = selectViewData({ state });
    expect(viewData.defaultValues.characters[0]).toMatchObject({
      opacity: 0.6,
      blurEnabled: true,
      blur: {
        x: 7,
        y: 8,
        quality: 4,
        kernelSize: 11,
        repeatEdgePixels: false,
      },
    });
    expect(viewData.defaultValues.blurRepeatEdgeOptions).toEqual([
      { value: false, label: "No" },
      { value: true, label: "Yes" },
    ]);

    updateCharacterOpacity({ state }, { index: 0, opacity: "-1" });
    expect(state.selectedCharacters[0].opacity).toBe(0);

    updateCharacterBlurEnabled({ state }, { index: 0, enabled: false });
    expect(state.selectedCharacters[0].blur).toBeUndefined();

    updateCharacterBlurEnabled({ state }, { index: 0, enabled: true });
    updateCharacterBlurField(
      { state },
      {
        index: 0,
        fieldName: "repeatEdgePixels",
        value: false,
      },
    );

    selectedCharacter = state.selectedCharacters[0];
    expect(selectedCharacter.blur).toEqual({
      x: 6,
      y: 9,
      quality: 3,
      kernelSize: 9,
      repeatEdgePixels: false,
    });

    viewData = selectViewData({ state });
    expect(viewData.defaultValues.characters[0]).toMatchObject({
      opacity: 0,
      blurEnabled: true,
      blur: selectedCharacter.blur,
    });
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
    expect(
      viewData.defaultValues.characters[0].spriteGroupBoxes.map(
        (spriteGroupBox) => spriteGroupBox.backgroundColor,
      ),
    ).toEqual(["mu", "mu"]);
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
