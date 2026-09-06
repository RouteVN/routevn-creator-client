import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import { describe, expect, it } from "vitest";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

const cases = [
  ["imageSelector", "images", "image"],
  ["soundSelector", "sounds", "sound"],
  ["spritesheetSelector", "spritesheets", "spritesheet"],
  ["commandLineVisual", "images", "image", "resource-select"],
  ["commandLineVisual", "videos", "video", "resource-select"],
  ["commandLineVisual", "layouts", "layout", "resource-select"],
  ["commandLineBackground", "layoutItems", "layout", "gallery"],
  ["commandLineBackground", "videoItems", "video", "gallery"],
  ["commandLineBgm", "items", "sound", "gallery"],
  ["commandLineSoundEffects", "items", "sound", "gallery"],
  ["commandLineCharacters", "items", "character", "character-select"],
  ["commandLineDialogueBox", undefined, "character", "character-select"],
  ["commandLineCharacters", "items", "image", "sprite-select"],
  ["commandLineDialogueBox", undefined, "image", "sprite-select"],
];

const folderCollection = () => ({
  items: {
    "folder-1": { id: "folder-1", type: "folder", name: "Folder One" },
    "folder-2": { id: "folder-2", type: "folder", name: "Folder Two" },
  },
  tree: [{ id: "folder-1", children: [{ id: "folder-2", children: [] }] }],
});

const addItem = (collection, type) => {
  collection.items["item-1"] = {
    id: "item-1",
    name: "Item One",
    type,
    layoutType: "general",
    animations: { Idle: { frames: ["frame-1"] } },
  };
  collection.tree[0].children[0].children.push({ id: "item-1" });
};

for (const [name, field, type, mode] of cases) {
  const store = await import(`../../src/components/${name}/${name}.store.js`);
  const view = yaml.load(
    readFileSync(
      new URL(
        `../../src/components/${name}/${name}.view.yaml`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const select = (
    collection,
    isTouchMode,
    searchQuery = "",
    i18n = EN_I18N,
  ) => {
    const state = store.createInitialState();
    const props = { searchQuery, columns: isTouchMode ? 2 : undefined };
    state.isTouchMode = isTouchMode;
    state.searchQuery = searchQuery;
    if (mode) state.mode = mode;
    if (name === "commandLineVisual" || name === "commandLineBackground") {
      state.tab = type;
    }
    if (mode === "sprite-select") {
      const character = {
        id: "character-1",
        type: "character",
        name: "Character One",
        sprites: collection,
      };
      if (name === "commandLineCharacters") {
        state.items = {
          items: { "character-1": character },
          tree: [{ id: "character-1" }],
        };
        state.selectedCharacters = [{ id: "character-1", sprites: [] }];
        state.selectedCharacterIndex = 0;
      } else {
        props.characters = [character];
        state.spriteCharacterId = "character-1";
      }
    } else if (field) {
      state[field] = collection;
    } else {
      props.characters = Object.values(collection.items);
      props.characterTree = collection.tree;
    }
    const data = store.selectViewData({ state, props, i18n });
    const message =
      mode === "sprite-select"
        ? data.spriteSelectorEmptyMessage
        : data.selectorEmptyMessage;
    return {
      message,
      rendered: JSON.stringify(parseAndRender(view.template, data)),
    };
  };

  describe(`${name} ${type} ${mode ?? "selector"} empty state`, () => {
    for (const isTouchMode of [false, true]) {
      const device = isTouchMode ? "mobile" : "desktop";
      it(`shows a message for empty and folder-only collections on ${device}`, () => {
        for (const collection of [
          { items: {}, tree: [] },
          folderCollection(),
        ]) {
          const result = select(collection, isTouchMode);
          expect(result.message).toBe(
            EN_I18N.resourcePages.selectorEmptyMessage,
          );
          expect(result.rendered).toContain(result.message);
          expect(result.rendered).not.toContain("data-group-id=");
        }
      });

      it(`distinguishes selectable items from filtered results on ${device}`, () => {
        const collection = folderCollection();
        addItem(collection, type);
        const populated = select(collection, isTouchMode);
        expect(populated.message).toBeUndefined();
        expect(populated.rendered).toContain("Item One");
        expect(populated.rendered).not.toContain(
          EN_I18N.resourcePages.selectorEmptyMessage,
        );

        const filtered = select(collection, isTouchMode, "missing item");
        expect(filtered.message).toBe(
          EN_I18N.resourcePages.selectorNoResultsMessage,
        );
        expect(filtered.rendered).toContain(filtered.message);
        expect(filtered.rendered).not.toContain("Item One");
      });
    }

    it("uses localized empty and search messages", () => {
      for (const i18n of [JA_I18N, ZH_HANS_I18N]) {
        expect(select(folderCollection(), false, "", i18n).message).toBe(
          i18n.resourcePages.selectorEmptyMessage,
        );
        expect(
          select(folderCollection(), false, "missing item", i18n).message,
        ).toBe(i18n.resourcePages.selectorNoResultsMessage);
      }
    });

    if (type === "spritesheet" || type === "layout") {
      it("shows the empty message when existing resources are not selectable", () => {
        const collection = folderCollection();
        addItem(collection, type);
        collection.items["item-1"].animations = {};
        collection.items["item-1"].layoutType = "dialogue-adv";
        const result = select(collection, true);
        expect(result.message).toBe(EN_I18N.resourcePages.selectorEmptyMessage);
        expect(result.rendered).toContain(result.message);
      });
    }
  });
}
