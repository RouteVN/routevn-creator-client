import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectActionsData,
  selectViewData,
  setRepositoryState,
  updateActions,
} from "../../src/components/systemActions/systemActions.store.js";

describe("systemActions.store", () => {
  it("hides conditional mode by default for nested action pickers", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        hiddenModes: ["rollbackByOffset"],
      },
    });

    expect(viewData.hiddenModes).toEqual(["conditional", "rollbackByOffset"]);
  });

  it("preserves and previews update variable actions", () => {
    const state = createInitialState();

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          updateVariable: {
            id: "updateVariable1",
            operations: [
              {
                variableId: "score",
                op: "increment",
                value: 2,
              },
            ],
          },
        },
      },
    });

    expect(actions.updateVariable).toEqual({
      id: "updateVariable1",
      operations: [
        {
          variableId: "score",
          op: "increment",
          value: 2,
        },
      ],
    });
    expect(preview.updateVariable).toEqual({
      summary: "score +2",
      operationCount: 1,
    });
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

  it("preserves and previews conditional actions", () => {
    const state = createInitialState();
    const conditional = {
      branches: [
        {
          when: {
            gte: [{ var: "variables.trust" }, 70],
          },
          actions: {
            nextLine: {},
          },
        },
        {
          actions: {
            sectionTransition: {
              sceneId: "scene-2",
              sectionId: "section-2",
            },
          },
        },
      ],
    };

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          conditional,
        },
      },
    });

    expect(actions.conditional).toEqual(conditional);
    expect(preview.conditional).toEqual({
      branchCount: 2,
      actionCount: 2,
      summary: "1 branch + default",
      actionsSummary: "2 nested actions",
    });
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

  it("prefers raw dialogue actions over presentation state when reopening the editor", () => {
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
        actions: {
          dialogue: {
            ui: {
              resourceId: "dialogue-layout",
            },
            mode: "adv",
            characterId: "character-1",
            character: {
              sprite: {
                transformId: "portrait-left",
                items: [{ id: "body", resourceId: "sprite-body" }],
              },
            },
          },
        },
        presentationState: {
          dialogue: {
            ui: {
              resourceId: "dialogue-layout",
            },
            mode: "adv",
            characterId: "character-1",
          },
        },
      },
    });

    expect(actions.dialogue.character.sprite).toEqual({
      transformId: "portrait-left",
      items: [{ id: "body", resourceId: "sprite-body" }],
    });
    expect(preview.dialogue).toMatchObject({
      name: "Main Dialogue",
      spriteLabel: "Sprite: 1 layer",
    });
  });

  it("uses final presentation dialogue for presentation state preview", () => {
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
        actionType: "presentation",
        actions: {
          dialogue: {
            append: true,
            content: [{ text: "Continued text" }],
          },
        },
        presentationState: {
          dialogue: {
            ui: {
              resourceId: "dialogue-layout",
            },
            mode: "adv",
            content: [{ text: "Inherited layout text" }],
          },
        },
      },
    });

    expect(actions.dialogue).toEqual({
      ui: {
        resourceId: "dialogue-layout",
      },
      mode: "adv",
      content: [{ text: "Inherited layout text" }],
    });
    expect(preview.dialogue).toMatchObject({
      name: "Main Dialogue",
      modeLabel: "ADV",
      appendLabel: "append",
    });
  });

  it("renders dialogue editor props from current component action state", () => {
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
    updateActions(
      { state },
      {
        dialogue: {
          ui: {
            resourceId: "dialogue-layout",
          },
          mode: "adv",
          characterId: "character-1",
          character: {
            sprite: {
              transformId: "portrait-left",
              items: [{ id: "body", resourceId: "sprite-body" }],
            },
          },
        },
      },
    );

    const viewData = selectViewData({
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
          },
        },
      },
    });

    expect(viewData.actions.dialogue.character.sprite).toEqual({
      transformId: "portrait-left",
      items: [{ id: "body", resourceId: "sprite-body" }],
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

  it("exposes default and scene-editor dialog surface options", () => {
    const defaultViewData = selectViewData({
      state: createInitialState(),
      props: {},
    });
    const sceneViewData = selectViewData({
      state: createInitialState(),
      props: {
        dialogVariant: "scene-editor-left",
        dialogPanelWidth: "calc((100vw - 64px) / 2)",
      },
    });

    expect(defaultViewData.dialogVariant).toBe("default");
    expect(defaultViewData.actionsDialogPanelWidth).toBe("50vw");
    expect(sceneViewData.dialogVariant).toBe("scene-editor-left");
    expect(sceneViewData.actionsDialogPanelWidth).toBe(
      "calc((100vw - 64px) / 2)",
    );
  });

  it("can hide the embedded close button for inline selected action lists", () => {
    const defaultViewData = selectViewData({
      state: createInitialState(),
      props: {
        actionType: "system",
      },
    });
    const inlineViewData = selectViewData({
      state: createInitialState(),
      props: {
        actionType: "system",
        showEmbeddedClose: false,
      },
    });
    const stringFalseViewData = selectViewData({
      state: createInitialState(),
      props: {
        actionType: "system",
        showEmbeddedClose: "false",
      },
    });

    expect(defaultViewData.showEmbeddedClose).toBe(true);
    expect(inlineViewData.showEmbeddedClose).toBe(false);
    expect(stringFalseViewData.showEmbeddedClose).toBe(false);
  });

  it("exposes allowed modes for constrained action choosers", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        allowedModes: ["sectionTransition", "", 42, "updateVariable"],
      },
    });

    expect(viewData.allowedModes).toEqual([
      "sectionTransition",
      "updateVariable",
    ]);
  });
});
