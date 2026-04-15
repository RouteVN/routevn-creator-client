import { describe, expect, it, vi } from "vitest";
import {
  submitCreateResourceCommand,
  submitUpdateResourceCommand,
} from "../../src/deps/services/shared/commandApi/resources/shared.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const createShared = ({
  fileCommands = [],
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
    buildMissingFileCommands: vi.fn().mockReturnValue(fileCommands),
    createId: vi.fn().mockReturnValue("generated-resource-id"),
    resolveResourceIndex: vi.fn().mockReturnValue(4),
    buildPlacementPayload: vi
      .fn()
      .mockReturnValue({ parentId: "folder-1", index: 4 }),
    submitCommandsWithContext: vi.fn().mockResolvedValue(submitResult),
    resourceTypePartitionFor: vi.fn().mockReturnValue("main"),
  };

  return { context, shared };
};

describe("resource command file batching", () => {
  it("submits missing file records with image creation in one batch", async () => {
    const fileCommands = [
      {
        scope: "resources",
        type: COMMAND_TYPES.FILE_CREATE,
        payload: {
          fileId: "file-1",
        },
      },
      {
        scope: "resources",
        type: COMMAND_TYPES.FILE_CREATE,
        payload: {
          fileId: "file-2",
        },
      },
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
      parentId: "folder-1",
      position: "last",
    });

    expect(result).toBe("generated-resource-id");
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
  });

  it("submits missing file records with image updates in one batch", async () => {
    const fileCommands = [
      {
        scope: "resources",
        type: COMMAND_TYPES.FILE_CREATE,
        payload: {
          fileId: "file-3",
        },
      },
    ];
    const submitResult = { valid: true, commandIds: ["cmd-1", "cmd-2"] };
    const { context, shared } = createShared({
      fileCommands,
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
      fileRecords: [
        {
          id: "file-3",
        },
      ],
    });

    expect(result).toBe(submitResult);
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
  });
});
