import { describe, expect, it } from "vitest";
import {
  applyCommandToRepositoryStateWithCreatorModel,
  toCreatorModelState,
  validateClientModelExtensionCommand,
} from "../../src/internal/creatorModelAdapter.js";

const createSpritesheetSprite = () => ({
  type: "spritesheet",
  name: "Walk Cycle",
  fileId: "sheet-file",
  sheetWidth: 512,
  sheetHeight: 128,
  frameCount: 4,
  width: 128,
  height: 128,
  jsonData: {},
  animations: {},
});

const createSpritesheetRepositoryState = () => ({
  files: {
    items: {
      "sheet-file": {
        id: "sheet-file",
        type: "image",
        mimeType: "image/png",
        size: 1024,
      },
    },
    tree: [{ id: "sheet-file" }],
  },
  characters: {
    items: {
      "character-1": {
        id: "character-1",
        type: "character",
        name: "Character One",
        sprites: {
          items: {
            "spritesheet-1": {
              id: "spritesheet-1",
              ...createSpritesheetSprite(),
            },
          },
          tree: [{ id: "spritesheet-1" }],
        },
      },
    },
    tree: [{ id: "character-1" }],
  },
});

const createSpriteUpdateCommand = (data) => ({
  type: "character.sprite.update",
  payload: {
    characterId: "character-1",
    spriteId: "spritesheet-1",
    data,
  },
});

describe("creatorModelAdapter", () => {
  it("normalizes legacy stored number variables without defaults to zero", () => {
    const state = {
      variables: {
        items: {
          score: {
            id: "score",
            type: "variable",
            name: "Score",
            variableType: "number",
            scope: "context",
          },
          level: {
            id: "level",
            type: "variable",
            name: "Level",
            variableType: "number",
            scope: "context",
            default: "",
            value: "",
          },
          total: {
            id: "total",
            type: "variable",
            name: "Total",
            variableType: "number",
            computed: {
              expr: {
                add: [1, 2],
              },
            },
          },
        },
        tree: [{ id: "score" }, { id: "level" }, { id: "total" }],
      },
    };

    const normalizedState = toCreatorModelState(state);

    expect(normalizedState.variables.items.score).toMatchObject({
      default: 0,
      value: 0,
    });
    expect(normalizedState.variables.items.level).toMatchObject({
      default: 0,
      value: 0,
    });
    expect(normalizedState.variables.items.total).not.toHaveProperty("default");
    expect(normalizedState.variables.items.total).not.toHaveProperty("value");
    expect(state.variables.items.score).not.toHaveProperty("default");
    expect(state.variables.items.level.default).toBe("");
  });

  it("preserves a legacy number variable's current value", () => {
    const normalizedState = toCreatorModelState({
      variables: {
        items: {
          score: {
            id: "score",
            type: "variable",
            name: "Score",
            variableType: "number",
            scope: "context",
            value: 12,
          },
        },
        tree: [{ id: "score" }],
      },
    });

    expect(normalizedState.variables.items.score).toMatchObject({
      default: 0,
      value: 12,
    });
  });

  it("removes a spritesheet sprite's default frame size when an update sends null", () => {
    const result = applyCommandToRepositoryStateWithCreatorModel({
      repositoryState: createSpritesheetRepositoryState(),
      command: createSpriteUpdateCommand({
        name: "Walk Cycle",
        width: null,
        height: null,
      }),
    });

    expect(result.valid).toBe(true);
    const sprite =
      result.repositoryState.characters.items["character-1"].sprites.items[
        "spritesheet-1"
      ];
    expect(sprite).not.toHaveProperty("width");
    expect(sprite).not.toHaveProperty("height");
    expect(sprite).toMatchObject({
      name: "Walk Cycle",
      sheetWidth: 512,
      sheetHeight: 128,
    });
  });

  it("removes only the spritesheet frame size field that an update sends as null", () => {
    const result = applyCommandToRepositoryStateWithCreatorModel({
      repositoryState: createSpritesheetRepositoryState(),
      command: createSpriteUpdateCommand({
        width: null,
        height: 96,
      }),
    });

    expect(result.valid).toBe(true);
    const sprite =
      result.repositoryState.characters.items["character-1"].sprites.items[
        "spritesheet-1"
      ];
    expect(sprite).not.toHaveProperty("width");
    expect(sprite.height).toBe(96);
  });

  it("accepts a null spritesheet frame size in a stateless update check", () => {
    const result = validateClientModelExtensionCommand({
      command: createSpriteUpdateCommand({
        width: null,
        height: null,
        jsonData: {},
        animations: {},
      }),
    });

    expect(result.valid).toBe(true);
  });

  it("rejects a non-number spritesheet frame size on update", () => {
    const result = applyCommandToRepositoryStateWithCreatorModel({
      repositoryState: createSpritesheetRepositoryState(),
      command: createSpriteUpdateCommand({
        width: "256",
      }),
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "payload.data.width must be a finite number when provided",
    );
  });

  it("rejects a null spritesheet frame size on create", () => {
    const sprite = createSpritesheetSprite();
    sprite.width = null;
    sprite.height = null;

    const result = applyCommandToRepositoryStateWithCreatorModel({
      repositoryState: createSpritesheetRepositoryState(),
      command: {
        type: "character.sprite.create",
        payload: {
          characterId: "character-1",
          spriteId: "spritesheet-2",
          data: sprite,
          position: "last",
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "payload.data.width must be a finite number when provided",
    );
  });
});
