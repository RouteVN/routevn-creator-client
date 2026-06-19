import { describe, expect, it } from "vitest";
import {
  closeAudioPlayer,
  createInitialState,
  openAudioPlayer,
  selectActionsData,
  selectViewData,
  setRepositoryState,
  updateActions,
} from "../../src/components/systemActions/systemActions.store.js";

describe("systemActions.store", () => {
  it("preserves explicit hidden modes for nested action pickers", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        hiddenModes: ["rollbackByOffset"],
      },
    });

    expect(viewData.hiddenModes).toEqual(["rollbackByOffset"]);
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

  it("preserves and previews screen transition actions", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          animations: {
            items: {
              "screen-crossfade": {
                id: "screen-crossfade",
                type: "animation",
                name: "Screen Crossfade",
              },
            },
            tree: [{ id: "screen-crossfade" }],
          },
        },
      },
    );

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          screen: {
            animations: {
              resourceId: "screen-crossfade",
            },
          },
        },
      },
    });

    expect(actions.screen).toEqual({
      animations: {
        resourceId: "screen-crossfade",
      },
    });
    expect(preview.screen).toMatchObject({
      label: "Screen Crossfade",
    });
  });

  it("preserves and previews voice actions from repository voices", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          voices: {
            items: {
              "voice-line-1": {
                id: "voice-line-1",
                type: "voice",
                name: "Aki Line 1",
                fileId: "file-voice-line-1",
              },
            },
            tree: [{ id: "voice-line-1" }],
          },
        },
      },
    );

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          voice: {
            resourceId: "voice-line-1",
            volume: 80,
          },
        },
      },
    });

    expect(actions.voice).toEqual({
      resourceId: "voice-line-1",
      volume: 80,
    });
    expect(preview.voice).toMatchObject({
      id: "voice-line-1",
      name: "Aki Line 1",
    });
  });

  it("exposes inline voice preview player state", () => {
    const state = createInitialState();

    openAudioPlayer(
      { state },
      {
        fileId: "file-voice-line-1",
        fileName: "Aki Line 1",
      },
    );

    expect(selectViewData({ state, props: {} })).toMatchObject({
      showAudioPlayer: true,
      playingSound: {
        fileId: "file-voice-line-1",
        title: "Aki Line 1",
      },
    });

    closeAudioPlayer({ state });

    expect(selectViewData({ state, props: {} })).toMatchObject({
      showAudioPlayer: false,
      playingSound: {
        fileId: undefined,
        title: "",
      },
    });
  });

  it("closes the inline voice preview player when the voice action changes", () => {
    const state = createInitialState();

    updateActions(
      { state },
      {
        voice: {
          resourceId: "voice-line-1",
        },
      },
    );
    openAudioPlayer(
      { state },
      {
        fileId: "file-voice-line-1",
        fileName: "Aki Line 1",
      },
    );

    updateActions(
      { state },
      {
        background: {
          resourceId: "bg-classroom",
        },
      },
    );

    expect(selectViewData({ state, props: {} })).toMatchObject({
      showAudioPlayer: false,
      playingSound: {
        fileId: undefined,
        title: "",
      },
    });
  });

  it("preserves and previews input form actions", () => {
    const state = createInitialState();
    const inputElements = {
      items: {
        nameInput: {
          id: "nameInput",
          type: "input",
          field: "name",
        },
      },
      tree: [{ id: "nameInput" }],
    };

    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: {
            items: {
              "profile-form-layout": {
                id: "profile-form-layout",
                type: "layout",
                name: "Profile Form",
                layoutType: "input",
                elements: inputElements,
              },
            },
            tree: [{ id: "profile-form-layout" }],
          },
          variables: {
            items: {
              playerName: {
                id: "playerName",
                type: "variable",
                name: "Player Name",
                variableType: "string",
              },
            },
            tree: [{ id: "playerName" }],
          },
        },
      },
    );

    const form = {
      resourceId: "profile-form-layout",
      fields: {
        name: {
          variableId: "playerName",
          required: true,
          trim: true,
          placeholder: "Name",
        },
      },
      submitActions: {
        nextLine: {},
      },
    };

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          form,
        },
      },
    });
    const viewData = selectViewData({
      state,
      props: {
        actions: {
          form,
        },
      },
    });

    expect(actions.form).toEqual(form);
    expect(preview.form).toEqual({
      layout: expect.objectContaining({
        id: "profile-form-layout",
        name: "Profile Form",
      }),
      layoutName: "Profile Form",
      fields: [
        {
          field: "name",
          fieldLabel: "name",
          variableId: "playerName",
          variableName: "Player Name",
          summary: "name: Player Name",
        },
      ],
      fieldCount: 1,
      submitActionCount: 1,
    });
    expect(viewData.inputLayouts).toEqual([
      {
        id: "profile-form-layout",
        name: "Profile Form",
        layoutType: "input",
        elements: inputElements,
      },
    ]);
  });

  it("uses input layout field labels in the input action preview", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: {
            items: {
              "profile-form-layout": {
                id: "profile-form-layout",
                type: "layout",
                name: "Profile Form",
                layoutType: "input",
                elements: {
                  items: {
                    nameInput: {
                      id: "nameInput",
                      type: "input",
                      field: "name",
                      name: "Name",
                    },
                    ageInput: {
                      id: "ageInput",
                      type: "input",
                      field: "age",
                      name: "Age",
                    },
                  },
                  tree: [{ id: "nameInput" }, { id: "ageInput" }],
                },
              },
            },
            tree: [{ id: "profile-form-layout" }],
          },
          variables: {
            items: {
              playerName: {
                id: "playerName",
                type: "variable",
                name: "fe",
                variableType: "string",
              },
              playerAge: {
                id: "playerAge",
                type: "variable",
                name: "age2",
                variableType: "string",
              },
            },
            tree: [{ id: "playerName" }, { id: "playerAge" }],
          },
        },
      },
    );

    const { preview } = selectActionsData({
      state,
      props: {
        actions: {
          form: {
            resourceId: "profile-form-layout",
            fields: {
              name: {
                variableId: "playerName",
              },
              age: {
                variableId: "playerAge",
              },
            },
          },
        },
      },
    });

    expect(preview.form.fields).toEqual([
      expect.objectContaining({
        field: "name",
        fieldLabel: "Name",
        variableName: "fe",
        summary: "Name: fe",
      }),
      expect.objectContaining({
        field: "age",
        fieldLabel: "Age",
        variableName: "age2",
        summary: "Age: age2",
      }),
    ]);
  });

  it("previews screen actions that only set opacity or blur", () => {
    const state = createInitialState();

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          screen: {
            opacity: 0.5,
            blur: {
              x: 6,
              y: 9,
              quality: 3,
              kernelSize: 9,
              repeatEdgePixels: true,
            },
          },
        },
      },
    });

    expect(actions.screen).toEqual({
      opacity: 0.5,
      blur: {
        x: 6,
        y: 9,
        quality: 3,
        kernelSize: 9,
        repeatEdgePixels: true,
      },
    });
    expect(preview.screen).toMatchObject({
      label: "Screen",
    });
  });

  it("previews screen blur clear actions", () => {
    const state = createInitialState();

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          screen: {
            blur: null,
          },
        },
      },
    });

    expect(actions.screen).toEqual({
      blur: null,
    });
    expect(preview.screen).toMatchObject({
      label: "Screen",
    });
  });

  it("previews background appearance-only actions against current background", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
          images: {
            items: {
              "bg-school": {
                id: "bg-school",
                type: "image",
                name: "School",
                fileId: "file-school",
              },
            },
            tree: [{ id: "bg-school" }],
          },
        },
      },
    );

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          background: {
            blur: null,
          },
        },
        presentationState: {
          background: {
            resourceId: "bg-school",
          },
        },
      },
    });

    expect(actions.background).toEqual({
      resourceId: "bg-school",
      blur: null,
    });
    expect(preview.background).toMatchObject({
      id: "bg-school",
      name: "School",
      type: "image",
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
        spritePreviewBr: "none",
        spritePreviewLayers: [
          {
            kind: "image",
            itemId: "sprite-body",
            fileId: "file-body",
            previewKey: "image:sprite-body:file-body",
          },
          {
            kind: "image",
            itemId: "sprite-face",
            fileId: "file-face",
            previewKey: "image:sprite-face:file-face",
          },
        ],
        hasSpritePreview: true,
      },
    ]);
  });

  it("builds spritesheet sprite preview layers for character action previews", () => {
    const state = createInitialState();
    const atlas = {
      frames: {
        idle0: {
          frame: { x: 0, y: 0, w: 64, h: 64 },
        },
        idle1: {
          frame: { x: 64, y: 0, w: 64, h: 64 },
        },
      },
    };
    const animation = {
      frames: [0, 1],
      fps: 12,
      loop: true,
    };

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
                    "sprite-idle": {
                      id: "sprite-idle",
                      type: "spritesheet",
                      name: "Idle",
                      fileId: "file-idle",
                      jsonData: atlas,
                      animations: {
                        idle: animation,
                      },
                    },
                  },
                  tree: [{ id: "sprite-idle" }],
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
                    resourceId: "sprite-idle",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(preview.character[0]).toMatchObject({
      id: "character-1",
      name: "Aki",
      spriteFileIds: ["file-idle"],
      spritePreviewBr: "none",
      hasSpritePreview: true,
      spritePreviewLayers: [
        {
          kind: "spritesheet",
          itemId: "sprite-idle",
          fileId: "file-idle",
          atlas,
          animation,
          animationName: "idle",
          previewKey: "spritesheet:sprite-idle:file-idle:idle:0,1:12",
        },
      ],
    });
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
