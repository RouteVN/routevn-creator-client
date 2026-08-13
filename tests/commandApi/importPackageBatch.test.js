import { describe, expect, it, vi } from "vitest";
import { createImportPackageCommandApi } from "../../src/deps/services/shared/commandApi/resources/importPackage.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../src/internal/assetPackageResources.js";

describe("import package command batch", () => {
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
      planId: "asset-plan",
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
      planId: "all-asset-plan",
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
