import { describe, expect, it } from "vitest";
import { parseAndRender } from "jempl";
import {
  createInitialState,
  setCharacterName,
  setCharacterSpriteEnabled,
  setCustomCharacterName,
  selectViewData,
  setPersistCharacter,
  setSelectedCharacterId,
  setSelectedSpriteIds,
  setSpriteAnimationId,
  setSpriteAnimationMode,
  setSpriteTransformId,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.store.js";

const isFieldVisible = ({ field, values }) => {
  const rendered = parseAndRender(
    {
      fields: [
        {
          [`$if ${field.$when}`]: {
            name: field.name,
          },
        },
      ],
    },
    {
      values,
    },
  );

  return rendered.fields.some(
    (renderedField) => renderedField.name === field.name,
  );
};

describe("commandLineDialogueBox.store", () => {
  it("includes custom speaker name and persistCharacter in form defaults and field values", () => {
    const state = createInitialState();

    setCustomCharacterName(
      { state },
      {
        customCharacterName: true,
      },
    );
    setCharacterName(
      { state },
      {
        characterName: "Boss",
      },
    );
    setPersistCharacter(
      { state },
      {
        persistCharacter: true,
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        layouts: [
          {
            id: "layout-adv",
            name: "ADV Layout",
            layoutType: "dialogue-adv",
          },
        ],
        characters: [],
      },
    });

    expect(viewData.defaultValues.customCharacterName).toBe(true);
    expect(viewData.defaultValues.characterName).toBe("Boss");
    expect(viewData.defaultValues.persistCharacter).toBe(true);
    expect(
      viewData.form.fields.find((field) => field.name === "mode"),
    ).toMatchObject({
      label: "Mode",
    });
    expect(
      viewData.form.fields.find((field) => field.name === "resourceId"),
    ).toMatchObject({
      label: "Layout",
    });
    expect(
      viewData.form.fields.find((field) => field.name === "characterId"),
    ).toMatchObject({
      label: "Speaker",
      placeholder: "Choose a speaker...",
    });
    expect(
      viewData.form.fields.find(
        (field) => field.name === "customCharacterName",
      ),
    ).toMatchObject({
      label: "Custom Speaker Name",
      type: "segmented-control",
      value: true,
    });
    expect(
      viewData.form.fields.find((field) => field.name === "characterName"),
    ).toMatchObject({
      label: "Speaker Name",
      placeholder: "Enter speaker name",
      type: "input-text",
      value: "Boss",
    });
    expect(
      viewData.form.fields.find(
        (field) => field.name === "characterSpriteEnabled",
      ),
    ).toMatchObject({
      label: "Speaker Sprite",
      type: "segmented-control",
      value: false,
    });
    expect(
      viewData.form.fields.find(
        (field) => field.name === "characterSpriteEnabled",
      ),
    ).not.toHaveProperty("$when");
    expect(
      viewData.form.fields.find((field) => field.name === "persistCharacter"),
    ).toMatchObject({
      $when: "values.characterId || values.customCharacterName",
      label: "Persist Speaker",
      type: "segmented-control",
      value: true,
    });
  });

  it("uses one layout label for every dialogue mode", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        layouts: [
          {
            id: "layout-nvl",
            name: "NVL Layout",
            layoutType: "dialogue-nvl",
          },
        ],
        characters: [],
      },
    });

    expect(
      viewData.form.fields.find((field) => field.name === "resourceId"),
    ).toMatchObject({
      label: "Layout",
    });

    state.selectedMode = "nvl";
    const nvlViewData = selectViewData({
      state,
      props: {
        layouts: [
          {
            id: "layout-nvl",
            name: "NVL Layout",
            layoutType: "dialogue-nvl",
          },
        ],
        characters: [],
      },
    });

    expect(
      nvlViewData.form.fields.find((field) => field.name === "resourceId"),
    ).toMatchObject({
      label: "Layout",
    });
  });

  it("shows persistCharacter only for selected characters or enabled custom naming", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        layouts: [
          {
            id: "layout-adv",
            name: "ADV Layout",
            layoutType: "dialogue-adv",
          },
        ],
        characters: [],
      },
    });
    const persistCharacterField = viewData.form.fields.find(
      (field) => field.name === "persistCharacter",
    );

    expect(
      isFieldVisible({
        field: persistCharacterField,
        values: {
          characterId: "",
          customCharacterName: false,
          characterName: "",
        },
      }),
    ).toBe(false);
    expect(
      isFieldVisible({
        field: persistCharacterField,
        values: {
          characterId: "character-1",
          customCharacterName: false,
          characterName: "",
        },
      }),
    ).toBe(true);
    expect(
      isFieldVisible({
        field: persistCharacterField,
        values: {
          characterId: "",
          customCharacterName: true,
          characterName: "Boss",
        },
      }),
    ).toBe(true);
    expect(
      isFieldVisible({
        field: persistCharacterField,
        values: {
          characterId: "",
          customCharacterName: true,
          characterName: "",
        },
      }),
    ).toBe(true);
    expect(
      isFieldVisible({
        field: persistCharacterField,
        values: {
          characterId: "",
          customCharacterName: true,
          characterName: "   ",
        },
      }),
    ).toBe(true);
  });

  it("adds speaker sprite fields for the selected character sprite groups", () => {
    const state = createInitialState();

    setSelectedCharacterId(
      { state },
      {
        characterId: "character-1",
      },
    );
    setCharacterSpriteEnabled(
      { state },
      {
        characterSpriteEnabled: true,
      },
    );
    setSpriteTransformId(
      { state },
      {
        transformId: "portrait-left",
      },
    );
    setSpriteAnimationMode(
      { state },
      {
        mode: "transition",
      },
    );
    setSpriteAnimationId(
      { state },
      {
        animationId: "portrait-in",
      },
    );
    setSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          body: "sprite-body",
          face: "sprite-face",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        layouts: [
          {
            id: "layout-adv",
            name: "ADV Layout",
            layoutType: "dialogue-adv",
          },
        ],
        characters: [
          {
            id: "character-1",
            type: "character",
            name: "Aki",
            spriteGroups: [
              { id: "body", name: "Body" },
              { id: "face", name: "Face", tags: ["face"] },
            ],
            sprites: {
              tree: [{ id: "sprite-body" }, { id: "sprite-face" }],
              items: {
                "sprite-body": {
                  id: "sprite-body",
                  type: "image",
                  name: "Body",
                },
                "sprite-face": {
                  id: "sprite-face",
                  type: "image",
                  name: "Smile",
                  tagIds: ["face"],
                },
              },
            },
          },
        ],
        transforms: {
          tree: [{ id: "portrait-left" }],
          items: {
            "portrait-left": {
              id: "portrait-left",
              type: "transform",
              name: "Portrait Left",
            },
          },
        },
        animations: {
          tree: [{ id: "portrait-in" }],
          items: {
            "portrait-in": {
              id: "portrait-in",
              type: "animation",
              name: "Portrait In",
              animation: {
                type: "transition",
              },
            },
          },
        },
      },
    });

    expect(
      viewData.form.fields.find(
        (field) => field.name === "characterSpriteEnabled",
      ),
    ).toMatchObject({
      label: "Speaker Sprite",
      value: true,
    });
    expect(
      viewData.form.fields.find((field) => field.name === "spriteTransformId"),
    ).toMatchObject({
      options: [{ value: "portrait-left", label: "Portrait Left" }],
      value: "portrait-left",
    });
    expect(
      viewData.form.fields.find(
        (field) => field.name === "transitionSpriteAnimation",
      ),
    ).toMatchObject({
      options: [{ value: "portrait-in", label: "Portrait In" }],
      value: "portrait-in",
    });
    expect(
      viewData.form.fields.find((field) => field.name === "spriteGroup:body"),
    ).toMatchObject({
      label: "Body",
      options: [
        { value: "sprite-body", label: "Body" },
        { value: "sprite-face", label: "Smile" },
      ],
      value: "sprite-body",
    });
    expect(
      viewData.form.fields.find((field) => field.name === "spriteGroup:face"),
    ).toMatchObject({
      label: "Face",
      options: [{ value: "sprite-face", label: "Smile" }],
      value: "sprite-face",
    });
  });
});
