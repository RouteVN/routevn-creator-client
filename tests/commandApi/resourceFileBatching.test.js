import { describe, expect, it, vi } from "vitest";
import {
  submitCreateResourceCommand,
  submitUpdateResourceCommand,
} from "../../src/deps/services/shared/commandApi/resources/shared.js";
import { createCatalogResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/catalog.js";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createControlCommandApi } from "../../src/deps/services/shared/commandApi/controls.js";
import { createCharacterSpriteCommandApi } from "../../src/deps/services/shared/commandApi/characterSprites.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const createShared = ({
  ensureFilesResult = { valid: true, createdCount: 0 },
  submitResult = { valid: true, commandIds: [] },
} = {}) => {
  const context = {
    projectId: "project-1",
    state: {
      files: {
        items: {},
      },
    },
  };

  const shared = {
    ensureCommandContext: vi.fn().mockResolvedValue(context),
    ensureFilesExist: vi.fn().mockResolvedValue(ensureFilesResult),
    buildMissingFileCommands: vi.fn(),
    createId: vi.fn().mockReturnValue("generated-resource-id"),
    resolveResourceIndex: vi.fn().mockReturnValue(4),
    resolveCharacterSpriteIndex: vi.fn().mockReturnValue(2),
    buildPlacementPayload: vi
      .fn()
      .mockReturnValue({ parentId: "folder-1", index: 4 }),
    submitCommandWithContext: vi.fn().mockResolvedValue(submitResult),
    submitCommandsWithContext: vi.fn().mockResolvedValue(submitResult),
    resourceTypePartitionFor: vi.fn().mockReturnValue("main"),
  };

  return { context, shared };
};

