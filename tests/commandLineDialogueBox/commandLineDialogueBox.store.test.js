import { describe, expect, it } from "vitest";
import { parseAndRender } from "jempl";
import {
  createInitialState,
  setAppendDialogue,
  setCharacterName,
  setCustomCharacterName,
  selectViewData,
  setPersistCharacter,
  setSelectedSpriteIds,
  setSpriteCharacterId,
  setSpriteAnimationId,
  setSpriteAnimationMode,
  setSpriteTransformId,
  setCustomizeTextSpeed,
  setTextSpeed,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.store.js";
import { EN_I18N } from "../support/i18n.js";

const selectTestViewData = ({ state, props }) =>
  selectViewData({ state, props, i18n: EN_I18N });

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

    const viewData = selectTestViewData({
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
    expect(viewData.defaultValues.append).toBe(false);
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
      viewData.form.fields.find((field) => field.slot === "characterSprite"),
    ).toMatchObject({
      label: "Speaker sprite",
      type: "slot",
      tooltip: {
        content:
          "Speaker's face that appears on top of the dialogue box. For body sprites use the Characters action",
      },
    });
    expect(
      viewData.form.fields.find((field) => field.name === "append"),
    ).toMatchObject({
      $when: 'values.mode == "adv"',
      label: "Append",
      type: "segmented-control",
      value: false,
    });
    expect(
      viewData.form.fields.find(
        (field) => field.name === "characterSpriteEnabled",
      ),
    ).toBeUndefined();
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

    const viewData = selectTestViewData({
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
    const nvlViewData = selectTestViewData({
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

  it("tracks append in form defaults and field values", () => {
    const state = createInitialState();

    setAppendDialogue(
      { state },
      {
        append: true,
      },
    );

    const viewData = selectTestViewData({
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

    expect(viewData.appendDialogue).toBe(true);
    expect(viewData.defaultValues.append).toBe(true);
    expect(
      viewData.form.fields.find((field) => field.name === "append"),
    ).toMatchObject({
      label: "Append",
      type: "segmented-control",
      value: true,
    });
  });

  it("exposes optional text speed controls with no override by default", () => {
    const state = createInitialState();

    const viewData = selectTestViewData({
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

    const customizeTextSpeedField = viewData.form.fields.find(
      (field) => field.name === "customizeTextSpeed",
    );
    const textSpeedField = viewData.form.fields.find(
      (field) => field.name === "textSpeed",
    );

    expect(viewData.customizeTextSpeed).toBe(false);
    expect(viewData.textSpeed).toBe(75);
    expect(viewData.defaultValues.customizeTextSpeed).toBe(false);
    expect(viewData.defaultValues.textSpeed).toBe(75);
    expect(customizeTextSpeedField).toMatchObject({
      label: "Customize Text Speed",
      type: "segmented-control",
      value: false,
      options: [
        { value: false, label: "No" },
        { value: true, label: "Yes" },
      ],
    });
    expect(textSpeedField).toMatchObject({
      $when: "values.customizeTextSpeed == true",
      label: "Text Speed",
      type: "slider-with-input",
      min: 0,
      max: 100,
      step: 1,
      value: 75,
    });
    expect(
      isFieldVisible({
        field: textSpeedField,
        values: {
          customizeTextSpeed: false,
          textSpeed: 75,
        },
      }),
    ).toBe(false);
    expect(
      isFieldVisible({
        field: textSpeedField,
        values: {
          customizeTextSpeed: true,
          textSpeed: 75,
        },
      }),
    ).toBe(true);
  });

  it("normalizes text speed values to the supported 0 to 100 range", () => {
    const state = createInitialState();

    setCustomizeTextSpeed({ state }, { customizeTextSpeed: true });
    setTextSpeed({ state }, { textSpeed: 150 });

    expect(state.textSpeed).toBe(100);
    expect(
      selectTestViewData({ state, props: { layouts: [], characters: [] } }),
    )
      .toMatchObject({
        defaultValues: {
          customizeTextSpeed: true,
          textSpeed: 100,
        },
      });
  });

  it("shows persistCharacter only for selected characters or enabled custom naming", () => {
    const state = createInitialState();
    const viewData = selectTestViewData({
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

  it("exposes one visual character sprite picker with transform and sprite data", () => {
    const state = createInitialState();

    setSpriteCharacterId(
      { state },
      {
        characterId: "character-1",
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

    const viewData = selectTestViewData({
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
      viewData.form.fields.find((field) => field.slot === "characterSprite"),
    ).toMatchObject({
      label: "Speaker sprite",
      type: "slot",
      tooltip: {
        content:
          "Speaker's face that appears on top of the dialogue box. For body sprites use the Characters action",
      },
    });
    expect(viewData.hasSpriteCharacter).toBe(true);
    expect(viewData.characterSpriteEnabled).toBe(true);
    expect(viewData.spriteCharacterId).toBe("character-1");
    expect(viewData.spriteTransformId).toBe("portrait-left");
    expect(viewData.spriteAnimationMode).toBe("transition");
    expect(viewData.spriteAnimationId).toBe("portrait-in");
    expect(viewData.transformOptions).toEqual([
      { value: "portrait-left", label: "Portrait Left" },
    ]);
    expect(viewData.transitionAnimationOptions).toEqual([
      { value: "portrait-in", label: "Portrait In" },
    ]);
    expect(viewData.selectedSpriteCharacter).toMatchObject({
      id: "character-1",
      displayName: "Aki",
      showSpriteGroupBoxes: true,
      spriteGroupBoxes: [
        {
          id: "body",
          name: "Body",
          selectedSpriteId: "sprite-body",
          backgroundColor: "mu",
        },
        {
          id: "face",
          name: "Face",
          selectedSpriteId: "sprite-face",
          backgroundColor: "mu",
        },
      ],
    });
  });

  it("clears the selected sprite animation when animation mode changes", () => {
    const state = createInitialState();

    setSpriteAnimationMode({ state }, { mode: "update" });
    setSpriteAnimationId({ state }, { animationId: "portrait-update" });
    setSpriteAnimationMode({ state }, { mode: "transition" });

    expect(state.spriteAnimationMode).toBe("transition");
    expect(state.spriteAnimationId).toBe("");
  });
});
