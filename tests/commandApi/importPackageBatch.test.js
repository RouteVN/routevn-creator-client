import { describe, expect, it, vi } from "vitest";
import { createImportPackageCommandApi } from "../../src/deps/services/shared/commandApi/resources/importPackage.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../src/internal/assetPackageResources.js";
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

  it("atomically commits nested image, sound, and video asset trees", async () => {
    const repository = await createProjectRepository({
      projectId: "project-assets",
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
      getCurrentProjectId: () => "project-assets",
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
    const fileRecords = [
      ["file.image", "image/png"],
      ["file.sound", "audio/mpeg"],
      ["file.video", "video/mp4"],
      ["file.video-thumbnail", "image/webp"],
    ].map(([id, mimeType]) => ({ id, mimeType, size: 1, sha256: "sha" }));
    const fileCommandIds = Object.fromEntries(
      fileRecords.map((record) => [record.id, `command-${record.id}`]),
    );

    const result = await api.commitAssetImportPackage({
      planId: "asset-plan",
      projectId: "project-assets",
      repositoryRevision: repository.getRevision(),
      fileRecords,
      fileCommandIds,
      entries: [
        {
          resourceType: "images",
          destinationId: "folder.images",
          commandId: "command-folder-images",
          folder: true,
          index: 0,
          data: { type: "folder", name: "Images" },
        },
        {
          resourceType: "images",
          destinationId: "image.city",
          commandId: "command-image",
          parentDestinationId: "folder.images",
          folder: false,
          index: 0,
          data: {
            type: "image",
            name: "City",
            fileId: "file.image",
          },
        },
        {
          resourceType: "sounds",
          destinationId: "folder.sounds",
          commandId: "command-folder-sounds",
          folder: true,
          index: 0,
          data: { type: "folder", name: "Sounds" },
        },
        {
          resourceType: "sounds",
          destinationId: "sound.theme",
          commandId: "command-sound",
          parentDestinationId: "folder.sounds",
          folder: false,
          index: 0,
          data: {
            type: "sound",
            name: "Theme",
            fileId: "file.sound",
          },
        },
        {
          resourceType: "videos",
          destinationId: "folder.videos",
          commandId: "command-folder-videos",
          folder: true,
          index: 0,
          data: { type: "folder", name: "Videos" },
        },
        {
          resourceType: "videos",
          destinationId: "video.intro",
          commandId: "command-video",
          parentDestinationId: "folder.videos",
          folder: false,
          index: 0,
          data: {
            type: "video",
            name: "Intro",
            fileId: "file.video",
            thumbnailFileId: "file.video-thumbnail",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      assetPackage: true,
      imageIds: ["image.city"],
      soundIds: ["sound.theme"],
      videoIds: ["video.intro"],
      createdFolderIds: ["folder.images", "folder.sounds", "folder.videos"],
    });
    const state = repository.getState();
    expect(state.images.tree).toEqual([
      {
        id: "folder.images",
        children: [{ id: "image.city", children: [] }],
      },
    ]);
    expect(state.sounds.tree).toEqual([
      {
        id: "folder.sounds",
        children: [{ id: "sound.theme", children: [] }],
      },
    ]);
    expect(state.videos.tree).toEqual([
      {
        id: "folder.videos",
        children: [{ id: "video.intro", children: [] }],
      },
    ]);
    expect(state.files.items).toMatchObject({
      "file.image": { mimeType: "image/png" },
      "file.sound": { mimeType: "audio/mpeg" },
      "file.video": { mimeType: "video/mp4" },
      "file.video-thumbnail": { mimeType: "image/webp" },
    });
  });

  it("commits every asset-package resource collection with cross-resource references", async () => {
    const repository = await createProjectRepository({
      projectId: "project-all-assets",
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
      getCurrentProjectId: () => "project-all-assets",
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
    const folderEntries = ASSET_PACKAGE_RESOURCE_CONFIGS.map(
      ({ resourceType }) => ({
        resourceType,
        destinationId: `folder.${resourceType}`,
        commandId: `command-folder-${resourceType}`,
        folder: true,
        index: 0,
        data: { type: "folder", name: resourceType },
      }),
    );

    const result = await api.commitAssetImportPackage({
      planId: "all-asset-plan",
      projectId: "project-all-assets",
      repositoryRevision: repository.getRevision(),
      fileRecords: [
        {
          id: "file.font",
          mimeType: "font/woff2",
          size: 1,
          sha256: "sha",
        },
      ],
      fileCommandIds: { "file.font": "command-file-font" },
      entries: [
        ...folderEntries,
        {
          resourceType: "colors",
          destinationId: "color.body",
          commandId: "command-color",
          parentDestinationId: "folder.colors",
          folder: false,
          index: 0,
          data: {
            type: "color",
            name: "Body Color",
            hex: "#112233",
          },
        },
        {
          resourceType: "fonts",
          destinationId: "font.body",
          commandId: "command-font",
          parentDestinationId: "folder.fonts",
          folder: false,
          index: 0,
          data: {
            type: "font",
            name: "Body Font",
            fileId: "file.font",
            fontFamily: "Body Font",
          },
        },
        {
          resourceType: "textStyles",
          destinationId: "textStyle.body",
          commandId: "command-text-style",
          parentDestinationId: "folder.textStyles",
          folder: false,
          index: 0,
          data: {
            type: "textStyle",
            name: "Body",
            fontId: ["font.body"],
            colorId: "color.body",
            fontSize: 24,
            lineHeight: 1.5,
            fontWeight: "400",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      assetPackage: true,
      resourceIds: ["color.body", "font.body", "textStyle.body"],
    });
    const state = repository.getState();
    for (const { resourceType } of ASSET_PACKAGE_RESOURCE_CONFIGS) {
      expect(state[resourceType].items[`folder.${resourceType}`]).toMatchObject(
        { type: "folder", name: resourceType },
      );
    }
    expect(state.textStyles.items["textStyle.body"]).toMatchObject({
      fontId: ["font.body"],
      colorId: "color.body",
    });
  });
});