describe("resource command file preflight", () => {
  it("ensures file records before image creation", async () => {
    const fileRecords = [{ id: "file-1" }, { id: "file-2" }];
    const { context, shared } = createShared();

    const result = await submitCreateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_CREATE,
      idField: "imageId",
      data: {
        fileId: "file-1",
        thumbnailFileId: "file-2",
      },
      fileRecords,
      parentId: "folder-1",
      position: "last",
    });

    expect(result).toBe("generated-resource-id");
    expect(shared.ensureFilesExist).toHaveBeenCalledTimes(1);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledTimes(1);
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.IMAGE_CREATE,
      payload: {
        imageId: "generated-resource-id",
        data: {
          fileId: "file-1",
          thumbnailFileId: "file-2",
        },
        parentId: "folder-1",
        index: 4,
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("ensures file records before image updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [
      {
        id: "file-3",
      },
    ];
    const { context, shared } = createShared({
      submitResult,
    });

    const result = await submitUpdateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_UPDATE,
      idField: "imageId",
      idValue: "image-1",
      data: {
        fileId: "file-3",
      },
      fileRecords,
    });

    expect(result).toBe(submitResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledTimes(1);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledTimes(1);
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.IMAGE_UPDATE,
      payload: {
        imageId: "image-1",
        data: {
          fileId: "file-3",
        },
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("does not submit the resource command when file preflight fails", async () => {
    const ensureFilesResult = {
      valid: false,
      error: {
        message: "file metadata missing",
      },
    };
    const fileRecords = [{ id: "file-4" }];
    const { context, shared } = createShared({ ensureFilesResult });

    const result = await submitCreateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_CREATE,
      idField: "imageId",
      data: {
        fileId: "file-4",
      },
      fileRecords,
      parentId: "folder-1",
      position: "last",
    });

    expect(result).toBe(ensureFilesResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
  });

  it("ensures file records before layout updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [{ id: "thumb-1" }];
    const { context, shared } = createShared({ submitResult });
    const api = createLayoutCommandApi(shared);

    const result = await api.updateLayoutItem({
      layoutId: "layout-1",
      data: {
        thumbnailFileId: "thumb-1",
        preview: {},
      },
      fileRecords,
    });

    expect(result).toBe(submitResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.LAYOUT_UPDATE,
      payload: {
        layoutId: "layout-1",
        data: {
          thumbnailFileId: "thumb-1",
          preview: {},
        },
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("ensures file records before control updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [{ id: "thumb-2" }];
    const { context, shared } = createShared({ submitResult });
    const api = createControlCommandApi(shared);

    const result = await api.updateControlItem({
      controlId: "control-1",
      data: {
        thumbnailFileId: "thumb-2",
        preview: {},
      },
      fileRecords,
    });

    expect(result).toBe(submitResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.CONTROL_UPDATE,
      payload: {
        controlId: "control-1",
        data: {
          thumbnailFileId: "thumb-2",
          preview: {},
        },
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("ensures file records before character sprite creation", async () => {
    const fileRecords = [{ id: "sprite-file" }];
    const { context, shared } = createShared();
    const api = createCharacterSpriteCommandApi(shared);

    const result = await api.createCharacterSpriteItem({
      characterId: "character-1",
      data: {
        fileId: "sprite-file",
      },
      fileRecords,
      parentId: "folder-1",
      position: "last",
    });

    expect(result).toBe("generated-resource-id");
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.CHARACTER_SPRITE_CREATE,
      payload: {
        characterId: "character-1",
        spriteId: "generated-resource-id",
        data: {
          fileId: "sprite-file",
        },
        parentId: "folder-1",
        index: 4,
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("ensures file records before character sprite updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [{ id: "sprite-file-2" }];
    const { context, shared } = createShared({ submitResult });
    const api = createCharacterSpriteCommandApi(shared);

    const result = await api.updateCharacterSpriteItem({
      characterId: "character-1",
      spriteId: "sprite-1",
      data: {
        fileId: "sprite-file-2",
      },
      fileRecords,
    });

    expect(result).toBe(submitResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.CHARACTER_SPRITE_UPDATE,
      payload: {
        characterId: "character-1",
        spriteId: "sprite-1",
        data: {
          fileId: "sprite-file-2",
        },
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("ensures file records before animation preview updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [{ id: "thumb-animation" }];
    const { context, shared } = createShared({ submitResult });
    const api = createCatalogResourceCommandApi(shared);

    const result = await api.updateAnimation({
      animationId: "animation-1",
      data: {
        thumbnailFileId: "thumb-animation",
        preview: {
          background: {
            imageId: "image-bg",
          },
        },
      },
      fileRecords,
    });

    expect(result).toBe(submitResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.ANIMATION_UPDATE,
      payload: {
        animationId: "animation-1",
        data: {
          thumbnailFileId: "thumb-animation",
          preview: {
            background: {
              imageId: "image-bg",
            },
          },
        },
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("ensures file records before transform thumbnail updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [
      { id: "preview-transform" },
      { id: "thumb-transform" },
    ];
    const { context, shared } = createShared({ submitResult });
    const api = createCatalogResourceCommandApi(shared);

    const result = await api.updateTransform({
      transformId: "transform-1",
      data: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        anchorX: 0,
        anchorY: 0,
        rotation: 0,
        thumbnailFileId: "thumb-transform",
        previewFileId: "preview-transform",
        preview: {
          background: {
            imageId: "image-bg",
          },
          target: {
            imageId: "image-target",
          },
        },
      },
      fileRecords,
    });

    expect(result).toBe(submitResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.TRANSFORM_UPDATE,
      payload: {
        transformId: "transform-1",
        data: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0,
          anchorY: 0,
          rotation: 0,
          thumbnailFileId: "thumb-transform",
          previewFileId: "preview-transform",
          preview: {
            background: {
              imageId: "image-bg",
            },
            target: {
              imageId: "image-target",
            },
          },
        },
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
    expect(shared.buildMissingFileCommands).not.toHaveBeenCalled();
  });

  it("submits resource create after empty file preflight", async () => {
    const { context, shared } = createShared();

    const result = await submitCreateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_CREATE,
      idField: "imageId",
      data: {
        fileId: "file-1",
      },
      fileRecords: [],
      parentId: "folder-1",
      position: "last",
    });

    expect(result).toBe("generated-resource-id");
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords: [],
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.IMAGE_CREATE,
      payload: {
        imageId: "generated-resource-id",
        data: {
          fileId: "file-1",
        },
        parentId: "folder-1",
        index: 4,
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
  });

  it("submits resource update after empty file preflight", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const { context, shared } = createShared({ submitResult });

    const result = await submitUpdateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_UPDATE,
      idField: "imageId",
      idValue: "image-1",
      data: {
        fileId: "file-3",
      },
      fileRecords: [],
    });

    expect(result).toBe(submitResult);
    expect(shared.ensureFilesExist).toHaveBeenCalledWith({
      context,
      fileRecords: [],
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "main",
      type: COMMAND_TYPES.IMAGE_UPDATE,
      payload: {
        imageId: "image-1",
        data: {
          fileId: "file-3",
        },
      },
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
  });
});
