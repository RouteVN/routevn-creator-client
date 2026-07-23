import { describe, expect, it } from "vitest";
import { buildSceneDocumentLineDecorations } from "../../src/internal/ui/sceneEditor/lineViewModels.js";

const createRepositoryState = () => ({
  characters: {
    items: {
      "character-1": {
        id: "character-1",
        type: "character",
        name: "Aki",
        fileId: "file-character-1",
      },
    },
    tree: [{ id: "character-1" }],
  },
});

describe("sceneEditor.lineDecorations", () => {
  it("uses the first canonical BGM clip for line decorations", () => {
    const viewModels = buildSceneDocumentLineDecorations({
      lines: [{ id: "line-1" }],
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [
          {
            id: "line-1",
            changes: {
              bgm: {
                changeType: "add",
                data: {
                  loop: true,
                  sounds: [
                    { id: "intro-clip", resourceId: "intro" },
                    { id: "theme-clip", resourceId: "theme" },
                  ],
                },
              },
            },
            presentationState: {},
          },
        ],
      },
    });

    expect(viewModels[0].bgm).toEqual({
      changeType: "add",
      resourceId: "intro",
    });
  });

  it("uses per-line presentationState from section changes for dialogue avatars", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          dialogue: {
            characterId: "character-1",
            persistCharacter: true,
            content: [{ text: "First" }],
          },
        },
      },
      {
        id: "line-2",
      },
      {
        id: "line-3",
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [
          {
            id: "line-1",
            changes: {},
            presentationState: {
              dialogue: {
                characterId: "character-1",
              },
            },
          },
          {
            id: "line-2",
            changes: {},
            presentationState: {
              dialogue: {
                characterId: "character-1",
              },
            },
          },
          {
            id: "line-3",
            changes: {},
            presentationState: {},
          },
        ],
      },
    });

    expect(viewModels[0].characterFileId).toBe("file-character-1");
    expect(viewModels[1].characterFileId).toBe("file-character-1");
    expect(viewModels[2].characterFileId).toBeUndefined();
  });

  it("does not derive a dialogue avatar from raw line actions when section presentationState has no character", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          dialogue: {
            characterId: "character-1",
            content: [{ text: "First" }],
          },
        },
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [
          {
            id: "line-1",
            changes: {},
            presentationState: {
              dialogue: {
                content: [{ text: "First" }],
              },
            },
          },
        ],
      },
    });

    expect(viewModels[0].characterFileId).toBeUndefined();
  });

  it("does not flash a stale selected presentationState onto a line when section presentationState has no character", () => {
    const lines = [
      {
        id: "line-1",
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [
          {
            id: "line-1",
            changes: {},
            presentationState: {},
          },
        ],
      },
    });

    expect(viewModels[0].characterFileId).toBeUndefined();
  });

  it("builds dialogue speaker sprite previews from engine sprite changes", () => {
    const repositoryState = createRepositoryState();
    repositoryState.characters.items["character-1"].sprites = {
      items: {
        "sprite-neutral": {
          id: "sprite-neutral",
          type: "image",
          fileId: "file-sprite-neutral",
        },
      },
      tree: [{ id: "sprite-neutral" }],
    };
    const spriteData = {
      transformId: "dialogue-left",
      items: [{ id: "base", resourceId: "sprite-neutral" }],
    };

    const viewModels = buildSceneDocumentLineDecorations({
      lines: [{ id: "line-1" }, { id: "line-2" }],
      repositoryState,
      sectionLineChanges: {
        lines: [
          {
            id: "line-1",
            changes: {
              dialogueSprite: {
                changeType: "add",
                data: spriteData,
              },
            },
            presentationState: {
              dialogue: {
                characterId: "character-1",
                character: { sprite: spriteData },
              },
            },
          },
          {
            id: "line-2",
            changes: {
              dialogueSprite: {
                changeType: "delete",
                data: spriteData,
              },
            },
            presentationState: { dialogue: {} },
          },
        ],
      },
    });

    const expectedPreview = {
      fileId: "file-sprite-neutral",
      spriteFileIds: ["file-sprite-neutral"],
      spritePreviewBr: "none",
      spritePreviewLayers: [
        {
          kind: "image",
          itemId: "sprite-neutral",
          fileId: "file-sprite-neutral",
          previewKey: "image:sprite-neutral:file-sprite-neutral",
        },
      ],
    };
    expect(viewModels[0].dialogueSprite).toEqual({
      changeType: "add",
      ...expectedPreview,
    });
    expect(viewModels[1].dialogueSprite).toEqual({
      changeType: "delete",
      ...expectedPreview,
    });
  });

  it("builds stacked sprite previews for multipart character changes", () => {
    const lines = [
      {
        id: "line-1",
      },
    ];

    const repositoryState = {
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
    };

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState,
      sectionLineChanges: {
        lines: [
          {
            id: "line-1",
            changes: {
              character: {
                changeType: "set",
                data: {
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
            presentationState: {},
          },
        ],
      },
    });

    expect(viewModels[0].characterSprites).toEqual({
      changeType: "set",
      items: [
        {
          characterId: "character-1",
          characterName: "Aki",
          fileId: "file-body",
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
        },
      ],
    });
  });

  it("builds spritesheet sprite previews for line character changes", () => {
    const lines = [
      {
        id: "line-1",
      },
    ];
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
    const repositoryState = {
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
    };

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState,
      sectionLineChanges: {
        lines: [
          {
            id: "line-1",
            changes: {
              character: {
                changeType: "set",
                data: {
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
            presentationState: {},
          },
        ],
      },
    });

    expect(viewModels[0].characterSprites).toEqual({
      changeType: "set",
      items: [
        {
          characterId: "character-1",
          characterName: "Aki",
          fileId: "file-idle",
          spriteFileIds: ["file-idle"],
          spritePreviewBr: "none",
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
        },
      ],
    });
  });

  it("marks conditional actions for inline action previews", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          conditional: {
            branches: [
              {
                when: { gte: [{ var: "variables.trust" }, 70] },
                actions: {
                  nextLine: {},
                },
              },
              {
                actions: {
                  nextLine: {},
                },
              },
            ],
          },
        },
      },
      {
        id: "line-2",
        actions: {},
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [],
      },
    });

    expect(viewModels[0].hasConditional).toBe(true);
    expect(viewModels[1].hasConditional).toBe(false);
  });

  it("marks update variable actions for inline action previews", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          updateVariable: {
            id: "update-variable-1",
            operations: [
              {
                variableId: "trust",
                op: "increment",
                value: 1,
              },
            ],
          },
        },
      },
      {
        id: "line-2",
        actions: {},
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [],
      },
    });

    expect(viewModels[0].hasUpdateVariable).toBe(true);
    expect(viewModels[1].hasUpdateVariable).toBe(false);
  });

  it("marks input form actions for inline action previews", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          form: {
            resourceId: "profile-form-layout",
            fields: {
              name: {
                variableId: "playerName",
              },
            },
          },
        },
      },
      {
        id: "line-2",
        actions: {},
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [],
      },
    });

    expect(viewModels[0].hasInput).toBe(true);
    expect(viewModels[1].hasInput).toBe(false);
  });

  it("marks voice actions for inline action previews", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          voice: {
            resourceId: "voice-line-1",
          },
        },
      },
      {
        id: "line-2",
        actions: {},
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [],
      },
    });

    expect(viewModels[0].hasVoice).toBe(true);
    expect(viewModels[1].hasVoice).toBe(false);
  });

  it("marks canonical Voice channels for inline action previews", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          voice: {
            sounds: [
              {
                id: "clip-1",
                resourceId: "voice-line-1",
                volume: 100,
                startDelayMs: 0,
              },
            ],
          },
        },
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [],
      },
    });

    expect(viewModels[0].hasVoice).toBe(true);
  });

  it("marks screen actions for inline action previews without duplicating section transitions", () => {
    const lines = [
      {
        id: "line-1",
        actions: {
          screen: {
            animations: {
              resourceId: "screen-crossfade",
            },
          },
        },
      },
      {
        id: "line-2",
        actions: {
          sectionTransition: {
            sceneId: "scene-1",
            sectionId: "section-2",
            screen: {
              animations: {
                resourceId: "screen-mask-reveal",
              },
            },
          },
        },
      },
      {
        id: "line-3",
        actions: {},
      },
    ];

    const viewModels = buildSceneDocumentLineDecorations({
      lines,
      repositoryState: createRepositoryState(),
      sectionLineChanges: {
        lines: [],
      },
    });

    expect(viewModels[0].screenTransition).toBe(true);
    expect(viewModels[1].screenTransition).toBe(false);
    expect(viewModels[1].sectionTransition).toBe(true);
    expect(viewModels[2].screenTransition).toBe(false);
  });
});
