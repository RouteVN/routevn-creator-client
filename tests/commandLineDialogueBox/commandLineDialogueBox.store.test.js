import { describe, expect, it } from "vitest";
import {
  createInitialState,
  setCharacterName,
  setCustomCharacterName,
  selectViewData,
  setPersistCharacter,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.store.js";

describe("commandLineDialogueBox.store", () => {
  it("includes custom character name and persistCharacter in form defaults and field values", () => {
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
      viewData.form.fields.find((field) => field.name === "customCharacterName"),
    ).toMatchObject({
      type: "segmented-control",
      value: true,
    });
    expect(
      viewData.form.fields.find((field) => field.name === "characterName"),
    ).toMatchObject({
      type: "input-text",
      value: "Boss",
    });
    expect(
      viewData.form.fields.find((field) => field.name === "persistCharacter"),
    ).toMatchObject({
      $when: "values.characterId || values.customCharacterName",
      type: "segmented-control",
      value: true,
    });
  });
});
