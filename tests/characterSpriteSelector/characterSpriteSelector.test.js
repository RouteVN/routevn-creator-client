import { produce } from "immer";
import { describe, expect, it } from "vitest";
import * as selectorStore from "../../src/components/characterSpriteSelector/characterSpriteSelector.store.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const sprite = (id, name, tagIds) => ({
  id,
  type: "image",
  name,
  fileId: `file-${id}`,
  tagIds,
});

// Character One has a body and a face, the face on top; Character Two has no
// sprite groups.
const charactersData = {
  tree: [{ id: "character-1" }, { id: "character-2" }],
  items: {
    "character-1": {
      id: "character-1",
      type: "character",
      name: "Character One",
      spriteGroups: [
        { id: "body", name: "Body", tags: ["tag-body"] },
        { id: "face", name: "Face", tags: ["tag-face"] },
      ],
      sprites: {
        tree: [
          { id: "sprite-smile" },
          { id: "sprite-body" },
          { id: "sprite-frown" },
          { id: "sprite-uniform" },
        ],
        items: {
          "sprite-smile": sprite("sprite-smile", "Smile", ["tag-face"]),
          "sprite-body": sprite("sprite-body", "Body", ["tag-body"]),
          "sprite-frown": sprite("sprite-frown", "Frown", ["tag-face"]),
          "sprite-uniform": sprite("sprite-uniform", "Uniform", ["tag-body"]),
        },
      },
    },
    "character-2": {
      id: "character-2",
      type: "character",
      name: "Character Two",
      sprites: {
        tree: [{ id: "sprite-wave" }],
        items: { "sprite-wave": sprite("sprite-wave", "Wave") },
      },
    },
  },
};

const createSelector = (props = {}) => {
  let state = selectorStore.createInitialState();
  const run = (name, payload) => {
    state = produce(state, (draft) => {
      selectorStore[name]({ state: draft }, payload);
    });
  };
  run("loadSelection", { charactersData, ...props });
  return {
    run,
    view: () => selectorStore.selectViewData({ state, i18n: EN_I18N }),
    selection: () => selectorStore.selectSelection({ state }),
  };
};

const listedIds = (view) =>
  view.groups.flatMap((group) => group.children.map((item) => item.id));

const selectedIds = (view) =>
  view.groups.flatMap((group) =>
    group.children
      .filter((item) => item.itemBorderColor === "pr")
      .map((item) => item.id),
  );

