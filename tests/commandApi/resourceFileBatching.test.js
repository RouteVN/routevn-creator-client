import { describe, expect, it, vi } from "vitest";
import {
  submitCreateResourceCommand,
  submitUpdateResourceCommand,
} from "../../src/deps/services/shared/commandApi/resources/shared.js";
import { createCatalogResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/catalog.js";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createControlCommandApi } from "../../src/deps/services/shared/commandApi/controls.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const createShared = ({
  ensureFilesResult = { valid: true, createdCount: 0 },
  submitResult = { valid: true, commandIds: [] },
  fileCommands = [],
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
    buildMissingFileCommands: vi.fn().mockReturnValue(fileCommands),
    createId: vi.fn().mockReturnValue("generated-resource-id"),
    resolveResourceIndex: vi.fn().mockReturnValue(4),
    buildPlacementPayload: vi
      .fn()
      .mockReturnValue({ parentId: "folder-1", index: 4 }),
    submitCommandWithContext: vi.fn().mockResolvedValue(submitResult),
    submitCommandsWithContext: vi.fn().mockResolvedValue(submitResult),
    resourceTypePartitionFor: vi.fn().mockReturnValue("main"),
  };

  return { context, shared };
};

describe("resource command file batching", () => {
  it("batches missing file records with image creation", async () => {
    const fileRecords = [{ id: "file-1" }, { id: "file-2" }];
    const fileCommands = [
      { type: COMMAND_TYPES.FILE_CREATE, payload: { fileId: "file-1" } },
      { type: COMMAND_TYPES.FILE_CREATE, payload: { fileId: "file-2" } },
    ];
    const { context, shared } = createShared({ fileCommands });

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
    expect(shared.buildMissingFileCommands).toHaveBeenCalledTimes(1);
    expect(shared.buildMissingFileCommands).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledTimes(1);
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        ...fileCommands,
        {
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
        },
      ],
    });
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(shared.ensureFilesExist).not.toHaveBeenCalled();
  });

  it("batches missing file records with image updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [
      {
        id: "file-3",
      },
    ];
    const fileCommands = [
      { type: COMMAND_TYPES.FILE_CREATE, payload: { fileId: "file-3" } },
    ];
    const { context, shared } = createShared({
      submitResult,
      fileCommands,
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
    expect(shared.buildMissingFileCommands).toHaveBeenCalledTimes(1);
    expect(shared.buildMissingFileCommands).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledTimes(1);
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        ...fileCommands,
        {
          scope: "resources",
          basePartition: "main",
          type: COMMAND_TYPES.IMAGE_UPDATE,
          payload: {
            imageId: "image-1",
            data: {
              fileId: "file-3",
            },
          },
        },
      ],
    });
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(shared.ensureFilesExist).not.toHaveBeenCalled();
  });

  it("batches missing file records with layout updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [{ id: "thumb-1" }];
    const fileCommands = [
      { type: COMMAND_TYPES.FILE_CREATE, payload: { fileId: "thumb-1" } },
    ];
    const { context, shared } = createShared({ submitResult, fileCommands });
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
    expect(shared.buildMissingFileCommands).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        ...fileCommands,
        {
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
        },
      ],
    });
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(shared.ensureFilesExist).not.toHaveBeenCalled();
  });

  it("batches missing file records with control updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [{ id: "thumb-2" }];
    const fileCommands = [
      { type: COMMAND_TYPES.FILE_CREATE, payload: { fileId: "thumb-2" } },
    ];
    const { context, shared } = createShared({ submitResult, fileCommands });
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
    expect(shared.buildMissingFileCommands).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        ...fileCommands,
        {
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
        },
      ],
    });
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(shared.ensureFilesExist).not.toHaveBeenCalled();
  });

  it("batches missing file records with animation preview updates", async () => {
    const submitResult = { valid: true, commandIds: ["cmd-1"] };
    const fileRecords = [{ id: "thumb-animation" }];
    const fileCommands = [
      {
        type: COMMAND_TYPES.FILE_CREATE,
        payload: { fileId: "thumb-animation" },
      },
    ];
    const { context, shared } = createShared({ submitResult, fileCommands });
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
    expect(shared.buildMissingFileCommands).toHaveBeenCalledWith({
      context,
      fileRecords,
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        ...fileCommands,
        {
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
        },
      ],
    });
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(shared.ensureFilesExist).not.toHaveBeenCalled();
  });

  it("submits resource create without file commands when there are no missing files", async () => {
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
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
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
        },
      ],
    });
  });

  it("submits resource update without file commands when there are no missing files", async () => {
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
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
          scope: "resources",
          basePartition: "main",
          type: COMMAND_TYPES.IMAGE_UPDATE,
          payload: {
            imageId: "image-1",
            data: {
              fileId: "file-3",
            },
          },
        },
      ],
    });
  });
});
