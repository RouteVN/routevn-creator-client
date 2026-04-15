import { describe, expect, it, vi } from "vitest";
import {
  submitCreateResourceCommand,
  submitUpdateResourceCommand,
} from "../../src/deps/services/shared/commandApi/resources/shared.js";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createControlCommandApi } from "../../src/deps/services/shared/commandApi/controls.js";
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
  it("ensures missing file records exist before image creation", async () => {
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
  });

  it("ensures missing file records exist before image updates", async () => {
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
  });

  it("ensures missing file records exist before layout updates", async () => {
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
  });

  it("ensures missing file records exist before control updates", async () => {
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
  });

  it("returns early when file creation fails before resource create", async () => {
    const ensureFilesResult = { valid: false, error: { message: "nope" } };
    const { shared } = createShared({ ensureFilesResult });

    const result = await submitCreateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_CREATE,
      idField: "imageId",
      data: {
        fileId: "file-1",
      },
      fileRecords: [{ id: "file-1" }],
      parentId: "folder-1",
      position: "last",
    });

    expect(result).toBe(ensureFilesResult);
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
  });

  it("returns early when file creation fails before resource update", async () => {
    const ensureFilesResult = { valid: false, error: { message: "nope" } };
    const { shared } = createShared({ ensureFilesResult });

    const result = await submitUpdateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_UPDATE,
      idField: "imageId",
      idValue: "image-1",
      data: {
        fileId: "file-3",
      },
      fileRecords: [{ id: "file-3" }],
    });

    expect(result).toBe(ensureFilesResult);
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
  });
});
