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
});
