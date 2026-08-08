import { describe, expect, it, vi } from "vitest";
import { createImportPackageCommandApi } from "../../src/deps/services/shared/commandApi/resources/importPackage.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

describe("import package command batch", () => {
  it("submits files, tags, images, and targets through one atomic batch", async () => {
    const submitCommandsWithContext = vi.fn(async () => ({
      valid: true,
      commandIds: ["command-1"],
    }));
    const context = {
      projectId: "project-1",
      repository: { getRevision: () => 4 },
      state: {
        files: { items: {}, tree: [] },
        images: {
          items: {
            "folder.images": { id: "folder.images", type: "folder" },
          },
          tree: [{ id: "folder.images" }],
        },
        transforms: {
          items: {
            "folder.transforms": { id: "folder.transforms", type: "folder" },
          },
          tree: [{ id: "folder.transforms" }],
        },
        tags: {},
      },
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      resourceTypePartitionFor: (_projectId, resourceType) =>
        `partition:${resourceType}`,
      buildMissingFileCommands: () => [
        { type: COMMAND_TYPES.FILE_CREATE, payload: { fileId: "file-1" } },
      ],
      resolveResourceIndex: () => 0,
      buildPlacementPayload: ({ parentId, index }) => ({ parentId, index }),
      submitCommandsWithContext,
    };
    const api = createImportPackageCommandApi(shared);
    const result = await api.commitResourceImportPackage({
      planId: "plan-1",
      repositoryRevision: 4,
      resourceType: "transforms",
      resourceParentId: "folder.transforms",
      imageParentId: "folder.images",
      fileRecords: [
        { id: "file-1", mimeType: "image/png", size: 1, sha256: "sha" },
      ],
      fileCommandIds: { "file-1": "command-file" },
      tags: [
        {
          commandId: "command-tag",
          mode: "create",
          scopeKey: "transforms",
          destinationId: "tag-1",
          data: { type: "tag", name: "Tag", color: "" },
        },
      ],
      images: [
        {
          commandId: "command-image",
          destinationId: "image-1",
          data: { type: "image", name: "Image", fileId: "file-1" },
        },
      ],
      resources: [
        {
          commandId: "command-transform",
          destinationId: "transform-1",
          data: {
            type: "transform",
            name: "Transform",
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            anchorX: 0,
            anchorY: 0,
            rotation: 0,
          },
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(submitCommandsWithContext).toHaveBeenCalledTimes(1);
    expect(
      submitCommandsWithContext.mock.calls[0][0].commands.map(
        (command) => command.type,
      ),
    ).toEqual([
      COMMAND_TYPES.FILE_CREATE,
      COMMAND_TYPES.TAG_CREATE,
      COMMAND_TYPES.IMAGE_CREATE,
      COMMAND_TYPES.TRANSFORM_CREATE,
    ]);
    expect(
      submitCommandsWithContext.mock.calls[0][0].commands.map(
        (command) => command.commandId,
      ),
    ).toEqual([
      "command-file",
      "command-tag",
      "command-image",
      "command-transform",
    ]);
  });

  it("commits the complete package through the real repository projection", async () => {
    const repository = await createProjectRepository({
      projectId: "project-1",
      store: {
        appendEvents: vi.fn(async () => {}),
        loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
        saveMaterializedViewCheckpoint: vi.fn(async () => {}),
        deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
      },
      events: [],
      historyLoaded: true,
    });
    const actor = { userId: "user-1", clientId: "client-1" };
    const session = {
      getActor: () => actor,
      submitCommands: vi.fn(async (commands) =>
        commands.map((command) => command.id),
      ),
    };
    let commandIndex = 0;
    const shared = createCommandApiShared({
      idGenerator: () => `generated-command-${++commandIndex}`,
      now: () => 1,
      getCurrentProjectId: () => "project-1",
      getCurrentRepository: async () => repository,
      getCachedRepository: () => repository,
      ensureCommandSessionForProject: async () => session,
      getOrCreateLocalActor: () => actor,
      storyBasePartitionFor: () => "m",
      storyScenePartitionFor: () => "m",
      scenePartitionFor: () => "m",
      resourceTypePartitionFor: () => "m",
    });

    const api = createImportPackageCommandApi(shared);
    const result = await api.commitResourceImportPackage({
      planId: "plan-real",
      repositoryRevision: repository.getRevision(),
      resourceType: "transforms",
      resourceDestination: {
        mode: "create",
        destinationId: "folder.transforms",
        commandId: "command-transform-folder",
        name: "Imported Transforms",
      },
      imageDestination: {
        mode: "create",
        destinationId: "folder.images",
        commandId: "command-image-folder",
        name: "Imported Images",
      },
      fileRecords: [
        {
          id: "file.image",
          mimeType: "image/png",
          size: 68,
          sha256: "file-sha",
        },
        {
          id: "file.thumbnail",
          mimeType: "image/webp",
          size: 42,
          sha256: "thumbnail-sha",
        },
      ],
      fileCommandIds: {
        "file.image": "command-file",
        "file.thumbnail": "command-thumbnail",
      },
      tags: [
        {
          commandId: "command-tag",
          mode: "create",
          scopeKey: "transforms",
          destinationId: "tag.motion",
          data: { type: "tag", name: "Motion", color: "#64748b" },
        },
      ],
      images: [
        {
          commandId: "command-image",
          destinationId: "image.preview",
          data: {
            type: "image",
            name: "Preview",
            description: "",
            fileId: "file.image",
            thumbnailFileId: "file.thumbnail",
            width: 1,
            height: 1,
            tagIds: [],
          },
        },
      ],
      resources: [
        {
          commandId: "command-transform",
          destinationId: "transform.imported",
          data: {
            type: "transform",
            name: "Imported Transform",
            description: "",
            tagIds: ["tag.motion"],
            x: 100,
            y: 120,
            scaleX: 1,
            scaleY: 1,
            anchorX: 0.5,
            anchorY: 0.5,
            rotation: 0,
            preview: {
              background: { imageId: "image.preview" },
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      resourceIds: ["transform.imported"],
      imageIds: ["image.preview"],
      createdFolderIds: ["folder.transforms", "folder.images"],
      createdTagIds: ["tag.motion"],
    });
    expect(session.submitCommands).toHaveBeenCalledTimes(1);
    const state = repository.getState();
    expect(state.files.items["file.image"]).toBeDefined();
    expect(state.files.items["file.thumbnail"]).toBeDefined();
    expect(state.images.items["image.preview"]).toMatchObject({
      fileId: "file.image",
      thumbnailFileId: "file.thumbnail",
    });
    expect(state.images.items["folder.images"]).toMatchObject({
      type: "folder",
      name: "Imported Images",
    });
    expect(state.tags.transforms.items["tag.motion"]).toMatchObject({
      name: "Motion",
    });
    expect(state.transforms.items["transform.imported"]).toMatchObject({
      tagIds: ["tag.motion"],
      preview: { background: { imageId: "image.preview" } },
    });
    expect(state.transforms.items["folder.transforms"]).toMatchObject({
      type: "folder",
      name: "Imported Transforms",
    });
  });
});
