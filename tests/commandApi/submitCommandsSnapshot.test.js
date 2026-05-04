import { describe, expect, it, vi } from "vitest";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const createRepositoryStore = () => {
  return {
    appendEvents: vi.fn(async () => {}),
    loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
    saveMaterializedViewCheckpoint: vi.fn(async () => {}),
    deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
  };
};

describe("commandApi submitCommandsWithContext", () => {
  it("validates commands against the current repository context before session submit", async () => {
    const store = createRepositoryStore();
    const repository = await createProjectRepository({
      projectId: "project-1",
      store,
      events: [],
      historyLoaded: true,
    });

    const session = {
      submitCommands: vi.fn(async (commands) =>
        commands.map((command) => command.id),
      ),
    };

    const shared = createCommandApiShared({
      idGenerator: (() => {
        let index = 0;
        return () => `cmd-${++index}`;
      })(),
      now: () => 1,
      getCurrentProjectId: () => "project-1",
      getCurrentRepository: async () => repository,
      getCachedRepository: () => repository,
      ensureCommandSessionForProject: async () => session,
      getOrCreateLocalActor: () => ({
        userId: "user-1",
        clientId: "client-1",
      }),
      storyBasePartitionFor: () => "m",
      storyScenePartitionFor: () => "m",
      scenePartitionFor: () => "s:test",
      resourceTypePartitionFor: () => "m",
    });

    const context = {
      repository,
      state: repository.getState(),
      session,
      actor: {
        userId: "user-1",
        clientId: "client-1",
      },
      projectId: "project-1",
    };

    const result = await shared.submitCommandsWithContext({
      context,
      commands: [
        {
          scope: "resources",
          partition: "m",
          type: COMMAND_TYPES.IMAGE_CREATE,
          payload: {
            imageId: "image-1",
            data: {
              type: "image",
              name: "Image One",
              fileId: "missing-file",
              thumbnailFileId: null,
              fileType: "image/png",
              fileSize: 123,
              width: 640,
              height: 360,
            },
            parentId: null,
            position: "last",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      valid: false,
      error: {
        code: "payload_validation_failed",
      },
    });
    expect(session.submitCommands).not.toHaveBeenCalled();
  });

  it("replays a cloned command snapshot after session submit mutates its input", async () => {
    const store = createRepositoryStore();
    const repository = await createProjectRepository({
      projectId: "project-1",
      store,
      events: [],
      historyLoaded: true,
    });

    const session = {
      submitCommands: vi.fn(async (commands) => {
        commands[0].payload.fileId = "mutated-file-id";
        commands[2].payload.data.fileId = "mutated-file-id";
        return commands.map((command) => command.id);
      }),
    };

    const shared = createCommandApiShared({
      idGenerator: (() => {
        let index = 0;
        return () => `cmd-${++index}`;
      })(),
      now: () => 1,
      getCurrentProjectId: () => "project-1",
      getCurrentRepository: async () => repository,
      getCachedRepository: () => repository,
      ensureCommandSessionForProject: async () => session,
      getOrCreateLocalActor: () => ({
        userId: "user-1",
        clientId: "client-1",
      }),
      storyBasePartitionFor: () => "m",
      storyScenePartitionFor: () => "m",
      scenePartitionFor: () => "s:test",
      resourceTypePartitionFor: () => "m",
    });

    const context = {
      repository,
      state: repository.getState(),
      session,
      actor: {
        userId: "user-1",
        clientId: "client-1",
      },
      projectId: "project-1",
    };

    const result = await shared.submitCommandsWithContext({
      context,
      commands: [
        {
          scope: "resources",
          partition: "m",
          type: COMMAND_TYPES.FILE_CREATE,
          payload: {
            fileId: "file-1",
            data: {
              mimeType: "image/png",
              size: 123,
              sha256: "hash-1",
            },
          },
        },
        {
          scope: "resources",
          partition: "m",
          type: COMMAND_TYPES.FILE_CREATE,
          payload: {
            fileId: "thumb-1",
            data: {
              mimeType: "image/webp",
              size: 45,
              sha256: "hash-2",
            },
          },
        },
        {
          scope: "resources",
          partition: "m",
          type: COMMAND_TYPES.IMAGE_CREATE,
          payload: {
            imageId: "image-1",
            data: {
              type: "image",
              name: "Image One",
              fileId: "file-1",
              thumbnailFileId: "thumb-1",
              width: 640,
              height: 360,
            },
            parentId: null,
            position: "last",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      commandIds: ["cmd-1", "cmd-2", "cmd-3"],
    });
    expect(session.submitCommands).toHaveBeenCalledTimes(1);

    const state = repository.getState();
    expect(state.files.items["file-1"]).toBeDefined();
    expect(state.files.items["thumb-1"]).toBeDefined();
    expect(state.images.items["image-1"]).toMatchObject({
      fileId: "file-1",
      thumbnailFileId: "thumb-1",
      name: "Image One",
    });
    expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: "project_repository_main_state",
        partition: "m",
        viewVersion: "1",
        lastCommittedId: 3,
      }),
    );
  });
});
