import { describe, expect, it } from "vitest";
import { buildSceneEditorLineViewModels } from "../../src/internal/ui/sceneEditor/lineViewModels.js";

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

describe("sceneEditor.lineViewModels", () => {
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

    const viewModels = buildSceneEditorLineViewModels({
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

    const viewModels = buildSceneEditorLineViewModels({
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

    const viewModels = buildSceneEditorLineViewModels({
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
});
