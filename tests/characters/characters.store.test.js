import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  createInitialState,
  openEditDialog,
  openSpriteGroupDialog,
  selectViewData,
  setItems,
  showSpriteGroupDropdownMenu,
} from "../../src/pages/characters/characters.store.js";

describe("characters store sprite group tags", () => {
  it("marks groups that contain child folders", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        charactersData: {
          items: {
            parentFolder: {
              id: "parentFolder",
              type: "folder",
              name: "Parent",
            },
            childFolder: {
              id: "childFolder",
              type: "folder",
              name: "Child",
            },
          },
          tree: [
            {
              id: "parentFolder",
              children: [{ id: "childFolder" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const parentGroup = viewData.flatGroups.find(
      (group) => group.id === "parentFolder",
    );
    const childGroup = viewData.flatGroups.find(
      (group) => group.id === "childFolder",
    );

    expect(parentGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
      }),
    );
    expect(childGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
      }),
    );
  });

  it("orders sprite groups with the top rendered group first", () => {
    const state = createInitialState();

    state.spriteTagsByCharacterId = {
      "character-hero": {
        items: {
          "sprite-tag-body": {
            id: "sprite-tag-body",
            type: "tag",
            name: "Body",
          },
          "sprite-tag-face": {
            id: "sprite-tag-face",
            type: "tag",
            name: "Face",
          },
        },
        tree: [{ id: "sprite-tag-body" }, { id: "sprite-tag-face" }],
      },
    };
    state.charactersData = {
      items: {
        "character-hero": {
          id: "character-hero",
          type: "character",
          name: "Hero",
          spriteGroups: [
            {
              id: "group-body",
              name: "Body",
              tags: ["sprite-tag-body"],
            },
            {
              id: "group-face",
              name: "Face",
              tags: ["sprite-tag-face"],
            },
          ],
        },
      },
      tree: [{ id: "character-hero" }],
    };
    state.selectedItemId = "character-hero";
    openEditDialog(
      { state },
      {
        itemId: "character-hero",
        spriteGroups: state.charactersData.items["character-hero"].spriteGroups,
      },
    );

    expect(state.editSpriteGroups.map((group) => group.id)).toEqual([
      "group-face",
      "group-body",
    ]);

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.spriteGroupsLabel).toBe("Sprite Groups");
    expect(viewData.spritesButtonLabel).toBe("Sprites");
    expect(viewData.selectedItemSpriteGroups.map((group) => group.id)).toEqual([
      "group-face",
      "group-body",
    ]);
    expect(viewData.editSpriteGroups.map((group) => group.id)).toEqual([
      "group-face",
      "group-body",
    ]);

    showSpriteGroupDropdownMenu(
      { state },
      {
        target: "edit",
        index: 0,
        items: [
          {
            label: EN_I18N.resourcePages.moveDownMenuItem,
            type: "item",
            value: "move-down",
          },
          {
            label: EN_I18N.resourcePages.removeMenuItem,
            type: "item",
            value: "remove",
          },
        ],
      },
    );
    expect(state.spriteGroupDropdownMenu.items).toEqual([
      {
        label: EN_I18N.resourcePages.moveDownMenuItem,
        type: "item",
        value: "move-down",
      },
      {
        label: EN_I18N.resourcePages.removeMenuItem,
        type: "item",
        value: "remove",
      },
    ]);

    showSpriteGroupDropdownMenu(
      { state },
      {
        target: "edit",
        index: 1,
        items: [
          {
            label: EN_I18N.resourcePages.moveUpMenuItem,
            type: "item",
            value: "move-up",
          },
          {
            label: EN_I18N.resourcePages.removeMenuItem,
            type: "item",
            value: "remove",
          },
        ],
      },
    );
    expect(state.spriteGroupDropdownMenu.items).toEqual([
      {
        label: EN_I18N.resourcePages.moveUpMenuItem,
        type: "item",
        value: "move-up",
      },
      {
        label: EN_I18N.resourcePages.removeMenuItem,
        type: "item",
        value: "remove",
      },
    ]);
  });

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
          nameVariableId: "playerName",
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
    state.variablesData = {
      items: {
        playerName: {
          id: "playerName",
          type: "variable",
          variableType: "string",
          name: "Player Name",
        },
        score: {
          id: "score",
          type: "variable",
          variableType: "number",
          name: "Score",
        },
      },
      tree: [{ id: "playerName" }, { id: "score" }],
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
    openSpriteGroupDialog(
      { state },
      {
        target: "edit",
        index: 0,
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.tagFilterOptions).toEqual([
      {
        label: "Main Cast",
        value: "character-tag-main",
      },
    ]);
    expect(viewData.dialogForm.fields[5]).toMatchObject({
      name: "nameVariableId",
      type: "select",
      description:
        "Set this only if you want the speaker display to come from a variable instead of fixed name.",
      options: [
        {
          label: "Player Name",
          value: "playerName",
        },
      ],
    });
    expect(viewData.dialogForm.fields[3]).toMatchObject({
      name: "tagIds",
      type: "tag-select",
      options: [
        {
          label: "Main Cast",
          value: "character-tag-main",
        },
      ],
    });
    expect(viewData.editForm.fields[6]).toMatchObject({
      name: "nameVariableId",
      type: "select",
      description:
        "Set this only if you want the speaker display to come from a variable instead of fixed name.",
      options: [
        {
          label: "Player Name",
          value: "playerName",
        },
      ],
    });
    expect(viewData.editForm.fields[3]).toMatchObject({
      name: "tagIds",
      type: "tag-select",
      options: [
        {
          label: "Main Cast",
          value: "character-tag-main",
        },
      ],
    });
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
    expect(viewData.spriteGroupDialogForm.fields[1]).toMatchObject({
      name: "tags",
      type: "tag-select",
      options: [
        {
          label: "Smile",
          value: "sprite-tag-smile",
        },
      ],
    });
    expect(viewData.spriteGroupDialogDefaultValues).toEqual({
      name: "Face",
      tags: ["sprite-tag-smile"],
    });
    expect(viewData.spriteGroupDialogForm.title).toBe("Edit Sprite Group");
    expect(viewData.spriteGroupDialogForm.actions.buttons[0].label).toBe(
      "Update Group",
    );
    expect(viewData.editDefaultValues.nameVariableId).toBe("playerName");
    expect(viewData.detailFields).toContainEqual({
      type: "text",
      label: "Name Variable",
      value: "Player Name",
    });
  });
});