describe("rvn-character-sprite-selector", () => {
  it("lists the characters as the scene editor's character picker does", () => {
    const selector = createSelector();

    expect(selector.view()).toMatchObject({
      step: "characters",
      showFileExplorer: true,
      previewStyle: "width: 200px; height: 120px;",
    });
    expect(selector.view().groups[0]).toMatchObject({
      fullLabel: "Ungrouped",
      children: [
        // Without an avatar, the card says so.
        {
          id: "character-1",
          name: "Character One",
          previewKind: undefined,
          emptyPreviewLabel: "No Avatar",
        },
        { id: "character-2", name: "Character Two" },
      ],
    });
    expect(selector.selection()).toBeUndefined();

    selector.run("setSearchQuery", { value: " TWO " });
    expect(listedIds(selector.view())).toEqual(["character-2"]);

    // Touch layouts drop the folder list and show two cards a row.
    selector.run("setUiConfig", { uiConfig: { id: "touch" } });
    expect(selector.view()).toMatchObject({
      showFileExplorer: false,
      gridStyle: expect.stringContaining("repeat(2,"),
    });
  });

  it("picks a character, starting with the first sprite of each group", () => {
    const selector = createSelector();
    selector.run("pickCharacter", { characterId: "character-1" });

    expect(selector.view()).toMatchObject({
      step: "sprites",
      characterName: "Character One",
      showGroupTabs: true,
      // The tabs list the groups top first, and the top group is picked
      // first.
      groupTabs: [
        { id: "face", label: "Face" },
        { id: "body", label: "Body" },
      ],
      selectedGroupId: "face",
    });
    // A group lists only the sprites with its tags.
    expect(listedIds(selector.view())).toEqual([
      "sprite-smile",
      "sprite-frown",
    ]);
    expect(selectedIds(selector.view())).toEqual(["sprite-smile"]);
    // Saved in drawing order, the first at the bottom.
    expect(selector.selection()).toEqual({
      characterId: "character-1",
      sprites: [
        { id: "body", resourceId: "sprite-body" },
        { id: "face", resourceId: "sprite-smile" },
      ],
    });
  });

  it("picks a sprite for the selected group", () => {
    const selector = createSelector();
    selector.run("pickCharacter", { characterId: "character-1" });

    selector.run("pickSprite", { spriteId: "sprite-frown" });
    selector.run("setSelectedGroupId", { groupId: "body" });
    expect(listedIds(selector.view())).toEqual([
      "sprite-body",
      "sprite-uniform",
    ]);
    expect(selectedIds(selector.view())).toEqual(["sprite-body"]);
    selector.run("pickSprite", { spriteId: "sprite-uniform" });

    expect(selector.selection().sprites).toEqual([
      { id: "body", resourceId: "sprite-uniform" },
      { id: "face", resourceId: "sprite-frown" },
    ]);
  });

  it("opens on a saved pick, keeps it for the same character, and starts over for another", () => {
    const saved = {
      characterId: "character-1",
      sprites: [
        { id: "body", resourceId: "sprite-uniform" },
        { id: "face", resourceId: "sprite-frown" },
      ],
    };
    const selector = createSelector(saved);
    expect(selector.view().step).toBe("sprites");
    expect(selector.selection()).toEqual(saved);

    selector.run("showCharacters");
    expect(selector.view().step).toBe("characters");
    expect(selectedIds(selector.view())).toEqual(["character-1"]);
    selector.run("pickCharacter", { characterId: "character-1" });
    expect(selector.selection()).toEqual(saved);

    // A character without sprite groups has one, which needs no tabs.
    selector.run("showCharacters");
    selector.run("pickCharacter", { characterId: "character-2" });
    expect(selector.selection()).toEqual({
      characterId: "character-2",
      sprites: [{ id: "base", resourceId: "sprite-wave" }],
    });
    expect(selector.view()).toMatchObject({
      showGroupTabs: false,
      groupTabs: [{ id: "base", label: "Sprite" }],
    });
    expect(listedIds(selector.view())).toEqual(["sprite-wave"]);
  });

  it("shows the characters, then the picked character's sprites under a back button", () => {
    const template =
      "src/components/characterSpriteSelector/characterSpriteSelector.view.yaml";
    const selector = createSelector();

    const charactersHtml = renderViewYaml(template, selector.view());
    expect(charactersHtml).toContain("Characters");
    expect(charactersHtml).toContain('data-item-id="character-2"');
    expect(charactersHtml).toContain("No Avatar");
    expect(charactersHtml).toContain("rvn-base-file-explorer");
    expect(charactersHtml).not.toContain("backButton");

    selector.run("pickCharacter", { characterId: "character-1" });
    const spritesHtml = renderViewYaml(template, selector.view());
    // Back is a square icon button, with no text.
    const backButton = spritesHtml.match(
      /<rtgl-button[^>]*id="backButton"[^>]*>(.*?)<\/rtgl-button>/,
    );
    expect(backButton[0]).toContain('pre="chevronLeft"');
    expect(backButton[0]).toContain('aria-label="Characters"');
    expect(backButton[0]).toMatch(/ sq[ =>]/);
    expect(backButton[1]).toBe("");
    expect(spritesHtml).toContain("Character One");
    expect(spritesHtml).toContain("rtgl-tabs");
    expect(spritesHtml).toContain('fileId="file-sprite-smile"');
    expect(spritesHtml).not.toContain("rvn-stacked-file-images");
  });
});
