import { describe, expect, it } from "vitest";
import { parseAndRender } from "jempl";
import {
  createInitialState,
  setAppendDialogue,
  setCharacterName,
  setCustomCharacterName,
  selectViewData,
  setPersistCharacter,
  setPersistSprite,
  setSelectedSpriteIds,
  setSpriteCharacterId,
  setSpriteAnimationId,
  setSpriteAnimationMode,
  setSpriteTransformId,
  setCustomizeTextSpeed,
  setTextSpeed,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.store.js";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

const selectTestViewData = ({ state, props }) =>
  selectViewData({ state, props, i18n: EN_I18N });

const flattenFormFields = (fields = []) =>
  fields.flatMap((field) => [
    field,
    ...(Array.isArray(field.fields) ? flattenFormFields(field.fields) : []),
  ]);

const findFormField = (viewData, predicate) =>
  flattenFormFields(viewData.form.fields).find(predicate);

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
      findFormField(viewData, (field) => field.name === "mode"),
    ).toBeUndefined();
    expect(
      findFormField(viewData, (field) => field.name === "resourceId"),
    ).toMatchObject({
      label: "Layout",
    });
    expect(
      findFormField(viewData, (field) => field.name === "characterId"),
    ).toMatchObject({
      label: "Character",
      placeholder: "Choose a character...",
    });
    expect(
      findFormField(viewData, (field) => field.name === "customCharacterName"),
    ).toMatchObject({
      label: "Custom name",
      type: "segmented-control",
      value: true,
    });
    expect(
      findFormField(viewData, (field) => field.name === "characterName"),
    ).toMatchObject({
      label: "Speaker Name",
      placeholder: "Enter speaker name",
      type: "input-text",
      value: "Boss",
    });
    const characterSpriteField = findFormField(
      viewData,
      (field) => field.slot === "characterSprite",
    );
    expect(characterSpriteField).toEqual({
      label: "Dialogue sprite",
      name: "characterSprite",
      slot: "characterSprite",
      tooltip: {
        content:
          "Speaker's face that appears on top of the dialogue box. For body sprites use the Character Sprites action",
      },
      type: "slot",
    });
    const characterSpriteRow = viewData.form.fields[1].fields.find((field) => {
      return field.fields?.includes(characterSpriteField);
    });
    expect(
      isFieldVisible({
        field: characterSpriteRow,
        values: viewData.defaultValues,
      }),
    ).toBe(false);
    expect(
      findFormField(viewData, (field) => field.name === "append"),
    ).toMatchObject({
      $when: 'dialogueMode == "adv"',
      label: "Append to previous line",
      type: "segmented-control",
      value: false,
    });
    expect(
      findFormField(
        viewData,
        (field) => field.name === "characterSpriteEnabled",
      ),
    ).toBeUndefined();
    expect(
      findFormField(viewData, (field) => field.name === "persistCharacter"),
    ).toMatchObject({
      $when: "values.characterId || values.customCharacterName",
      label: "Persist Speaker",
      type: "segmented-control",
      value: true,
    });
    expect(viewData.form.fields.map((field) => field.label)).toEqual([
      "Layout",
      "Speaker",
      "Options",
    ]);
    expect(viewData.form.fields[1]).toMatchObject({
      id: "speaker",
      action: {
        id: "add",
        icon: "plus",
        label: "Add option",
      },
    });
    expect(viewData.form.fields[2]).toMatchObject({
      id: "options",
      action: {
        id: "add",
        icon: "plus",
        label: "Add option",
      },
    });
    const speakerFields = viewData.form.fields[1].fields;
    expect(
      speakerFields.map((field) => field.name ?? field.slot ?? field.type),
    ).toEqual(["row", "row", "row", "row", "row", "row"]);
    expect(
      speakerFields.map((field) =>
        field.type === "row"
          ? field.fields.map(
              (nestedField) => nestedField.name ?? nestedField.slot,
            )
          : field.slot,
      ),
    ).toEqual([
      ["characterId", "persistCharacter", "persistCharacterSpacer"],
      ["customCharacterName", "characterName", "characterNameSpacer"],
      ["characterSprite", "persistSprite"],
      ["spriteTransformId", "spriteAnimationId"],
      ["spriteAnimationPlaybackSpeed", "spriteAnimationPlaybackContinuity"],
      ["spriteAnimationPlaybackLoop", "spriteAnimationPlaybackLoopSpacer"],
    ]);
    expect(
      viewData.form.fields[2].fields.map((field) => field.name ?? field.slot),
    ).toEqual(["append", "textSpeed", "clearPage"]);
  });

  it("reserves right-hand columns while optional Speaker fields are hidden", () => {
    const state = createInitialState();
    const viewData = selectTestViewData({
      state,
      props: {
        layouts: [],
        characters: [],
      },
    });
    const characterRow = viewData.form.fields[1].fields[0];
    const persistCharacterField = characterRow.fields.find(
      (field) => field.name === "persistCharacter",
    );
    const spacerField = characterRow.fields.find(
      (field) => field.slot === "persistCharacterSpacer",
    );
    const customNameRow = viewData.form.fields[1].fields[1];
    const characterNameField = customNameRow.fields.find(
      (field) => field.name === "characterName",
    );
    const characterNameSpacerField = customNameRow.fields.find(
      (field) => field.slot === "characterNameSpacer",
    );

    expect(
      isFieldVisible({
        field: persistCharacterField,
        values: viewData.defaultValues,
      }),
    ).toBe(false);
    expect(
      isFieldVisible({
        field: spacerField,
        values: viewData.defaultValues,
      }),
    ).toBe(true);
    expect(
      isFieldVisible({
        field: characterNameField,
        values: viewData.defaultValues,
      }),
    ).toBe(false);
    expect(
      isFieldVisible({
        field: characterNameSpacerField,
        values: viewData.defaultValues,
      }),
    ).toBe(true);
  });

  it("localizes the Options section action label", () => {
    const state = createInitialState();

    const jaViewData = selectViewData({ state, props: {}, i18n: JA_I18N });
    const zhHansViewData = selectViewData({
      state,
      props: {},
      i18n: ZH_HANS_I18N,
    });

    expect(jaViewData.form.fields[2].action.label).toBe("オプションを追加");
    expect(zhHansViewData.form.fields[2].action.label).toBe("添加选项");
  });

  it("shows ADV and NVL layouts together with right-side mode labels", () => {
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
      findFormField(viewData, (field) => field.name === "resourceId"),
    ).toMatchObject({
      label: "Layout",
      options: [
        {
          value: "layout-adv",
          label: "ADV Layout",
          suffixText: "ADV",
        },
        {
          value: "layout-nvl",
          label: "NVL Layout",
          suffixText: "NVL",
        },
      ],
    });

    state.selectedResourceId = "layout-nvl";
    const nvlViewData = selectTestViewData({
      state,
      props: {
        layouts: [
          {
            id: "layout-adv",
            name: "ADV Layout",
            layoutType: "dialogue-adv",
          },
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
      findFormField(nvlViewData, (field) => field.name === "resourceId"),
    ).toMatchObject({
      value: "layout-nvl",
    });
    expect(nvlViewData.selectedMode).toBe("nvl");
    expect(nvlViewData.context.dialogueMode).toBe("nvl");
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
      findFormField(viewData, (field) => field.name === "append"),
    ).toMatchObject({
      label: "Append to previous line",
      type: "segmented-control",
      value: true,
    });
  });

  it("hides text speed until the optional override is added", () => {
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

    const textSpeedField = findFormField(
      viewData,
      (field) => field.slot === "textSpeed",
    );

    expect(viewData.customizeTextSpeed).toBe(false);
    expect(viewData.textSpeed).toBe(75);
    expect(viewData.defaultValues.customizeTextSpeed).toBe(false);
    expect(viewData.defaultValues.textSpeed).toBe(75);
    expect(
      findFormField(viewData, (field) => field.name === "customizeTextSpeed"),
    ).toBeUndefined();
    expect(viewData.form.fields[2].action).toMatchObject({
      id: "add",
      icon: "plus",
      label: "Add option",
    });
    expect(textSpeedField).toMatchObject({
      $when: "values.customizeTextSpeed == true",
      slot: "textSpeed",
      type: "slot",
    });
    expect(viewData.textSpeedLabel).toBe("Text Speed");
    expect(viewData.removeCustomTextSpeedLabel).toBe(
      "Remove custom text speed",
    );
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

    setCustomizeTextSpeed({ state }, { customizeTextSpeed: true });
    const customizedViewData = selectTestViewData({
      state,
      props: {
        layouts: [],
        characters: [],
      },
    });

    expect(customizedViewData.form.fields[2].action).toBeUndefined();
  });

  it("normalizes text speed values to the supported 0 to 100 range", () => {
    const state = createInitialState();

    setCustomizeTextSpeed({ state }, { customizeTextSpeed: true });
    setTextSpeed({ state }, { textSpeed: 150 });

    expect(state.textSpeed).toBe(100);
    expect(
      selectTestViewData({ state, props: { layouts: [], characters: [] } }),
    ).toMatchObject({
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
    const persistCharacterField = findFormField(
      viewData,
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

  it("shows persist controls only when a sprite is selected", () => {
    const state = createInitialState();
    let viewData = selectTestViewData({
      state,
      props: {
        layouts: [],
        characters: [
          {
            id: "character-1",
            name: "Aki",
          },
        ],
      },
    });
    let spriteRow = viewData.form.fields[1].fields.find((field) => {
      return field.fields?.some((nestedField) => {
        return nestedField.slot === "characterSprite";
      });
    });
    expect(spriteRow).toMatchObject({
      $when: "values.characterSpriteEnabled == true",
      type: "row",
    });
    expect(
      isFieldVisible({ field: spriteRow, values: viewData.defaultValues }),
    ).toBe(false);
    expect(
      findFormField(viewData, (field) => field.name === "persistSprite"),
    ).toMatchObject({
      label: "Persist Sprite",
      type: "segmented-control",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
      value: false,
    });
    expect(
      findFormField(
        viewData,
        (field) => field.name === "removePersistedSprite",
      ),
    ).toBeUndefined();

    setSpriteCharacterId({ state }, { characterId: "character-1" });
    setSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          base: "sprite-1",
        },
      },
    );
    viewData = selectTestViewData({
      state,
      props: {
        layouts: [],
        characters: [
          {
            id: "character-1",
            name: "Aki",
          },
        ],
      },
    });
    expect(
      findFormField(
        viewData,
        (field) => field.name === "removePersistedSprite",
      ),
    ).toBeUndefined();
    spriteRow = viewData.form.fields[1].fields.find((field) => {
      return field.fields?.some((nestedField) => {
        return nestedField.slot === "characterSprite";
      });
    });
    expect(
      isFieldVisible({ field: spriteRow, values: viewData.defaultValues }),
    ).toBe(true);
    expect(viewData.persistSprite).toBe(true);
    expect(
      findFormField(viewData, (field) => field.name === "persistSprite"),
    ).toMatchObject({ value: true });
  });

  it("preserves an explicit persistence choice when sprite layers change", () => {
    const state = createInitialState();

    setSpriteCharacterId({ state }, { characterId: "character-1" });
    setSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          body: "sprite-body",
        },
      },
    );
    setPersistSprite({ state }, { persistSprite: false });
    setSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          body: "sprite-body-updated",
        },
      },
    );

    expect(state.persistSprite).toBe(false);
    expect(state.persistSpriteExplicit).toBe(true);
    expect(state.defaultValues.persistSprite).toBe(false);
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
          tree: [{ id: "portrait-in" }, { id: "portrait-pulse" }],
          items: {
            "portrait-in": {
              id: "portrait-in",
              type: "animation",
              name: "Portrait In",
              animation: {
                type: "transition",
              },
            },
            "portrait-pulse": {
              id: "portrait-pulse",
              type: "animation",
              name: "Portrait Pulse",
              animation: {
                type: "update",
              },
            },
          },
        },
      },
    });

    const speakerFields = viewData.form.fields[1].fields;
    const spriteRow = speakerFields.find((field) => {
      return field.fields?.some((nestedField) => {
        return nestedField.slot === "characterSprite";
      });
    });
    expect(spriteRow).toMatchObject({
      $when: "values.characterSpriteEnabled == true",
      type: "row",
    });
    expect(spriteRow.fields.map((field) => field.name ?? field.slot)).toEqual([
      "characterSprite",
      "persistSprite",
    ]);
    const transformAnimationRow = speakerFields.find((field) => {
      return field.fields?.some((nestedField) => {
        return nestedField.name === "spriteTransformId";
      });
    });
    expect(transformAnimationRow.fields.map((field) => field.name)).toEqual([
      "spriteTransformId",
      "spriteAnimationId",
    ]);
    const playbackRow = speakerFields.find((field) => {
      return field.fields?.some((nestedField) => {
        return nestedField.name === "spriteAnimationPlaybackSpeed";
      });
    });
    expect(playbackRow.fields.map((field) => field.name)).toEqual([
      "spriteAnimationPlaybackSpeed",
      "spriteAnimationPlaybackContinuity",
    ]);
    expect(playbackRow.fields[0]).toMatchObject({
      label: "Playback Speed",
      type: "slider-with-input",
      min: 0.01,
      max: 4,
      step: 0.01,
      value: 1,
    });
    expect(playbackRow.fields[1]).toMatchObject({
      label: "Continuity",
      type: "segmented-control",
      value: "render",
      options: [
        { value: "render", label: "Single Line" },
        { value: "persistent", label: "Persistent" },
      ],
    });
    expect(viewData.hasSpriteCharacter).toBe(true);
    expect(viewData.characterSpriteEnabled).toBe(true);
    expect(viewData.form.fields[1].action).toBeUndefined();
    expect(
      isFieldVisible({
        field: spriteRow,
        values: viewData.defaultValues,
      }),
    ).toBe(true);
    expect(viewData.spriteCharacterId).toBe("character-1");
    expect(viewData.spriteTransformId).toBe("portrait-left");
    expect(viewData.spriteAnimationMode).toBe("transition");
    expect(viewData.spriteAnimationId).toBe("portrait-in");
    expect(transformAnimationRow.fields[0].options).toEqual([
      { value: "portrait-left", label: "Portrait Left" },
    ]);
    expect(transformAnimationRow.fields[1]).toMatchObject({
      label: "Animation",
      type: "select",
      clearable: true,
      placeholder: "Select animation",
    });
    expect(transformAnimationRow.fields[1].options).toEqual([
      {
        value: "portrait-in",
        label: "Portrait In",
        suffixText: "Transition",
      },
      {
        value: "portrait-pulse",
        label: "Portrait Pulse",
        suffixText: "Update",
      },
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

  it("derives animation mode from the selected animation and clears it", () => {
    const state = createInitialState();
    const animations = {
      tree: [{ id: "portrait-update" }, { id: "portrait-transition" }],
      items: {
        "portrait-update": {
          id: "portrait-update",
          type: "animation",
          animation: { type: "update" },
        },
        "portrait-transition": {
          id: "portrait-transition",
          type: "animation",
          animation: { type: "transition" },
        },
      },
    };

    setSpriteAnimationId(
      { state, props: { animations } },
      { animationId: "portrait-update" },
    );
    expect(state.spriteAnimationMode).toBe("update");

    setSpriteAnimationId(
      { state, props: { animations } },
      { animationId: "portrait-transition" },
    );
    expect(state.spriteAnimationMode).toBe("transition");
    expect(state.spriteAnimationId).toBe("portrait-transition");

    setSpriteAnimationId({ state, props: { animations } }, {});
    expect(state.spriteAnimationMode).toBe("none");
    expect(state.spriteAnimationId).toBe("");
  });
});
