import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectActionsData,
  setRepositoryState,
} from "../../src/components/systemActions/systemActions.store.js";

describe("systemActions.store", () => {
  it("preserves hidden update variable actions without previewing them", () => {
    const state = createInitialState();

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          updateVariable: {
            id: "updateVariable1",
            operations: [],
          },
        },
      },
    });

    expect(actions.updateVariable).toEqual({
      id: "updateVariable1",
      operations: [],
    });
    expect(preview.updateVariable).toBeUndefined();
  });

  it("preserves and previews explicit skip mode start and stop actions", () => {
    const state = createInitialState();

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          startSkipMode: {},
          stopSkipMode: {},
        },
      },
    });

    expect(actions.startSkipMode).toEqual({});
    expect(actions.stopSkipMode).toEqual({});
    expect(preview.startSkipMode).toEqual({});
    expect(preview.stopSkipMode).toEqual({});
  });

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
      persistCharacterLabel: "Persist Speaker",
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
      persistCharacterLabel: "Persist Speaker",
    });
  });

  it("builds stacked sprite previews for multipart characters", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          characters: {
            items: {
              "character-1": {
                id: "character-1",
                type: "character",
                name: "Aki",
                sprites: {
                  items: {
                    "sprite-body": {
                      id: "sprite-body",
                      type: "image",
                      name: "Body",
                      fileId: "file-body",
                    },
                    "sprite-face": {
                      id: "sprite-face",
                      type: "image",
                      name: "Face",
                      fileId: "file-face",
                    },
                  },
                  tree: [{ id: "sprite-body" }, { id: "sprite-face" }],
                },
              },
            },
            tree: [{ id: "character-1" }],
          },
        },
      },
    );

    const { preview } = selectActionsData({
      state,
      props: {
        actions: {},
        presentationState: {
          character: {
            items: [
              {
                id: "character-1",
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
        },
      },
    });

    expect(preview.character).toEqual([
      {
        id: "character-1",
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
        name: "Aki",
        spriteFileIds: ["file-body", "file-face"],
        hasSpritePreview: true,
      },
    ]);
  });
});
