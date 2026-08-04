import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  removeCharacterBlurOption,
  removeCharacterOpacityOption,
  selectCharacterBlurOptionEnabled,
  selectCharacterOpacityOptionEnabled,
  selectViewData,
  setAnimations,
  setExistingCharacters,
  setItems,
  showCharacterBlurOption,
  showCharacterOpacityOption,
} from "../../src/components/commandLineCharacters/commandLineCharacters.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("commandLineCharacters sections", () => {
  it("creates a named form section for each displayed character", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        items: {
          items: {
            hero: { id: "hero", type: "character", name: "Hero" },
            rival: { id: "rival", type: "character", name: "Rival" },
          },
          tree: [{ id: "hero" }, { id: "rival" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [{ id: "hero" }, { id: "rival" }],
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(
      viewData.form.fields.map((section) => ({
        id: section.id,
        label: section.label,
        rows: section.fields.map((field) =>
          field.type === "row"
            ? field.fields.map((nestedField) => nestedField.slot)
            : field.slot,
        ),
      })),
    ).toEqual([
      {
        id: "character-1",
        label: "Rival",
        rows: [
          ["character-1-sprite", "character-1-sprite-spacer"],
          ["character-1-transform-mode", "character-1-predefined-transform"],
          "character-1-animation",
        ],
      },
      {
        id: "character-0",
        label: "Hero",
        rows: [
          ["character-0-sprite", "character-0-sprite-spacer"],
          ["character-0-transform-mode", "character-0-predefined-transform"],
          "character-0-animation",
        ],
      },
    ]);
    expect(viewData.formKey).toBe(
      "1:rival:Rival:preset-transform:no-animation:none:no-opacity:no-blur-option:no-blur:no-groups|0:hero:Hero:preset-transform:no-animation:none:no-opacity:no-blur-option:no-blur:no-groups",
    );
    expect(
      viewData.defaultValues.characters.map(
        (character) => character.spriteFormSlot,
      ),
    ).toEqual(["character-1-sprite", "character-0-sprite"]);
  });

  it("matches the dialogue sprite animation row layout", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        items: {
          items: {
            hero: { id: "hero", type: "character", name: "Hero" },
          },
          tree: [{ id: "hero" }],
        },
      },
    );
    setAnimations(
      { state },
      {
        animations: {
          items: {
            idle: {
              id: "idle",
              type: "animation",
              name: "Idle",
              animation: { type: "update" },
            },
          },
          tree: [{ id: "idle" }],
        },
      },
    );
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "hero",
            animations: { resourceId: "idle" },
          },
        ],
      },
    );

    const [section] = selectViewData({ state, i18n: EN_I18N }).form.fields;
    const rows = section.fields.map((field) =>
      field.type === "row"
        ? field.fields.map((nestedField) => nestedField.slot)
        : field.slot,
    );

    expect(rows).toEqual([
      ["character-0-sprite", "character-0-sprite-spacer"],
      ["character-0-transform-mode", "character-0-predefined-transform"],
      "character-0-animation",
      ["character-0-playback-speed", "character-0-playback-continuity"],
      ["character-0-playback-loop", "character-0-playback-loop-spacer"],
    ]);
  });

  it("adds opacity and blur through individual character options", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        items: {
          items: {
            hero: { id: "hero", type: "character", name: "Hero" },
          },
          tree: [{ id: "hero" }],
        },
      },
    );
    setExistingCharacters({ state }, { characters: [{ id: "hero" }] });

    let [section] = selectViewData({ state, i18n: EN_I18N }).form.fields;
    expect(section.action).toMatchObject({ id: "add", icon: "plus" });
    expect(section.fields.map((field) => field.id).filter(Boolean)).toEqual([]);

    showCharacterOpacityOption({ state }, { index: 0 });
    expect(selectCharacterOpacityOptionEnabled({ state }, { index: 0 })).toBe(
      true,
    );
    [section] = selectViewData({ state, i18n: EN_I18N }).form.fields;
    expect(section.action).toMatchObject({ id: "add", icon: "plus" });
    expect(section.fields.at(-1)).toMatchObject({
      type: "slot",
      slot: "character-0-opacity",
    });

    showCharacterBlurOption({ state }, { index: 0 });
    expect(selectCharacterBlurOptionEnabled({ state }, { index: 0 })).toBe(
      true,
    );
    [section] = selectViewData({ state, i18n: EN_I18N }).form.fields;
    expect(section.action).toBeUndefined();
    expect(section.fields.at(-1)).toMatchObject({
      type: "section",
      id: "character-0-blur",
      label: "Blur",
      separator: false,
      action: { id: "remove", icon: "x" },
      fields: [
        {
          type: "row",
          fields: [
            { slot: "character-0-blur-x", label: "Blur X" },
            { slot: "character-0-blur-y", label: "Blur Y" },
          ],
        },
        {
          type: "row",
          fields: [
            { slot: "character-0-blur-quality", label: "Quality" },
            { slot: "character-0-blur-kernel-size", label: "Kernel Size" },
          ],
        },
        {
          slot: "character-0-blur-repeat-edge-pixels",
          label: "Repeat Edge Pixels",
        },
      ],
    });

    removeCharacterOpacityOption({ state }, { index: 0 });
    removeCharacterBlurOption({ state }, { index: 0 });
    expect(selectCharacterOpacityOptionEnabled({ state }, { index: 0 })).toBe(
      false,
    );
    expect(selectCharacterBlurOptionEnabled({ state }, { index: 0 })).toBe(
      false,
    );
    expect(state.selectedCharacters[0].opacity).toBeUndefined();
    expect(state.selectedCharacters[0].blur).toBeNull();
  });

  it("renders each character row through its matching form section slot", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineCharacters/commandLineCharacters.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rtgl-form#form key=${formKey}");
    expect(view).toContain("handler: handleFormSectionAction");
    expect(view).toMatch(
      /characterSpriteBox\*:[\s\S]*?contextmenu:[\s\S]*?handler: handleCharacterContextMenu/,
    );
    expect(view).toContain("slot=${character.spriteFormSlot}");
    expect(view).toContain("slot=${character.transformModeFormSlot}");
    expect(view).toContain("slot=${character.predefinedTransformFormSlot}");
    expect(view).toContain("slot=${character.customTransformFormSlot}");
    expect(view).toContain("slot=${character.animationFormSlot}");
    expect(view).toContain("slot=${character.playbackSpeedFormSlot}");
    expect(view).toContain("rtgl-slider-input#animationPlaybackSpeed${i}");
    expect(view).not.toContain("slot=characters");
  });
});
