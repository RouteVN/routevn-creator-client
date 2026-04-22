import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectActionsData,
  setRepositoryState,
} from "../../src/components/systemActions/systemActions.store.js";

describe("systemActions.store", () => {
  it("builds resetStoryAtSection preview labels from repository sections", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          scenes: {
            items: {
              "scene-1": {
                id: "scene-1",
                type: "scene",
                name: "Opening",
                sections: {
                  items: {
                    "section-2": {
                      id: "section-2",
                      type: "section",
                      name: "Arrival",
                    },
                  },
                  tree: [{ id: "section-2" }],
                },
              },
            },
            tree: [{ id: "scene-1" }],
          },
        },
      },
    );

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          resetStoryAtSection: {
            sectionId: "section-2",
          },
        },
      },
    });

    expect(actions.resetStoryAtSection).toEqual({
      sectionId: "section-2",
    });
    expect(preview.resetStoryAtSection).toMatchObject({
      sectionId: "section-2",
      label: "Reset story at Opening - Arrival",
    });
  });

  it("includes custom character name and persist character labels in dialogue preview when a character is selected", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: {
            items: {
              "dialogue-layout": {
                id: "dialogue-layout",
                type: "layout",
                name: "Main Dialogue",
                layoutType: "dialogue-adv",
              },
            },
            tree: [{ id: "dialogue-layout" }],
          },
        },
      },
    );

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {},
        presentationState: {
          dialogue: {
            ui: {
              resourceId: "dialogue-layout",
            },
            mode: "adv",
            characterId: "character-1",
            character: {
              name: "Boss",
            },
            persistCharacter: true,
          },
        },
      },
    });

    expect(actions.dialogue).toEqual({
      ui: {
        resourceId: "dialogue-layout",
      },
      mode: "adv",
      characterId: "character-1",
      character: {
        name: "Boss",
      },
      persistCharacter: true,
    });
    expect(preview.dialogue).toMatchObject({
      name: "Main Dialogue",
      modeLabel: "ADV",
      customCharacterNameLabel: "Name: Boss",
      persistCharacterLabel: "Persist Character",
    });
  });

  it("includes the persist character label for custom character names without a selected character", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: {
            items: {
              "dialogue-layout": {
                id: "dialogue-layout",
                type: "layout",
                name: "Main Dialogue",
                layoutType: "dialogue-adv",
              },
            },
            tree: [{ id: "dialogue-layout" }],
          },
        },
      },
    );

    const { preview } = selectActionsData({
      state,
      props: {
        actions: {},
        presentationState: {
          dialogue: {
            ui: {
              resourceId: "dialogue-layout",
            },
            mode: "adv",
            character: {
              name: "Boss",
            },
            persistCharacter: true,
          },
        },
      },
    });

    expect(preview.dialogue).toMatchObject({
      name: "Main Dialogue",
      modeLabel: "ADV",
      customCharacterNameLabel: "Name: Boss",
      persistCharacterLabel: "Persist Character",
    });
  });
});
