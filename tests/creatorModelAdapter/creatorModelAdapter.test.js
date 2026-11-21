import { describe, expect, it } from "vitest";
import {
  applyCommandToRepositoryStateWithCreatorModel,
  toCreatorModelState,
  validateClientModelExtensionCommand,
} from "../../src/internal/creatorModelAdapter.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";

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
  it("saves an animation's thumbnail with its source hash, and keeps both through the editor's save", () => {
    const file = (id) => ({
      id,
      type: "image",
      mimeType: "image/jpeg",
      size: 1,
      sha256: `${id}-sha256`,
    });
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.files = {
      items: { "thumb-1": file("thumb-1"), "thumb-2": file("thumb-2") },
      tree: [{ id: "thumb-1" }, { id: "thumb-2" }],
    };
    repositoryState.animations = {
      items: {
        "animation-1": {
          id: "animation-1",
          type: "animation",
          name: "Animation One",
          // Saved before thumbnails had a hash.
          thumbnailFileId: "thumb-1",
          animation: {
            type: "update",
            tween: { alpha: { keyframes: [{ duration: 100, value: 1 }] } },
          },
        },
      },
      tree: [{ id: "animation-1" }],
    };
    const update = (state, data) =>
      applyCommandToRepositoryStateWithCreatorModel({
        repositoryState: state,
        command: {
          type: "animation.update",
          payload: { animationId: "animation-1", data },
        },
      });

    const saved = update(repositoryState, {
      thumbnailFileId: "thumb-2",
      thumbnailSourceHash: "hash-2",
    });

    expect(saved.error).toBeUndefined();
    expect(saved.valid).toBe(true);
    expect(saved.repositoryState.animations.items["animation-1"]).toMatchObject(
      { thumbnailFileId: "thumb-2", thumbnailSourceHash: "hash-2" },
    );
    expect(
      toCreatorModelState(saved.repositoryState).animations.items[
        "animation-1"
      ],
    ).toMatchObject({
      thumbnailFileId: "thumb-2",
      thumbnailSourceHash: "hash-2",
    });

    // The editor saves the whole animation, without its thumbnail.
    const edited = update(saved.repositoryState, {
      name: "Animation Two",
      description: "",
      animation: {
        type: "update",
        tween: { alpha: { keyframes: [{ duration: 300, value: 0 }] } },
      },
      cameraTracks: undefined,
    });

    expect(edited.valid).toBe(true);
    expect(
      edited.repositoryState.animations.items["animation-1"],
    ).toMatchObject({
      name: "Animation Two",
      thumbnailFileId: "thumb-2",
      thumbnailSourceHash: "hash-2",
    });
  });

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

  describe("character spritesheet frame sources", () => {
    const frameFile = (id) => ({
      id,
      type: "image",
      mimeType: "image/png",
      size: 64,
    });

    const createFramedState = () => {
      const state = createSpritesheetRepositoryState();
      for (const id of ["frame-a", "frame-b", "sheet-file-2"]) {
        state.files.items[id] = frameFile(id);
        state.files.tree.push({ id });
      }
      Object.assign(
        state.characters.items["character-1"].sprites.items["spritesheet-1"],
        {
          animations: { default: { frames: [0, 1, 1], fps: 12 } },
          frameSource: {
            frameWidth: 64,
            frameHeight: 64,
            frames: [{ fileId: "frame-a" }, { fileId: "frame-b" }],
          },
        },
      );
      return state;
    };

    const getSprite = (result) =>
      result.repositoryState.characters.items["character-1"].sprites.items[
        "spritesheet-1"
      ];

    it("keeps frames on a created spritesheet sprite", () => {
      const state = createSpritesheetRepositoryState();
      state.files.items["frame-a"] = frameFile("frame-a");
      state.files.tree.push({ id: "frame-a" });
      const sprite = createSpritesheetSprite();
      sprite.animations = { default: { frames: [0], fps: 12 } };
      sprite.frameSource = {
        frameWidth: 64,
        frameHeight: 64,
        frames: [{ fileId: "frame-a" }],
      };

      const result = applyCommandToRepositoryStateWithCreatorModel({
        repositoryState: state,
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

      expect(result.valid).toBe(true);
      expect(
        result.repositoryState.characters.items["character-1"].sprites.items[
          "spritesheet-2"
        ].frameSource,
      ).toEqual(sprite.frameSource);
    });

    it("rejects frames whose picture file does not exist", () => {
      const state = createSpritesheetRepositoryState();
      const sprite = createSpritesheetSprite();
      sprite.frameSource = {
        frameWidth: 64,
        frameHeight: 64,
        frames: [{ fileId: "missing-file" }],
      };

      const result = applyCommandToRepositoryStateWithCreatorModel({
        repositoryState: state,
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
        "payload.data.frameSource.frames.0.fileId must reference an existing file",
      );
    });

    it("rejects an animation frame that has no picture", () => {
      const result = applyCommandToRepositoryStateWithCreatorModel({
        repositoryState: createFramedState(),
        command: createSpriteUpdateCommand({
          animations: { default: { frames: [0, 2], fps: 12 } },
        }),
      });

      expect(result.valid).toBe(false);
      expect(result.error.message).toBe(
        "payload.data.animations.default.frames.1 must be less than the frameSource.frames length",
      );
    });

    it("rejects a new sheet file that does not say what happens to the frames", () => {
      const result = applyCommandToRepositoryStateWithCreatorModel({
        repositoryState: createFramedState(),
        command: createSpriteUpdateCommand({
          fileId: "sheet-file-2",
          jsonData: {},
        }),
      });

      expect(result.valid).toBe(false);
      expect(result.error.message).toContain(
        "payload.data.frameSource must be provided, or null to clear it",
      );
    });

    it("clears the frames when an update sends null with a new sheet", () => {
      const result = applyCommandToRepositoryStateWithCreatorModel({
        repositoryState: createFramedState(),
        command: createSpriteUpdateCommand({
          fileId: "sheet-file-2",
          jsonData: {},
          animations: { default: { frames: [0, 3], fps: 12 } },
          frameSource: null,
        }),
      });

      expect(result.valid).toBe(true);
      expect(getSprite(result)).not.toHaveProperty("frameSource");
      expect(getSprite(result).fileId).toBe("sheet-file-2");
    });

    it("keeps unchanged frames when an edit resends the current sheet", () => {
      const state = createFramedState();
      const { frameSource } =
        state.characters.items["character-1"].sprites.items["spritesheet-1"];

      const result = applyCommandToRepositoryStateWithCreatorModel({
        repositoryState: state,
        command: createSpriteUpdateCommand({
          name: "Blink",
          fileId: "sheet-file",
          jsonData: {},
          frameSource,
        }),
      });

      expect(result.valid).toBe(true);
      expect(getSprite(result).frameSource).toEqual(frameSource);
      expect(getSprite(result).name).toBe("Blink");
    });

    it("rejects frames with an unknown field", () => {
      const result = validateClientModelExtensionCommand({
        command: createSpriteUpdateCommand({
          frameSource: {
            frameWidth: 64,
            frameHeight: 64,
            frames: [{ fileId: "frame-a", name: "a" }],
          },
        }),
      });

      expect(result.valid).toBe(false);
      expect(result.error.message).toBe(
        "payload.data.frameSource.frames.0.name is not supported",
      );
    });
  });
});
