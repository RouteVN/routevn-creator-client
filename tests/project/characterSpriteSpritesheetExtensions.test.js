import { describe, expect, it } from "vitest";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";
import {
  applyCommandsToRepositoryState,
  assertSupportedProjectState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";

const actor = {
  userId: "user-1",
  clientId: "client-1",
};

const createCommand = (overrides = {}) => ({
  id: "command-1",
  projectId: "project-1",
  partition: "project-1:resources:characters",
  actor,
  clientTs: 1,
  schemaVersion: 1,
  ...overrides,
});

const createFileCommand = ({ commandId, fileId }) =>
  createCommand({
    id: commandId,
    type: COMMAND_TYPES.FILE_CREATE,
    payload: {
      fileId,
      data: {
        mimeType: "image/png",
        size: 1024,
        sha256: `${fileId}-sha`,
      },
    },
  });

const createCharacterCommand = () =>
  createCommand({
    id: "character-create",
    type: COMMAND_TYPES.CHARACTER_CREATE,
    payload: {
      characterId: "hero",
      data: {
        type: "character",
        name: "Hero",
        sprites: {
          items: {},
          tree: [],
        },
      },
    },
  });

const createFolderCommand = () =>
  createCommand({
    id: "folder-create",
    type: COMMAND_TYPES.CHARACTER_SPRITE_CREATE,
    payload: {
      characterId: "hero",
      spriteId: "folder-1",
      data: {
        type: "folder",
        name: "Folder",
      },
      parentId: null,
      index: 0,
    },
  });

const createSpritesheetCommand = (overrides = {}) =>
  createCommand({
    id: "sheet-create",
    type: COMMAND_TYPES.CHARACTER_SPRITE_CREATE,
    payload: {
      characterId: "hero",
      spriteId: "sheet-1",
      data: {
        type: "spritesheet",
        name: "Hero Sheet",
        fileId: "sheet-file",
        jsonData: {
          frames: {
            "idle-1": {},
          },
        },
        animations: {
          Idle: {
            frames: [0],
            fps: 12,
            loop: true,
          },
        },
      },
      parentId: null,
      index: 0,
    },
    ...overrides,
  });

const createBaseCommands = () => [
  createFileCommand({
    commandId: "sheet-file-create",
    fileId: "sheet-file",
  }),
  createCharacterCommand(),
];

describe("character sprite spritesheet creator-model extension", () => {
  it("stores character spritesheets and strips deleted character-sprite tags", () => {
    const scopeKey = "characterSprites:hero";
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        ...createBaseCommands(),
        createCommand({
          id: "tag-create",
          type: COMMAND_TYPES.TAG_CREATE,
          payload: {
            scopeKey,
            tagId: "tag-idle",
            data: {
              type: "tag",
              name: "Idle",
            },
          },
        }),
        createSpritesheetCommand({
          payload: {
            ...createSpritesheetCommand().payload,
            data: {
              ...createSpritesheetCommand().payload.data,
              tagIds: ["tag-idle"],
            },
          },
        }),
        createCommand({
          id: "sheet-update",
          type: COMMAND_TYPES.CHARACTER_SPRITE_UPDATE,
          payload: {
            characterId: "hero",
            spriteId: "sheet-1",
            data: {
              name: "Hero Sheet Updated",
              animations: {
                Idle: {
                  frames: [0],
                  fps: 18,
                  loop: true,
                },
              },
            },
          },
        }),
        createCommand({
          id: "tag-delete",
          type: COMMAND_TYPES.TAG_DELETE,
          payload: {
            scopeKey,
            tagIds: ["tag-idle"],
          },
        }),
      ],
    });

    expect(result.valid).toBe(true);
    const sprites = result.repositoryState.characters.items.hero.sprites;
    expect(sprites.items["sheet-1"]).toMatchObject({
      id: "sheet-1",
      type: "spritesheet",
      name: "Hero Sheet Updated",
      fileId: "sheet-file",
      animations: {
        Idle: {
          fps: 18,
        },
      },
    });
    expect(sprites.items["sheet-1"].tagIds).toBeUndefined();
    expect(sprites.tree).toEqual([{ id: "sheet-1" }]);
    expect(() =>
      assertSupportedProjectState(result.repositoryState),
    ).not.toThrow();
  });

  it("rejects character spritesheet creation under a folder missing from the tree", () => {
    const baseResult = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [...createBaseCommands(), createFolderCommand()],
    });
    expect(baseResult.valid).toBe(true);

    const corruptedState = structuredClone(baseResult.repositoryState);
    corruptedState.characters.items.hero.sprites.tree = [];

    const result = applyCommandsToRepositoryState({
      repositoryState: corruptedState,
      projectId: "project-1",
      commands: [
        createSpritesheetCommand({
          payload: {
            ...createSpritesheetCommand().payload,
            parentId: "folder-1",
          },
        }),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toContain("payload.parentId");
  });

  it("rejects existing character spritesheet extensions missing from the tree", () => {
    const baseResult = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [...createBaseCommands(), createSpritesheetCommand()],
    });
    expect(baseResult.valid).toBe(true);

    const corruptedState = structuredClone(baseResult.repositoryState);
    corruptedState.characters.items.hero.sprites.tree = [];

    const result = applyCommandsToRepositoryState({
      repositoryState: corruptedState,
      projectId: "project-1",
      commands: [
        createCommand({
          id: "tag-create",
          type: COMMAND_TYPES.TAG_CREATE,
          payload: {
            scopeKey: "characters",
            tagId: "tag-any",
            data: {
              type: "tag",
              name: "Any",
            },
          },
        }),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toContain("must exist in sprites.tree");
  });

  it("keeps character sprite tree moves working when a spritesheet is present", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        ...createBaseCommands(),
        createFileCommand({
          commandId: "image-file-create",
          fileId: "image-file",
        }),
        createCommand({
          id: "image-create",
          type: COMMAND_TYPES.CHARACTER_SPRITE_CREATE,
          payload: {
            characterId: "hero",
            spriteId: "image-1",
            data: {
              type: "image",
              name: "Hero Image",
              fileId: "image-file",
            },
            parentId: null,
            index: 0,
          },
        }),
        createSpritesheetCommand({
          payload: {
            ...createSpritesheetCommand().payload,
            index: 1,
          },
        }),
        createCommand({
          id: "image-move",
          type: COMMAND_TYPES.CHARACTER_SPRITE_MOVE,
          payload: {
            characterId: "hero",
            spriteId: "image-1",
            parentId: null,
            position: "after",
            positionTargetId: "sheet-1",
          },
        }),
      ],
    });

    expect(result.valid).toBe(true);
    expect(
      result.repositoryState.characters.items.hero.sprites.tree.map(
        (node) => node.id,
      ),
    ).toEqual(["sheet-1", "image-1"]);
    expect(() =>
      assertSupportedProjectState(result.repositoryState),
    ).not.toThrow();
  });
});
